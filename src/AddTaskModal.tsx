import React, { useState, useEffect } from 'react';
import './AddTaskModal.css';
import { invoke } from '@tauri-apps/api/core';

// Check if we're running in Tauri environment
const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
}

interface Team {
  id: string;
  team_name: string;
}

interface Project {
  id: string;
  name: string;
  team_id?: string;
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
}

function AddTaskModal({ isOpen, onClose, onTaskAdded }: AddTaskModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'Medium' as 'Low' | 'Medium' | 'High',
    dueDate: '',
    projectId: '',
    assigneeId: '',
    status: 'Todo' as 'Todo' | 'InProgress' | 'Done'
  });

  // Load teams, projects, and members when modal opens
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      if (isTauri()) {
        const [teamsData, projectsData, membersData] = await Promise.all([
          invoke('get_all_teams') as Promise<Team[]>,
          invoke('get_all_projects') as Promise<Project[]>,
          invoke('get_all_users') as Promise<TeamMember[]>
        ]);

        setTeams(teamsData);
        setProjects(projectsData);
        setTeamMembers(membersData);

        // Set default project if available
        if (projectsData.length > 0) {
          setFormData(prev => ({ ...prev, projectId: projectsData[0].id }));
        }
      } else {
        // Browser mode - use mock data
        const mockTeams: Team[] = [
          { id: 'team-1', team_name: 'Frontend Team' }
        ];
        const mockProjects: Project[] = [
          { id: 'project-1', name: 'Frontend App', team_id: 'team-1' }
        ];
        const mockMembers: TeamMember[] = [
          { id: 'user-1', name: 'John Doe', team_id: 'team-1' },
          { id: 'user-2', name: 'Jane Smith', team_id: 'team-1' }
        ];

        setTeams(mockTeams);
        setProjects(mockProjects);
        setTeamMembers(mockMembers);
        setFormData(prev => ({ ...prev, projectId: 'project-1' }));
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load team and project data.');
    }
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
        
        // Create task in backend - project_id is now optional
        const projectId = formData.projectId || null;
        
        // Convert status to backend format
        const backendStatus = formData.status === 'Todo' ? 'todo' : 
                             formData.status === 'InProgress' ? 'in_progress' : 'done';
        
        const newTask = await invoke('create_task', {
          title: formData.title.trim(),
          projectId: projectId, // Tauri will convert this to project_id
          assigneeId: formData.assigneeId || null, // Tauri will convert this to assignee_id
          description: formData.description.trim() || null,
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
          projectId: projects.length > 0 ? projects[0].id : '',
          assigneeId: '',
          status: 'Todo'
        });
        
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
      projectId: projects.length > 0 ? projects[0].id : '',
      assigneeId: '',
      status: 'Todo'
    });
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
            <label htmlFor="project">Project</label>
            <select
              id="project"
              value={formData.projectId}
              onChange={(e) => setFormData(prev => ({ ...prev, projectId: e.target.value }))}
            >
              <option value="">Default Project</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="assignee">Assignee</label>
            <select
              id="assignee"
              value={formData.assigneeId}
              onChange={(e) => setFormData(prev => ({ ...prev, assigneeId: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {teamMembers.map(member => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
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
