import React, { useState, useEffect } from 'react';
import './TaskPage.css';
import Sidebar from './Sidebar';
import AddTaskModal from './AddTaskModal';
import TaskDetailModal from './TaskDetailModal';
import { invoke } from '@tauri-apps/api/core';
import { TasksSkeletonGrid } from './components/LoadingComponents';

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

interface TaskPageProps {
  onLogout: () => void;
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs') => void;
}

function TaskPage({ onLogout, onPageChange }: TaskPageProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
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

  // Load all data from backend
  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (isTauri()) {
        // Load tasks and team members in parallel
        const [backendTasks, backendMembers] = await Promise.all([
          invoke('get_my_tasks') as Promise<BackendTask[]>,
          invoke('get_all_users') as Promise<TeamMember[]>
        ]);

        console.log('=== BACKEND DATA DEBUG ===');
        console.log('Backend tasks:', JSON.stringify(backendTasks, null, 2));
        console.log('Backend members:', JSON.stringify(backendMembers, null, 2));
        console.log('========================');

        // Transform tasks with proper assignee names
        const transformedTasks: Task[] = backendTasks.map(task => {
          const assignee = backendMembers.find(member => member.id === task.assignee_id);
          
          // Convert backend status to frontend status
          const frontendStatus = task.status === 'todo' ? 'Todo' :
                                task.status === 'in_progress' ? 'InProgress' : 'Done';
          
          // Convert backend priority to frontend priority
          const frontendPriority = task.priority === 'low' ? 'Low' :
                                  task.priority === 'medium' ? 'Medium' :
                                  task.priority === 'high' ? 'High' : 'Medium';
          
          return {
            id: task.id,
            title: task.title,
            description: task.description || '',
            project_id: task.project_id || '',
            assignee_id: task.assignee_id,
            status: frontendStatus,
            priority: frontendPriority,
            due_date: task.due_date,
            created_at: task.created_at,
            updated_at: task.updated_at,
            assignee_name: assignee?.name,
            project_name: 'Unassigned Project'
          };
        });

        console.log('=== FRONTEND TRANSFORMATION DEBUG ===');
        console.log('Transformed tasks:', JSON.stringify(transformedTasks, null, 2));
        console.log('=====================================');
        
        setTasks(transformedTasks);
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

  return (
    <div className="dashboard-container">
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
