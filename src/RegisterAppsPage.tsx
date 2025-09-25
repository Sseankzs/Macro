import React, { useState } from 'react';
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
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder') => void;
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

  const [newAppName, setNewAppName] = useState('');
  const [newAppDirectory, setNewAppDirectory] = useState('');
  const [newAppCategory, setNewAppCategory] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

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

  const handleAddApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (newAppName.trim() && newAppDirectory.trim()) {
      const newApp: App = {
        id: Date.now().toString(),
        name: newAppName.trim(),
        directory: newAppDirectory.trim(),
        icon: '📱',
        isEnabled: true,
        category: newAppCategory.trim() || 'Other',
        lastUsed: 'Just added'
      };
      setApps(prevApps => [...prevApps, newApp]);
      setNewAppName('');
      setNewAppDirectory('');
      setNewAppCategory('');
      setShowAddForm(false);
    }
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
        <div className="app-icon-section">
          <span className="app-icon">{app.icon}</span>
          <div className="app-info">
            <h4 className="app-name">{app.name}</h4>
            <p className="app-directory">{app.directory}</p>
          </div>
        </div>
        <div className="app-actions">
          <button
            className={`toggle-btn ${app.isEnabled ? 'enabled' : 'disabled'}`}
            onClick={() => handleToggleApp(app.id)}
          >
            {app.isEnabled ? 'Enabled' : 'Disabled'}
          </button>
          <button
            className="delete-btn"
            onClick={() => handleDeleteApp(app.id)}
          >
            Delete
          </button>
        </div>
      </div>
      
      <div className="app-details">
        <div className="app-meta">
          <span 
            className="category-tag" 
            style={{ backgroundColor: getCategoryColor(app.category) }}
          >
            {app.category}
          </span>
          {app.lastUsed && (
            <span className="last-used">Last used: {app.lastUsed}</span>
          )}
        </div>
      </div>
    </div>
  );

  const AddAppForm = () => (
    <div className="add-app-form">
      <h3>Register New App</h3>
      <form onSubmit={handleAddApp}>
        <div className="form-group">
          <label htmlFor="appName">App Name</label>
          <input
            type="text"
            id="appName"
            value={newAppName}
            onChange={(e) => setNewAppName(e.target.value)}
            placeholder="e.g., Visual Studio Code"
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="appDirectory">App Directory</label>
          <input
            type="text"
            id="appDirectory"
            value={newAppDirectory}
            onChange={(e) => setNewAppDirectory(e.target.value)}
            placeholder="e.g., /Applications/App Name.app"
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="appCategory">Category (Optional)</label>
          <select
            id="appCategory"
            value={newAppCategory}
            onChange={(e) => setNewAppCategory(e.target.value)}
          >
            <option value="">Select Category</option>
            <option value="Development">Development</option>
            <option value="Browser">Browser</option>
            <option value="Communication">Communication</option>
            <option value="Design">Design</option>
            <option value="Entertainment">Entertainment</option>
            <option value="Productivity">Productivity</option>
            <option value="Other">Other</option>
          </select>
        </div>
        
        <div className="form-actions">
          <button type="submit" className="btn-primary">Add App</button>
          <button 
            type="button" 
            className="btn-secondary"
            onClick={() => setShowAddForm(false)}
          >
            Cancel
          </button>
        </div>
      </form>
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
        <header className="main-header">
          <div className="header-info">
            <h1>Register Apps</h1>
            <p className="header-subtitle">
              Manage which applications you want to track. 
              {getEnabledCount()} of {getTotalCount()} apps are currently enabled.
            </p>
          </div>
          <div className="header-actions">
            <button 
              className="btn-primary"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? 'Cancel' : 'Add App'}
            </button>
          </div>
        </header>
        
        <div className="content-area">
          {showAddForm && <AddAppForm />}
          
          <div className="apps-section">
            <div className="section-header">
              <h2>Registered Applications</h2>
              <div className="filter-controls">
                <button className="filter-btn active">All</button>
                <button className="filter-btn">Enabled</button>
                <button className="filter-btn">Disabled</button>
              </div>
            </div>
            
            <div className="apps-grid">
              {apps.map(app => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
            
            {apps.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📱</div>
                <h3>No apps registered</h3>
                <p>Add your first application to start tracking time and productivity.</p>
                <button 
                  className="btn-primary"
                  onClick={() => setShowAddForm(true)}
                >
                  Add Your First App
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterAppsPage;
