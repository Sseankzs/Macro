import React, { useEffect, useRef } from 'react';
import './Dashboard.css';

interface SidebarProps {
  currentPage: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'detected' | 'logs';
  onLogout: () => void;
  onPageChange: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'detected' | 'logs') => void;
}

function Sidebar({ currentPage, onLogout, onPageChange }: SidebarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Add class to body when sidebar is mounted
    document.body.classList.add('dashboard-active');
    
    // Add Command+F keyboard shortcut
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    // Cleanup: remove class and event listener when component unmounts
    return () => {
      document.body.classList.remove('dashboard-active');
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const navItems = [
    {
      id: 'dashboard' as const,
      label: 'Home',
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
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      )
    },
    {
      id: 'detected' as const,
      label: 'Detected',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/>
          <path d="M20.2 20.2L16 16m-8 0L3.8 3.8"/>
        </svg>
      )
    },
    {
      id: 'logs' as const,
      label: 'Logs',
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
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
        <div className="search-bar">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search"
            className="search-input"
          />
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <span className="search-shortcut">⌘F</span>
        </div>
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
                  {item.label}
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
