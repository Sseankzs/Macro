import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './DetectedPage.css';
import Sidebar from './Sidebar';

interface DetectedApp {
  name: string;
  process_name: string;
  window_title?: string;
  directory?: string;
  is_active: boolean;
  last_seen: string;
}

interface DetectedPageProps {
  onLogout: () => void;
  onPageChange: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'detected') => void;
}

function DetectedPage({ onLogout, onPageChange }: DetectedPageProps) {
  const [detectedApps, setDetectedApps] = useState<DetectedApp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'background'>('active');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchDetectedApps();
  }, []);

  const fetchDetectedApps = async () => {
    try {
      setIsLoading(true);
      const apps = await invoke<DetectedApp[]>('get_running_processes');
      setDetectedApps(apps);
    } catch (error) {
      console.error('Failed to fetch detected apps:', error);
      // Show empty state instead of fallback data
      setDetectedApps([]);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredApps = detectedApps.filter(app => {
    const matchesFilter = filter === 'all' || 
      (filter === 'active' && app.is_active) || 
      (filter === 'background' && !app.is_active);
    
    const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.process_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (app.directory && app.directory.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (app.window_title && app.window_title.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return matchesFilter && matchesSearch;
  });

  const formatLastSeen = (timestamp: string) => {
    const now = new Date();
    const lastSeen = new Date(timestamp);
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const formatDirectory = (directory?: string) => {
    if (!directory) return 'Unknown location';
    
    // Extract just the directory path (remove the executable name)
    const path = directory.replace(/\\[^\\]*$/, ''); // Remove last part after last backslash
    
    // Show more of the path since we have scrolling animation
    if (path.length > 80) {
      const parts = path.split('\\');
      if (parts.length > 4) {
        return `...\\${parts.slice(-3).join('\\')}`;
      }
    }
    
    return path;
  };

  const getAppIcon = (appName: string) => {
    const iconMap: { [key: string]: string } = {
      'Visual Studio Code': '💻',
      'Google Chrome': '🌐',
      'Discord': '💬',
      'Windows Explorer': '📁',
      'Spotify': '🎵',
      'Slack': '💼',
      'Notion': '📝',
      'Figma': '🎨',
      'Photoshop': '🖼️',
      'Excel': '📊',
      'Word': '📄',
      'PowerPoint': '📈'
    };
    return iconMap[appName] || '📱';
  };

  return (
    <div className="detected-container" key="detected-page">
      <Sidebar 
        currentPage="detected" 
        onLogout={onLogout} 
        onPageChange={onPageChange} 
      />
      
      <div className="main-content">
        <header className="main-header">
          <div className="header-left">
            <h1>Detected Applications</h1>
            <p className="header-subtitle">Monitor active applications and processes • Click refresh to update</p>
          </div>
          <div className="header-actions">
            <button 
              className={`btn-secondary ${isLoading ? 'loading' : ''}`} 
              onClick={fetchDetectedApps}
              disabled={isLoading}
            >
              <svg className={`btn-icon ${isLoading ? 'spinning' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </header>
        
        <div className="content-area">
          {/* Controls */}
          <div className="controls-section">
            <div className="filter-tabs">
              <button 
                className={`filter-tab ${filter === 'active' ? 'active' : ''}`}
                onClick={() => setFilter('active')}
              >
                Active ({detectedApps.filter(app => app.is_active).length})
              </button>
              <button 
                className={`filter-tab ${filter === 'background' ? 'active' : ''}`}
                onClick={() => setFilter('background')}
              >
                Background ({detectedApps.filter(app => !app.is_active).length})
              </button>
              <button 
                className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All ({detectedApps.length})
              </button>
            </div>
            
            <div className="search-container">
              <div className="search-input-wrapper">
                <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search applications..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>
          </div>

          {/* Apps List */}
          <div className="apps-section">
            {isLoading ? (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <p>Detecting applications...</p>
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <h3>No applications found</h3>
                <p>No applications match your current filter and search criteria.</p>
              </div>
            ) : (
              <div className="apps-grid">
                {filteredApps.map((app, index) => (
                  <div key={`${app.process_name}-${index}`} className={`app-card ${app.is_active ? 'active' : 'inactive'}`}>
                    <div className="app-header">
                      <div className="app-icon">
                        {getAppIcon(app.name)}
                      </div>
                      <div className="app-info">
                        <h3 className="app-name">{app.name}</h3>
                        {app.directory && (
                          <p className="app-directory" title={app.directory}>
                            <span className="app-directory-text">📁 {formatDirectory(app.directory)}</span>
                          </p>
                        )}
                        <p className="app-process">{app.process_name}</p>
                        {app.window_title && (
                          <p className="app-window">{app.window_title}</p>
                        )}
                      </div>
                      <div className="app-status">
                        <div className={`status-indicator ${app.is_active ? 'active' : 'inactive'}`}>
                          {app.is_active ? 'Active' : 'Background'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="app-info-footer">
                      <div className="last-seen">
                        <span className="last-seen-label">Last detected:</span>
                        <span className="last-seen-value">{formatLastSeen(app.last_seen)}</span>
                      </div>
                    </div>
                    
                    <div className="app-actions">
                      <button className="action-btn secondary">
                        <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                        Track
                      </button>
                      <button className="action-btn primary">
                        <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 12l2 2 4-4"/>
                          <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9s4.03-9 9-9s9 4.03 9 9z"/>
                        </svg>
                        Add to Apps
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DetectedPage;
