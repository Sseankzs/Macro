import React, { useState, useEffect } from 'react';
import './TaskPage.css';
import Sidebar from './Sidebar';
import AddTaskModal from './AddTaskModal';
import TaskDetailModal from './TaskDetailModal';
import { invoke } from '@tauri-apps/api/core';
import { TasksSkeletonGrid } from './components/LoadingComponents';
import { E2EE_TASKS } from './config';
import { decryptTextForTeam, isEncrypted } from './crypto/e2ee';

// Check if we're running in Tauri environment
const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
}

// Backend Task interface (matches the Rust backend)
interface BackendTask {
  id: string;
  title: string;
  description?: string;
  project_id: string | null;
  assignee_id?: string;
  status: 'todo' | 'in_progress' | 'done'; // Backend returns lowercase
  priority?: 'low' | 'medium' | 'high'; // Backend returns lowercase
  due_date?: string;
  created_at: string;
  updated_at: string;
}

// Frontend Task interface (for UI display)
interface Task {
  id: string;
  title: string;
  description: string;
  project_id: string;
  assignee_id?: string;
  status: 'Todo' | 'InProgress' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  due_date?: string;
  created_at: string;
  updated_at: string;
  // UI-specific fields
  assignee_name?: string;
  project_name?: string;
}

// Team member interface for task assignment
interface TeamMember {
  id: string;
  name: string;
  team_id?: string;
}

// Team interface
interface Team {
  id: string;
  team_name: string;
  created_at?: string;
  updated_at?: string;
}

// Project interface
interface Project {
  id: string;
  name: string;
  team_id?: string;
  manager_id?: string;
  description?: string;
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | undefined>();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{type: 'task', id: string, title: string} | null>(null);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const [showE2EEHelp, setShowE2EEHelp] = useState(false);
  const [membersSidebarCollapsed, setMembersSidebarCollapsed] = useState(false);
  const [teamMemberCounts, setTeamMemberCounts] = useState<Record<string, number>>({});

  // Load all data from backend
  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (isTauri()) {
        // Load tasks, teams, projects, and all members in parallel
        const [backendTasks, backendTeams, backendProjects, backendMembers] = await Promise.all([
          invoke('get_my_tasks') as Promise<BackendTask[]>,
          invoke('get_all_teams') as Promise<Team[]>,
          invoke('get_all_projects') as Promise<Project[]>,
          invoke('get_all_users') as Promise<TeamMember[]>
        ]);

        console.log('=== BACKEND DATA DEBUG ===');
        console.log('Backend tasks:', JSON.stringify(backendTasks, null, 2));
        console.log('Backend teams:', JSON.stringify(backendTeams, null, 2));
        console.log('Backend projects:', JSON.stringify(backendProjects, null, 2));
        console.log('Backend members:', JSON.stringify(backendMembers, null, 2));
        console.log('========================');

        // Transform tasks with proper assignee and project names
        const transformedTasks: Task[] = await Promise.all(backendTasks.map(async (task) => {
          const assignee = backendMembers.find(member => member.id === task.assignee_id);
          const project = backendProjects.find(proj => proj.id === task.project_id);
          
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
            project_id: task.project_id || '',
            assignee_id: task.assignee_id,
            status: frontendStatus,
            priority: frontendPriority,
            due_date: task.due_date,
            created_at: task.created_at,
            updated_at: task.updated_at,
            assignee_name: assignee?.name,
            project_name: project?.name || 'Unassigned Project'
          };
        }));

        console.log('=== FRONTEND TRANSFORMATION DEBUG ===');
        console.log('Transformed tasks:', JSON.stringify(transformedTasks, null, 2));
        console.log('=====================================');
        
        setAllTasks(transformedTasks);
        setTeams(backendTeams);
        setProjects(backendProjects);
        
        // Select first team if available and none selected
        if (backendTeams.length > 0 && !selectedTeam) {
          setSelectedTeam(backendTeams[0].id);
        }
      } else {
        // Browser mode - use mock data
        const mockTeams: Team[] = [
          { id: '1', team_name: 'Frontend Team' },
          { id: '2', team_name: 'Backend Team' },
        ];
        
        const mockProjects: Project[] = [
          { id: 'project-1', name: 'Frontend App', team_id: '1' },
          { id: 'project-2', name: 'Backend API', team_id: '2' },
        ];
        
        const mockTasks: Task[] = [
          {
            id: '1',
            title: 'Implement user authentication',
            description: 'Add login and registration functionality',
            project_id: 'project-1',
            assignee_id: 'user-1',
            status: 'Todo',
            priority: 'High',
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            assignee_name: 'John Doe',
            project_name: 'Frontend App'
          },
          {
            id: '2',
            title: 'Fix responsive design issues',
            description: 'Resolve mobile layout problems',
            project_id: 'project-1',
            assignee_id: 'user-2',
            status: 'InProgress',
            priority: 'Medium',
            due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            assignee_name: 'Jane Smith',
            project_name: 'Frontend App'
          },
          {
            id: '3',
            title: 'Write API documentation',
            description: 'Document all REST API endpoints',
            project_id: 'project-2',
            assignee_id: 'user-1',
            status: 'Done',
            priority: 'Low',
            due_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            assignee_name: 'John Doe',
            project_name: 'Backend API'
          }
        ];

        setAllTasks(mockTasks);
        setTeams(mockTeams);
        setProjects(mockProjects);
        
        if (mockTeams.length > 0 && !selectedTeam) {
          setSelectedTeam(mockTeams[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load tasks and team data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load team members when team is selected
  const loadTeamMembers = async (teamId: string | null) => {
    if (!teamId) {
      setTeamMembers([]);
      return;
    }
    
    try {
      if (isTauri()) {
        const members = await invoke('get_users_by_team', { teamId }) as TeamMember[];
        setTeamMembers(members);
      } else {
        // Browser mode - mock data
        const mockMembers: TeamMember[] = [
          { id: 'user-1', name: 'John Doe', team_id: teamId },
          { id: 'user-2', name: 'Jane Smith', team_id: teamId },
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
    
    // Get projects for the selected team
    const teamProjectIds = projects
      .filter(project => project.team_id === selectedTeam)
      .map(project => project.id);
    
    // Filter tasks that belong to team projects
    const filteredTasks = allTasks.filter(task => 
      teamProjectIds.includes(task.project_id)
    );
    
    setTasks(filteredTasks);
  }, [selectedTeam, allTasks, projects]);

  // Load team members when team is selected
  useEffect(() => {
    loadTeamMembers(selectedTeam);
  }, [selectedTeam]);

  // Update member counts when teams change
  useEffect(() => {
    const counts: Record<string, number> = {};
    teams.forEach(team => {
      // Use mock numbers for now: random between 3-10 members
      // If we have actual member data, prefer it, otherwise use mock
      const actualMembers = teamMembers.filter(m => m.team_id === team.id);
      if (actualMembers.length > 0) {
        counts[team.id] = actualMembers.length;
      } else {
        // Generate a consistent mock number based on team ID
        const hash = team.id.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);
        counts[team.id] = (Math.abs(hash) % 8) + 3; // 3-10 members
      }
    });
    setTeamMemberCounts(counts);
  }, [teams, teamMembers]);

  // Function to add a new team (skeleton - mock implementation for now)
  const handleAddTeam = () => {
    // Find the next team number
    const existingTeamNumbers = teams
      .map(team => {
        const match = team.team_name.match(/^Team (\d+)$/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter(num => num > 0);
    
    const nextNumber = existingTeamNumbers.length > 0 
      ? Math.max(...existingTeamNumbers) + 1 
      : 1;
    
    const newTeamName = `Team ${nextNumber}`;
    
    // Create mock team (no backend call for now)
    const mockTeam: Team = {
      id: `team-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      team_name: newTeamName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Add to local state
    setTeams(prev => [...prev, mockTeam]);
    
    // Set as selected team
    setSelectedTeam(mockTeam.id);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Get tasks by status
  const getTasksByStatus = (status: 'Todo' | 'InProgress' | 'Done') => {
    const filteredTasks = tasks.filter(task => task.status === status);
    console.log(`=== TASKS FOR STATUS: ${status} ===`);
    console.log('All tasks:', tasks);
    console.log('Filtered tasks:', filteredTasks);
    console.log('===============================');
    return filteredTasks;
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

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTask(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverStatus(null);
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  };

  const handleDragLeave = () => {
    setDragOverStatus(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: 'Todo' | 'InProgress' | 'Done') => {
    e.preventDefault();
    setDragOverStatus(null);
    
    if (!draggedTask) return;
    
    const task = tasks.find(t => t.id === draggedTask);
    if (!task || task.status === newStatus) {
      setDraggedTask(null);
      return;
    }
    
    try {
      // Optimistically update the UI
      setTasks(prev => prev.map(t => 
        t.id === draggedTask ? { ...t, status: newStatus } : t
      ));
      
      // Update in backend
      if (isTauri()) {
        await invoke('update_task', {
          taskId: draggedTask,
          status: newStatus
        });
        console.log('Task status updated successfully');
      }
    } catch (error) {
      console.error('Failed to update task status:', error);
      // Revert the UI change if backend update fails
      setTasks(prev => prev.map(t => 
        t.id === draggedTask ? { ...t, status: task.status } : t
      ));
      setError('Failed to update task status. Please try again.');
    }
    
    setDraggedTask(null);
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
        className={`task-card ${editMode ? 'edit-mode' : ''} ${draggedTask === task.id ? 'dragging' : ''}`}
        draggable={!editMode}
        onDragStart={editMode ? undefined : (e) => handleDragStart(e, task.id)}
        onDragEnd={editMode ? undefined : handleDragEnd}
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
          {task.assignee_name && (
            <div className="task-assignee">
              <span className="assignee-avatar">👤</span>
              <span className="assignee-name">{task.assignee_name}</span>
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
      className={`status-column ${dragOverStatus === status ? 'drag-over' : ''} ${editMode ? 'edit-mode' : ''}`}
      onDragOver={editMode ? undefined : (e) => handleDragOver(e, status)}
      onDragLeave={editMode ? undefined : handleDragLeave}
      onDrop={editMode ? undefined : (e) => handleDrop(e, status)}
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
                      disabled={loading}
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
            
            {loading ? (
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
            <button 
              className="collapse-toggle-btn"
              onClick={() => setMembersSidebarCollapsed(!membersSidebarCollapsed)}
              title={membersSidebarCollapsed ? 'Expand members' : 'Collapse members'}
            >
              {membersSidebarCollapsed ? '▶' : '◀'}
            </button>
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
                teamMembers.map(member => (
                  <div key={member.id} className="member-item">
                    <div className="member-avatar-container">
                      <span className="member-avatar">{getRandomEmoji(member.id)}</span>
                      <span className="member-status-indicator"></span>
                    </div>
                    <span className="member-name">{member.name}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Add Task Modal */}
      <AddTaskModal 
        isOpen={showAddTaskModal}
        onClose={() => setShowAddTaskModal(false)}
        onTaskAdded={() => {
          setShowAddTaskModal(false);
          // Reload tasks
          loadAllData();
        }}
      />
      
      {/* Task Detail Modal */}
      <TaskDetailModal 
        isOpen={showTaskDetailModal}
        onClose={() => setShowTaskDetailModal(false)}
        task={selectedTask}
        clickPosition={clickPosition}
        onTaskUpdated={() => {
          // Reload tasks to reflect changes
          loadAllData();
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
    </div>
  );
}

export default TaskPage;
