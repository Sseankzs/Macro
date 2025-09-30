import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './AddSectionModal.css';

// Check if we're running in Tauri environment
const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
}

interface AddSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSectionAdded: () => void;
}

function AddSectionModal({ isOpen, onClose, onSectionAdded }: AddSectionModalProps) {
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTeamName(e.target.value);
    setError(null);
    setSuccess(null);
  };

  const validateForm = () => {
    if (!teamName.trim()) {
      setError('Team name is required');
      return false;
    }
    
    if (teamName.trim().length < 2) {
      setError('Team name must be at least 2 characters');
      return false;
    }
    
    if (teamName.trim().length > 50) {
      setError('Team name must be less than 50 characters');
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
        console.log('Creating team:', teamName.trim());
        
        // Create team in backend
        const newTeam = await invoke('create_team', {
          teamName: teamName.trim()
        });
        
        console.log('Team created successfully:', newTeam);
        setSuccess(`Team "${teamName.trim()}" created successfully!`);
        
        // Reset form
        setTeamName('');
        
        // Notify parent component immediately
        onSectionAdded();
        
      } else {
        // Browser mode - simulate success
        setSuccess(`Team "${teamName.trim()}" created successfully! (Browser mode)`);
        onSectionAdded();
      }
    } catch (error) {
      console.error('Failed to create team:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
        setError('A team with this name already exists. Please choose a different name.');
      } else {
        setError(`Failed to create team: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTeamName('');
    setError(null);
    setSuccess(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="add-section-overlay" onClick={handleClose}>
      <div className="add-section-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-section-header">
          <h2>Create New Team</h2>
          <button className="close-button" onClick={handleClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-section-form">
          <div className="form-group">
            <label htmlFor="teamName">Team Name *</label>
            <input
              type="text"
              id="teamName"
              name="teamName"
              value={teamName}
              onChange={handleInputChange}
              placeholder="Enter team name (e.g., Frontend, Backend, Design)"
              required
              disabled={loading}
              autoFocus
            />
            <small>This will create a new section in your team management view</small>
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
              onClick={handleClose}
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
              {loading ? 'Creating...' : 'Create Team'}
            </button>
          </div>
        </form>

        <div className="help-text">
          <h4>💡 Tips:</h4>
          <ul>
            <li>Choose descriptive names like "Frontend", "Backend", "Design", "QA"</li>
            <li>You can always rename or delete teams later</li>
            <li>Team members can be assigned to any team you create</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default AddSectionModal;
