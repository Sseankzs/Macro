import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Dashboard.css';
import Sidebar from './Sidebar';

interface DashboardProps {
  onLogout: () => void;
  onPageChange: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'detected') => void;
}

function Dashboard({ onLogout, onPageChange }: DashboardProps) {
  const [user, setUser] = useState<{ name: string } | null>(null);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<'today' | 'week' | 'month'>('week');

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await invoke('get_current_user');
        setUser(userData as { name: string });
      } catch (error) {
        console.error('Failed to fetch user:', error);
        // Fallback to default name if fetch fails
        setUser({ name: 'Dev User' });
      }
    };

    fetchUser();
  }, []);

  const handleTimePeriodChange = (period: 'today' | 'week' | 'month') => {
    setSelectedTimePeriod(period);
  };

  return (
    <div className="dashboard-container">
      <Sidebar 
        currentPage="dashboard" 
        onLogout={onLogout} 
        onPageChange={onPageChange} 
      />
      
      <div className="main-content">
        <div className="dashboard-page-container">
          <div className="dashboard-header">
            <h1>Welcome, {user?.name || 'User'}!</h1>
            <div className="header-actions">
              <button className="btn-primary">New Project</button>
            </div>
          </div>
          
          <div className="content-area">
          {/* Top Section - Quick Stats Cards */}
          <div className="stats-section">
            <h2 className="section-title">Today's Overview</h2>
            <div className="stats-grid">
              <div className="stat-card ios-card">
                <div className="stat-header">
                  <h3>Hours Tracked Today</h3>
                  <span className="stat-period">vs yesterday</span>
                </div>
                <div className="stat-main">
                  <span className="stat-number">6.5h</span>
                  <span className="stat-change positive">+1.2h</span>
                </div>
                <div className="stat-subtitle">This week: 32.5h</div>
              </div>
              
              <div className="stat-card ios-card">
                <div className="stat-header">
                  <h3>Most Used App</h3>
                  <span className="stat-period">today</span>
                </div>
                <div className="stat-main">
                  <div className="app-info">
                    <div className="app-icon">💻</div>
                    <div className="app-details">
                      <span className="app-name">VS Code</span>
                      <span className="app-time">4.2h</span>
                    </div>
                  </div>
                </div>
                <div className="stat-subtitle">Development</div>
              </div>
              
              <div className="stat-card ios-card">
                <div className="stat-header">
                  <h3>Tasks Completed</h3>
                  <span className="stat-period">with AI summaries</span>
                </div>
                <div className="stat-main">
                  <span className="stat-number">3</span>
                  <div className="task-summary">
                    <span className="task-item">2 features added</span>
                    <span className="task-item">1 bug fixed</span>
                  </div>
                </div>
                <div className="stat-subtitle">Productivity boost</div>
              </div>
            </div>
          </div>
          
          {/* Middle Section - Charts & Visuals */}
          <div className="charts-section">
            <div className="charts-header">
              <h2 className="section-title">Time Distribution</h2>
              <div className="chart-controls chart-controls-stacked">
                <button 
                  className={`chart-btn ${selectedTimePeriod === 'today' ? 'active' : ''}`}
                  onClick={() => handleTimePeriodChange('today')}
                >
                  Today
                </button>
                <button 
                  className={`chart-btn ${selectedTimePeriod === 'week' ? 'active' : ''}`}
                  onClick={() => handleTimePeriodChange('week')}
                >
                  Week
                </button>
                <button 
                  className={`chart-btn ${selectedTimePeriod === 'month' ? 'active' : ''}`}
                  onClick={() => handleTimePeriodChange('month')}
                >
                  Month
                </button>
              </div>
            </div>
            
            {/* Daily Time Distribution Chart - Show for Week/Month */}
            {selectedTimePeriod !== 'today' && (
              <div className="chart-card ios-card">
                <div className="chart-header">
                  <h3>Daily Time Distribution</h3>
                </div>
                <div className="chart-placeholder">
                  <div className="chart-bars">
                    {/* Monday */}
                    <div className="bar-container">
                      <div className="bar-segment" style={{height: '40%', backgroundColor: '#007AFF'}} data-label="Development: 4.2h"></div>
                      <div className="bar-segment" style={{height: '20%', backgroundColor: '#34C759'}} data-label="Communication: 2.1h"></div>
                    </div>
                    {/* Tuesday */}
                    <div className="bar-container">
                      <div className="bar-segment" style={{height: '50%', backgroundColor: '#007AFF'}} data-label="Development: 5.3h"></div>
                      <div className="bar-segment" style={{height: '30%', backgroundColor: '#FF9500'}} data-label="Research: 3.2h"></div>
                    </div>
                    {/* Wednesday */}
                    <div className="bar-container">
                      <div className="bar-segment" style={{height: '30%', backgroundColor: '#007AFF'}} data-label="Development: 3.1h"></div>
                      <div className="bar-segment" style={{height: '15%', backgroundColor: '#34C759'}} data-label="Communication: 1.6h"></div>
                    </div>
                    {/* Thursday */}
                    <div className="bar-container">
                      <div className="bar-segment" style={{height: '45%', backgroundColor: '#007AFF'}} data-label="Development: 4.8h"></div>
                      <div className="bar-segment" style={{height: '25%', backgroundColor: '#AF52DE'}} data-label="Design: 2.7h"></div>
                    </div>
                    {/* Friday */}
                    <div className="bar-container">
                      <div className="bar-segment" style={{height: '60%', backgroundColor: '#007AFF'}} data-label="Development: 6.4h"></div>
                      <div className="bar-segment" style={{height: '30%', backgroundColor: '#FF3B30'}} data-label="Meetings: 3.2h"></div>
                    </div>
                    {/* Saturday */}
                    <div className="bar-container">
                      <div className="bar-segment" style={{height: '35%', backgroundColor: '#007AFF'}} data-label="Development: 3.7h"></div>
                      <div className="bar-segment" style={{height: '20%', backgroundColor: '#34C759'}} data-label="Communication: 2.1h"></div>
                    </div>
                    {/* Sunday */}
                    <div className="bar-container">
                      <div className="bar-segment" style={{height: '50%', backgroundColor: '#007AFF'}} data-label="Development: 5.3h"></div>
                      <div className="bar-segment" style={{height: '25%', backgroundColor: '#FF9500'}} data-label="Research: 2.7h"></div>
                    </div>
                  </div>
                  <div className="chart-labels">
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                    <span>Sun</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* App Category Breakdown Chart - Show for Today */}
            {selectedTimePeriod === 'today' && (
              <div className="chart-card ios-card chart-card-expanded">
                <div className="chart-header">
                  <h3>App Category Breakdown</h3>
                </div>
                <div className="expanded-chart-content">
                  <div className="pie-chart-container">
                    <div className="pie-chart">
                      <div className="pie-segment coding" style={{'--percentage': '45%'} as React.CSSProperties}></div>
                      <div className="pie-segment communication" style={{'--percentage': '25%'} as React.CSSProperties}></div>
                      <div className="pie-segment research" style={{'--percentage': '20%'} as React.CSSProperties}></div>
                      <div className="pie-segment other" style={{'--percentage': '10%'} as React.CSSProperties}></div>
                      <div className="pie-center">
                        <span className="pie-total">6.5h</span>
                      </div>
                    </div>
                  </div>
                  <div className="category-breakdown">
                    <div className="category-item">
                      <span className="category-dot coding"></span>
                      <span className="category-name">Coding</span>
                      <span className="category-percentage">45%</span>
                    </div>
                    <div className="category-item">
                      <span className="category-dot communication"></span>
                      <span className="category-name">Communication</span>
                      <span className="category-percentage">25%</span>
                    </div>
                    <div className="category-item">
                      <span className="category-dot research"></span>
                      <span className="category-name">Research</span>
                      <span className="category-percentage">20%</span>
                    </div>
                    <div className="category-item">
                      <span className="category-dot other"></span>
                      <span className="category-name">Other</span>
                      <span className="category-percentage">10%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
