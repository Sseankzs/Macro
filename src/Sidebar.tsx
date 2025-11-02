import { useEffect } from 'react';
import './Dashboard.css';
import { useTheme } from './useTheme';

interface SidebarProps {
  currentPage: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant' | 'debug';
  onLogout: () => void;
  onPageChange: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant' | 'debug') => void;
}

// Detect if running on macOS
function isMacOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || 
         /Mac/.test(navigator.userAgent);
}

// Format shortcut parts based on platform
function getShortcutParts(key: string): { modifier: string; key: string } {
  const isMac = isMacOS();
  const modifier = isMac ? '⌘' : 'Ctrl';
  return { modifier, key };
}

function Sidebar({ currentPage, onLogout, onPageChange }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
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
      shortcut: getShortcutParts('H'),
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
      shortcut: getShortcutParts('T'),
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3l8-8"/>
          <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9s4.03-9 9-9s9 4.03 9 9z"/>
        </svg>
      )
    },
    {
      id: 'register-apps' as const,
      label: 'Apps',
      shortcut: getShortcutParts('A'),
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
      shortcut: getShortcutParts('L'),
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
      label: 'Insights',
      shortcut: getShortcutParts('I'),
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21h6M12 3a6 6 0 0 1 6 6c0 2.22-1.206 4.16-3 5.196V17a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-2.804A5.978 5.978 0 0 1 6 9a6 6 0 0 1 6-6z"/>
        </svg>
      )
    },
    {
      id: 'debug' as const,
      label: 'Debug',
      shortcut: getShortcutParts('D'),
      icon: (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
          <circle cx="8" cy="7" r="1"/>
          <circle cx="12" cy="7" r="1"/>
          <circle cx="16" cy="7" r="1"/>
        </svg>
      )
    }
  ];

  return (
    <div className="sidebar">
      {/* Hidden theme toggle - logic kept for later use */}
      <div className="sidebar-header" style={{ display: 'none' }}>
        <label className="theme-toggle" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          <input
            type="checkbox"
            checked={theme === 'dark'}
            onChange={toggleTheme}
            aria-label="Toggle dark mode"
          />
          <span className="theme-slider" aria-hidden></span>
          <span className="theme-label">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
        </label>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section">
          <ul>
            {navItems
              .map((item) => {
                const tooltipText = `${item.label} (${item.shortcut.modifier}+${item.shortcut.key})`;
                return (
                  <li key={item.id} className={`nav-item ${currentPage === item.id ? 'active' : ''}`}>
                    <a 
                      href="#" 
                      className="nav-link" 
                      title={tooltipText}
                      onClick={(e) => { 
                        e.preventDefault(); 
                        onPageChange(item.id); 
                      }}
                    >
                      {item.icon}
                      <span className="nav-tooltip">
                        <span className="nav-tooltip-label">{item.label}</span>
                        <span className="nav-tooltip-shortcut">
                          <span className="nav-tooltip-modifier">{item.shortcut.modifier}</span>
                          <span className="nav-tooltip-separator">+</span>
                          <span className="nav-tooltip-key">{item.shortcut.key}</span>
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
          </ul>
        </div>
      </nav>
      <div className="sidebar-footer">
        <button 
          className="logout-btn-top" 
          onClick={onLogout}
          title="Logout"
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16,17 21,12 16,7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span className="nav-tooltip">
            <span className="nav-tooltip-label">Logout</span>
          </span>
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
