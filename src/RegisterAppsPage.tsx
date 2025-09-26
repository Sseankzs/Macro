import React, { useState, useEffect, useRef } from 'react';
import './RegisterAppsPage.css';
import Sidebar from './Sidebar';
import { invoke } from '@tauri-apps/api/core';

interface App {
  id: string;
  name: string;
  directory: string;
  icon: string;
  isEnabled: boolean;
  category: string;
  lastUsed?: string;
}

interface DetectedApp {
  name: string;
  process_name: string;
  window_title?: string;
  directory?: string;
  is_active: boolean;
  last_seen: string;
}

interface RegisterAppsPageProps {
  onLogout: () => void;
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'detected') => void;
}

function RegisterAppsPage({ onLogout, onPageChange }: RegisterAppsPageProps) {
  const [apps, setApps] = useState<App[]>([]);

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [detectedApps, setDetectedApps] = useState<DetectedApp[]>([]);
  const [isLoadingDetectedApps, setIsLoadingDetectedApps] = useState(false);

  // Fetch detected apps when dropdown opens
  const fetchDetectedApps = async () => {
    try {
      setIsLoadingDetectedApps(true);
      const apps = await invoke<DetectedApp[]>('get_running_processes');
      // Filter out background apps (only show active apps)
      const activeApps = apps.filter(app => app.is_active);
      setDetectedApps(activeApps);
    } catch (error) {
      console.error('Failed to fetch detected apps:', error);
      setDetectedApps([]);
    } finally {
      setIsLoadingDetectedApps(false);
    }
  };

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


  const handleDropdownToggle = () => {
    if (!showDropdown) {
      fetchDetectedApps();
    }
    setShowDropdown(!showDropdown);
  };

  const handleAddFromDropdown = (detectedApp: DetectedApp) => {
    // Check if app is already registered
    const isAlreadyRegistered = apps.some(app => app.name === detectedApp.name);
    if (isAlreadyRegistered) return;

    const newApp: App = {
      id: Date.now().toString(),
      name: detectedApp.name,
      directory: detectedApp.directory || 'Unknown location',
      icon: getAppIcon(detectedApp.name),
      isEnabled: true,
      category: 'Detected',
      lastUsed: 'Just added'
    };
    setApps(prevApps => [...prevApps, newApp]);
    setShowDropdown(false);
  };

  const getAppIcon = (appName: string): string => {
    const iconMap: { [key: string]: string } = {
      'Visual Studio Code': '💻',
      'Code': '💻',
      'Chrome': '🌐',
      'Firefox': '🦊',
      'Edge': '🌐',
      'Safari': '🧭',
      'Slack': '💬',
      'Discord': '🎮',
      'Teams': '👥',
      'Zoom': '📹',
      'Spotify': '🎵',
      'Music': '🎵',
      'Terminal': '⚡',
      'PowerShell': '⚡',
      'Command Prompt': '⚡',
      'Notepad': '📝',
      'Notepad++': '📝',
      'Word': '📄',
      'Excel': '📊',
      'PowerPoint': '📈',
      'Photoshop': '🎨',
      'Figma': '🎨',
      'Paint': '🎨',
      'Calculator': '🧮',
      'File Explorer': '📁',
      'Explorer': '📁'
    };
    
    return iconMap[appName] || '📱';
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
                  onClick={handleDropdownToggle}
                >
                  <span className="dropdown-text">Add App</span>
                  <span className={`dropdown-arrow ${showDropdown ? 'open' : ''}`}>▼</span>
                </div>
                {showDropdown && (
                  <div className="dropdown-menu">
                    {isLoadingDetectedApps ? (
                      <div className="dropdown-loading">
                        <span className="loading-spinner">⏳</span>
                        Detecting apps...
                      </div>
                    ) : (
                      <>
                        {detectedApps
                          .filter(app => !apps.some(registeredApp => registeredApp.name === app.name))
                          .map((app, index) => (
                            <div
                              key={index}
                              className="dropdown-item"
                              onClick={() => handleAddFromDropdown(app)}
                            >
                              <span className="dropdown-icon">{getAppIcon(app.name)}</span>
                              <div className="dropdown-app-info">
                                <span className="dropdown-name">{app.name}</span>
                                {app.window_title && (
                                  <span className="dropdown-title">{app.window_title}</span>
                                )}
                                <span className="dropdown-process">{app.process_name}</span>
                              </div>
                            </div>
                          ))}
                        {detectedApps.filter(app => !apps.some(registeredApp => registeredApp.name === app.name)).length === 0 && (
                          <div className="dropdown-empty">
                            No detected apps available to add
                          </div>
                        )}
                      </>
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
