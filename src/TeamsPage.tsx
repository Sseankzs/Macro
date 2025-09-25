import React, { useState } from 'react';
import './TeamsPage.css';
import Sidebar from './Sidebar';

interface TeamMember {
  id: string;
  name: string;
  position: string;
  inProgressTasks: number;
  hoursTracked: number;
  currentApp: string;
  currentUrl: string;
  category: 'active' | 'break' | 'meeting' | 'offline';
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
      currentApp: 'VS Code',
      currentUrl: 'github.com/project',
      category: 'active',
      avatar: '👩‍💻',
      status: 'online'
    },
    {
      id: '2',
      name: 'Mike Chen',
      position: 'Backend Developer',
      inProgressTasks: 2,
      hoursTracked: 7.2,
      currentApp: 'Terminal',
      currentUrl: 'api.docs',
      category: 'active',
      avatar: '👨‍💻',
      status: 'online'
    },
    {
      id: '3',
      name: 'Emily Rodriguez',
      position: 'UI/UX Designer',
      inProgressTasks: 1,
      hoursTracked: 5.8,
      currentApp: 'Figma',
      currentUrl: 'figma.com/design',
      category: 'active',
      avatar: '👩‍🎨',
      status: 'online'
    },
    {
      id: '4',
      name: 'David Kim',
      position: 'Product Manager',
      inProgressTasks: 4,
      hoursTracked: 8.1,
      currentApp: 'Slack',
      currentUrl: 'slack.com/channels',
      category: 'meeting',
      avatar: '👨‍💼',
      status: 'busy'
    },
    {
      id: '5',
      name: 'Lisa Wang',
      position: 'QA Engineer',
      inProgressTasks: 2,
      hoursTracked: 4.3,
      currentApp: 'Chrome',
      currentUrl: 'test-app.com',
      category: 'break',
      avatar: '👩‍🔬',
      status: 'away'
    },
    {
      id: '6',
      name: 'Alex Thompson',
      position: 'DevOps Engineer',
      inProgressTasks: 0,
      hoursTracked: 0,
      currentApp: '',
      currentUrl: '',
      category: 'offline',
      avatar: '👨‍🔧',
      status: 'offline'
    }
  ]);

  const [draggedMember, setDraggedMember] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, memberId: string) => {
    setDraggedMember(memberId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
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

  const TeamMemberCard = ({ member }: { member: TeamMember }) => (
    <div
      className="team-member-card"
      draggable
      onDragStart={(e) => handleDragStart(e, member.id)}
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
      
      <div className="member-stats">
        <div className="stat-item">
          <span className="stat-label">Tasks</span>
          <span className="stat-value">{member.inProgressTasks}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Hours</span>
          <span className="stat-value">{member.hoursTracked}h</span>
        </div>
      </div>
      
      {member.currentApp && (
        <div className="current-activity">
          <div className="activity-header">
            <span className="activity-label">Currently using</span>
          </div>
          <div className="activity-content">
            <span className="app-name">{member.currentApp}</span>
            <span className="app-url">{member.currentUrl}</span>
          </div>
        </div>
      )}
    </div>
  );

  const CategoryColumn = ({ 
    title, 
    category, 
    count,
    color 
  }: { 
    title: string; 
    category: TeamMember['category']; 
    count: number;
    color: string;
  }) => (
    <div 
      className="category-column"
      onDragOver={handleDragOver}
      onDrop={(e) => handleDrop(e, category)}
    >
      <div className="column-header">
        <div className="column-title-section">
          <div 
            className="category-indicator" 
            style={{ backgroundColor: color }}
          ></div>
          <h3 className="column-title">{title}</h3>
        </div>
        <span className="column-count">{count}</span>
      </div>
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
        <header className="main-header">
          <h1>Team Management</h1>
          <div className="header-actions">
            <button className="btn-primary">Add Member</button>
          </div>
        </header>
        
        <div className="content-area">
          <div className="teams-grid">
            <CategoryColumn 
              title="Active" 
              category="active" 
              count={getMembersByCategory('active').length}
              color="#007aff"
            />
            <CategoryColumn 
              title="On Break" 
              category="break" 
              count={getMembersByCategory('break').length}
              color="#ff9500"
            />
            <CategoryColumn 
              title="In Meeting" 
              category="meeting" 
              count={getMembersByCategory('meeting').length}
              color="#af52de"
            />
            <CategoryColumn 
              title="Offline" 
              category="offline" 
              count={getMembersByCategory('offline').length}
              color="#8e8e93"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeamsPage;
