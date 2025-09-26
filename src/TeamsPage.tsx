import React, { useState } from 'react';
import './TeamsPage.css';
import Sidebar from './Sidebar';

interface TeamMember {
  id: string;
  name: string;
  position: string;
  inProgressTasks: number;
  hoursTracked: number;
  currentTask: string;
  currentUrl: string;
  category: 'frontend' | 'backend' | 'design' | 'management';
  avatar: string;
  status: 'online' | 'away' | 'busy' | 'offline';
}

interface TeamsPageProps {
  onLogout: () => void;
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder') => void;
}

function TeamsPage({ onLogout, onPageChange }: TeamsPageProps) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    {
      id: '1',
      name: 'Sarah Johnson',
      position: 'Frontend Developer',
      inProgressTasks: 3,
      hoursTracked: 6.5,
      currentTask: 'Implement user dashboard',
      currentUrl: 'github.com/project',
      category: 'frontend',
      avatar: '👩‍💻',
      status: 'online'
    },
    {
      id: '2',
      name: 'Mike Chen',
      position: 'Backend Developer',
      inProgressTasks: 2,
      hoursTracked: 7.2,
      currentTask: 'API optimization',
      currentUrl: 'api.docs',
      category: 'backend',
      avatar: '👨‍💻',
      status: 'online'
    },
    {
      id: '3',
      name: 'Emily Rodriguez',
      position: 'UI/UX Designer',
      inProgressTasks: 1,
      hoursTracked: 5.8,
      currentTask: 'Mobile wireframes',
      currentUrl: 'figma.com/design',
      category: 'design',
      avatar: '👩‍🎨',
      status: 'online'
    },
    {
      id: '4',
      name: 'David Kim',
      position: 'Product Manager',
      inProgressTasks: 4,
      hoursTracked: 8.1,
      currentTask: 'Sprint planning',
      currentUrl: 'slack.com/channels',
      category: 'management',
      avatar: '👨‍💼',
      status: 'busy'
    },
    {
      id: '5',
      name: 'Lisa Wang',
      position: 'QA Engineer',
      inProgressTasks: 2,
      hoursTracked: 4.3,
      currentTask: 'Bug testing',
      currentUrl: 'test-app.com',
      category: 'backend',
      avatar: '👩‍🔬',
      status: 'away'
    },
    {
      id: '6',
      name: 'Alex Thompson',
      position: 'DevOps Engineer',
      inProgressTasks: 0,
      hoursTracked: 0,
      currentTask: '',
      currentUrl: '',
      category: 'backend',
      avatar: '👨‍🔧',
      status: 'offline'
    }
  ]);

  const [draggedMember, setDraggedMember] = useState<string | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, memberId: string) => {
    setDraggedMember(memberId);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('dragging');
    setDraggedMember(null);
    setDragOverCategory(null);
  };

  const handleDragOver = (e: React.DragEvent, category: TeamMember['category']) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCategory(category);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverCategory(null);
  };

  const handleDrop = (e: React.DragEvent, newCategory: TeamMember['category']) => {
    e.preventDefault();
    if (draggedMember) {
      setTeamMembers(prevMembers =>
        prevMembers.map(member =>
          member.id === draggedMember ? { ...member, category: newCategory } : member
        )
      );
      setDraggedMember(null);
      setDragOverCategory(null);
    }
  };

  const getMembersByCategory = (category: TeamMember['category']) => {
    return teamMembers.filter(member => member.category === category);
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

  const getCategoryColor = (category: TeamMember['category']) => {
    switch (category) {
      case 'active': return '#007aff';
      case 'break': return '#ff9500';
      case 'meeting': return '#af52de';
      case 'offline': return '#8e8e93';
      default: return '#8e8e93';
    }
  };

  const TeamMemberCard = ({ member }: { member: TeamMember }) => {
    const maxHours = 8; // Assuming 8 hours is the target
    const progressPercentage = Math.min((member.hoursTracked / maxHours) * 100, 100);

    return (
      <div
        className="team-member-card"
        draggable
        onDragStart={(e) => handleDragStart(e, member.id)}
        onDragEnd={handleDragEnd}
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

  const CategoryColumn = ({ 
    category
  }: { 
    category: TeamMember['category'];
  }) => (
    <div 
      className={`category-column ${dragOverCategory === category ? 'drag-over' : ''}`}
      onDragOver={(e) => handleDragOver(e, category)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, category)}
    >
      <div className="column-content">
        {getMembersByCategory(category).map(member => (
          <TeamMemberCard key={member.id} member={member} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="dashboard-container">
      <Sidebar 
        currentPage="teams" 
        onLogout={onLogout} 
        onPageChange={onPageChange || (() => {})} 
      />
      
      <div className="main-content">
        <div className="teams-container">
          <div className="teams-header">
            <h1>Team Management</h1>
            <div className="header-actions">
              <button className="btn-secondary">Add Section</button>
              <button className="btn-primary">Add Member</button>
            </div>
          </div>
          
          <div className="content-area">
            <div className="teams-grid">
              <div className="category-section">
                <div className="category-title">
                  <div className="category-title-section">
                    <h3 className="category-title-text">Frontend</h3>
                    <span className="category-count">{getMembersByCategory('frontend').length}</span>
                  </div>
                </div>
                <CategoryColumn 
                  category="frontend" 
                />
              </div>
              
              <div className="category-section">
                <div className="category-title">
                  <div className="category-title-section">
                    <h3 className="category-title-text">Backend</h3>
                    <span className="category-count">{getMembersByCategory('backend').length}</span>
                  </div>
                </div>
                <CategoryColumn 
                  category="backend" 
                />
              </div>
              
              <div className="category-section">
                <div className="category-title">
                  <div className="category-title-section">
                    <h3 className="category-title-text">Design</h3>
                    <span className="category-count">{getMembersByCategory('design').length}</span>
                  </div>
                </div>
                <CategoryColumn 
                  category="design" 
                />
              </div>
              
              <div className="category-section">
                <div className="category-title">
                  <div className="category-title-section">
                    <h3 className="category-title-text">Management</h3>
                    <span className="category-count">{getMembersByCategory('management').length}</span>
                  </div>
                </div>
                <CategoryColumn 
                  category="management" 
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeamsPage;
