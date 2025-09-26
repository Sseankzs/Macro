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

  return (
    <div className="dashboard-container">
      <Sidebar 
        currentPage="dashboard" 
        onLogout={onLogout} 
        onPageChange={onPageChange} 
      />
      
      <div className="main-content">
        <header className="main-header">
          <h1>Welcome, {user?.name || 'User'}!</h1>
          <div className="header-actions">
            <button className="btn-primary">New Project</button>
          </div>
        </header>
        
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
            <h2 className="section-title">Time Distribution</h2>
            <div className="charts-grid">
              <div className="chart-card ios-card">
                <div className="chart-header">
                  <h3>Daily Time Distribution</h3>
                  <div className="chart-controls">
                    <button className="chart-btn active">Week</button>
                    <button className="chart-btn">Month</button>
                  </div>
                </div>
                <div className="chart-placeholder">
                  <div className="chart-bars">
                    <div className="bar" style={{height: '60%', backgroundColor: '#007AFF'}}></div>
                    <div className="bar" style={{height: '80%', backgroundColor: '#34C759'}}></div>
                    <div className="bar" style={{height: '45%', backgroundColor: '#FF9500'}}></div>
                    <div className="bar" style={{height: '70%', backgroundColor: '#AF52DE'}}></div>
                    <div className="bar" style={{height: '90%', backgroundColor: '#FF3B30'}}></div>
                    <div className="bar" style={{height: '55%', backgroundColor: '#007AFF'}}></div>
                    <div className="bar" style={{height: '75%', backgroundColor: '#34C759'}}></div>
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
                <div className="chart-legend">
                  <div className="legend-item">
                    <span className="legend-color" style={{backgroundColor: '#007AFF'}}></span>
                    <span>Development</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color" style={{backgroundColor: '#34C759'}}></span>
                    <span>Communication</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color" style={{backgroundColor: '#FF9500'}}></span>
                    <span>Research</span>
                  </div>
                </div>
              </div>
              
              <div className="chart-card ios-card">
                <div className="chart-header">
                  <h3>App Category Breakdown</h3>
                  <span className="chart-period">today</span>
                </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
