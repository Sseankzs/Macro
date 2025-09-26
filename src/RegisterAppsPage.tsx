import React, { useState, useEffect, useRef } from 'react';
import './RegisterAppsPage.css';
import Sidebar from './Sidebar';

interface App {
  id: string;
  name: string;
  directory: string;
  icon: string;
  isEnabled: boolean;
  category: string;
  lastUsed?: string;
}

interface RegisterAppsPageProps {
  onLogout: () => void;
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'detected') => void;
}

function RegisterAppsPage({ onLogout, onPageChange }: RegisterAppsPageProps) {
  const [apps, setApps] = useState<App[]>([
    {
      id: '1',
      name: 'Visual Studio Code',
      directory: '/Applications/Visual Studio Code.app',
      icon: '💻',
      isEnabled: true,
      category: 'Development',
      lastUsed: '2 hours ago'
    },
    {
      id: '2',
      name: 'Chrome',
      directory: '/Applications/Google Chrome.app',
      icon: '🌐',
      isEnabled: true,
      category: 'Browser',
      lastUsed: '5 minutes ago'
    },
    {
      id: '3',
      name: 'Slack',
      directory: '/Applications/Slack.app',
      icon: '💬',
      isEnabled: true,
      category: 'Communication',
      lastUsed: '1 hour ago'
    },
    {
      id: '4',
      name: 'Figma',
      directory: '/Applications/Figma.app',
      icon: '🎨',
      isEnabled: false,
      category: 'Design',
      lastUsed: '3 days ago'
    },
    {
      id: '5',
      name: 'Terminal',
      directory: '/Applications/Utilities/Terminal.app',
      icon: '⚡',
      isEnabled: true,
      category: 'Development',
      lastUsed: '30 minutes ago'
    },
    {
      id: '6',
      name: 'Spotify',
      directory: '/Applications/Spotify.app',
      icon: '🎵',
      isEnabled: false,
      category: 'Entertainment',
      lastUsed: '1 week ago'
    },
    {
      id: '7',
      name: 'Xcode',
      directory: '/Applications/Xcode.app',
      icon: '📱',
      isEnabled: true,
      category: 'Development',
      lastUsed: '4 hours ago'
    },
    {
      id: '8',
      name: 'Discord',
      directory: '/Applications/Discord.app',
      icon: '🎮',
      isEnabled: false,
      category: 'Communication',
      lastUsed: '2 days ago'
    }
  ]);

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [availableApps] = useState([
    { name: 'Visual Studio Code', directory: '/Applications/Visual Studio Code.app', icon: '💻' },
    { name: 'Chrome', directory: '/Applications/Google Chrome.app', icon: '🌐' },
    { name: 'Slack', directory: '/Applications/Slack.app', icon: '💬' },
    { name: 'Figma', directory: '/Applications/Figma.app', icon: '🎨' },
    { name: 'Terminal', directory: '/Applications/Utilities/Terminal.app', icon: '⚡' },
    { name: 'Spotify', directory: '/Applications/Spotify.app', icon: '🎵' },
    { name: 'Xcode', directory: '/Applications/Xcode.app', icon: '📱' },
    { name: 'Discord', directory: '/Applications/Discord.app', icon: '🎮' },
    { name: 'Safari', directory: '/Applications/Safari.app', icon: '🧭' },
    { name: 'Mail', directory: '/Applications/Mail.app', icon: '📧' },
    { name: 'Calendar', directory: '/Applications/Calendar.app', icon: '📅' },
    { name: 'Notes', directory: '/Applications/Notes.app', icon: '📝' }
  ]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  const handleToggleApp = (appId: string) => {
    setApps(prevApps =>
      prevApps.map(app =>
        app.id === appId ? { ...app, isEnabled: !app.isEnabled } : app
      )
    );
  };

  const handleDeleteApp = (appId: string) => {
    setApps(prevApps => prevApps.filter(app => app.id !== appId));
  };


  const handleAddFromDropdown = (availableApp: { name: string; directory: string; icon: string }) => {
    // Check if app is already registered
    const isAlreadyRegistered = apps.some(app => app.name === availableApp.name);
    if (isAlreadyRegistered) return;

    const newApp: App = {
      id: Date.now().toString(),
      name: availableApp.name,
      directory: availableApp.directory,
      icon: availableApp.icon,
      isEnabled: true,
      category: 'Other',
      lastUsed: 'Just added'
    };
    setApps(prevApps => [...prevApps, newApp]);
    setShowDropdown(false);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Development': return '#007aff';
      case 'Browser': return '#34c759';
      case 'Communication': return '#af52de';
      case 'Design': return '#ff9500';
      case 'Entertainment': return '#ff3b30';
      default: return '#8e8e93';
    }
  };

  const getEnabledCount = () => apps.filter(app => app.isEnabled).length;
  const getTotalCount = () => apps.length;

  const AppCard = ({ app }: { app: App }) => (
    <div className={`app-card ${!app.isEnabled ? 'disabled' : ''}`}>
      <div className="app-header">
        <div className="app-info">
          <h4 className="app-name">{app.name}</h4>
          <p className="app-directory">{app.directory}</p>
        </div>
        <div className="app-actions">
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={app.isEnabled}
              onChange={() => handleToggleApp(app.id)}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
      
      <div className="app-details">
        <div className="app-meta">
          {app.lastUsed && (
            <span className="last-used">Last used: {app.lastUsed}</span>
          )}
        </div>
      </div>
    </div>
  );


  return (
    <div className="dashboard-container">
      <Sidebar 
        currentPage="register-apps" 
        onLogout={onLogout} 
        onPageChange={onPageChange || (() => {})} 
      />
      
      <div className="main-content">
        <div className="apps-container">
          <div className="apps-header">
            <div className="header-info">
              <h1>Register Apps</h1>
              <p className="header-subtitle">
                Manage which applications you want to track. 
                {getEnabledCount()} of {getTotalCount()} apps are currently enabled.
              </p>
            </div>
            <div className="header-actions">
              <div className="dropdown-container" ref={dropdownRef}>
                <div 
                  className="ios-dropdown"
                  onClick={() => setShowDropdown(!showDropdown)}
                >
                  <span className="dropdown-text">Add App</span>
                  <span className={`dropdown-arrow ${showDropdown ? 'open' : ''}`}>▼</span>
                </div>
                {showDropdown && (
                  <div className="dropdown-menu">
                    {availableApps
                      .filter(app => !apps.some(registeredApp => registeredApp.name === app.name))
                      .map((app, index) => (
                        <div
                          key={index}
                          className="dropdown-item"
                          onClick={() => handleAddFromDropdown(app)}
                        >
                          <span className="dropdown-icon">{app.icon}</span>
                          <span className="dropdown-name">{app.name}</span>
                        </div>
                      ))}
                    {availableApps.filter(app => !apps.some(registeredApp => registeredApp.name === app.name)).length === 0 && (
                      <div className="dropdown-empty">
                        No available apps to add
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="content-area">
            <div className="apps-section">
              <div className="apps-grid">
                {apps.map(app => (
                  <AppCard key={app.id} app={app} />
                ))}
              </div>
              
              {apps.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">📱</div>
                  <h3>No apps registered</h3>
                  <p>Use the dropdown above to add your first application and start tracking time and productivity.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterAppsPage;
