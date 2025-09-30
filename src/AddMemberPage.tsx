import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './AddMemberPage.css';

// Check if we're running in Tauri environment
const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
}

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMemberAdded: () => void;
}

function AddMemberModal({ isOpen, onClose, onMemberAdded }: AddMemberModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'member' as 'owner' | 'manager' | 'member',
    teamId: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availableTeams, setAvailableTeams] = useState<any[]>([]);

  // Load available teams on component mount
  React.useEffect(() => {
    const loadTeams = async () => {
      if (isTauri()) {
        try {
          const teams = await invoke('get_all_teams') as any[];
          console.log('Available teams:', teams);
          
          if (teams.length === 0) {
            // No teams exist, create a default team
            console.log('No teams found, creating default team...');
            const defaultTeam = await invoke('create_team', { teamName: 'Default Team' });
            console.log('Created default team:', defaultTeam);
            setAvailableTeams([defaultTeam]);
            setFormData(prev => ({ ...prev, teamId: (defaultTeam as any).id }));
          } else {
            setAvailableTeams(teams);
            // Set default team if available
            setFormData(prev => ({ ...prev, teamId: teams[0].id }));
          }
        } catch (err) {
          console.error('Failed to load teams:', err);
          setError('Failed to load teams. Please try again.');
        }
      }
    };
    
    loadTeams();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      setError('Name is required');
      return false;
    }
    
    if (!formData.email.trim()) {
      setError('Email is required');
      return false;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      setError('Please enter a valid email address');
      return false;
    }
    
    if (formData.email.trim().length < 5) {
      setError('Email address is too short');
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
        console.log('Creating user with data:', formData);
        console.log('Team ID being sent:', formData.teamId);
        console.log('Team ID type:', typeof formData.teamId);
        console.log('Team ID length:', formData.teamId?.length);
        console.log('Team ID processed:', formData.teamId && formData.teamId.trim() !== '' ? formData.teamId : null);
        
        // Ensure we have a valid team ID - if not, this should be an error
        if (!formData.teamId || formData.teamId.trim() === '') {
          setError('Please select a team for the member');
          setLoading(false);
          return;
        }
        
        // Create user with all required fields
        const newUser = await invoke('create_user', {
          name: formData.name.trim(),
          email: formData.email.trim(),
          teamId: formData.teamId.trim(), // Always send a valid team ID
          role: formData.role
        });
        
        console.log('User created successfully:', newUser);
        setSuccess(`User "${formData.name}" created successfully!`);
        
        // Reset form
        setFormData({
          name: '',
          email: '',
          role: 'member',
          teamId: availableTeams.length > 0 ? availableTeams[0].id : ''
        });
        
        // Notify parent component immediately
        onMemberAdded();
        
      } else {
        // Browser mode - simulate success
        setSuccess(`User "${formData.name}" created successfully! (Browser mode)`);
        setTimeout(() => {
          onMemberAdded();
        }, 1500);
      }
    } catch (error) {
      console.error('Failed to create user:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('duplicate key value violates unique constraint') || 
          errorMessage.includes('already exists')) {
        setError('A user with this email already exists. Please use a different email address.');
      } else if (errorMessage.includes('HTTP error 409')) {
        setError('This email is already registered. Please use a different email address.');
      } else {
        setError(`Failed to create user: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="add-member-overlay" onClick={onClose}>
      <div className="add-member-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-member-header">
          <h2>Add New Team Member</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-member-form">
          <div className="form-group">
            <label htmlFor="name">Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="Enter full name"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email *</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="Enter email address"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="role">Role *</label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleInputChange}
              required
              disabled={loading}
            >
              <option value="member">Member</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="teamId">Team</label>
            <select
              id="teamId"
              name="teamId"
              value={formData.teamId}
              onChange={handleInputChange}
              disabled={loading}
            >
              <option value="">No Team (Unassigned)</option>
              {availableTeams.map(team => (
                <option key={team.id} value={team.id}>
                  {team.team_name} (ID: {team.id})
                </option>
              ))}
            </select>
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Debug: Selected team ID = "{formData.teamId}" | Available teams: {availableTeams.length}
            </div>
            <small>
              {availableTeams.length > 0 
                ? `Select a team from ${availableTeams.length} available team(s)`
                : 'No teams available - a default team will be created'
              }
            </small>
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
            <button
              type="button"
              onClick={onClose}
              className="cancel-button"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="submit-button"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Member'}
            </button>
          </div>
        </form>

        <div className="debug-info">
          <h3>Debug Information</h3>
          <div className="debug-section">
            <strong>Available Teams:</strong>
            <pre>{JSON.stringify(availableTeams, null, 2)}</pre>
          </div>
          <div className="debug-section">
            <strong>Form Data:</strong>
            <pre>{JSON.stringify(formData, null, 2)}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AddMemberModal;
