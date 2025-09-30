import React, { useState, useEffect } from 'react';
import './TaskDetailModal.css';
import { invoke } from '@tauri-apps/api/core';

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
  assignee_name?: string;
  project_name?: string;
}

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onTaskUpdated?: () => void;
}

function TaskDetailModal({ isOpen, onClose, task, onTaskUpdated }: TaskDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'Todo' as 'Todo' | 'InProgress' | 'Done',
    priority: 'Medium' as 'Low' | 'Medium' | 'High',
    due_date: ''
  });

  // Check if we're running in Tauri environment
  const isTauri = () => {
    return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
  };

  // Initialize form data when task changes
  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date ? task.due_date.split('T')[0] : ''
      });
    }
  }, [task]);

  if (!isOpen || !task) return null;

  const getPriorityColor = (priority: 'Low' | 'Medium' | 'High') => {
    switch (priority) {
      case 'High': return '#ff3b30';
      case 'Medium': return '#ff9500';
      case 'Low': return '#34c759';
      default: return '#8e8e93';
    }
  };

  const getStatusColor = (status: 'Todo' | 'InProgress' | 'Done') => {
    switch (status) {
      case 'Todo': return '#ff3b30';
      case 'InProgress': return '#ff9500';
      case 'Done': return '#34c759';
      default: return '#8e8e93';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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

  const dueDateInfo = formatDueDate(task.due_date);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isTauri()) {
        await invoke('update_task', {
          task_id: task.id,
          title: formData.title,
          description: formData.description,
          status: formData.status.toLowerCase(),
          priority: formData.priority.toLowerCase(),
          due_date: formData.due_date || null
        });
      }

      setIsEditing(false);
      if (onTaskUpdated) {
        onTaskUpdated();
      }
    } catch (err) {
      console.error('Failed to update task:', err);
      setError('Failed to update task. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
    // Reset form data to original task data
    if (task) {
      setFormData({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date ? task.due_date.split('T')[0] : ''
      });
    }
  };

  return (
    <div className="task-detail-overlay" onClick={onClose}>
      <div className="task-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isEditing ? 'Edit Task' : task.title}</h2>
          <div className="header-actions">
            {!isEditing ? (
              <button className="edit-btn" onClick={() => setIsEditing(true)}>
                Edit
              </button>
            ) : (
              <div className="edit-actions">
                <button className="cancel-btn" onClick={handleCancel} disabled={loading}>
                  Cancel
                </button>
                <button className="save-btn" onClick={handleSave} disabled={loading}>
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
            <button className="close-btn" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        
        <div className="modal-content">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="detail-section">
            <h3 className="section-title">Title</h3>
            {isEditing ? (
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className="form-input"
                placeholder="Task title"
              />
            ) : (
              <p className="section-content">{task.title}</p>
            )}
          </div>

          <div className="detail-section">
            <h3 className="section-title">Description</h3>
            {isEditing ? (
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                className="form-textarea"
                placeholder="Task description"
                rows={3}
              />
            ) : (
              <p className="section-content">{task.description || 'No description provided'}</p>
            )}
          </div>

          <div className="detail-section">
            <h3 className="section-title">Status</h3>
            {isEditing ? (
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="form-select"
              >
                <option value="Todo">Todo</option>
                <option value="InProgress">In Progress</option>
                <option value="Done">Done</option>
              </select>
            ) : (
              <div className="status-badge" style={{ 
                backgroundColor: getStatusColor(task.status) + '20',
                color: getStatusColor(task.status)
              }}>
                {task.status}
              </div>
            )}
          </div>

          <div className="detail-section">
            <h3 className="section-title">Priority</h3>
            {isEditing ? (
              <select
                name="priority"
                value={formData.priority}
                onChange={handleInputChange}
                className="form-select"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            ) : (
              <div className="priority-badge" style={{ 
                backgroundColor: getPriorityColor(task.priority) + '20',
                color: getPriorityColor(task.priority)
              }}>
                {task.priority}
              </div>
            )}
          </div>

          {task.assignee_name && (
            <div className="detail-section">
              <h3 className="section-title">Assignee</h3>
              <div className="assignee-info">
                <span className="assignee-avatar">👤</span>
                <span className="assignee-name">{task.assignee_name}</span>
              </div>
            </div>
          )}

          {task.project_name && (
            <div className="detail-section">
              <h3 className="section-title">Project</h3>
              <p className="section-content">📁 {task.project_name}</p>
            </div>
          )}

          <div className="detail-section">
            <h3 className="section-title">Due Date</h3>
            {isEditing ? (
              <input
                type="date"
                name="due_date"
                value={formData.due_date}
                onChange={handleInputChange}
                className="form-input"
              />
            ) : dueDateInfo ? (
              <p className="section-content" style={{ color: dueDateInfo.color }}>
                {dueDateInfo.text}
              </p>
            ) : (
              <p className="section-content">No due date set</p>
            )}
          </div>

          <div className="detail-section">
            <h3 className="section-title">Created</h3>
            <p className="section-content">{formatDate(task.created_at)}</p>
          </div>

          <div className="detail-section">
            <h3 className="section-title">Last Updated</h3>
            <p className="section-content">{formatDate(task.updated_at)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskDetailModal;
