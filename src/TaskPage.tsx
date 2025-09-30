import React, { useState, useRef, useEffect } from 'react';
import './TaskPage.css';
import Sidebar from './Sidebar';
import { invoke } from '@tauri-apps/api/core';

interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  tags: {
    type: string;
    urgency: string;
  };
  status: 'backlog' | 'todo' | 'in-progress' | 'done';
}

interface TaskPageProps {
  onLogout: () => void;
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'detected' | 'logs') => void;
}

function TaskPage({ onLogout, onPageChange }: TaskPageProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        
        // Fetch tasks from Tauri backend
        const backendTasks = await invoke('get_my_tasks') as Task[];
        
        // Transform backend tasks to frontend format
        const frontendTasks: Task[] = backendTasks.map(task => ({
          id: task.id,
          title: task.title,
          description: task.description,
          dueDate: task.dueDate,
          tags: task.tags,
          status: task.status
        }));
        
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
            status: 'in-progress'
          },
          {
            id: '2',
            title: 'Fix responsive design issues',
            description: 'Mobile layout breaks on screens smaller than 320px',
            dueDate: '2024-01-12',
            tags: { type: 'Bug', urgency: 'Medium' },
            status: 'todo'
          },
          {
            id: '3',
            title: 'Add dark mode toggle',
            description: 'Implement theme switching with system preference detection',
            dueDate: '2024-01-20',
            tags: { type: 'Enhancement', urgency: 'Low' },
            status: 'backlog'
          },
          {
            id: '4',
            title: 'Optimize database queries',
            description: 'Reduce query time for user dashboard data',
            dueDate: '2024-01-10',
            tags: { type: 'Performance', urgency: 'High' },
            status: 'done'
          },
          {
            id: '5',
            title: 'Write unit tests',
            description: 'Add test coverage for authentication module',
            dueDate: '2024-01-18',
            tags: { type: 'Testing', urgency: 'Medium' },
            status: 'todo'
          },
          {
            id: '6',
            title: 'Update documentation',
            description: 'Document new API endpoints and usage examples',
            dueDate: '2024-01-25',
            tags: { type: 'Documentation', urgency: 'Low' },
            status: 'backlog'
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
      // Optimistically update the UI
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === taskId ? { ...task, status: newStatus } : task
        )
      );
      
      // Update the backend
      try {
        await invoke('update_task', {
          taskId: taskId,
          status: newStatus
        });
      } catch (error) {
        console.error('Failed to update task status:', error);
        // Revert the UI change if backend update fails
        setTasks(prevTasks =>
          prevTasks.map(task =>
            task.id === taskId ? { ...task, status: task.status } : task
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
          onClick={() => console.log(`Add task to ${title}`)}
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
    </div>
  );
}

export default TaskPage;