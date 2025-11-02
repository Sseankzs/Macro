import React, { useState, useEffect } from 'react';
import './TeamsPage.css';
import Sidebar from './Sidebar';
import AddSectionModal from './AddSectionModal';
import AddMemberModal from './AddMemberPage';
import { invoke } from '@tauri-apps/api/core';
import { useCurrentUser } from './contexts/CurrentUserContext';
import { TeamsSkeletonGrid, LoadingOverlay } from './components/LoadingComponents';
import PageSourceBadge from './components/PageSourceBadge';

// Check if we're running in Tauri environment
const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
}

interface Team {
  id: string;
  team_name: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  description?: string | null;
}

interface BackendUser {
  id: string;
  name: string;
  email?: string | null;
  team_id?: string | null;
  workspace_id?: string | null;
  image_url?: string | null;
}

interface TeamMember {
  id: string;
  name: string;
  position: string;
  inProgressTasks: number;
  hoursTracked: number;
  currentTask: string;
  currentUrl: string;
  team_id?: string;
  avatar: string;
  status: 'online' | 'away' | 'busy' | 'offline';
}

interface TeamsPageProps {
  onLogout: () => void;
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'debug' | 'ai-assistant') => void;
}

function TeamsPage({ onLogout, onPageChange }: TeamsPageProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{type: 'member' | 'team', id: string, name: string} | null>(null);

  // Array of people emojis for random selection
  const peopleEmojis = [
    '👨', '👩', '👨‍💻', '👩‍💻', '👨‍🎨', '👩‍🎨', '👨‍🔬', '👩‍🔬',
    '👨‍🚀', '👩‍🚀', '👨‍⚕️', '👩‍⚕️', '👨‍🏫', '👩‍🏫', '👨‍💼', '👩‍💼',
    '👨‍🔧', '👩‍🔧', '👨‍🌾', '👩‍🌾', '👨‍🍳', '👩‍🍳', '👨‍🎓', '👩‍🎓',
    '🧑', '🧑‍💻', '🧑‍🎨', '🧑‍🔬', '🧑‍🚀', '🧑‍⚕️', '🧑‍🏫', '🧑‍💼',
    '🧑‍🔧', '🧑‍🌾', '🧑‍🍳', '🧑‍🎓', '👦', '👧', '👴', '👵'
  ];

  // Function to get a consistent random emoji for a given ID
  const getRandomEmoji = (id: string) => {
    // Use the ID to generate a consistent "random" emoji
    const hash = id.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    const index = Math.abs(hash) % peopleEmojis.length;
    return peopleEmojis[index];
  };

  // Load teams and team members from backend
  const loadTeamsAndMembers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (isTauri()) {
        // Load only teams (workspaces) the current user belongs to or created
        const teamsData = await invoke('get_my_workspaces') as Team[];
        console.log('User workspaces loaded:', teamsData);

        const normalizedTeams = (teamsData ?? [])
          .map(team => ({
            ...team,
            team_name: team.team_name || (team as any)?.name || 'Untitled workspace'
          }))
          .sort((a, b) => a.team_name.localeCompare(b.team_name));

        setTeams(normalizedTeams);
        setTeamMembers([]);

        if (normalizedTeams.length === 0) {
          return;
        }

        const memberFetches = normalizedTeams.map(async (team) => {
          try {
            const teamUsers = await invoke('get_users_by_team', { teamId: team.id }) as BackendUser[];
            console.log(`Members loaded for team ${team.id}:`, teamUsers);
            return teamUsers.map(user => ({
              id: user.id,
              name: user.name,
              position: 'Team Member',
              inProgressTasks: 0, // TODO: Get real data
              hoursTracked: 0, // TODO: Get real data
              currentTask: 'No current task', // TODO: Get real data
              currentUrl: '',
              team_id: user.team_id ?? user.workspace_id ?? team.id,
              avatar: getRandomEmoji(user.id),
              status: 'online' as const
            } as TeamMember));
          } catch (memberErr) {
            console.error(`Failed to load team users for team ${team.id}:`, memberErr);
            return [] as TeamMember[];
          }
        });

        const membersByTeam = await Promise.all(memberFetches);
        setTeamMembers(membersByTeam.flat());
      } else {
        // Browser mode - use mock data
        const mockTeams: Team[] = [
          { id: '1', team_name: 'Frontend Team' },
          { id: '2', team_name: 'Backend Team' },
          { id: '3', team_name: 'Design Team' },
          { id: '4', team_name: 'Management Team' }
        ];
        setTeams(mockTeams);
        
        const mockMembers: TeamMember[] = [
          {
            id: '1',
            name: 'John Doe',
            position: 'Frontend Developer',
            inProgressTasks: 3,
            hoursTracked: 8.5,
            currentTask: 'Implement user dashboard',
            currentUrl: 'https://github.com/project/dashboard',
            team_id: '1',
            avatar: getRandomEmoji('1'),
            status: 'online'
          },
          {
            id: '2',
            name: 'Jane Smith',
            position: 'Backend Developer',
            inProgressTasks: 2,
            hoursTracked: 7.2,
            currentTask: 'API optimization',
            currentUrl: 'https://github.com/project/api',
            team_id: '2',
            avatar: getRandomEmoji('2'),
            status: 'busy'
          }
        ];
        setTeamMembers(mockMembers);
      }
    } catch (err) {
      console.error('Failed to load teams and members:', err);
      setError('Failed to load teams and members. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Authorization: only Managers and Owners can view teams and other users
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const { currentUser } = useCurrentUser();

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        setError(null);

        if (isTauri()) {
          // Use currentUser from context (populated once at login) to avoid
          // re-querying the backend on every page change.
          console.log('Current user for Teams page (from context):', currentUser);
          setAuthorized(true);
          await loadTeamsAndMembers();
        } else {
          // Browser/dev mode: allow viewing
          setAuthorized(true);
          await loadTeamsAndMembers();
        }
      } catch (err) {
        console.error('Authorization or data load failed:', err);
        setError('Failed to load teams. Please try again.');
        setAuthorized(false);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [currentUser]);

  const [draggedMember, setDraggedMember] = useState<string | null>(null);
  const [dragOverTeam, setDragOverTeam] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, memberId: string) => {
    setDraggedMember(memberId);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('dragging');
    setDraggedMember(null);
    setDragOverTeam(null);
  };

  const handleDragOver = (e: React.DragEvent, teamId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTeam(teamId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTeam(null);
  };

  const handleDrop = async (e: React.DragEvent, newTeamId: string) => {
    e.preventDefault();
    if (draggedMember) {
      // Don't update if dropped in the same team
      const currentMember = teamMembers.find(member => member.id === draggedMember);
      if (currentMember && currentMember.team_id === newTeamId) {
        setDraggedMember(null);
        setDragOverTeam(null);
        return;
      }
      
      // Optimistically update the UI
      setTeamMembers(prevMembers =>
        prevMembers.map(member =>
          member.id === draggedMember ? { ...member, team_id: newTeamId } : member
        )
      );
      
      // Update the backend
      try {
        if (isTauri()) {
          await invoke('update_user', {
            user_id: draggedMember,
            team_id: newTeamId
          });
          console.log('User team updated successfully');
        } else {
          console.log('User update not available in browser mode');
        }
      } catch (error) {
        console.error('Failed to update team member team:', error);
        // Revert the UI change if backend update fails
        setTeamMembers(prevMembers =>
          prevMembers.map(member =>
            member.id === draggedMember ? { ...member, team_id: currentMember?.team_id } : member
          )
        );
        setError('Failed to update team member team. Please try again.');
      }
      
      setDraggedMember(null);
      setDragOverTeam(null);
    }
  };

  const getMembersByTeam = (teamId: string) => {
    return teamMembers.filter(member => member.team_id === teamId);
  };

  const getUnassignedMembers = () => {
    return teamMembers.filter(member => !member.team_id || member.team_id === 'N/A');
  };

  // Delete member function
  const handleDeleteMember = (memberId: string, memberName: string) => {
    setDeleteTarget({ type: 'member', id: memberId, name: memberName });
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === 'member') {
        if (isTauri()) {
          await invoke('delete_user', { userId: deleteTarget.id });
          console.log('Member deleted successfully');
        }
        
        // Remove from local state
        setTeamMembers(prev => prev.filter(member => member.id !== deleteTarget.id));
      } else if (deleteTarget.type === 'team') {
        if (isTauri()) {
          await invoke('delete_team', { teamId: deleteTarget.id });
          console.log('Team deleted successfully');
        }
        
        // Remove team from local state
        setTeams(prev => prev.filter(team => team.id !== deleteTarget.id));
        
        // Move team members to unassigned
        setTeamMembers(prev => prev.map(member => 
          member.team_id === deleteTarget.id ? { ...member, team_id: undefined } : member
        ));
      }
    } catch (error) {
      console.error('Failed to delete:', error);
      setError(`Failed to delete ${deleteTarget.name}. Please try again.`);
    } finally {
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    }
  };

  const getStatusColor = (status: TeamMember['status']) => {
    switch (status) {
      case 'online': return '#34c759';
      case 'away': return '#ff9500';
      case 'busy': return '#ff3b30';
      case 'offline': return '#8e8e93';
      default: return '#8e8e93';
    }
  };

  const TeamMemberCard = ({ member }: { member: TeamMember }) => {
    const maxHours = 8; // Assuming 8 hours is the target
    const progressPercentage = Math.min((member.hoursTracked / maxHours) * 100, 100);

    return (
      <div
        className={`team-member-card ${editMode ? 'edit-mode' : ''}`}
        draggable={!editMode}
        onDragStart={editMode ? undefined : (e) => handleDragStart(e, member.id)}
        onDragEnd={editMode ? undefined : handleDragEnd}
      >
        <div className="member-header">
          <div className="member-avatar">
            <span className="avatar-emoji">{member.avatar}</span>
            <div 
              className="status-indicator" 
              style={{ backgroundColor: getStatusColor(member.status) }}
            ></div>
          </div>
          <div className="member-info">
            <h4 className="member-name">{member.name}</h4>
            <p className="member-position">{member.position}</p>
          </div>
          {editMode && (
            <button 
              className="delete-member-btn"
              onClick={() => handleDeleteMember(member.id, member.name)}
              title={`Delete ${member.name}`}
            >
              ×
            </button>
          )}
        </div>
        
        <div className="progress-section">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          <div className="progress-footer">
            <span className="progress-hours">{member.hoursTracked}h / {maxHours}h</span>
            <span className="progress-percentage">{Math.round(progressPercentage)}%</span>
          </div>
        </div>
        
        <div className="task-section">
          {member.currentTask ? (
            <div className="task-pill">
              <span className="task-text">{member.currentTask}</span>
            </div>
          ) : (
            <div className="task-pill-empty">
              <span className="task-text-empty">No current task</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const TeamColumn = ({ 
    team
  }: { 
    team: Team;
  }) => (
    <div 
      className={`category-column ${dragOverTeam === team.id ? 'drag-over' : ''} ${editMode ? 'edit-mode' : ''}`}
      onDragOver={editMode ? undefined : (e) => handleDragOver(e, team.id)}
      onDragLeave={editMode ? undefined : handleDragLeave}
      onDrop={editMode ? undefined : (e) => handleDrop(e, team.id)}
    >
      <div className="column-content">
        {getMembersByTeam(team.id).map(member => (
          <TeamMemberCard key={`${team.id}-${member.id}`} member={member} />
        ))}
      </div>
    </div>
  );

  const UnassignedColumn = () => (
    <div 
      className={`category-column ${dragOverTeam === 'unassigned' ? 'drag-over' : ''}`}
      onDragOver={(e) => handleDragOver(e, 'unassigned')}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, 'unassigned')}
    >
      <div className="column-content">
        {getUnassignedMembers().map(member => (
          <TeamMemberCard key={`unassigned-${member.id}`} member={member} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="dashboard-container">
      <PageSourceBadge source="src/TeamsPage.tsx" />
      <Sidebar 
        currentPage="teams" 
        onLogout={onLogout} 
        onPageChange={onPageChange || (() => {})} 
      />
      
      <div className="main-content">
        {authorized === null ? (
          <div className="teams-container">
            <LoadingOverlay />
          </div>
        ) : authorized === false ? (
          <div className="teams-container">
            <div className="unauthorized-state">
              <h2>Access denied</h2>
              <p>You do not have permission to view the Teams page.</p>
              <div className="header-actions">
                <button
                  className="btn-secondary"
                  onClick={() => onPageChange ? onPageChange('dashboard') : undefined}
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="teams-container">
          <div className="teams-header">
            <h1>Team Management</h1>
              <div className="header-actions">
                {!editMode ? (
                  <>
                    <button 
                      className="btn-secondary" 
                      onClick={() => setShowAddSectionModal(true)}
                      disabled={loading}
                    >
                      Add Section
                    </button>
                    <button 
                      className="btn-primary"
                      onClick={() => setShowAddMemberModal(true)}
                      disabled={loading}
                    >
                      Add Member
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
              padding: '12px', 
              borderRadius: '8px', 
              margin: '16px 0',
              border: '1px solid #ffcdd2'
            }}>
              {error}
            </div>
          )}
          
          {loading && (
            <div className="content-area">
              <TeamsSkeletonGrid />
            </div>
          )}
          
          {!loading && (
            <div className="content-area">
              {teams.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-content">
                    <h3>No teams yet</h3>
                    <p>Create your first team to get started organizing your team members.</p>
                    <button 
                      className="btn-primary"
                      onClick={() => setShowAddSectionModal(true)}
                    >
                      Create First Team
                    </button>
                  </div>
                </div>
              ) : (
                <div className="teams-grid">
                  {/* Render each team as a section */}
                  {teams.map(team => (
                    <div key={team.id} className="category-section">
                      <div className="category-title">
                        <div className="category-title-section">
                          <h3 className="category-title-text">{team.team_name}</h3>
                          <span className="category-count">{getMembersByTeam(team.id).length}</span>
                        </div>
                      </div>
                      <TeamColumn team={team} />
                    </div>
                  ))}
                  
                  {/* Show unassigned members if any exist */}
                  {getUnassignedMembers().length > 0 && (
                    <div className="category-section">
                      <div className="category-title">
                        <div className="category-title-section">
                          <h3 className="category-title-text">Unassigned</h3>
                          <span className="category-count">{getUnassignedMembers().length}</span>
                        </div>
                      </div>
                      <UnassignedColumn />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>
      
      <AddSectionModal 
        isOpen={showAddSectionModal}
        onClose={() => setShowAddSectionModal(false)}
        onSectionAdded={() => {
          setShowAddSectionModal(false);
          // Reload teams and members
          loadTeamsAndMembers();
        }}
      />
      
      <AddMemberModal 
        isOpen={showAddMemberModal}
        onClose={() => setShowAddMemberModal(false)}
        onMemberAdded={() => {
          setShowAddMemberModal(false);
          // Reload teams and members
          loadTeamsAndMembers();
        }}
      />
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deleteTarget && (
        <div className="delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-confirm-header">
              <h3>Delete {deleteTarget.type === 'member' ? 'Member' : 'Team'}</h3>
            </div>
            <div className="delete-confirm-content">
              <p>
                Are you sure you want to delete <strong>"{deleteTarget.name}"</strong>?
              </p>
              {deleteTarget.type === 'team' && (
                <p className="warning-text">
                  All members in this team will become unassigned.
                </p>
              )}
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

export default TeamsPage;
