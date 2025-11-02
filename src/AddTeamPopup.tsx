import React, { useState, useRef, useEffect } from 'react';
import './AddTeamPopup.css';

interface AddTeamPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (teamData: { name: string; description?: string }) => Promise<void>;
  anchorElement?: HTMLElement | null;
}

const AddTeamPopup: React.FC<AddTeamPopupProps> = ({ isOpen, onClose, onSubmit, anchorElement }) => {
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        name: teamName.trim(),
        description: description.trim() || undefined
      });
      
      // Reset form on success
      setTeamName('');
      setDescription('');
      onClose();
    } catch (err) {
      console.error('Team creation error:', err);
      
      // Provide detailed error messages based on error type and source
      let errorMessage = 'Failed to create team';
      
      if (err instanceof Error) {
        const errorMsg = err.message.toLowerCase();
        
        // Detect Supabase-related errors
        if (errorMsg.includes('failed to create workspace')) {
          errorMessage = `Database Error: ${err.message}. This appears to be a Supabase database issue.`;
        } else if (errorMsg.includes('failed to add user to workspace')) {
          errorMessage = `Database Error: ${err.message}. Failed to add you as team owner in Supabase.`;
        } else if (errorMsg.includes('duplicate') || errorMsg.includes('unique')) {
          errorMessage = 'Database Error: A team with this name already exists. Please choose a different name.';
        } else if (errorMsg.includes('permission') || errorMsg.includes('unauthorized')) {
          errorMessage = 'Permission Error: You don\'t have permission to create teams. Check your account permissions.';
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
          errorMessage = 'Network Error: Unable to connect to the database. Check your internet connection.';
        } else if (errorMsg.includes('get_current_user')) {
          errorMessage = 'Backend Error: Failed to get current user from local backend. The Tauri backend may not be responding.';
        } else if (errorMsg.includes('invoke')) {
          errorMessage = 'Backend Error: Failed to communicate with local backend. Make sure the application is running properly.';
        } else {
          // Generic error with more context
          errorMessage = `Error: ${err.message}`;
          
          // Add source context if we can determine it
          if (errorMsg.includes('supabase') || errorMsg.includes('postgres') || errorMsg.includes('database')) {
            errorMessage += ' (Supabase Database)';
          } else if (errorMsg.includes('tauri') || errorMsg.includes('backend') || errorMsg.includes('invoke')) {
            errorMessage += ' (Local Backend)';
          }
        }
      } else {
        errorMessage = 'Unknown error occurred while creating team. Please try again.';
      }
      
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setTeamName('');
      setDescription('');
      setError(null);
      onClose();
    }
  };

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close popup on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  // Position popup relative to anchor element
  const getPopupStyle = (): React.CSSProperties => {
    if (!anchorElement) return {};

    const rect = anchorElement.getBoundingClientRect();
    return {
      position: 'fixed',
      top: rect.bottom + 8,
      left: Math.max(8, rect.left - 200 + rect.width / 2),
      zIndex: 1000,
    };
  };

  if (!isOpen) return null;

  return (
    <div ref={popupRef} className="add-team-popup" style={getPopupStyle()}>
      <div className="popup-header">
        <h3>Create New Team</h3>
        <button 
          className="close-btn" 
          onClick={handleClose}
          disabled={isSubmitting}
          type="button"
        >
          ×
        </button>
      </div>

      <form onSubmit={handleSubmit} className="add-team-form">
        <div className="form-group">
          <label htmlFor="teamName">Team Name</label>
          <input
            id="teamName"
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Enter team name"
            disabled={isSubmitting}
            maxLength={100}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            disabled={isSubmitting}
            maxLength={500}
            rows={2}
          />
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="popup-actions">
          <button 
            type="button" 
            onClick={handleClose}
            disabled={isSubmitting}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={isSubmitting || !teamName.trim()}
            className="btn-primary"
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddTeamPopup;