import React, { useState, useEffect } from 'react';
import './TaskPage.css';
import Sidebar from './Sidebar';
import AddTaskModal from './AddTaskModal';
import AddTeamPopup from './AddTeamPopup';
import TaskDetailModal from './TaskDetailModal';
import { invoke } from '@tauri-apps/api/core';
import { TasksSkeletonGrid } from './components/LoadingComponents';
import { E2EE_TASKS } from './config';
import { decryptTextForTeam, isEncrypted } from './crypto/e2ee';
import { supabase } from './lib/supabase';

// Check if we're running in Tauri environment
const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
}

// Backend Task interface (matches the Rust backend)
interface BackendTask {
  id: string;
  title: string;
  description?: string;
  workspace_id?: string | null;
  assignee_id?: string;
  assigned_to?: string[]; // Array of UUIDs as per schema
  status: 'todo' | 'in_progress' | 'done'; // Backend returns lowercase
  priority?: 'low' | 'medium' | 'high'; // Backend returns lowercase
  due_date?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// Frontend Task interface (for UI display)
interface Task {
  id: string;
  title: string;
  description: string;
  assignee_id?: string;
  status: 'Todo' | 'InProgress' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  due_date?: string;
  created_at: string;
  updated_at: string;
  // UI-specific fields
  assignee_name?: string;
  // Multi-assignee support
  assignees?: TeamMember[];
}

// Team member interface for task assignment
interface TeamMember {
  id: string;
  name: string;
  team_id?: string;
  role?: string; // 'owner', 'member', 'manager', etc.
  currentApp?: string; // Current app/activity, defaults to "idle"
}

// Team interface
interface Team {
  id: string;
  team_name: string;
  created_at?: string;
  updated_at?: string;
}

interface TaskPageProps {
  onLogout: () => void;
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant') => void;
}

function TaskPage({ onLogout, onPageChange }: TaskPageProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]); // Store all tasks
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false); // Loading state for team switching
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddTeamPopup, setShowAddTeamPopup] = useState(false);
  const [addTeamAnchor, setAddTeamAnchor] = useState<HTMLElement | null>(null);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | undefined>();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{type: 'task', id: string, title: string} | null>(null);
  const [showE2EEHelp, setShowE2EEHelp] = useState(false);
  const [membersSidebarCollapsed, setMembersSidebarCollapsed] = useState(false);
  const [teamMemberCounts, setTeamMemberCounts] = useState<Record<string, number>>({});
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    type: 'team' | 'member';
    targetId: string;
    targetName: string;
  } | null>(null);
  
  // Edit team state
  const [showEditTeamPopup, setShowEditTeamPopup] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  
  // Add member state
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);

  // Load assignees for a specific task
  const loadTaskAssignees = async (taskId: string): Promise<TeamMember[]> => {
    try {
      console.log('🔍 loadTaskAssignees: Loading assignees for task:', taskId);
      
      if (isTauri()) {
        // Get all assignees from the backend
        const allAssignees = await invoke<any[]>('get_all_assignees');
        console.log('🔍 loadTaskAssignees: All assignees from backend:', allAssignees);
        
        // Filter assignees for this specific task
        const taskAssignees = allAssignees.filter((assignee: any) => assignee.task_id === taskId);
        console.log('🔍 loadTaskAssignees: Assignees for task', taskId, ':', taskAssignees);
        
        // Fetch user details for each assignee
        const assigneesWithDetails: TeamMember[] = await Promise.all(
          taskAssignees.map(async (assignee: any) => {
            try {
              const user = await invoke('get_user', { userId: assignee.user_id }) as any;
              if (user) {
                return {
                  id: user.id,
                  name: user.name,
                  team_id: user.team_id || user.workspace_id,
                  role: 'member', // Default role
                  email: user.email
                };
              } else {
                // Fallback if user not found
                return {
                  id: assignee.user_id,
                  name: assignee.user_id,
                  team_id: taskId, // Use task ID as fallback
                  role: 'member'
                };
              }
            } catch (userErr) {
              console.warn('🔍 loadTaskAssignees: Failed to get user details for', assignee.user_id, ':', userErr);
              // Return fallback user info
              return {
                id: assignee.user_id,
                name: assignee.user_id,
                team_id: taskId,
                role: 'member'
              };
            }
          })
        );
        
        console.log('🔍 loadTaskAssignees: Final assignees with details:', assigneesWithDetails);
        return assigneesWithDetails;
      } else {
        // For browser/Supabase mode, use direct Supabase queries
        const { data: assignees, error } = await supabase
          .from('assignee')
          .select('id, user_id, task_id')
          .eq('task_id', taskId);
        
        if (error) {
          console.error('🔍 loadTaskAssignees: Supabase error:', error);
          return [];
        }
        
        if (!assignees || assignees.length === 0) {
          console.log('🔍 loadTaskAssignees: No assignees found for task', taskId);
          return [];
        }
        
        // Fetch user details for each assignee
        const assigneesWithDetails: TeamMember[] = await Promise.all(
          assignees.map(async (assignee: any) => {
            try {
              const { data: user, error: userError } = await supabase
                .from('users')
                .select('id, name, email')
                .eq('id', assignee.user_id)
                .single();
              
              if (userError || !user) {
                console.warn('🔍 loadTaskAssignees: Failed to get user details for', assignee.user_id);
                return {
                  id: assignee.user_id,
                  name: assignee.user_id,
                  team_id: taskId,
                  role: 'member'
                };
              }
              
              return {
                id: user.id,
                name: user.name,
                team_id: taskId,
                role: 'member',
                email: user.email
              };
            } catch (userErr) {
              console.warn('🔍 loadTaskAssignees: Error fetching user:', userErr);
              return {
                id: assignee.user_id,
                name: assignee.user_id,
                team_id: taskId,
                role: 'member'
              };
            }
          })
        );
        
        console.log('🔍 loadTaskAssignees: Supabase assignees with details:', assigneesWithDetails);
        return assigneesWithDetails;
      }
    } catch (err) {
      console.error('❌ Failed to load task assignees:', err);
      return [];
    }
  };

  // Load assignees for all tasks at once (optimized version)
  const loadAllTaskAssignees = async (tasks: Task[]) => {
    try {
      console.log('🔍 loadAllTaskAssignees: Loading assignees for all tasks...');
      
      if (isTauri()) {
        // Get all assignees from the backend once
        const allAssignees = await invoke<any[]>('get_all_assignees');
        console.log('🔍 loadAllTaskAssignees: All assignees from backend:', allAssignees);
        
        // Group assignees by task_id for efficient lookup
        const assigneesByTaskId: Record<string, any[]> = {};
        allAssignees.forEach((assignee: any) => {
          if (!assigneesByTaskId[assignee.task_id]) {
            assigneesByTaskId[assignee.task_id] = [];
          }
          assigneesByTaskId[assignee.task_id].push(assignee);
        });
        
        // For each task, populate its assignees
        for (const task of tasks) {
          const taskAssignees = assigneesByTaskId[task.id] || [];
          console.log('🔍 loadAllTaskAssignees: Assignees for task', task.id, ':', taskAssignees);
          
          // Fetch user details for each assignee of this task
          const assigneesWithDetails: TeamMember[] = await Promise.all(
            taskAssignees.map(async (assignee: any) => {
              try {
                const user = await invoke('get_user', { userId: assignee.user_id }) as any;
                if (user) {
                  return {
                    id: user.id,
                    name: user.name,
                    team_id: user.team_id || user.workspace_id,
                    role: 'member'
                  };
                } else {
                  // Fallback if user not found
                  return {
                    id: assignee.user_id,
                    name: assignee.user_id,
                    team_id: task.id,
                    role: 'member'
                  };
                }
              } catch (userErr) {
                console.warn('🔍 loadAllTaskAssignees: Failed to get user details for', assignee.user_id, ':', userErr);
                // Return fallback user info
                return {
                  id: assignee.user_id,
                  name: assignee.user_id,
                  team_id: task.id,
                  role: 'member'
                };
              }
            })
          );
          
          // Update the task with assignees
          task.assignees = assigneesWithDetails;
        }
        
        console.log('🔍 loadAllTaskAssignees: All tasks updated with assignees');
      } else {
        // For browser/Supabase mode, use direct Supabase queries
        const { data: allAssignees, error } = await supabase
          .from('assignee')
          .select('id, user_id, task_id');
        
        if (error) {
          console.error('🔍 loadAllTaskAssignees: Supabase error:', error);
          return;
        }
        
        if (!allAssignees || allAssignees.length === 0) {
          console.log('🔍 loadAllTaskAssignees: No assignees found');
          return;
        }
        
        // Group assignees by task_id for efficient lookup
        const assigneesByTaskId: Record<string, any[]> = {};
        allAssignees.forEach((assignee: any) => {
          if (!assigneesByTaskId[assignee.task_id]) {
            assigneesByTaskId[assignee.task_id] = [];
          }
          assigneesByTaskId[assignee.task_id].push(assignee);
        });
        
        // For each task, populate its assignees
        for (const task of tasks) {
          const taskAssignees = assigneesByTaskId[task.id] || [];
          
          // Fetch user details for each assignee of this task
          const assigneesWithDetails: TeamMember[] = await Promise.all(
            taskAssignees.map(async (assignee: any) => {
              try {
                const { data: user, error: userError } = await supabase
                  .from('users')
                  .select('id, name, email')
                  .eq('id', assignee.user_id)
                  .single();
                
                if (userError || !user) {
                  console.warn('🔍 loadAllTaskAssignees: Failed to get user details for', assignee.user_id);
                  return {
                    id: assignee.user_id,
                    name: assignee.user_id,
                    team_id: task.id,
                    role: 'member'
                  };
                }
                
                return {
                  id: user.id,
                  name: user.name,
                  team_id: task.id,
                  role: 'member'
                };
              } catch (userErr) {
                console.warn('🔍 loadAllTaskAssignees: Error fetching user:', userErr);
                return {
                  id: assignee.user_id,
                  name: assignee.user_id,
                  team_id: task.id,
                  role: 'member'
                };
              }
            })
          );
          
          // Update the task with assignees
          task.assignees = assigneesWithDetails;
        }
        
        console.log('🔍 loadAllTaskAssignees: All tasks updated with assignees (Supabase)');
      }
    } catch (err) {
      console.error('❌ Failed to load all task assignees:', err);
      // Set empty assignees for all tasks on error
      tasks.forEach(task => {
        task.assignees = [];
      });
    }
  };

  // Load teams data independently (only teams user is a member of)
  const loadTeamsData = async () => {
    try {
      if (isTauri()) {
        // Use get_my_workspaces to only get teams the user is a member of
        const userWorkspaces = await invoke('get_my_workspaces') as Team[];
        console.log('✅ User workspaces loaded successfully:', userWorkspaces);
        
        // Normalize team names (handle both 'name' and 'team_name' fields)
        const normalizedTeams = userWorkspaces.map(team => ({
          ...team,
          team_name: team.team_name ?? (team as any)?.name ?? 'Untitled workspace',
        }));
        
        setTeams(normalizedTeams);
        
        // Select first team if available and none selected
        if (normalizedTeams.length > 0 && !selectedTeam) {
          setSelectedTeam(normalizedTeams[0].id);
        }
      } else {
        // Browser mode - use mock data
        const mockTeams: Team[] = [
          { id: '1', team_name: 'Frontend Team' },
          { id: '2', team_name: 'Backend Team' },
        ];
        setTeams(mockTeams);
        if (mockTeams.length > 0 && !selectedTeam) {
          setSelectedTeam(mockTeams[0].id);
        }
      }
    } catch (err) {
      console.error('❌ Failed to load teams:', err);
      // Teams failure doesn't prevent other data from loading
    }
  };

  // Load tasks data independently
  const loadTasksData = async () => {
    try {
      if (isTauri()) {
        const [backendTasks, backendMembers] = await Promise.all([
          invoke('get_my_tasks') as Promise<BackendTask[]>,
          invoke('get_all_users') as Promise<TeamMember[]>
        ]);
        
        console.log('✅ Tasks and related data loaded successfully');
        console.log('Backend tasks:', JSON.stringify(backendTasks, null, 2));
        
        // Transform tasks with proper assignee names (no projects) - without assignees first
        const transformedTasks: Task[] = await Promise.all(backendTasks.map(async (task) => {
          const assignee = backendMembers.find(member => member.id === task.assignee_id);
          
          // Convert backend status to frontend status
          const frontendStatus = task.status === 'todo' ? 'Todo' :
                                task.status === 'in_progress' ? 'InProgress' : 'Done';
          
          // Convert backend priority to frontend priority
          const frontendPriority = task.priority === 'low' ? 'Low' :
                                  task.priority === 'medium' ? 'Medium' :
                                  task.priority === 'high' ? 'High' : 'Medium';
          
          // Decrypt fields if encrypted
          const title = E2EE_TASKS && isEncrypted(task.title) ? await decryptTextForTeam(task.title) : task.title;
          const description = E2EE_TASKS && task.description && isEncrypted(task.description) 
            ? await decryptTextForTeam(task.description)
            : (task.description || '');
          
          return {
            id: task.id,
            title,
            description,
            assignee_id: task.assignee_id,
            status: frontendStatus,
            priority: frontendPriority,
            due_date: task.due_date,
            created_at: task.created_at,
            updated_at: task.updated_at,
            assignee_name: assignee?.name,
            assignees: [] // Will be populated later
          };
        }));

        // Now load all assignees once at the end
        console.log('🔍 Loading all assignees after task transformation...');
        await loadAllTaskAssignees(transformedTasks);

        console.log('=== FRONTEND TRANSFORMATION DEBUG ===');
        console.log('Transformed tasks:', JSON.stringify(transformedTasks, null, 2));
        console.log('=====================================');
        
        setAllTasks(transformedTasks);
      } else {
        // Browser mode - use mock data (without projects)
        const mockTasks: Task[] = [
          {
            id: '1',
            title: 'Implement user authentication',
            description: 'Add login and registration functionality',
            assignee_id: 'user-1',
            status: 'Todo',
            priority: 'High',
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            assignee_name: 'John Doe',
            assignees: [
              { id: 'user-1', name: 'John Doe', team_id: 'team-1', role: 'member' },
              { id: 'user-2', name: 'Jane Smith', team_id: 'team-1', role: 'member' }
            ]
          },
          {
            id: '2',
            title: 'Fix responsive design issues',
            description: 'Resolve mobile layout problems',
            assignee_id: 'user-2',
            status: 'InProgress',
            priority: 'Medium',
            due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            assignee_name: 'Jane Smith',
            assignees: [
              { id: 'user-2', name: 'Jane Smith', team_id: 'team-1', role: 'member' }
            ]
          },
          {
            id: '3',
            title: 'Write API documentation',
            description: 'Document all REST API endpoints',
            assignee_id: 'user-1',
            status: 'Done',
            priority: 'Low',
            due_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            assignee_name: 'John Doe',
            assignees: [
              { id: 'user-1', name: 'John Doe', team_id: 'team-1', role: 'member' },
              { id: 'user-3', name: 'Alice Johnson', team_id: 'team-1', role: 'manager' }
            ]
          }
        ];
        setAllTasks(mockTasks);
      }
    } catch (err) {
      console.error('❌ Failed to load tasks:', err);
      // Tasks failure doesn't prevent other data from loading
    }
  };

  // Load tasks for a specific workspace using the new backend command
  const loadTasksByWorkspace = async (workspaceId: string) => {
    setLoadingTasks(true);
    setError(null);
    
    try {
      if (isTauri()) {
        // First, load just the tasks for the workspace
        const backendTasks = await invoke('get_tasks_by_workspace', { workspaceId }) as BackendTask[];
        console.log('✅ Tasks for workspace loaded successfully:', workspaceId);
        console.log('Backend tasks for workspace:', JSON.stringify(backendTasks, null, 2));
        
        // Try to load related data, but don't fail if they don't exist
        let backendMembers: TeamMember[] = [];
        
        try {
          backendMembers = await invoke('get_all_users') as TeamMember[];
        } catch (userError) {
          console.warn('Could not load users:', userError);
        }
        
        // Transform tasks with proper assignee names (no projects) - without assignees first
        const transformedTasks: Task[] = await Promise.all(backendTasks.map(async (task) => {
          const assignee = backendMembers.find(member => member.id === task.assignee_id);
          
          // Convert backend status to frontend status
          const frontendStatus = task.status === 'todo' ? 'Todo' :
                                task.status === 'in_progress' ? 'InProgress' : 'Done';
          
          // Convert backend priority to frontend priority
          const frontendPriority = task.priority === 'low' ? 'Low' :
                                  task.priority === 'medium' ? 'Medium' :
                                  task.priority === 'high' ? 'High' : 'Medium';
          
          // Decrypt fields if encrypted
          const title = E2EE_TASKS && isEncrypted(task.title) ? await decryptTextForTeam(task.title) : task.title;
          const description = E2EE_TASKS && task.description && isEncrypted(task.description) 
            ? await decryptTextForTeam(task.description)
            : (task.description || '');
          
          return {
            id: task.id,
            title,
            description,
            assignee_id: task.assignee_id,
            status: frontendStatus,
            priority: frontendPriority,
            due_date: task.due_date,
            created_at: task.created_at,
            updated_at: task.updated_at,
            assignee_name: assignee?.name,
            assignees: [] // Will be populated later
          };
        }));

        // Now load all assignees once at the end
        console.log('🔍 Loading all assignees for workspace tasks...');
        await loadAllTaskAssignees(transformedTasks);

        console.log('=== WORKSPACE TASKS TRANSFORMATION DEBUG ===');
        console.log('Transformed workspace tasks:', JSON.stringify(transformedTasks, null, 2));
        console.log('============================================');
        
        setTasks(transformedTasks);
      } else {
        // Browser mode - filter mock data by workspace (for demo purposes)
        const mockWorkspaceTasks = allTasks.filter(() => {
          // In browser mode, we'll simulate workspace filtering
          // You can customize this logic based on your mock data structure
          return true; // For now, show all tasks in browser mode
        });
        setTasks(mockWorkspaceTasks);
      }
    } catch (err) {
      console.error('❌ Failed to load tasks for workspace:', workspaceId, err);
      setError(`Failed to load tasks for workspace: ${err}`);
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  // Refresh functions for individual data types
  const refreshTasks = () => {
    if (selectedTeam) {
      loadTasksByWorkspace(selectedTeam);
    } else {
      setLoadingTasks(true);
      loadTasksData().finally(() => setLoadingTasks(false));
    }
  };

  // Load all data from backend with independent error handling
  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    
    // Load data independently - if one fails, others can still succeed
    await Promise.allSettled([
      loadTeamsData(),
      loadTasksData()
    ]);

    setLoading(false);
  };

  // Load team members when team is selected
  const loadTeamMembers = async (teamId: string | null) => {
    if (!teamId) {
      setTeamMembers([]);
      return;
    }
    
    try {
      if (isTauri()) {
        const members = await invoke('get_users_by_team', { teamId }) as any[];
        
        // Map backend User objects to TeamMember with role
        const teamMembers: TeamMember[] = members.map((user: any) => {
          return {
            id: user.id,
            name: user.name,
            team_id: teamId,
            role: user.role || 'member', // Default to 'member' if no role
            currentApp: 'idle' // Default, will be updated below
          };
        });
        
        // Fetch current app for each member (in parallel)
        const membersWithApps = await Promise.all(
          teamMembers.map(async (member) => {
            try {
              // Use the backend function to get user's recent time entries
              const timeEntries = await invoke('get_time_entries_by_user', { 
                userId: member.id, 
                limit: 5  // Get last 5 entries to find the most recent with an app
              }) as any[];
              
              if (timeEntries && timeEntries.length > 0) {
                // Find the most recent entry with an app_id
                for (const entry of timeEntries) {
                  if (entry.app_id) {
                    try {
                      // Get application details
                      const { data: app, error } = await supabase
                        .from('applications')
                        .select('name')
                        .eq('id', entry.app_id)
                        .single();
                      
                      if (!error && app && app.name) {
                        // Check if this entry is recent (within last 30 minutes)
                        const entryTime = new Date(entry.start_time || entry.created_at);
                        const now = new Date();
                        const timeDiff = now.getTime() - entryTime.getTime();
                        const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds
                        
                        if (timeDiff <= thirtyMinutes) {
                          return { ...member, currentApp: app.name };
                        } else {
                          return { ...member, currentApp: 'idle' };
                        }
                      }
                    } catch (appErr) {
                      console.warn(`Failed to get app details for ${entry.app_id}:`, appErr);
                    }
                  }
                }
              }
              
              // Default to idle if no recent activity found
              return { ...member, currentApp: 'idle' };
            } catch (err) {
              console.error(`Failed to get activity for member ${member.id}:`, err);
              return { ...member, currentApp: 'idle' };
            }
          })
        );
        
        setTeamMembers(membersWithApps);
      } else {
        // Browser mode - mock data
        const mockMembers: TeamMember[] = [
          { id: 'user-1', name: 'John Doe', team_id: teamId, role: 'owner', currentApp: 'VS Code' },
          { id: 'user-2', name: 'Jane Smith', team_id: teamId, role: 'member', currentApp: 'idle' },
        ];
        setTeamMembers(mockMembers);
      }
    } catch (err) {
      console.error('Failed to load team members:', err);
      setTeamMembers([]);
    }
  };

  // Filter tasks by selected team
  useEffect(() => {
    if (!selectedTeam) {
      setTasks([]);
      return;
    }
    
    // Load tasks for the selected workspace directly
    loadTasksByWorkspace(selectedTeam);
  }, [selectedTeam]);

  // Load team members when team is selected
  useEffect(() => {
    loadTeamMembers(selectedTeam);
  }, [selectedTeam]);

  // Load workspace members and calculate team member counts
  const loadWorkspaceMembersAndCounts = async () => {
    try {
      if (isTauri()) {
        // Get all workspace members
        const workspaceMembers = await invoke('get_all_workspace_members') as any[];
        console.log('✅ Workspace members loaded for counting:', workspaceMembers);
        
        // Count members per workspace/team
        const counts: Record<string, number> = {};
        const workspaceIdSet = new Set(teams.map(team => team.id));
        
        (workspaceMembers ?? []).forEach((member) => {
          const workspaceId = member.workspace_id ?? member.team_id ?? null;
          if (workspaceId && workspaceIdSet.has(workspaceId)) {
            counts[workspaceId] = (counts[workspaceId] ?? 0) + 1;
          }
        });
        
        // Set counts for all teams, defaulting to 0 if no members found
        teams.forEach(team => {
          if (!(team.id in counts)) {
            counts[team.id] = 0;
          }
        });
        
        console.log('Team member counts calculated:', counts);
        console.log('Teams processed:', teams.map(t => `${t.team_name} (${t.id})`));
        setTeamMemberCounts(counts);
      } else {
        // Browser mode - use mock data
        const counts: Record<string, number> = {};
        teams.forEach(team => {
          // Generate a consistent mock number based on team ID
          const hash = team.id.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
          }, 0);
          counts[team.id] = (Math.abs(hash) % 8) + 3; // 3-10 members
        });
        setTeamMemberCounts(counts);
      }
    } catch (err) {
      console.error('❌ Failed to load workspace members for counting:', err);
      // Fallback to zero counts
      const counts: Record<string, number> = {};
      teams.forEach(team => {
        counts[team.id] = 0;
      });
      setTeamMemberCounts(counts);
    }
  };

  // Refresh function for member counts
  const refreshMemberCounts = () => loadWorkspaceMembersAndCounts();

  // Update member counts when teams change
  useEffect(() => {
    if (teams.length > 0) {
      loadWorkspaceMembersAndCounts();
    } else {
      setTeamMemberCounts({});
    }
  }, [teams]);

  // Function to open the add team popup
  const handleAddTeam = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAddTeamAnchor(event.currentTarget);
    setShowAddTeamPopup(true);
  };

  // Handle right-click on team
  const handleTeamRightClick = (e: React.MouseEvent, team: Team) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type: 'team',
      targetId: team.id,
      targetName: team.team_name
    });
  };

  // Handle right-click on member
  const handleMemberRightClick = (e: React.MouseEvent, member: TeamMember) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type: 'member',
      targetId: member.id,
      targetName: member.name
    });
  };

  // Close context menu
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // Handle edit team
  const handleEditTeam = () => {
    if (!contextMenu) return;
    const team = teams.find(t => t.id === contextMenu.targetId);
    if (team) {
      setEditingTeam(team);
      setShowEditTeamPopup(true);
      closeContextMenu();
    }
  };

  // Handle update team
  const handleUpdateTeam = async (teamData: { name: string; description?: string }) => {
    if (!editingTeam) return;
    
    try {
      console.log('Updating team:', editingTeam.id, teamData);
      
      // Update workspace in Supabase
      const { error: updateError } = await supabase
        .from('workspaces')
        .update({
          name: teamData.name,
          description: teamData.description || null
        })
        .eq('id', editingTeam.id);

      if (updateError) {
        throw new Error(`Failed to update workspace: ${updateError.message}`);
      }

      // Update local state
      setTeams(prev => prev.map(team => 
        team.id === editingTeam.id 
          ? { ...team, team_name: teamData.name, description: teamData.description }
          : team
      ));

      setShowEditTeamPopup(false);
      setEditingTeam(null);
    } catch (error) {
      console.error('Failed to update team:', error);
      throw error;
    }
  };

  // Handle delete team
  const handleDeleteTeam = async () => {
    if (!contextMenu) return;
    
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${contextMenu.targetName}"? This action cannot be undone.`
    );
    
    if (!confirmDelete) {
      closeContextMenu();
      return;
    }

    try {
      if (isTauri()) {
        await invoke('delete_team', { teamId: contextMenu.targetId });
      } else {
        // Browser mode - just remove from state
        await supabase
          .from('workspaces')
          .delete()
          .eq('id', contextMenu.targetId);
      }

      // Remove from local state
      setTeams(prev => prev.filter(team => team.id !== contextMenu.targetId));
      
      // If deleted team was selected, select first available team or null
      if (selectedTeam === contextMenu.targetId) {
        const remainingTeams = teams.filter(team => team.id !== contextMenu.targetId);
        setSelectedTeam(remainingTeams.length > 0 ? remainingTeams[0].id : null);
      }

      // Refresh member counts
      refreshMemberCounts();
      
      closeContextMenu();
    } catch (error) {
      console.error('Failed to delete team:', error);
      setError(`Failed to delete team: ${error instanceof Error ? error.message : 'Unknown error'}`);
      closeContextMenu();
    }
  };

  // Handle delete member
  const handleDeleteMember = async () => {
    if (!contextMenu) return;
    
    const confirmDelete = window.confirm(
      `Are you sure you want to remove "${contextMenu.targetName}" from this team?`
    );
    
    if (!confirmDelete) {
      closeContextMenu();
      return;
    }

    try {
      if (isTauri()) {
        // Remove from workspace_members
        await supabase
          .from('workspace_members')
          .delete()
          .eq('user_id', contextMenu.targetId)
          .eq('workspace_id', selectedTeam);
      }

      // Remove from local state
      setTeamMembers(prev => prev.filter(member => member.id !== contextMenu.targetId));
      
      // Refresh member counts
      refreshMemberCounts();
      
      closeContextMenu();
    } catch (error) {
      console.error('Failed to delete member:', error);
      setError(`Failed to remove member: ${error instanceof Error ? error.message : 'Unknown error'}`);
      closeContextMenu();
    }
  };

  // Close context menu when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu?.visible) {
        closeContextMenu();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextMenu?.visible) {
        closeContextMenu();
      }
    };

    if (contextMenu?.visible) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu?.visible]); // Only depend on visibility, not the entire contextMenu object

  // Function to create a new team
  const handleCreateTeam = async (teamData: { name: string; description?: string }) => {
    try {
      console.log('🚀 Starting team creation process...', teamData);
      
      // Step 1: Get current user from local backend
      console.log('📍 Step 1: Getting current user from local backend...');
      const currentUser = await invoke('get_current_user') as { id: string; name: string };
      console.log('✅ Current user retrieved:', currentUser);
      
      // Step 2: Create workspace in Supabase
      console.log('📍 Step 2: Creating workspace in Supabase...');
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .insert({
          name: teamData.name,
          description: teamData.description,
          created_by: currentUser.id
        })
        .select('*')
        .single();

      if (workspaceError) {
        console.error('❌ Supabase workspace creation failed:', workspaceError);
        throw new Error(`Failed to create workspace: ${workspaceError.message} (Supabase Error: ${workspaceError.code || 'Unknown'})`);
      }
      console.log('✅ Workspace created in Supabase:', workspace);

      // Step 3: Add current user as workspace member
      console.log('📍 Step 3: Adding user as workspace member in Supabase...');
      const { error: memberError } = await supabase
        .from('workspace_members')
        .insert({
          user_id: currentUser.id,
          workspace_id: workspace.id,
          role: 'owner'
        });

      if (memberError) {
        console.error('❌ Supabase member insertion failed:', memberError);
        throw new Error(`Failed to add user to workspace: ${memberError.message} (Supabase Error: ${memberError.code || 'Unknown'})`);
      }
      console.log('✅ User added as workspace member');

      // Step 4: Update local state
      console.log('📍 Step 4: Updating local UI state...');
      const newTeam: Team = {
        id: workspace.id,
        team_name: workspace.name,
        created_at: workspace.created_at,
        updated_at: workspace.updated_at
      };

      // Add to local state
      setTeams(prev => [...prev, newTeam]);
      
      // Set as selected team
      setSelectedTeam(newTeam.id);
      
      // Update team member counts
      setTeamMemberCounts(prev => ({
        ...prev,
        [newTeam.id]: 1
      }));
      
      console.log('✅ Team created successfully:', newTeam);
      console.log('🎉 Team creation process completed!');
    } catch (error) {
      console.error('❌ Team creation failed:', error);
      
      // Enhance error message with source context
      if (error instanceof Error) {
        const errorMsg = error.message;
        if (errorMsg.includes('get_current_user') || errorMsg.includes('invoke')) {
          // This is a local backend error
          throw new Error(`Local Backend Error: ${errorMsg}. The Tauri backend may not be responding properly.`);
        } else if (errorMsg.includes('Supabase Error') || errorMsg.includes('Failed to create workspace') || errorMsg.includes('Failed to add user to workspace')) {
          // This is already a Supabase error with context
          throw error;
        } else {
          // Generic error - add more context
          throw new Error(`${errorMsg}. Please check both your internet connection (for Supabase) and that the local backend is running.`);
        }
      } else {
        throw new Error('Unknown error during team creation. Please check console for details.');
      }
    }
  };

  // Function to handle adding a member to the team
  const handleAddMember = async () => {
    if (!addMemberEmail.trim()) {
      setError('Please enter a valid email address');
      return;
    }

    if (!selectedTeam) {
      setError('No team selected');
      return;
    }

    setIsAddingMember(true);

    try {
      console.log('🚀 Starting member invitation process...', {
        email: addMemberEmail,
        teamId: selectedTeam
      });

      // Here you would typically call your backend API to invite the member
      // For now, we'll show a placeholder implementation
      
      // Example API call (you'll need to implement this in your backend):
      // await invoke('invite_team_member', {
      //   teamId: selectedTeam,
      //   email: addMemberEmail.trim()
      // });

      console.log('✅ Member invitation sent successfully');
      
      // Close modal and reset form
      setShowAddMemberModal(false);
      setAddMemberEmail('');
      
      // Show success message
      setError(null);
      
      // Optionally refresh team members list
      loadTeamMembers(selectedTeam);
      
    } catch (error) {
      console.error('❌ Failed to invite member:', error);
      setError(`Failed to invite member: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAddingMember(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Get tasks by status
  const getTasksByStatus = (status: 'Todo' | 'InProgress' | 'Done') => {
    return tasks.filter(task => task.status === status);
  };

  // Get priority color
  const getPriorityColor = (priority: 'Low' | 'Medium' | 'High') => {
    switch (priority) {
      case 'High': return '#ff3b30';
      case 'Medium': return '#ff9500';
      case 'Low': return '#34c759';
      default: return '#8e8e93';
    }
  };

  // Format due date
  const formatDueDate = (dueDate?: string) => {
    if (!dueDate) return null;
    const date = new Date(dueDate);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: 'Overdue', color: '#ff3b30' };
    if (diffDays === 0) return { text: 'Due today', color: '#ff9500' };
    if (diffDays === 1) return { text: 'Due tomorrow', color: '#ff9500' };
    if (diffDays <= 7) return { text: `Due in ${diffDays} days`, color: '#ff9500' };
    return { text: date.toLocaleDateString(), color: '#8e8e93' };
  };

  // Format due date for tag (short month format)
  const formatDueDateTag = (dueDate?: string) => {
    if (!dueDate) return null;
    const date = new Date(dueDate);
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  // Handle task card click
  const handleTaskClick = (task: Task) => {
    if (!editMode) {
      setSelectedTask(task);
      setShowTaskDetailModal(true);
    }
  };

  // Delete task function
  const handleDeleteTask = (taskId: string, taskTitle: string) => {
    setDeleteTarget({ type: 'task', id: taskId, title: taskTitle });
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (isTauri()) {
        await invoke('delete_task', { taskId: deleteTarget.id });
        console.log('Task deleted successfully');
      }
      
      // Remove from local state
      setTasks(prev => prev.filter(task => task.id !== deleteTarget.id));
    } catch (error) {
      console.error('Failed to delete task:', error);
      setError(`Failed to delete task "${deleteTarget.title}". Please try again.`);
    } finally {
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    }
  };


  // Task Card Component
  const TaskCard = ({ task }: { task: Task }) => {
    const dueDateInfo = formatDueDate(task.due_date);
    const dueDateTag = formatDueDateTag(task.due_date);
    
    return (
      <div
        className={`task-card ${editMode ? 'edit-mode' : ''}`}
        onClick={() => handleTaskClick(task)}
      >
        <div className="task-header">
          <div className="task-priority-container">
            <span className="task-priority" style={{ 
              backgroundColor: getPriorityColor(task.priority) + '20',
              color: getPriorityColor(task.priority)
            }}>
              {task.priority}
            </span>
            <button 
              className="task-ellipsis-btn"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setClickPosition({ x: rect.left, y: rect.bottom + 5 });
                handleTaskClick(task);
              }}
              title="View task details"
            >
              ⋯
            </button>
          </div>
          <div className="task-title-container">
            <h4 className="task-title">{task.title}</h4>
            {editMode && (
              <button 
                className="delete-task-btn"
                onClick={() => handleDeleteTask(task.id, task.title)}
                title={`Delete ${task.title}`}
              >
                ×
              </button>
            )}
          </div>
        </div>
        
        {task.description && (
          <p className="task-description">{task.description}</p>
        )}
        
        <div className="task-meta">
          {task.assignees && task.assignees.length > 0 ? (
            <div className="task-assignees">
              {task.assignees.map((assignee) => (
                <div key={assignee.id} className="task-assignee-tag">
                  <span className="assignee-avatar">👤</span>
                  <span className="assignee-name">{assignee.name}</span>
                </div>
              ))}
            </div>
          ) : task.assignee_name ? (
            <div className="task-assignee">
              <span className="assignee-avatar">👤</span>
              <span className="assignee-name">{task.assignee_name}</span>
            </div>
          ) : (
            <div className="task-assignee">
              <span className="assignee-avatar">👤</span>
              <span className="assignee-name">-</span>
            </div>
          )}
          
          {dueDateInfo && (
            <div className="task-due-date" style={{ color: dueDateInfo.color }}>
              {dueDateInfo.text}
            </div>
          )}
        </div>
        
        {dueDateTag && (
          <>
            <div className="task-divider"></div>
            <div className="task-due-date-section">
              <span className="task-due-date-tag">
                🏁 {dueDateTag}
              </span>
            </div>
          </>
        )}
      </div>
    );
  };

  // Status Column Component
  const StatusColumn = ({ 
    status, 
    title, 
    count 
  }: { 
    status: 'Todo' | 'InProgress' | 'Done';
    title: string;
    count: number;
  }) => (
    <div 
      className={`status-column ${editMode ? 'edit-mode' : ''}`}
    >
      <div className="status-header">
        <h3 className="status-title" data-status={status}>{title}</h3>
        <span className="status-count">{count}</span>
      </div>
      <div className="status-content">
        {getTasksByStatus(status).map(task => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );

  // Function to get a consistent random emoji for a given ID (similar to TeamsPage)
  const getRandomEmoji = (id: string) => {
    const peopleEmojis = [
      '👨', '👩', '👨‍💻', '👩‍💻', '👨‍🎨', '👩‍🎨', '👨‍🔬', '👩‍🔬',
      '👨‍🚀', '👩‍🚀', '👨‍⚕️', '👩‍⚕️', '👨‍🏫', '👩‍🏫', '👨‍💼', '👩‍💼',
      '🧑', '🧑‍💻', '🧑‍🎨', '🧑‍🔬', '🧑‍🚀', '🧑‍⚕️', '🧑‍🏫', '🧑‍💼',
    ];
    const hash = id.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    const index = Math.abs(hash) % peopleEmojis.length;
    return peopleEmojis[index];
  };

  return (
    <div className="dashboard-container">
      <Sidebar 
        currentPage="tasks" 
        onLogout={onLogout} 
        onPageChange={onPageChange || (() => {})} 
      />
      
      {/* Unified Task Management Container */}
      <div className="task-management-container">
        {/* Left Sidebar - Teams */}
        <div className="task-teams-sidebar">
          <div className="task-teams-header">
            <h3>Teams</h3>
            <button 
              className="add-team-btn"
              onClick={handleAddTeam}
              title="Add team"
            >
              +
            </button>
          </div>
          <div className="task-teams-list">
            {loading ? (
              <div className="teams-loading">Loading teams...</div>
            ) : teams.length === 0 ? (
              <div className="teams-empty">No teams available</div>
            ) : (
              teams.map(team => (
                <div
                  key={team.id}
                  className={`team-item ${selectedTeam === team.id ? 'active' : ''}`}
                  onClick={() => setSelectedTeam(team.id)}
                  onContextMenu={(e) => handleTeamRightClick(e, team)}
                >
                  <span className="team-icon">👥</span>
                  <div className="team-info">
                    <span className="team-name">{team.team_name}</span>
                    <span className="team-member-count">
                      {teamMemberCounts[team.id] || 0} {teamMemberCounts[team.id] === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Main Content - Kanban Board */}
        <div className="main-content">
          <div className="tasks-container">
            <div className="tasks-header">
              <h1>Task Management</h1>
              <div className="header-actions">
                {!editMode ? (
                  <>
                    <button 
                      className="btn-text" 
                      onClick={() => setShowAddTaskModal(true)}
                      disabled={loading || !selectedTeam}
                      title={!selectedTeam ? "Please select a team/workspace first" : "Add new task"}
                    >
                      +
                    </button>
                    <button 
                      className="btn-text"
                      onClick={() => setEditMode(true)}
                      disabled={loading}
                    >
                      Edit
                    </button>
                  </>
                ) : (
                  <button 
                    className="btn-text"
                    onClick={() => setEditMode(false)}
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
            {E2EE_TASKS && (
              <div style={{
                marginTop: 8,
                marginBottom: 8,
                padding: '10px 12px',
                borderRadius: 10,
                background: '#f5f7ff',
                color: '#1f3a8a',
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}>
                <span role="img" aria-label="info">🔐</span>
                <div style={{ flex: 1 }}>
                  <strong>Encryption is on.</strong> Task titles and descriptions are encrypted end‑to‑end.
                  <button
                    onClick={() => setShowE2EEHelp(!showE2EEHelp)}
                    style={{
                      marginLeft: 8,
                      background: 'transparent',
                      border: 'none',
                      color: '#1d4ed8',
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    {showE2EEHelp ? 'Hide details' : 'Learn more'}
                  </button>
                  {showE2EEHelp && (
                    <div style={{ marginTop: 8, color: '#334155' }}>
                      - You may see a passphrase prompt the first time; this lets teammates decrypt tasks.<br />
                      - For this prototype, everyone on the team uses the same passphrase.<br />
                      - To change the passphrase, an admin can reset the team key (e.g., remove the saved team key in Supabase and clear the local cache), then set a new passphrase. Do this only during testing — old encrypted tasks won't be readable after a reset.
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {error && (
              <div className="error-message" style={{ 
                background: '#ffebee', 
                color: '#c62828', 
                padding: '12px 16px', 
                borderRadius: '8px', 
                margin: '16px 0' 
              }}>
                {error}
              </div>
            )}
            
            {loading || loadingTasks ? (
              <TasksSkeletonGrid />
            ) : (
              <div className="task-board">
                <StatusColumn 
                  status="Todo" 
                  title="To Do" 
                  count={getTasksByStatus('Todo').length} 
                />
                <StatusColumn 
                  status="InProgress" 
                  title="In Progress" 
                  count={getTasksByStatus('InProgress').length} 
                />
                <StatusColumn 
                  status="Done" 
                  title="Done" 
                  count={getTasksByStatus('Done').length} 
                />
              </div>
            )}
          </div>
        </div>
        
        {/* Right Sidebar - Team Members */}
        <div className={`task-members-sidebar ${membersSidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="task-members-header">
            <h3>{selectedTeam ? teams.find(t => t.id === selectedTeam)?.team_name || 'Members' : 'Members'}</h3>
            <div className="task-members-header-actions">
              <button 
                className="collapse-toggle-btn"
                onClick={() => setMembersSidebarCollapsed(!membersSidebarCollapsed)}
                title={membersSidebarCollapsed ? 'Expand members' : 'Collapse members'}
              >
                {membersSidebarCollapsed ? '▶' : '◀'}
              </button>
            </div>
          </div>
          {!membersSidebarCollapsed && (
            <div className="task-members-list">
              {!selectedTeam ? (
                <div className="members-empty">Select a team to view members</div>
              ) : loading ? (
                <div className="members-loading">Loading members...</div>
              ) : teamMembers.length === 0 ? (
                <div className="members-empty">No members in this team</div>
              ) : (
                (() => {
                  // Group members by role - specifically Owner vs Member
                  const owners: TeamMember[] = [];
                  const members: TeamMember[] = [];
                  
                  teamMembers.forEach(member => {
                    const role = member.role?.toLowerCase() || 'member';
                    
                    if (role === 'owner') {
                      owners.push(member);
                    } else {
                      // All non-owners are considered members
                      members.push(member);
                    }
                  });

                  return (
                    <>
                      {/* Owner Section */}
                      {owners.length > 0 && (
                        <div className="member-role-group">
                          <div className="member-role-label">
                            Owner
                          </div>
                          {owners.map(member => (
                            <div 
                              key={member.id} 
                              className="member-item"
                              onContextMenu={(e) => handleMemberRightClick(e, member)}
                            >
                              <div className="member-avatar-container">
                                <span className="member-avatar">{getRandomEmoji(member.id)}</span>
                                <span className="member-status-indicator"></span>
                              </div>
                              <div className="member-info">
                                <span className="member-name">{member.name}</span>
                                <span className="member-activity">{member.currentApp || 'idle'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Member Section */}
                      {members.length > 0 && (
                        <div className="member-role-group">
                          <div className="member-role-label">
                            Member
                          </div>
                          {members.map(member => (
                            <div 
                              key={member.id} 
                              className="member-item"
                              onContextMenu={(e) => handleMemberRightClick(e, member)}
                            >
                              <div className="member-avatar-container">
                                <span className="member-avatar">{getRandomEmoji(member.id)}</span>
                                <span className="member-status-indicator"></span>
                              </div>
                              <div className="member-info">
                                <span className="member-name">{member.name}</span>
                                <span className="member-activity">{member.currentApp || 'idle'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()
              )}
            </div>
          )}
          
          {/* Add Member Button at Bottom */}
          {selectedTeam && !membersSidebarCollapsed && (
            <div className="add-member-bottom">
              <button 
                className="add-member-bottom-btn"
                onClick={() => setShowAddMemberModal(true)}
                title="Add member to team"
              >
                <span className="add-member-icon">+</span>
                Add Member
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Add Task Modal */}
      <AddTaskModal 
        isOpen={showAddTaskModal}
        onClose={() => setShowAddTaskModal(false)}
        workspaceId={selectedTeam || undefined} // Pass the selected team/workspace ID
        onTaskAdded={() => {
          setShowAddTaskModal(false);
          // Only refresh if tasks are currently loaded for the selected team
          if (selectedTeam) {
            refreshTasks();
          }
        }}
      />
      
      {/* Add Team Popup */}
      <AddTeamPopup 
        isOpen={showAddTeamPopup}
        onClose={() => {
          setShowAddTeamPopup(false);
          setAddTeamAnchor(null);
        }}
        onSubmit={handleCreateTeam}
        anchorElement={addTeamAnchor}
      />
      
      {/* Edit Team Popup */}
      {editingTeam && (
        <AddTeamPopup 
          isOpen={showEditTeamPopup}
          onClose={() => {
            setShowEditTeamPopup(false);
            setEditingTeam(null);
          }}
          onSubmit={handleUpdateTeam}
          anchorElement={null}
          initialData={{ name: editingTeam.team_name, description: editingTeam.description || '' }}
        />
      )}
      
      {/* Context Menu */}
      {contextMenu?.visible && (
        <div 
          className="context-menu"
          style={{
            position: 'fixed',
            top: Math.min(contextMenu.y, window.innerHeight - 100),
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            zIndex: 1000
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {contextMenu.type === 'team' ? (
            <>
              <button className="context-menu-item" onClick={handleEditTeam}>
                Edit
              </button>
              <button className="context-menu-item context-menu-item-danger" onClick={handleDeleteTeam}>
                Delete
              </button>
            </>
          ) : (
            <button className="context-menu-item context-menu-item-danger" onClick={handleDeleteMember}>
              Remove from team
            </button>
          )}
        </div>
      )}
      
      {/* Task Detail Modal */}
      <TaskDetailModal 
        isOpen={showTaskDetailModal}
        onClose={() => setShowTaskDetailModal(false)}
        task={selectedTask}
        clickPosition={clickPosition}
        onTaskUpdated={() => {
          // Only refresh if there's a selected team (more targeted refresh)
          if (selectedTeam) {
            refreshTasks();
          }
        }}
      />
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deleteTarget && (
        <div className="delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-confirm-header">
              <h3>Delete Task</h3>
            </div>
            <div className="delete-confirm-content">
              <p>
                Are you sure you want to delete <strong>"{deleteTarget.title}"</strong>?
              </p>
              <p className="warning-text">
                This action cannot be undone.
              </p>
            </div>
            <div className="delete-confirm-actions">
              <button 
                className="cancel-btn"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className="delete-btn"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div className="modal-overlay" onClick={() => setShowAddMemberModal(false)}>
          <div className="add-member-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Team Member</h2>
              <button 
                className="modal-close-button"
                onClick={() => setShowAddMemberModal(false)}
                disabled={isAddingMember}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="add-member-form">
                <div className="form-group">
                  <label htmlFor="member-email">Email Address</label>
                  <input
                    id="member-email"
                    type="email"
                    value={addMemberEmail}
                    onChange={(e) => setAddMemberEmail(e.target.value)}
                    placeholder="Enter email address to invite"
                    disabled={isAddingMember}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddMember();
                      }
                    }}
                  />
                </div>
                <div className="form-actions">
                  <button 
                    className="cancel-btn"
                    onClick={() => setShowAddMemberModal(false)}
                    disabled={isAddingMember}
                  >
                    Cancel
                  </button>
                  <button 
                    className="add-btn"
                    onClick={handleAddMember}
                    disabled={isAddingMember || !addMemberEmail.trim()}
                  >
                    {isAddingMember ? 'Sending Invite...' : 'Send Invite'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskPage;
