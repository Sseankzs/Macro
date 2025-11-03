import { useEffect, useState } from 'react';
import './Dashboard.css';
import Sidebar from './Sidebar';
import { invoke } from '@tauri-apps/api/core';
import { supabase } from './lib/supabase';
import { BYPASS_LOGIN } from './config';
import { formatTimestamp } from './utils/timeFormat';

interface DebugPageProps {
  onLogout: () => void;
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant' | 'debug') => void;
}

interface DebugUser {
  id: string;
  name: string;
  email?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  image_url?: string | null;
  team_id?: string | null;
  workspace_id?: string | null;
  membership_role?: string | null;
}

interface WorkspaceRecord {
  id: string;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  description?: string | null;
  member_count?: number;
  created_by_name?: string | null;
  members?: { id: string; name: string; email?: string }[];
}

interface BackendWorkspace {
  id: string;
  name?: string | null;
  team_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  description?: string | null;
}

interface WorkspaceMemberRow {
  id?: string | null;
  user_id?: string | null;
  workspace_id?: string | null;
  role?: string | null;
  joined_at?: string | null;
}

interface AssigneeRecord {
  id: number;
  created_at?: string | null;
  task_id?: string | null;
  user_id?: string | null;
}

interface TaskRecord {
  id: string;
  title: string;
  description?: string | null;
  project_id?: string | null;
  workspace_id?: string | null;
  assignee_id?: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority?: 'low' | 'medium' | 'high' | null;
  due_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const isTauri = () => typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

function DebugPage({ onLogout, onPageChange }: DebugPageProps) {
  const [users, setUsers] = useState<DebugUser[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<DebugUser | null>(null);
  const [currentUserError, setCurrentUserError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState<boolean>(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState<boolean>(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<AssigneeRecord[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState<boolean>(false);
  const [assigneesError, setAssigneesError] = useState<string | null>(null);
  
  // Task-specific assignees
  const [taskId, setTaskId] = useState<string>('');
  const [taskAssignees, setTaskAssignees] = useState<AssigneeRecord[]>([]);
  const [taskAssigneesLoading, setTaskAssigneesLoading] = useState<boolean>(false);
  const [taskAssigneesError, setTaskAssigneesError] = useState<string | null>(null);
  
  // All tasks
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [tasksLoading, setTasksLoading] = useState<boolean>(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  
  // Task assignees mapping - maps task ID to array of assignee user info
  const [taskAssigneesMap, setTaskAssigneesMap] = useState<Record<string, { id: string; name: string; email?: string }[]>>({});
  
  // User task count state
  const [userTaskCount, setUserTaskCount] = useState<number>(0);
  const [userTaskCountLoading, setUserTaskCountLoading] = useState<boolean>(false);
  const [userTaskCountError, setUserTaskCountError] = useState<string | null>(null);

  // High priority task count state
  const [highPriorityTaskCount, setHighPriorityTaskCount] = useState<number>(0);
  const [highPriorityTaskCountLoading, setHighPriorityTaskCountLoading] = useState<boolean>(false);
  const [highPriorityTaskCountError, setHighPriorityTaskCountError] = useState<string | null>(null);

  // Closest deadline state
  const [closestDeadline, setClosestDeadline] = useState<string | null>(null);

  const fetchUserTaskCount = async () => {
    try {
      setUserTaskCountLoading(true);
      setUserTaskCountError(null);
      
      if (!currentUser) {
        setUserTaskCount(0);
        return;
      }

      if (isTauri()) {
        // Get all assignees and filter for the current user
        const allAssignees = await invoke<AssigneeRecord[]>('get_all_assignees');
        console.log('✅ All assignees loaded:', allAssignees);
        
        const userAssignees = allAssignees.filter(assignee => assignee.user_id === currentUser.id);
        console.log('✅ User assignees filtered:', userAssignees);
        
        if (!userAssignees || userAssignees.length === 0) {
          setUserTaskCount(0);
          return;
        }
        
        // Get task IDs assigned to the user
        const taskIds = userAssignees.map(assignee => assignee.task_id).filter(Boolean) as string[];
        
        if (taskIds.length === 0) {
          setUserTaskCount(0);
          return;
        }
        
        // Get all tasks and filter for todo/in_progress status and matching task IDs
        const allTasks = await invoke<TaskRecord[]>('get_all_tasks');
        const activeTasks = allTasks.filter(task => 
          taskIds.includes(task.id) && 
          (task.status === 'todo' || task.status === 'in_progress')
        );
        
        console.log('✅ Active tasks for user:', activeTasks);
        setUserTaskCount(activeTasks.length);
        return;
      }

      if (!BYPASS_LOGIN) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const userId = sessionData?.session?.user?.id;

        if (!userId) {
          setUserTaskCount(0);
          return;
        }

        // Query assignee table for current user's task assignments
        const { data: userAssignees, error: assigneesError } = await supabase
          .from('assignee')
          .select('task_id')
          .eq('user_id', currentUser.id);
        
        if (assigneesError) throw assigneesError;
        
        if (!userAssignees || userAssignees.length === 0) {
          setUserTaskCount(0);
          return;
        }
        
        const taskIds = userAssignees.map(assignee => assignee.task_id).filter(Boolean);
        
        if (taskIds.length === 0) {
          setUserTaskCount(0);
          return;
        }
        
        // Query tasks table for tasks with todo/in_progress status
        const { data: activeTasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id')
          .in('id', taskIds)
          .in('status', ['todo', 'in_progress']);
        
        if (tasksError) throw tasksError;
        
        setUserTaskCount(activeTasks?.length || 0);
        return;
      }

      // Mock data for bypass mode
      if (currentUser.id === 'mock-user-1') {
        setUserTaskCount(2); // mock-task-1 and mock-task-2 are todo/in_progress
      } else {
        setUserTaskCount(0);
      }
    } catch (err) {
      console.error('Failed to fetch user task count:', err);
      const message = err instanceof Error ? err.message : String(err);
      setUserTaskCountError(message);
      setUserTaskCount(0);
    } finally {
      setUserTaskCountLoading(false);
    }
  };

  const fetchHighPriorityTaskCount = async () => {
    try {
      setHighPriorityTaskCountLoading(true);
      setHighPriorityTaskCountError(null);
      
      if (!currentUser) {
        setHighPriorityTaskCount(0);
        setClosestDeadline(null);
        return;
      }

      if (isTauri()) {
        // Get all assignees and filter for the current user
        const allAssignees = await invoke<AssigneeRecord[]>('get_all_assignees');
        console.log('✅ All assignees loaded for high priority:', allAssignees);
        
        const userAssignees = allAssignees.filter(assignee => assignee.user_id === currentUser.id);
        console.log('✅ User assignees filtered for high priority:', userAssignees);
        
        if (!userAssignees || userAssignees.length === 0) {
          setHighPriorityTaskCount(0);
          setClosestDeadline(null);
          return;
        }
        
        // Get task IDs assigned to the user
        const taskIds = userAssignees.map(assignee => assignee.task_id).filter(Boolean) as string[];
        
        if (taskIds.length === 0) {
          setHighPriorityTaskCount(0);
          setClosestDeadline(null);
          return;
        }
        
        // Get all tasks and filter for todo/in_progress status, high priority, and matching task IDs
        const allTasks = await invoke<TaskRecord[]>('get_all_tasks');
        const highPriorityActiveTasks = allTasks.filter(task => 
          taskIds.includes(task.id) && 
          (task.status === 'todo' || task.status === 'in_progress') &&
          task.priority === 'high'
        );
        
        console.log('✅ High priority active tasks for user:', highPriorityActiveTasks);
        setHighPriorityTaskCount(highPriorityActiveTasks.length);

        // Find closest future deadline
        const now = new Date();
        const futureDeadlines = highPriorityActiveTasks
          .filter(task => task.due_date && new Date(task.due_date) > now)
          .map(task => new Date(task.due_date!))
          .sort((a, b) => a.getTime() - b.getTime());
        
        setClosestDeadline(futureDeadlines.length > 0 ? futureDeadlines[0].toISOString() : null);
        return;
      }

      if (!BYPASS_LOGIN) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const userId = sessionData?.session?.user?.id;

        if (!userId) {
          setHighPriorityTaskCount(0);
          setClosestDeadline(null);
          return;
        }

        // Query assignee table for current user's task assignments
        const { data: userAssignees, error: assigneesError } = await supabase
          .from('assignee')
          .select('task_id')
          .eq('user_id', currentUser.id);
        
        if (assigneesError) throw assigneesError;
        
        if (!userAssignees || userAssignees.length === 0) {
          setHighPriorityTaskCount(0);
          setClosestDeadline(null);
          return;
        }
        
        const taskIds = userAssignees.map(assignee => assignee.task_id).filter(Boolean);
        
        if (taskIds.length === 0) {
          setHighPriorityTaskCount(0);
          setClosestDeadline(null);
          return;
        }
        
        // Query tasks table for high priority tasks with todo/in_progress status
        const { data: highPriorityTasks, error: tasksError } = await supabase
          .from('tasks')
          .select('id, due_date')
          .in('id', taskIds)
          .in('status', ['todo', 'in_progress'])
          .eq('priority', 'high');
        
        if (tasksError) throw tasksError;
        
        setHighPriorityTaskCount(highPriorityTasks?.length || 0);

        // Find closest future deadline
        if (highPriorityTasks && highPriorityTasks.length > 0) {
          const now = new Date();
          const futureDeadlines = highPriorityTasks
            .filter(task => task.due_date && new Date(task.due_date) > now)
            .map(task => new Date(task.due_date))
            .sort((a, b) => a.getTime() - b.getTime());
          
          setClosestDeadline(futureDeadlines.length > 0 ? futureDeadlines[0].toISOString() : null);
        } else {
          setClosestDeadline(null);
        }
        return;
      }

      // Mock data for bypass mode
      if (currentUser.id === 'mock-user-1') {
        setHighPriorityTaskCount(1); // One high priority task from mock data
        // Set a mock future deadline (3 days from now)
        const mockDeadline = new Date();
        mockDeadline.setDate(mockDeadline.getDate() + 3);
        setClosestDeadline(mockDeadline.toISOString());
      } else {
        setHighPriorityTaskCount(0);
        setClosestDeadline(null);
      }
    } catch (err) {
      console.error('Failed to fetch high priority task count:', err);
      const message = err instanceof Error ? err.message : String(err);
      setHighPriorityTaskCountError(message);
      setHighPriorityTaskCount(0);
      setClosestDeadline(null);
    } finally {
      setHighPriorityTaskCountLoading(false);
    }
  };

  const fetchWorkspaceMembers = async () => {
    try {
      setMembersLoading(true);
      setMembersError(null);

      if (isTauri()) {
        const members = await invoke<WorkspaceMemberRow[]>('get_all_workspace_members');
        console.log('✅ Workspace members loaded:', members);
        
        // Enrich with user and workspace names
        const enrichedMembers = await Promise.all(
          (members ?? []).map(async (member) => {
            let enrichedMember = { ...member };
            
            // Try to get user name
            if (member.user_id) {
              try {
                const user = await invoke('get_user', { userId: member.user_id }) as DebugUser | null;
                if (user) {
                  (enrichedMember as any).user_name = user.name;
                  (enrichedMember as any).user_email = user.email;
                }
              } catch (userErr) {
                console.warn(`Failed to get user for ${member.user_id}:`, userErr);
              }
            }
            
            // Try to get workspace name
            if (member.workspace_id) {
              const workspace = workspaces.find(w => w.id === member.workspace_id);
              if (workspace) {
                (enrichedMember as any).workspace_name = workspace.name;
              }
            }
            
            return enrichedMember;
          })
        );
        
        setWorkspaceMembers(enrichedMembers);
        return;
      }

      if (!BYPASS_LOGIN) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const userId = sessionData?.session?.user?.id;

        if (!userId) {
          setWorkspaceMembers([]);
          return;
        }

        const { data: members, error: membersError } = await supabase
          .from('workspace_members')
          .select('id, user_id, workspace_id, role, joined_at');
        
        if (membersError) throw membersError;
        setWorkspaceMembers(members ?? []);
        return;
      }

      // Mock data for bypass mode
      setWorkspaceMembers([
        {
          id: 'mock-member-1',
          user_id: 'mock-user-1',
          workspace_id: 'mock-workspace-1',
          role: 'owner',
          joined_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error('Failed to fetch workspace members:', err);
      const message = err instanceof Error ? err.message : String(err);
      setMembersError(message);
      setWorkspaceMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  const fetchAssignees = async () => {
    try {
      setAssigneesLoading(true);
      setAssigneesError(null);

      if (isTauri()) {
        const assigneeData = await invoke<AssigneeRecord[]>('get_all_assignees');
        console.log('✅ Assignees loaded:', assigneeData);
        setAssignees(assigneeData ?? []);
        return;
      }

      if (!BYPASS_LOGIN) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const userId = sessionData?.session?.user?.id;

        if (!userId) {
          setAssignees([]);
          return;
        }

        const { data: assignees, error: assigneesError } = await supabase
          .from('assignee')
          .select('id, created_at, task_id, user_id');
        
        if (assigneesError) throw assigneesError;
        setAssignees(assignees ?? []);
        return;
      }

      // Mock data for bypass mode
      setAssignees([
        {
          id: 1,
          task_id: 'mock-task-1',
          user_id: 'mock-user-1',
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          task_id: 'mock-task-1',
          user_id: 'mock-user-2',
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error('Failed to fetch assignees:', err);
      const message = err instanceof Error ? err.message : String(err);
      setAssigneesError(message);
      setAssignees([]);
    } finally {
      setAssigneesLoading(false);
    }
  };

  const fetchTaskAssignees = async (targetTaskId: string) => {
    if (!targetTaskId.trim()) {
      setTaskAssigneesError('Please enter a task ID');
      return;
    }

    try {
      setTaskAssigneesLoading(true);
      setTaskAssigneesError(null);

      if (isTauri()) {
        const assigneeData = await invoke<AssigneeRecord[]>('get_task_assignees', { taskId: targetTaskId });
        console.log('✅ Task assignees loaded:', assigneeData);
        setTaskAssignees(assigneeData ?? []);
        return;
      }

      if (!BYPASS_LOGIN) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const userId = sessionData?.session?.user?.id;

        if (!userId) {
          setTaskAssignees([]);
          return;
        }

        const { data: assignees, error: assigneesError } = await supabase
          .from('assignee')
          .select('id, created_at, task_id, user_id')
          .eq('task_id', targetTaskId);
        
        if (assigneesError) throw assigneesError;
        setTaskAssignees(assignees ?? []);
        return;
      }

      // Mock data for bypass mode
      if (targetTaskId === 'mock-task-1') {
        setTaskAssignees([
          {
            id: 1,
            task_id: targetTaskId,
            user_id: 'mock-user-1',
            created_at: new Date().toISOString(),
          },
          {
            id: 2,
            task_id: targetTaskId,
            user_id: 'mock-user-2',
            created_at: new Date().toISOString(),
          },
        ]);
      } else {
        setTaskAssignees([]);
      }
    } catch (err) {
      console.error('Failed to fetch task assignees:', err);
      const message = err instanceof Error ? err.message : String(err);
      setTaskAssigneesError(message);
      setTaskAssignees([]);
    } finally {
      setTaskAssigneesLoading(false);
    }
  };

  const fetchTasks = async () => {
    try {
      setTasksLoading(true);
      setTasksError(null);

      if (isTauri()) {
        const taskData = await invoke<TaskRecord[]>('get_all_tasks');
        console.log('✅ Tasks loaded:', taskData);
        setTasks(taskData ?? []);
        return;
      }

      if (!BYPASS_LOGIN) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const userId = sessionData?.session?.user?.id;

        if (!userId) {
          setTasks([]);
          return;
        }

        const { data: tasks, error: tasksError } = await supabase
          .from('tasks')
          .select('*');
        
        if (tasksError) throw tasksError;
        setTasks(tasks ?? []);
        return;
      }

      // Mock data for bypass mode
      setTasks([
        {
          id: 'mock-task-1',
          title: 'Sample Task 1',
          description: 'This is a sample task for testing',
          workspace_id: 'mock-workspace-1',
          status: 'todo',
          priority: 'high',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'mock-task-2',
          title: 'Sample Task 2',
          description: 'Another sample task',
          workspace_id: 'mock-workspace-1',
          status: 'in_progress',
          priority: 'medium',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'mock-task-3',
          title: 'Completed Task',
          description: 'A finished task',
          workspace_id: 'mock-workspace-1',
          status: 'done',
          priority: 'low',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
      const message = err instanceof Error ? err.message : String(err);
      setTasksError(message);
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
    
    // After loading tasks, fetch the assignees mapping
    console.log('🔍 fetchTasks: About to call fetchAllTaskAssignees...');
    await fetchAllTaskAssignees();
    console.log('🔍 fetchTasks: fetchAllTaskAssignees completed');
  };

  // Function to fetch assignees for all tasks and create a mapping
  const fetchAllTaskAssignees = async () => {
    try {
      console.log('🔍 fetchAllTaskAssignees: Starting to fetch assignees...');
      // Always fetch fresh assignee data instead of using cached
      const assigneesData = await (async () => {
        if (isTauri()) {
          console.log('🔍 fetchAllTaskAssignees: Using Tauri mode');
          const result = await invoke<any[]>('get_all_assignees');
          console.log('🔍 fetchAllTaskAssignees: Tauri result:', result);
          // Convert the serde_json::Value objects to our expected format
          const convertedResult = result.map((item: any) => ({
            id: item.id,
            task_id: item.task_id,
            user_id: item.user_id,
            created_at: item.created_at
          }));
          console.log('🔍 fetchAllTaskAssignees: Converted result:', convertedResult);
          return convertedResult;
        }
        
        if (!BYPASS_LOGIN) {
          console.log('🔍 fetchAllTaskAssignees: Using Supabase mode');
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          const userId = sessionData?.session?.user?.id;
          if (!userId) return [];

          const { data: assignees, error: assigneesError } = await supabase
            .from('assignee')
            .select('id, created_at, task_id, user_id');
          
          if (assigneesError) throw assigneesError;
          console.log('🔍 fetchAllTaskAssignees: Supabase result:', assignees);
          return assignees ?? [];
        }

        // Mock data for bypass mode
        console.log('🔍 fetchAllTaskAssignees: Using mock mode');
        const mockData = [
          { id: 1, task_id: 'mock-task-1', user_id: 'mock-user-1', created_at: new Date().toISOString() },
          { id: 2, task_id: 'mock-task-1', user_id: 'mock-user-2', created_at: new Date().toISOString() },
          { id: 3, task_id: 'mock-task-2', user_id: 'mock-user-1', created_at: new Date().toISOString() },
        ];
        console.log('🔍 fetchAllTaskAssignees: Mock result:', mockData);
        return mockData;
      })();

      console.log('🔍 fetchAllTaskAssignees: Final assignees data:', assigneesData);

      // Group assignees by task_id and fetch user details
      const taskAssigneeGroups: Record<string, { id: string; name: string; email?: string }[]> = {};
      
      for (const assignee of assigneesData) {
        if (!assignee.task_id || !assignee.user_id) {
          console.log('🔍 fetchAllTaskAssignees: Skipping assignee with missing data:', assignee);
          continue;
        }
        
        if (!taskAssigneeGroups[assignee.task_id]) {
          taskAssigneeGroups[assignee.task_id] = [];
        }

        // Get user details for this assignee
        let userName = assignee.user_id;
        let userEmail: string | undefined;

        try {
          if (isTauri()) {
            const user = await invoke('get_user', { userId: assignee.user_id }) as DebugUser | null;
            if (user) {
              userName = user.name;
              userEmail = user.email || undefined;
            }
            console.log('🔍 fetchAllTaskAssignees: User details for', assignee.user_id, ':', { userName, userEmail });
          } else if (!BYPASS_LOGIN) {
            // For Supabase mode, we'd need to fetch from users table
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('id, name, email')
              .eq('id', assignee.user_id)
              .single();
            
            if (!userError && userData) {
              userName = userData.name || assignee.user_id;
              userEmail = userData.email || undefined;
            }
          } else {
            // Mock mode - provide mock names
            userName = assignee.user_id === 'mock-user-1' ? 'John Doe' : 
                     assignee.user_id === 'mock-user-2' ? 'Jane Smith' : assignee.user_id;
            userEmail = assignee.user_id === 'mock-user-1' ? 'john@example.com' : 
                       assignee.user_id === 'mock-user-2' ? 'jane@example.com' : undefined;
          }
        } catch (userErr) {
          console.warn(`🔍 fetchAllTaskAssignees: Failed to get user details for ${assignee.user_id}:`, userErr);
        }

        taskAssigneeGroups[assignee.task_id].push({
          id: assignee.user_id,
          name: userName,
          email: userEmail,
        });
      }

      console.log('🔍 fetchAllTaskAssignees: Final task assignee groups:', taskAssigneeGroups);
      setTaskAssigneesMap(taskAssigneeGroups);
    } catch (err) {
      console.error('🔍 fetchAllTaskAssignees: Error occurred:', err);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      setWorkspaceLoading(true);
      setWorkspaceError(null);

      if (isTauri()) {
        const userWorkspaces = await invoke<BackendWorkspace[]>('get_my_workspaces');
        const workspaceRows = (userWorkspaces ?? []).map((row) => ({
          id: row.id,
          name: row.name ?? row.team_name ?? 'Untitled workspace',
          created_at: row.created_at ?? null,
          updated_at: row.updated_at ?? null,
          created_by: row.created_by ?? null,
          description: row.description ?? null,
        }));

  const workspaceIds = workspaceRows.map((w) => w.id);
  const workspaceIdSet = new Set(workspaceIds);
        const memberCounts: Record<string, number> = {};
        const creatorNames: Record<string, string | null> = {};
        const workspaceMembers: Record<string, { id: string; name: string; email?: string }[]> = {};

        if (workspaceIds.length > 0) {
          // Get users first to have user data available
          let userMap = new Map<string, { name: string; email?: string }>();
          try {
            const users = await invoke<DebugUser[]>('get_all_users');
            (users ?? []).forEach((user) => {
              if (user?.id) {
                userMap.set(user.id, { 
                  name: user.name ?? user.email ?? 'Unknown user',
                  email: user.email ?? undefined
                });
              }
            });
          } catch (userErr) {
            console.warn('Failed to load users via Tauri command:', userErr);
          }

          try {
            const memberships = await invoke<WorkspaceMemberRow[]>('get_all_workspace_members');
            (memberships ?? []).forEach((row) => {
              const workspaceId = row.workspace_id ?? undefined;
              const userId = row.user_id ?? undefined;
              if (!workspaceId || !workspaceIdSet.has(workspaceId) || !userId) return;
              
              // Count members
              memberCounts[workspaceId] = (memberCounts[workspaceId] ?? 0) + 1;
              
              // Add member to workspace members list
              if (!workspaceMembers[workspaceId]) {
                workspaceMembers[workspaceId] = [];
              }
              const userData = userMap.get(userId);
              if (userData) {
                workspaceMembers[workspaceId].push({
                  id: userId,
                  name: userData.name,
                  email: userData.email
                });
              }
            });
          } catch (membershipErr) {
            console.warn('Failed to load workspace member counts via Tauri command:', membershipErr);
          }

          // Set creator names
          workspaceRows.forEach((workspace) => {
            if (workspace.created_by) {
              const userData = userMap.get(workspace.created_by);
              creatorNames[workspace.id] = userData?.name ?? 'Unknown user';
            }
          });
        }

        const mapped: WorkspaceRecord[] = workspaceRows.map((workspace) => ({
          ...workspace,
          member_count: memberCounts[workspace.id] ?? 0,
          created_by_name: workspace.created_by ? creatorNames[workspace.id] ?? null : null,
          members: workspaceMembers[workspace.id] ?? [],
        }));
        setWorkspaces(mapped);
        return;
      }

      if (!BYPASS_LOGIN) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const userId = sessionData?.session?.user?.id;

        if (!userId) {
          setWorkspaces([]);
          return;
        }

        const workspaceMap = new Map<string, WorkspaceRecord>();

        try {
          const { data: createdRows, error: createdError } = await supabase
            .from('workspaces')
            .select('id, name, created_at, updated_at, created_by, description')
            .eq('created_by', userId);
          if (createdError) throw createdError;
          (createdRows ?? []).forEach((row: any) => {
            if (!row?.id) return;
            workspaceMap.set(row.id, {
              id: row.id,
              name: row.name ?? 'Untitled workspace',
              created_at: row.created_at ?? null,
              updated_at: row.updated_at ?? null,
              created_by: row.created_by ?? null,
              description: row.description ?? null,
            });
          });
        } catch (createdErr) {
          console.warn('Failed to fetch workspaces created by user:', createdErr);
        }

        let membershipWorkspaceIds: string[] = [];
        try {
          const { data: membershipRows, error: membershipError } = await supabase
            .from('workspace_members')
            .select('workspace_id')
            .eq('user_id', userId);
          if (membershipError) throw membershipError;
          const ids = new Set<string>();
          (membershipRows ?? []).forEach((row: any) => {
            if (row?.workspace_id) {
              ids.add(row.workspace_id);
            }
          });
          membershipWorkspaceIds = Array.from(ids);
        } catch (membershipErr) {
          console.warn('Failed to fetch workspace memberships for user:', membershipErr);
        }

        if (membershipWorkspaceIds.length > 0) {
          try {
            const { data: memberWorkspaces, error: memberWorkspaceError } = await supabase
              .from('workspaces')
              .select('id, name, created_at, updated_at, created_by, description')
              .in('id', membershipWorkspaceIds);
            if (memberWorkspaceError) throw memberWorkspaceError;
            (memberWorkspaces ?? []).forEach((row: any) => {
              if (!row?.id) return;
              workspaceMap.set(row.id, {
                id: row.id,
                name: row.name ?? 'Untitled workspace',
                created_at: row.created_at ?? null,
                updated_at: row.updated_at ?? null,
                created_by: row.created_by ?? null,
                description: row.description ?? null,
              });
            });
          } catch (memberWorkspaceErr) {
            console.warn('Failed to fetch workspace records for memberships:', memberWorkspaceErr);
          }
        }

        const workspaceRows = Array.from(workspaceMap.values());
        const workspaceIds = workspaceRows.map((w) => w.id);

        if (workspaceIds.length > 0) {
          // Get all users first to have user data available
          let userMap = new Map<string, { name: string; email?: string }>();
          try {
            const { data: users, error: userError } = await supabase
              .from('users')
              .select('id, name, email');
            if (userError) throw userError;
            (users ?? []).forEach((user: any) => {
              if (user?.id) {
                userMap.set(user.id, {
                  name: user.name ?? user.email ?? 'Unknown user',
                  email: user.email ?? undefined
                });
              }
            });
          } catch (userErr) {
            console.warn('Failed to load users via Supabase:', userErr);
          }

          // Get member counts and member lists
          const workspaceMembers: Record<string, { id: string; name: string; email?: string }[]> = {};
          try {
            const { data: membershipData, error: membershipError } = await supabase
              .from('workspace_members')
              .select('workspace_id, user_id')
              .in('workspace_id', workspaceIds);
            if (membershipError) throw membershipError;
            const counts = new Map<string, number>();
            (membershipData ?? []).forEach((row: any) => {
              const workspaceId = row?.workspace_id;
              const userId = row?.user_id;
              if (!workspaceId || !userId) return;
              
              // Count members
              counts.set(workspaceId, (counts.get(workspaceId) ?? 0) + 1);
              
              // Add member to workspace members list
              if (!workspaceMembers[workspaceId]) {
                workspaceMembers[workspaceId] = [];
              }
              const userData = userMap.get(userId);
              if (userData) {
                workspaceMembers[workspaceId].push({
                  id: userId,
                  name: userData.name,
                  email: userData.email
                });
              }
            });
            workspaceRows.forEach((row) => {
              row.member_count = counts.get(row.id) ?? 0;
              (row as any).members = workspaceMembers[row.id] ?? [];
            });
          } catch (membershipErr) {
            console.warn('Failed to load workspace member counts via Supabase:', membershipErr);
          }

          try {
            const creatorIds = workspaceRows
              .map((row) => row.created_by)
              .filter((id): id is string => Boolean(id));
            if (creatorIds.length > 0) {
              workspaceRows.forEach((row) => {
                if (row.created_by) {
                  const userData = userMap.get(row.created_by);
                  row.created_by_name = userData?.name ?? 'Unknown user';
                }
              });
            }
          } catch (creatorErr) {
            console.warn('Failed to load workspace creator names via Supabase:', creatorErr);
          }
        }

        setWorkspaces(workspaceRows);
        return;
      }

      setWorkspaces([
        {
          id: 'mock-workspace-1',
          name: 'Demo Workspace',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: 'mock-user-1',
          description: 'Static workspace for debug mode',
          member_count: 3,
          created_by_name: 'Dev User',
          members: [
            { id: 'mock-user-1', name: 'Dev User', email: 'dev@example.com' },
            { id: 'mock-user-2', name: 'Test User', email: 'test@example.com' },
            { id: 'mock-user-3', name: 'Demo User' }
          ]
        },
      ]);
    } catch (err) {
      console.error('Failed to fetch workspaces for debug page:', err);
      const message = err instanceof Error ? err.message : String(err);
      setWorkspaceError(message);
      setWorkspaces([]);
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isTauri()) {
        const data = await invoke<DebugUser[]>('get_all_users');
        const normalized = data.map((user) => ({
          ...user,
          membership_role: (user as any)?.membership_role ?? null,
        }));
        setUsers(normalized);
        return;
      }

      // Browser/dev mode: attempt Supabase direct query if login isn't bypassed.
      if (!BYPASS_LOGIN) {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email, created_at, updated_at, image_url');
        if (error) throw error;

        const { data: membershipRows, error: membershipError } = await supabase
          .from('workspace_members')
          .select('user_id, workspace_id, role');

        if (membershipError) {
          console.warn('Failed to load workspace memberships for debug users:', membershipError);
        }

        const membershipMap = new Map<string, { workspace_id: string | null; membership_role: string | null }>();
        (membershipRows ?? []).forEach((row: any) => {
          if (row?.user_id) {
            membershipMap.set(row.user_id, {
              workspace_id: row.workspace_id ?? null,
              membership_role: row.role ?? null,
            });
          }
        });

        const enriched = (data ?? []).map((user) => {
          const membership = membershipMap.get(user.id);
          return {
            ...user,
            team_id: membership?.workspace_id ?? null,
            workspace_id: membership?.workspace_id ?? null,
            membership_role: membership?.membership_role ?? null,
          } as DebugUser;
        });

        setUsers(enriched);
        return;
      }

      // Fallback mock data for pure dev mode
      setUsers([
        {
          id: 'mock-user-1',
          name: 'Dev User',
          email: 'dev@example.com',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          image_url: null,
          team_id: 'mock-team-1',
          workspace_id: 'mock-team-1',
          membership_role: 'owner',
        },
      ]);
    } catch (err) {
      console.error('Failed to fetch users for debug page:', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      setCurrentUserError(null);

      if (isTauri()) {
        const data = await invoke<DebugUser>('get_current_user');
        setCurrentUser({
          ...data,
          membership_role: (data as any)?.membership_role ?? null,
        });
        return;
      }

      if (!BYPASS_LOGIN) {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        const user = data?.user;
        if (user) {
          let membershipRole: string | null = null;
          let membershipTeam: string | null = null;

          try {
            const { data: membershipRows, error: membershipError } = await supabase
              .from('workspace_members')
              .select('workspace_id, role')
              .eq('user_id', user.id)
              .limit(1);

            if (membershipError) {
              console.warn('Failed to load membership for current user:', membershipError);
            } else if (membershipRows && membershipRows.length > 0) {
              membershipRole = (membershipRows[0] as any)?.role ?? null;
              membershipTeam = (membershipRows[0] as any)?.workspace_id ?? null;
            }
          } catch (membershipErr) {
            console.warn('Membership lookup failed for current user:', membershipErr);
          }

          setCurrentUser({
            id: user.id,
            name: user.user_metadata?.name || user.email || 'Unknown',
            email: user.email,
            created_at: user.created_at ?? null,
            updated_at: (user as any)?.updated_at ?? user.last_sign_in_at ?? null,
            image_url: (user.user_metadata as any)?.avatar_url ?? null,
            membership_role: membershipRole,
            team_id: membershipTeam,
            workspace_id: membershipTeam,
          });
        } else {
          setCurrentUser(null);
        }
        return;
      }

      const fallback = (window as any).__INITIAL_CURRENT_USER__ ?? { id: 'dev', name: 'Dev User', membership_role: 'owner' };
      setCurrentUser({
        id: fallback.id ?? 'dev',
        name: fallback.name ?? 'Dev User',
        email: fallback.email ?? 'dev@example.com',
        created_at: null,
        updated_at: null,
        image_url: fallback.image_url ?? null,
        membership_role: fallback.membership_role ?? 'owner',
        team_id: fallback.team_id ?? null,
        workspace_id: fallback.workspace_id ?? fallback.team_id ?? null,
      });
    } catch (err) {
      console.error('Failed to fetch current user for debug page:', err);
      const message = err instanceof Error ? err.message : String(err);
      setCurrentUser(null);
      setCurrentUserError(message);
    }
  };

  const handleRefresh = () => {
    fetchUsers();
    fetchCurrentUser();
    fetchWorkspaces();
    fetchUserTaskCount();
  };

  useEffect(() => {
    fetchUsers();
    fetchCurrentUser();
    fetchWorkspaces();
    fetchAssignees();
    fetchTasks();
  }, []);

  // Fetch workspace members after workspaces are loaded
  useEffect(() => {
    if (workspaces.length > 0) {
      fetchWorkspaceMembers();
    }
  }, [workspaces]);

  // Calculate user task count when current user and tasks are available
  useEffect(() => {
    if (currentUser && tasks.length >= 0) { // >= 0 to handle empty task lists
      fetchUserTaskCount();
      fetchHighPriorityTaskCount();
    }
  }, [currentUser, tasks, assignees]);

  return (
    <div className="dashboard-container">
      <Sidebar
        currentPage="debug"
        onLogout={onLogout}
        onPageChange={onPageChange || (() => {})}
      />
      <div className="main-content debug-main-content">
        <div className="tasks-container" style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div className="tasks-header">
            <h1>Debug Utilities</h1>
            <div className="header-actions">
              <button className="btn-text" onClick={handleRefresh} disabled={loading || workspaceLoading}>
                Refresh
              </button>
            </div>
          </div>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>Current User</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>Resolved identity for the active session.</p>
              </div>
              <button className="btn-text" onClick={fetchCurrentUser} style={{ minWidth: 90 }}>
                Reload
              </button>
            </header>

            {currentUserError && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                Failed to load current user: {currentUserError}
              </div>
            )}

            {currentUser ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Field</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['ID', currentUser.id],
                      ['Name', currentUser.name || '—'],
                      ['Email', currentUser.email || '—'],
                      ['Created', currentUser.created_at ? new Date(currentUser.created_at).toLocaleString() : '—'],
                      ['Updated', currentUser.updated_at ? new Date(currentUser.updated_at).toLocaleString() : '—'],
                      ['Image URL', currentUser.image_url || '—'],
                      ['Membership Role', currentUser.membership_role || '—'],
                      ['Workspace ID', currentUser.workspace_id || currentUser.team_id || '—'],
                    ].map(([label, value]) => (
                      <tr key={label as string} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 16px', width: '30%', fontWeight: 500 }}>{label}</td>
                        <td style={{ padding: '12px 16px', color: label === 'Email' ? '#2563eb' : undefined }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#6b7280' }}>
                No current user detected.
              </div>
            )}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>User Active Tasks</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>Number of tasks assigned to the current user with status 'todo' or 'in_progress'.</p>
              </div>
              <button className="btn-text" onClick={fetchUserTaskCount} disabled={userTaskCountLoading} style={{ minWidth: 90 }}>
                {userTaskCountLoading ? 'Loading...' : 'Reload'}
              </button>
            </header>

            {userTaskCountError && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                Failed to load user task count: {userTaskCountError}
              </div>
            )}

            {!currentUser ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#6b7280' }}>
                No current user available to calculate task count.
              </div>
            ) : (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: '32px 24px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: 12,
                color: 'white',
                textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '8px' }}>
                    {userTaskCountLoading ? '...' : userTaskCount}
                  </div>
                  <div style={{ fontSize: '16px', opacity: 0.9 }}>
                    Active Tasks for {currentUser.name}
                  </div>
                  <div style={{ fontSize: '14px', opacity: 0.7, marginTop: '4px' }}>
                    (Todo + In Progress)
                  </div>
                </div>
              </div>
            )}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>High Priority Tasks</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>Number of high priority tasks assigned to the current user with status 'todo' or 'in_progress'.</p>
              </div>
              <button className="btn-text" onClick={fetchHighPriorityTaskCount} disabled={highPriorityTaskCountLoading} style={{ minWidth: 90 }}>
                {highPriorityTaskCountLoading ? 'Loading...' : 'Reload'}
              </button>
            </header>

            {highPriorityTaskCountError && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                Failed to load high priority task count: {highPriorityTaskCountError}
              </div>
            )}

            {!currentUser ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#6b7280' }}>
                No current user available to calculate high priority task count.
              </div>
            ) : (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: '32px 24px',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                borderRadius: 12,
                color: 'white',
                textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '8px' }}>
                    {highPriorityTaskCountLoading ? '...' : highPriorityTaskCount}
                  </div>
                  <div style={{ fontSize: '16px', opacity: 0.9 }}>
                    High Priority Tasks for {currentUser.name}
                  </div>
                  <div style={{ fontSize: '14px', opacity: 0.7, marginTop: '4px' }}>
                    (Todo + In Progress)
                  </div>
                  {closestDeadline && (
                    <div style={{ fontSize: '14px', opacity: 0.8, marginTop: '12px', padding: '8px 12px', background: 'rgba(255,255,255,0.15)', borderRadius: 8 }}>
                      📅 Next deadline: {formatTimestamp(closestDeadline, 'relative')}
                    </div>
                  )}
                  {!closestDeadline && highPriorityTaskCount > 0 && !highPriorityTaskCountLoading && (
                    <div style={{ fontSize: '14px', opacity: 0.6, marginTop: '12px', fontStyle: 'italic' }}>
                      No upcoming deadlines
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>Workspaces</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>Live snapshot of workspaces from Supabase.</p>
              </div>
              <button className="btn-text" onClick={fetchWorkspaces} disabled={workspaceLoading} style={{ minWidth: 90 }}>
                Reload
              </button>
            </header>

            {workspaceError && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                Failed to load workspaces: {workspaceError}
              </div>
            )}

            {workspaces.length === 0 && !workspaceLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                No workspaces found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Members</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Member Tags</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Created</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Updated</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Created By</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Creator Name</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspaces.map((workspace) => (
                      <tr key={workspace.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 16px' }}>{workspace.name || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{workspace.member_count ?? 0}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {workspace.members && workspace.members.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {workspace.members.map((member) => (
                                <span
                                  key={member.id}
                                  style={{
                                    display: 'inline-block',
                                    background: '#007AFF',
                                    color: 'white',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap',
                                    maxWidth: '120px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}
                                  title={member.email ? `${member.name} (${member.email})` : member.name}
                                >
                                  {member.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: '#6b7280', fontStyle: 'italic' }}>No members</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>{workspace.created_at ? new Date(workspace.created_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{workspace.updated_at ? new Date(workspace.updated_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 16px', color: workspace.created_by ? '#2563eb' : undefined }}>{workspace.created_by || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{workspace.created_by_name || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{workspace.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>Workspace Members</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>All workspace membership records from the backend.</p>
              </div>
              {membersLoading && <span style={{ color: '#6b7280', fontSize: 14 }}>Loading…</span>}
            </header>

            {membersError && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                Failed to load workspace members: {membersError}
              </div>
            )}

            {workspaceMembers.length === 0 && !membersLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                No workspace members found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>User ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>User Name</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>User Email</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Workspace ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Workspace Name</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Role</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspaceMembers.map((member, index) => (
                      <tr key={member.id || `member-${index}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#6b7280' }}>{member.id || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#2563eb' }}>{member.user_id || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{(member as any).user_name || '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#2563eb' }}>{(member as any).user_email || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#2563eb' }}>{member.workspace_id || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{(member as any).workspace_name || '—'}</td>
                        <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                          <span style={{ 
                            padding: '4px 8px', 
                            borderRadius: '6px', 
                            fontSize: '12px', 
                            fontWeight: 500,
                            background: member.role === 'owner' ? '#dbeafe' : member.role === 'admin' ? '#fef3c7' : '#f3f4f6',
                            color: member.role === 'owner' ? '#1d4ed8' : member.role === 'admin' ? '#d97706' : '#6b7280'
                          }}>
                            {member.role || 'member'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>{member.joined_at ? new Date(member.joined_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>Users</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>Live snapshot of users from the backend.</p>
              </div>
              {loading && <span style={{ color: '#6b7280', fontSize: 14 }}>Loading…</span>}
            </header>

            {error && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                Failed to load users: {error}
              </div>
            )}

            {users.length === 0 && !loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                No users found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Email</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Created</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Updated</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Image URL</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Membership Role</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Workspace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 16px' }}>{user.name || '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#2563eb' }}>{user.email || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{user.created_at ? new Date(user.created_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{user.updated_at ? new Date(user.updated_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 16px', color: user.image_url ? '#2563eb' : undefined }}>{user.image_url || '—'}</td>
                        <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>{user.membership_role || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{user.workspace_id || user.team_id || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>Task Assignees</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>Live snapshot of task assignments from Supabase.</p>
              </div>
              <button className="btn-text" onClick={fetchAssignees} disabled={assigneesLoading} style={{ minWidth: 90 }}>
                {assigneesLoading ? 'Loading...' : 'Reload'}
              </button>
            </header>

            {assigneesError && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                Failed to load assignees: {assigneesError}
              </div>
            )}

            {assignees.length === 0 && !assigneesLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                No task assignees found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Task ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>User ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignees.map((assignee) => (
                      <tr key={assignee.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 16px' }}>{assignee.id}</td>
                        <td style={{ padding: '12px 16px', color: '#2563eb', fontFamily: 'monospace', fontSize: '12px' }}>{assignee.task_id || '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#2563eb', fontFamily: 'monospace', fontSize: '12px' }}>{assignee.user_id || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{assignee.created_at ? new Date(assignee.created_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>Assignees by Task</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>Query assignees for a specific task ID.</p>
              </div>
            </header>

            <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '14px' }}>
                  Task ID
                </label>
                <input
                  type="text"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  placeholder="Enter task ID (e.g., uuid or mock-task-1)"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: '14px',
                    fontFamily: 'monospace'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      fetchTaskAssignees(taskId);
                    }
                  }}
                />
              </div>
              <button 
                className="btn-text" 
                onClick={() => fetchTaskAssignees(taskId)} 
                disabled={taskAssigneesLoading || !taskId.trim()}
                style={{ minWidth: 100, padding: '8px 16px' }}
              >
                {taskAssigneesLoading ? 'Loading...' : 'Query'}
              </button>
            </div>

            {taskAssigneesError && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                {taskAssigneesError}
              </div>
            )}

            {taskId && (
              <>
                {taskAssignees.length === 0 && !taskAssigneesLoading && !taskAssigneesError ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                    No assignees found for task: <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{taskId}</code>
                  </div>
                ) : (
                  taskAssignees.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ padding: '12px 16px', fontWeight: 600 }}>ID</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600 }}>Task ID</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600 }}>User ID</th>
                            <th style={{ padding: '12px 16px', fontWeight: 600 }}>Created At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {taskAssignees.map((assignee) => (
                            <tr key={assignee.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '12px 16px' }}>{assignee.id}</td>
                              <td style={{ padding: '12px 16px', color: '#2563eb', fontFamily: 'monospace', fontSize: '12px' }}>{assignee.task_id || '—'}</td>
                              <td style={{ padding: '12px 16px', color: '#2563eb', fontFamily: 'monospace', fontSize: '12px' }}>{assignee.user_id || '—'}</td>
                              <td style={{ padding: '12px 16px' }}>{assignee.created_at ? new Date(assignee.created_at).toLocaleString() : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </>
            )}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 8px 30px rgba(15, 23, 42, 0.08)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0 }}>All Tasks</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280' }}>Complete list of tasks from the database.</p>
                <div style={{ margin: '8px 0 0', fontSize: '12px', color: '#6b7280' }}>
                  Debug: {Object.keys(taskAssigneesMap).length} tasks with assignees, {Object.values(taskAssigneesMap).flat().length} total assignees
                </div>
              </div>
              <button className="btn-text" onClick={fetchTasks} disabled={tasksLoading} style={{ minWidth: 90 }}>
                {tasksLoading ? 'Loading...' : 'Reload'}
              </button>
              <button className="btn-text" onClick={fetchAllTaskAssignees} style={{ minWidth: 120, marginLeft: 8 }}>
                Debug Assignees
              </button>
            </header>

            {tasksError && (
              <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: '#fee2e2', color: '#b91c1c' }}>
                Failed to load tasks: {tasksError}
              </div>
            )}

            {tasks.length === 0 && !tasksLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                No tasks found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                {(() => {
                  console.log('🔍 Current taskAssigneesMap when rendering table:', taskAssigneesMap);
                  console.log('🔍 Current tasks when rendering table:', tasks.map(t => ({ id: t.id, title: t.title })));
                  return null;
                })()}
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Title</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Priority</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Assignees</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Workspace ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Project ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Assignee ID</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Due Date</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Created</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Updated</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <tr key={task.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 16px', color: '#2563eb', fontFamily: 'monospace', fontSize: '12px' }}>{task.id}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 500 }}>{task.title}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 500,
                            backgroundColor: 
                              task.status === 'done' ? '#dcfce7' :
                              task.status === 'in_progress' ? '#fef3c7' : '#f3f4f6',
                            color:
                              task.status === 'done' ? '#166534' :
                              task.status === 'in_progress' ? '#92400e' : '#6b7280'
                          }}>
                            {task.status === 'in_progress' ? 'In Progress' : 
                             task.status === 'done' ? 'Done' : 'Todo'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {task.priority ? (
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 500,
                              backgroundColor: 
                                task.priority === 'high' ? '#fecaca' :
                                task.priority === 'medium' ? '#fed7aa' : '#d1fae5',
                              color:
                                task.priority === 'high' ? '#991b1b' :
                                task.priority === 'medium' ? '#9a3412' : '#065f46'
                            }}>
                              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {(() => {
                            const assigneesForTask = taskAssigneesMap[task.id];
                            console.log(`🔍 Rendering assignees for task ${task.id}:`, assigneesForTask);
                            
                            if (assigneesForTask && assigneesForTask.length > 0) {
                              return (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {assigneesForTask.map((assignee, index) => (
                                    <span
                                      key={`${task.id}-${assignee.id}-${index}`}
                                      style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        backgroundColor: '#dbeafe',
                                        color: '#1e40af',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title={assignee.email || assignee.name}
                                    >
                                      {assignee.name}
                                    </span>
                                  ))}
                                </div>
                              );
                            } else {
                              return '—';
                            }
                          })()}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#2563eb', fontFamily: 'monospace', fontSize: '12px' }}>{task.workspace_id || '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#2563eb', fontFamily: 'monospace', fontSize: '12px' }}>{task.project_id || '—'}</td>
                        <td style={{ padding: '12px 16px', color: '#2563eb', fontFamily: 'monospace', fontSize: '12px' }}>{task.assignee_id || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{task.created_at ? new Date(task.created_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 16px' }}>{task.updated_at ? new Date(task.updated_at).toLocaleString() : '—'}</td>
                        <td style={{ padding: '12px 16px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default DebugPage;
