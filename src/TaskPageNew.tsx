import React, { useState, useEffect } from 'react';
import './TaskPage.css';
import Sidebar from './Sidebar';
import { invoke } from '@tauri-apps/api/core';
import PageSourceBadge from './components/PageSourceBadge';

// Check if we're running in Tauri environment
const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
}

// Backend Task interface (matches the Rust backend)
interface BackendTask {
  id: string;
  title: string;
  description?: string;
  project_id: string;
  assignee_id?: string;
  status: 'Todo' | 'InProgress' | 'Done';
  priority?: 'Low' | 'Medium' | 'High';
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
  // Multi-assignee support
  assignees?: TeamMember[];
}

// Team and Project interfaces for task assignment
interface Team {
  id: string;
  team_name: string;
}

interface Project {
  id: string;
  name: string;
  team_id: string;
}

interface TeamMember {
  id: string;
  name: string;
  team_id?: string;
}

interface TaskPageProps {
  onLogout: () => void;
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant' | 'debug') => void;
}

function TaskPage({ onLogout, onPageChange }: TaskPageProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Load assignees for a specific task
  const loadTaskAssignees = async (taskId: string): Promise<TeamMember[]> => {
    try {
      console.log('🔍 loadTaskAssignees (New): Loading assignees for task:', taskId);
      
      if (isTauri()) {
        // Get all assignees from the backend
        const allAssignees = await invoke<any[]>('get_all_assignees');
        console.log('🔍 loadTaskAssignees (New): All assignees from backend:', allAssignees);
        
        // Filter assignees for this specific task
        const taskAssignees = allAssignees.filter((assignee: any) => assignee.task_id === taskId);
        console.log('🔍 loadTaskAssignees (New): Assignees for task', taskId, ':', taskAssignees);
        
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
              console.warn('🔍 loadTaskAssignees (New): Failed to get user details for', assignee.user_id, ':', userErr);
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
        
        console.log('🔍 loadTaskAssignees (New): Final assignees with details:', assigneesWithDetails);
        return assigneesWithDetails;
      }
      
      return [];
    } catch (err) {
      console.error('❌ Failed to load task assignees (New):', err);
      return [];
    }
  };

  // Load assignees for all tasks at once (optimized version)
  const loadAllTaskAssignees = async (tasks: Task[]) => {
    try {
      console.log('🔍 loadAllTaskAssignees (New): Loading assignees for all tasks...');
      
      if (isTauri()) {
        // Get all assignees from the backend once
        const allAssignees = await invoke<any[]>('get_all_assignees');
        console.log('🔍 loadAllTaskAssignees (New): All assignees from backend:', allAssignees);
        
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
          console.log('🔍 loadAllTaskAssignees (New): Assignees for task', task.id, ':', taskAssignees);
          
          // Fetch user details for each assignee of this task
          const assigneesWithDetails: TeamMember[] = await Promise.all(
            taskAssignees.map(async (assignee: any) => {
              try {
                const user = await invoke('get_user', { userId: assignee.user_id }) as any;
                if (user) {
                  return {
                    id: user.id,
                    name: user.name,
                    team_id: user.team_id || user.workspace_id
                  };
                } else {
                  // Fallback if user not found
                  return {
                    id: assignee.user_id,
                    name: assignee.user_id,
                    team_id: task.id
                  };
                }
              } catch (userErr) {
                console.warn('🔍 loadAllTaskAssignees (New): Failed to get user details for', assignee.user_id, ':', userErr);
                // Return fallback user info
                return {
                  id: assignee.user_id,
                  name: assignee.user_id,
                  team_id: task.id
                };
              }
            })
          );
          
          // Update the task with assignees
          task.assignees = assigneesWithDetails;
        }
        
        console.log('🔍 loadAllTaskAssignees (New): All tasks updated with assignees');
      }
    } catch (err) {
      console.error('❌ Failed to load all task assignees (New):', err);
      // Set empty assignees for all tasks on error
      tasks.forEach(task => {
        task.assignees = [];
      });
    }
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{type: 'task', id: string, title: string} | null>(null);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  if (false) {
    console.log(teams.length, projects.length, teamMembers.length, showAddTaskModal);
  }

  // Load all data from backend
  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (isTauri()) {
        // Load tasks, teams, projects, and team members in parallel
        const [backendTasks, backendTeams, backendProjects, backendMembers] = await Promise.all([
          invoke('get_my_tasks') as Promise<BackendTask[]>,
          invoke('get_all_teams') as Promise<Team[]>,
          invoke('get_all_projects') as Promise<Project[]>,
          invoke('get_all_users') as Promise<TeamMember[]>
        ]);

        console.log('Loaded data:', { backendTasks, backendTeams, backendProjects, backendMembers });

        // Transform tasks with proper assignee and project names - without assignees first
        const transformedTasks: Task[] = await Promise.all(backendTasks.map(async (task) => {
          const assignee = backendMembers.find(member => member.id === task.assignee_id);
          const project = backendProjects.find(proj => proj.id === task.project_id);
          
          return {
            id: task.id,
            title: task.title,
            description: task.description || '',
            project_id: task.project_id,
            assignee_id: task.assignee_id,
            status: task.status,
            priority: task.priority || 'Medium',
            due_date: task.due_date,
            created_at: task.created_at,
            updated_at: task.updated_at,
            assignee_name: assignee?.name,
            project_name: project?.name,
            assignees: [] // Will be populated later
          };
        }));

        // Now load all assignees once at the end
        console.log('🔍 Loading all assignees for tasks (New page)...');
        await loadAllTaskAssignees(transformedTasks);

        setTasks(transformedTasks);
        setTeams(backendTeams);
        setProjects(backendProjects);
        setTeamMembers(backendMembers);
      } else {
        // Browser mode - use mock data
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
            project_id: 'project-1',
            assignee_id: 'user-1',
            status: 'Done',
            priority: 'Low',
            due_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            assignee_name: 'John Doe',
            project_name: 'Frontend App'
          }
        ];

        setTasks(mockTasks);
        setTeams([{ id: 'team-1', team_name: 'Frontend Team' }]);
        setProjects([{ id: 'project-1', name: 'Frontend App', team_id: 'team-1' }]);
        setTeamMembers([
          { id: 'user-1', name: 'John Doe', team_id: 'team-1' },
          { id: 'user-2', name: 'Jane Smith', team_id: 'team-1' }
        ]);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load tasks and team data. Please try again.');
    } finally {
      setLoading(false);
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
          task_id: draggedTask,
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
    
    return (
      <div
        className={`task-card ${editMode ? 'edit-mode' : ''} ${draggedTask === task.id ? 'dragging' : ''}`}
        draggable={!editMode}
        onDragStart={editMode ? undefined : (e) => handleDragStart(e, task.id)}
        onDragEnd={editMode ? undefined : handleDragEnd}
      >
        <div className="task-header">
          <div className="task-priority" style={{ backgroundColor: getPriorityColor(task.priority) }}></div>
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
        
        {task.project_name && (
          <div className="task-project">
            📁 {task.project_name}
          </div>
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
        <h3 className="status-title">{title}</h3>
        <span className="status-count">{count}</span>
      </div>
      <div className="status-content">
        {getTasksByStatus(status).map(task => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="dashboard-container">
      <PageSourceBadge source="src/TaskPageNew.tsx" />
      <Sidebar 
        currentPage="tasks" 
        onLogout={onLogout} 
        onPageChange={onPageChange || (() => {})} 
      />
      
      <div className="main-content">
        <div className="tasks-container">
          <div className="tasks-header">
            <h1>Task Management</h1>
            <div className="header-actions">
              {!editMode ? (
                <>
                  <button 
                    className="btn-secondary" 
                    onClick={() => setShowAddTaskModal(true)}
                    disabled={loading}
                  >
                    Add Task
                  </button>
                  <button 
                    className="btn-edit"
                    onClick={() => setEditMode(true)}
                    disabled={loading}
                  >
                    Edit
                  </button>
                </>
              ) : (
                <button 
                  className="btn-done"
                  onClick={() => setEditMode(false)}
                >
                  Done
                </button>
              )}
            </div>
          </div>
          
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
          
          {loading && (
            <div className="loading-message" style={{ 
              textAlign: 'center', 
              padding: '40px', 
              color: '#666' 
            }}>
              Loading tasks...
            </div>
          )}
          
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
        </div>
      </div>
      
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
