import React, { useState, useEffect } from 'react';
import './AddTaskModal.css';
import { invoke } from '@tauri-apps/api/core';
import { E2EE_TASKS } from './config';
import { encryptTextForTeam } from './crypto/e2ee';

// Check if we're running in Tauri environment
const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
}

interface TeamMember {
  id: string;
  name: string;
  team_id?: string;
}

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskAdded: () => void;
  workspaceId?: string; // The selected workspace/team ID
}

function AddTaskModal({ isOpen, onClose, onTaskAdded, workspaceId }: AddTaskModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [assignedUsers, setAssignedUsers] = useState<TeamMember[]>([]);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'Medium' as 'Low' | 'Medium' | 'High',
    dueDate: '',
    status: 'Todo' as 'Todo' | 'InProgress' | 'Done'
  });

  // Load team members when modal opens
  useEffect(() => {
    if (isOpen && workspaceId) {
      loadTeamMembers();
    }
  }, [isOpen, workspaceId]);

  const loadTeamMembers = async () => {
    try {
      if (isTauri()) {
        // Load all users and filter by workspace
        const allUsers = await invoke('get_all_users') as TeamMember[];
        const workspaceMembers = allUsers.filter(user => user.team_id === workspaceId);
        setTeamMembers(workspaceMembers);
      } else {
        // Browser mode - use mock data
        const mockMembers: TeamMember[] = [
          { id: 'user-1', name: 'John Doe', team_id: workspaceId },
          { id: 'user-2', name: 'Jane Smith', team_id: workspaceId },
          { id: 'user-3', name: 'Bob Johnson', team_id: workspaceId }
        ];
        setTeamMembers(mockMembers);
      }
    } catch (err) {
      console.error('Failed to load team members:', err);
      setError('Failed to load team members.');
    }
  };

  const handleUserSelection = (user: TeamMember) => {
    if (!assignedUsers.find(assigned => assigned.id === user.id)) {
      setAssignedUsers(prev => [...prev, user]);
    }
  };

  const removeAssignedUser = (userId: string) => {
    setAssignedUsers(prev => prev.filter(user => user.id !== userId));
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      setError('Task title is required.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isTauri()) {
        console.log('Creating task with data:', formData);
        
        // Convert status to backend format
        const backendStatus = formData.status === 'Todo' ? 'todo' : 
                             formData.status === 'InProgress' ? 'in_progress' : 'done';
        
        // Encrypt payload if enabled (prototype: single local team key)
        const encTitle = E2EE_TASKS ? await encryptTextForTeam(formData.title.trim()) : formData.title.trim();
        const encDescription = E2EE_TASKS && formData.description ? await encryptTextForTeam(formData.description.trim()) : (formData.description.trim() || null);

        const newTask = await invoke('create_task', {
          title: encTitle,
          workspaceId: workspaceId || null, // Use the selected workspace ID
          assignedUserIds: assignedUsers.map(user => user.id), // Pass assigned user IDs
          description: encDescription,
          status: backendStatus,
          priority: formData.priority.toLowerCase(),
          dueDate: formData.dueDate || null // Tauri will convert this to due_date
        });
        
        console.log('Task created successfully:', newTask);
        setSuccess(`Task "${formData.title}" created successfully!`);
        
        // Reset form
        setFormData({
          title: '',
          description: '',
          priority: 'Medium',
          dueDate: '',
          status: 'Todo'
        });
        setAssignedUsers([]); // Clear assigned users
        
        // Notify parent component
        onTaskAdded();
        
      } else {
        // Browser mode - simulate success
        console.log('Simulating task creation:', formData);
        setSuccess(`Task "${formData.title}" created successfully (browser mode)!`);
        setFormData(prev => ({ ...prev, title: '', description: '' }));
        setTimeout(() => onTaskAdded(), 500);
      }
    } catch (err) {
      console.error('Failed to create task:', err);
      setError(`Failed to create task: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccess(null);
    setFormData({
      title: '',
      description: '',
      priority: 'Medium',
      dueDate: '',
      status: 'Todo'
    });
    setAssignedUsers([]); // Clear assigned users
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="add-task-overlay" onClick={handleClose}>
      <div className="add-task-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-task-header">
          <h2>Add New Task</h2>
          <button className="close-btn" onClick={handleClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="add-task-form">
          <div className="form-group">
            <label htmlFor="title">Task Title *</label>
            <input
              id="title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter task title"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Enter task description"
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="priority">Priority</label>
              <select
                id="priority"
                value={formData.priority}
                onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as 'Low' | 'Medium' | 'High' }))}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
          </div>

          <div className="form-group">
            <label htmlFor="assignedTo">Assigned To</label>
            <div className="assignee-section">
              <select
                id="assignedTo"
                onChange={(e) => {
                  const selectedUser = teamMembers.find(member => member.id === e.target.value);
                  if (selectedUser) {
                    handleUserSelection(selectedUser);
                    e.target.value = ''; // Reset select
                  }
                }}
                value=""
              >
                <option value="">Select team member...</option>
                {teamMembers
                  .filter(member => !assignedUsers.find(assigned => assigned.id === member.id))
                  .map(member => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
              </select>
              
              {assignedUsers.length > 0 && (
                <div className="assigned-users">
                  {assignedUsers.map(user => (
                    <div key={user.id} className="assigned-user-tag">
                      <span>{user.name}</span>
                      <button
                        type="button"
                        className="remove-user-btn"
                        onClick={() => removeAssignedUser(user.id)}
                        title="Remove assignee"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="status">Status</label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as 'Todo' | 'InProgress' | 'Done' }))}
              >
                <option value="Todo">To Do</option>
                <option value="InProgress">In Progress</option>
                <option value="Done">Done</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="dueDate">Due Date</label>
            <input
              id="dueDate"
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {success && (
            <div className="success-message">
              {success}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddTaskModal;
