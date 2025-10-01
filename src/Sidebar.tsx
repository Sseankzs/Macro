import React, { useEffect } from 'react';
import './Dashboard.css';

interface SidebarProps {
  currentPage: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant';
  onLogout: () => void;
  onPageChange: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant') => void;
}

function Sidebar({ currentPage, onLogout, onPageChange }: SidebarProps) {
  useEffect(() => {
    // Add class to body when sidebar is mounted
    document.body.classList.add('dashboard-active');
    
    // Cleanup: remove class when component unmounts
    return () => {
      document.body.classList.remove('dashboard-active');
    };
  }, []);

  const navItems = [
    {
      id: 'dashboard' as const,
      label: 'Home',
      shortcut: 'Ctrl+H',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9,22 9,12 15,12 15,22"/>
        </svg>
      )
    },
    {
      id: 'tasks' as const,
      label: 'Tasks',
      shortcut: 'Ctrl+T',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3l8-8"/>
          <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9s4.03-9 9-9s9 4.03 9 9z"/>
        </svg>
      )
    },
    {
      id: 'teams' as const,
      label: 'Teams',
      shortcut: 'Ctrl+E',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      )
    },
    {
      id: 'register-apps' as const,
      label: 'Apps',
      shortcut: 'Ctrl+A',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      )
    },
    {
      id: 'logs' as const,
      label: 'Logs',
      shortcut: 'Ctrl+L',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
      )
    },
    {
      id: 'ai-assistant' as const,
      label: 'AI Assistant',
      shortcut: 'Ctrl+I',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
      )
    }
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button className="logout-btn-top" onClick={onLogout}>Logout</button>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section">
          <h3 className="nav-section-title">Essentials</h3>
          <ul>
            {navItems.map((item) => (
              <li key={item.id} className={`nav-item ${currentPage === item.id ? 'active' : ''}`}>
                <a 
                  href="#" 
                  className="nav-link" 
                  onClick={(e) => { 
                    e.preventDefault(); 
                    onPageChange(item.id); 
                  }}
                >
                  {item.icon}
                  <span className="nav-label">{item.label}</span>
                  <span className="nav-shortcut">{item.shortcut}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
}

export default Sidebar;
