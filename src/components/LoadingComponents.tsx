import React from 'react';
import './LoadingComponents.css';

// iOS-style spinner component
export const IOSSpinner: React.FC<{ size?: 'small' | 'medium' | 'large' }> = ({ size = 'medium' }) => {
  return (
    <div className={`ios-spinner ios-spinner-${size}`}>
      <div className="spinner-ring"></div>
    </div>
  );
};

// Skeleton card for team members
export const TeamMemberSkeleton: React.FC = () => {
  // Random emoji for skeleton
  const randomEmojis = ['👨', '👩', '👨‍💻', '👩‍💻', '🧑', '👦', '👧'];
  const randomEmoji = randomEmojis[Math.floor(Math.random() * randomEmojis.length)];
  
  return (
    <div className="team-member-skeleton">
      <div className="skeleton-header">
        <div className="skeleton-avatar">
          <div className="skeleton-emoji">{randomEmoji}</div>
          <div className="skeleton-status"></div>
        </div>
        <div className="skeleton-info">
          <div className="skeleton-name"></div>
          <div className="skeleton-position"></div>
        </div>
      </div>
      
      <div className="skeleton-progress">
        <div className="skeleton-progress-bar">
          <div className="skeleton-progress-fill"></div>
        </div>
        <div className="skeleton-progress-footer">
          <div className="skeleton-hours"></div>
          <div className="skeleton-percentage"></div>
        </div>
      </div>
      
      <div className="skeleton-task">
        <div className="skeleton-task-pill"></div>
      </div>
    </div>
  );
};

// Skeleton card for tasks
export const TaskSkeleton: React.FC = () => {
  return (
    <div className="task-skeleton">
      <div className="skeleton-task-header">
        <div className="skeleton-priority-container">
          <div className="skeleton-priority"></div>
          <div className="skeleton-ellipsis"></div>
        </div>
        <div className="skeleton-title-container">
          <div className="skeleton-title"></div>
        </div>
      </div>
      
      <div className="skeleton-description"></div>
      
      <div className="skeleton-meta">
        <div className="skeleton-assignee">
          <div className="skeleton-avatar-small"></div>
          <div className="skeleton-assignee-name"></div>
        </div>
        <div className="skeleton-due-date"></div>
      </div>
      
      <div className="skeleton-divider"></div>
      <div className="skeleton-due-date-tag"></div>
    </div>
  );
};

// Loading overlay with spinner
export const LoadingOverlay: React.FC<{ message?: string }> = ({ message = "Loading..." }) => {
  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <IOSSpinner size="large" />
        <p className="loading-message">{message}</p>
      </div>
    </div>
  );
};

// Skeleton grid for teams page
export const TeamsSkeletonGrid: React.FC = () => {
  return (
    <div className="teams-skeleton-grid">
      <div className="skeleton-teams-header">
        <div className="skeleton-teams-title"></div>
        <div className="skeleton-header-actions">
          <div className="skeleton-btn"></div>
          <div className="skeleton-btn"></div>
          <div className="skeleton-btn"></div>
        </div>
      </div>
      {[1, 2, 3, 4].map((teamIndex) => (
        <div key={teamIndex} className="skeleton-team-section">
          <div className="skeleton-team-title">
            <div className="skeleton-team-name"></div>
            <div className="skeleton-team-count"></div>
          </div>
          <div className="skeleton-team-column">
            {[1, 2, 3].map((memberIndex) => (
              <TeamMemberSkeleton key={memberIndex} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Skeleton grid for tasks page
export const TasksSkeletonGrid: React.FC = () => {
  return (
    <div className="tasks-skeleton-grid">
      <div className="skeleton-tasks-header">
        <div className="skeleton-tasks-title"></div>
        <div className="skeleton-header-actions">
          <div className="skeleton-btn"></div>
          <div className="skeleton-btn"></div>
        </div>
      </div>
      <div className="skeleton-tasks-content">
        {['Todo', 'In Progress', 'Done'].map((status) => (
          <div key={status} className="skeleton-status-column">
            <div className="skeleton-status-header">
              <div className="skeleton-status-title"></div>
              <div className="skeleton-status-count"></div>
            </div>
            <div className="skeleton-status-content">
              {[1, 2, 3].map((taskIndex) => (
                <TaskSkeleton key={taskIndex} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Skeleton grid for dashboard page
export const DashboardSkeletonGrid: React.FC = () => {
  return (
    <div className="dashboard-skeleton-grid">
      {/* Stats Section Skeleton */}
      <div className="skeleton-stats-section">
        <div className="skeleton-section-title"></div>
        <div className="skeleton-stats-grid">
          {[1, 2, 3, 4].map((statIndex) => (
            <div key={statIndex} className="skeleton-stat-card">
              <div className="skeleton-stat-header">
                <div className="skeleton-stat-title"></div>
                <div className="skeleton-stat-period"></div>
              </div>
              <div className="skeleton-stat-main">
                <div className="skeleton-stat-number"></div>
                <div className="skeleton-stat-change"></div>
              </div>
              <div className="skeleton-stat-subtitle"></div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Charts Section Skeleton */}
      <div className="skeleton-charts-section">
        <div className="skeleton-charts-header">
          <div className="skeleton-section-title"></div>
          <div className="skeleton-chart-controls">
            {[1, 2, 3].map((btnIndex) => (
              <div key={btnIndex} className="skeleton-chart-btn"></div>
            ))}
          </div>
        </div>
        <div className="skeleton-charts-grid">
          <div className="skeleton-chart-card">
            <div className="skeleton-chart-header">
              <div className="skeleton-chart-title"></div>
            </div>
            <div className="skeleton-chart-content"></div>
          </div>
          <div className="skeleton-chart-card">
            <div className="skeleton-chart-header">
              <div className="skeleton-chart-title"></div>
            </div>
            <div className="skeleton-table-content">
              <div className="skeleton-table-header"></div>
              {[1, 2, 3, 4, 5].map((rowIndex) => (
                <div key={rowIndex} className="skeleton-table-row"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};