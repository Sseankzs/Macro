import React, { useState, useRef, useEffect } from 'react';
import './TaskPage.css';
import Sidebar from './Sidebar';
import { invoke } from '@tauri-apps/api/core';

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
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs') => void;
}

function TaskPage({ onLogout, onPageChange }: TaskPageProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{type: 'task', id: string, title: string} | null>(null);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  useEffect(() => {
    // Add Command+T keyboard shortcut for task search
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Load tasks from backend
  useEffect(() => {
    const loadTasks = async () => {
      try {
        setLoading(true);
        setError(null);
        
        let backendTasks: BackendTask[] = [];
        if (isTauri()) {
          backendTasks = await invoke('get_my_tasks') as BackendTask[];
          console.log('Backend tasks loaded:', backendTasks);
        } else {
          // Browser mode - use mock data for development
          backendTasks = [
            {
              id: '1',
              title: 'Sample Task 1',
              description: 'This is a sample task for development',
              project_id: 'project-1',
              assignee_id: 'user-1',
              status: 'Todo',
              priority: 'Medium',
              due_date: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            {
              id: '2',
              title: 'Sample Task 2',
              description: 'Another sample task',
              project_id: 'project-1',
              assignee_id: 'user-1',
              status: 'InProgress',
              priority: 'High',
              due_date: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
          ];
        }
        
        // Transform backend tasks to frontend format
        const frontendTasks: Task[] = backendTasks.map(task => {
          // Map backend status to frontend status
          const mapStatus = (backendStatus: string): 'backlog' | 'todo' | 'in-progress' | 'done' => {
            switch (backendStatus) {
              case 'Todo': return 'todo';
              case 'InProgress': return 'in-progress';
              case 'Done': return 'done';
              default: return 'todo';
            }
          };

          // Map priority to urgency for UI
          const mapPriorityToUrgency = (priority?: string): string => {
            switch (priority) {
              case 'High': return 'High';
              case 'Medium': return 'Medium';
              case 'Low': return 'Low';
              default: return 'Medium';
            }
          };

          // Generate task type based on title/description
          const generateTaskType = (title: string, description?: string): string => {
            const text = (title + ' ' + (description || '')).toLowerCase();
            if (text.includes('bug') || text.includes('fix') || text.includes('error')) return 'Bug';
            if (text.includes('test') || text.includes('testing')) return 'Testing';
            if (text.includes('doc') || text.includes('documentation')) return 'Documentation';
            if (text.includes('performance') || text.includes('optimize')) return 'Performance';
            if (text.includes('enhancement') || text.includes('improve')) return 'Enhancement';
            return 'Feature';
          };

          return {
            id: task.id,
            title: task.title,
            description: task.description || 'No description',
            dueDate: task.due_date || new Date().toISOString(),
            tags: {
              type: generateTaskType(task.title, task.description),
              urgency: mapPriorityToUrgency(task.priority)
            },
            status: mapStatus(task.status),
            // Backend fields
            project_id: task.project_id,
            assignee_id: task.assignee_id,
            priority: task.priority
          };
        });
        
        setTasks(frontendTasks);
      } catch (err) {
        console.error('Failed to load tasks:', err);
        setError('Failed to load tasks. Please try again.');
        
        // Fallback to sample data if backend fails
        setTasks([
          {
            id: '1',
            title: 'Implement user authentication',
            description: 'Add login and registration functionality with JWT tokens',
            dueDate: '2024-01-15',
            tags: { type: 'Feature', urgency: 'High' },
            status: 'in-progress',
            project_id: 'project-1'
          },
          {
            id: '2',
            title: 'Fix responsive design issues',
            description: 'Mobile layout breaks on screens smaller than 320px',
            dueDate: '2024-01-12',
            tags: { type: 'Bug', urgency: 'Medium' },
            status: 'todo',
            project_id: 'project-1'
          },
          {
            id: '3',
            title: 'Add dark mode toggle',
            description: 'Implement theme switching with system preference detection',
            dueDate: '2024-01-20',
            tags: { type: 'Enhancement', urgency: 'Low' },
            status: 'backlog',
            project_id: 'project-1'
          },
          {
            id: '4',
            title: 'Optimize database queries',
            description: 'Reduce query time for user dashboard data',
            dueDate: '2024-01-10',
            tags: { type: 'Performance', urgency: 'High' },
            status: 'done',
            project_id: 'project-1'
          },
          {
            id: '5',
            title: 'Write unit tests',
            description: 'Add test coverage for authentication module',
            dueDate: '2024-01-18',
            tags: { type: 'Testing', urgency: 'Medium' },
            status: 'todo',
            project_id: 'project-1'
          },
          {
            id: '6',
            title: 'Update documentation',
            description: 'Document new API endpoints and usage examples',
            dueDate: '2024-01-25',
            tags: { type: 'Documentation', urgency: 'Low' },
            status: 'backlog',
            project_id: 'project-1'
          }
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, []);

  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTask(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragEnter = (e: React.DragEvent, status: Task['status']) => {
    e.preventDefault();
    setDragOverColumn(status);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: Task['status']) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTask;
    
    if (taskId) {
      const taskToUpdate = tasks.find(task => task.id === taskId);
      if (!taskToUpdate) return;

      // Map frontend status to backend status
      const mapStatusToBackend = (frontendStatus: string): 'todo' | 'in_progress' | 'done' => {
        switch (frontendStatus) {
          case 'backlog': return 'todo'; // Map backlog to todo for backend
          case 'todo': return 'todo';
          case 'in-progress': return 'in_progress';
          case 'done': return 'done';
          default: return 'todo';
        }
      };

      const backendStatus = mapStatusToBackend(newStatus);
      
      // Optimistically update the UI
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === taskId ? { ...task, status: newStatus } : task
        )
      );
      
      // Update the backend
      try {
        if (isTauri()) {
          await invoke('update_task', {
            task_id: taskId,
            status: backendStatus
          });
          console.log('Task status updated successfully');
        } else {
          console.log('Task update not available in browser mode');
        }
      } catch (error) {
        console.error('Failed to update task status:', error);
        // Revert the UI change if backend update fails
        setTasks(prevTasks =>
          prevTasks.map(task =>
            task.id === taskId ? { ...task, status: taskToUpdate.status } : task
          )
        );
        setError('Failed to update task status. Please try again.');
      }
      
      setDraggedTask(null);
      setDragOverColumn(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const getTasksByStatus = (status: Task['status']) => {
    return tasks.filter(task => task.status === status);
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'High': return '#d32f2f';
      case 'Medium': return '#f57c00';
      case 'Low': return '#7b1fa2';
      default: return '#8e8e93';
    }
  };

  const getUrgencyBackground = (urgency: string) => {
    switch (urgency) {
      case 'High': return '#ffebee';
      case 'Medium': return '#fff3e0';
      case 'Low': return '#f3e5f5';
      default: return '#f5f5f5';
    }
  };

  const getUrgencyBorder = (urgency: string) => {
    switch (urgency) {
      case 'High': return '#ffcdd2';
      case 'Medium': return '#ffcc02';
      case 'Low': return '#e1bee7';
      default: return '#e0e0e0';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  const handleAddTask = async (status: 'backlog' | 'todo' | 'in-progress' | 'done') => {
    if (!newTaskTitle.trim()) {
      setError('Please enter a task title');
      return;
    }

    try {
      setError(null);
      
      if (isTauri()) {
        // Get current user ID for assignee
        const currentUserId = await invoke('get_current_user_id') as string;
        
        // Create task in backend
        const newTask = await invoke('create_task', {
          title: newTaskTitle.trim(),
          project_id: 'default-project', // For now, use a default project
          assignee_id: currentUserId,
          description: newTaskDescription.trim() || null,
          status: status === 'backlog' ? 'todo' : status === 'in-progress' ? 'in_progress' : status,
          priority: newTaskPriority.toLowerCase(),
          due_date: newTaskDueDate || null
        }) as BackendTask;

        // Transform to frontend format and add to list
        const generateTaskType = (title: string, description?: string): string => {
          const text = (title + ' ' + (description || '')).toLowerCase();
          if (text.includes('bug') || text.includes('fix') || text.includes('error')) return 'Bug';
          if (text.includes('test') || text.includes('testing')) return 'Testing';
          if (text.includes('doc') || text.includes('documentation')) return 'Documentation';
          if (text.includes('performance') || text.includes('optimize')) return 'Performance';
          if (text.includes('enhancement') || text.includes('improve')) return 'Enhancement';
          return 'Feature';
        };

        const frontendTask: Task = {
          id: newTask.id,
          title: newTask.title,
          description: newTask.description || 'No description',
          dueDate: newTask.due_date || new Date().toISOString(),
          tags: {
            type: generateTaskType(newTask.title, newTask.description),
            urgency: newTask.priority || 'Medium'
          },
          status: status,
          project_id: newTask.project_id,
          assignee_id: newTask.assignee_id,
          priority: newTask.priority
        };

        setTasks(prev => [...prev, frontendTask]);
        console.log('New task added successfully');
      } else {
        // Browser mode - add to local state
        const frontendTask: Task = {
          id: Date.now().toString(),
          title: newTaskTitle.trim(),
          description: newTaskDescription.trim() || 'No description',
          dueDate: newTaskDueDate || new Date().toISOString(),
          tags: {
            type: 'Feature',
            urgency: newTaskPriority
          },
          status: status,
          project_id: 'default-project'
        };

        setTasks(prev => [...prev, frontendTask]);
      }

      // Reset form and close modal
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskPriority('Medium');
      setNewTaskDueDate('');
      setShowAddTaskModal(false);
    } catch (error) {
      console.error('Failed to add task:', error);
      setError('Failed to add task. Please try again.');
    }
  };

  const TaskCard = ({ task }: { task: Task }) => (
    <div
      className={`task-page-card ${draggedTask === task.id ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => handleDragStart(e, task.id)}
      onDragEnd={handleDragEnd}
    >
      <div className="task-tags">
        <div className="urgency-tags">
          <span 
            className="tag urgency-tag"
            style={{ 
              backgroundColor: getUrgencyBackground(task.tags.urgency),
              color: getUrgencyColor(task.tags.urgency),
              borderColor: getUrgencyBorder(task.tags.urgency)
            }}
          >
            {task.tags.urgency}
          </span>
        </div>
        <div className="type-tags">
          <span className="tag type-tag">
            {task.tags.type}
          </span>
        </div>
      </div>
      <h4 className="task-title">{task.title}</h4>
      <p className="task-description">{task.description}</p>
      <div className="task-divider"></div>
      <div className="task-footer">
        <div className="due-date-pill">
          <svg className="flag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
            <line x1="4" y1="22" x2="4" y2="15"/>
          </svg>
          <span className="due-date">
            {formatDate(task.dueDate)}
          </span>
        </div>
        <div className="attachment-pill">
          <svg className="paperclip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.64 16.2a2 2 0 0 1-2.83-2.83l8.49-8.49"/>
          </svg>
          <span className="attachment-count">2</span>
        </div>
      </div>
    </div>
  );

  const KanbanColumn = ({ 
    title, 
    status, 
    count 
  }: { 
    title: string; 
    status: Task['status']; 
    count: number; 
  }) => (
    <div 
      className={`task-kanban-column ${dragOverColumn === status ? 'drag-over' : ''}`}
      onDragEnter={(e) => handleDragEnter(e, status)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, status)}
    >
      <div className="task-column-header">
        <div className="task-column-title-section">
          <h3 className="task-column-title">{title}</h3>
          <span className="task-column-card-count">{count} cards</span>
        </div>
        <button className="task-column-actions" onClick={() => console.log(`Actions for ${title}`)}>
          <svg className="task-ellipsis-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1"/>
            <circle cx="19" cy="12" r="1"/>
            <circle cx="5" cy="12" r="1"/>
          </svg>
        </button>
      </div>
      <div className="task-column-content">
        <button 
          className="task-add-card-button"
          onClick={() => {
            setShowAddTaskModal(true);
            // Store the target status for when the modal is submitted
            (window as any).targetTaskStatus = status;
          }}
        >
          +
        </button>
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
        <div className="task-container">
          <div className="task-header">
            <h1>Tasks</h1>
            <div className="task-search-bar">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search tasks"
                className="task-search-input"
              />
              <svg className="task-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
              <span className="task-search-shortcut">⌘T</span>
            </div>
          </div>
          
          {error && (
            <div className="error-message" style={{ 
              background: '#ffebee', 
              color: '#c62828', 
              padding: '12px', 
              borderRadius: '8px', 
              margin: '16px 0',
              border: '1px solid #ffcdd2'
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
          
          <div className="kanban-board">
            <KanbanColumn 
              title="Backlog" 
              status="backlog" 
              count={getTasksByStatus('backlog').length} 
            />
            <KanbanColumn 
              title="To-do" 
              status="todo" 
              count={getTasksByStatus('todo').length} 
            />
            <KanbanColumn 
              title="In Progress" 
              status="in-progress" 
              count={getTasksByStatus('in-progress').length} 
            />
            <KanbanColumn 
              title="Done" 
              status="done" 
              count={getTasksByStatus('done').length} 
            />
          </div>
        </div>
      </div>

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '12px',
            width: '500px',
            maxWidth: '90vw',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: '600' }}>Add New Task</h2>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Title *</label>
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Enter task title"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Description</label>
              <textarea
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Enter task description"
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Priority</label>
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as 'Low' | 'Medium' | 'High')}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Due Date</label>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddTaskModal(false)}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const targetStatus = (window as any).targetTaskStatus || 'todo';
                  handleAddTask(targetStatus);
                }}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: '#007aff',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskPage;