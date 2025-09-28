import { useState, useEffect, useRef } from 'react';
import './RegisterAppsPage.css';
import Sidebar from './Sidebar';
import { invoke } from '@tauri-apps/api/core';

interface App {
  id: string;
  name: string;
  process_name: string;
  icon_path?: string;
  category?: string;
  is_tracked?: boolean;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  last_used?: string;
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
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected' | 'error'>('checking');
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [rlsErrors, setRlsErrors] = useState<string[]>([]);

  const [showDropdown, setShowDropdown] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [detectedApps, setDetectedApps] = useState<DetectedApp[]>([]);
  const [isLoadingDetectedApps, setIsLoadingDetectedApps] = useState(false);

  // Test database connection and check for RLS issues
  const testDatabaseConnection = async () => {
    try {
      console.log('🔍 Testing database connection...');
      setConnectionStatus('checking');
      
      const isConnected = await invoke<boolean>('test_database_connection');
      
      if (isConnected) {
        console.log('✅ Database connection successful');
        setConnectionStatus('connected');
        setError(null);
      } else {
        console.log('❌ Database connection failed');
        setConnectionStatus('disconnected');
        setError('Database connection failed');
      }
    } catch (error) {
      console.error('🚨 Database connection error:', error);
      setConnectionStatus('error');
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for specific RLS errors
      if (errorMessage.includes('42501') || errorMessage.includes('row-level security')) {
        const rlsError = 'Row Level Security (RLS) policy violation. Check if user exists and has proper permissions.';
        setRlsErrors(prev => [...prev, rlsError]);
        setError(`RLS Error: ${rlsError}`);
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        const authError = 'Authentication failed. Check Supabase credentials in .env file.';
        setRlsErrors(prev => [...prev, authError]);
        setError(`Auth Error: ${authError}`);
      } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
        const networkError = 'Network connection issue. Check internet connection and Supabase URL.';
        setRlsErrors(prev => [...prev, networkError]);
        setError(`Network Error: ${networkError}`);
      } else {
        setError(`Database Error: ${errorMessage}`);
      }
    }
  };

  // Enhanced debug function
  const collectDebugInfo = async () => {
    try {
      console.log('🔍 Collecting debug information...');
      
      const debugData: any = {
        timestamp: new Date().toISOString(),
        connectionStatus,
        apps: apps.length,
        detectedApps: detectedApps.length,
        error: error,
        rlsErrors: rlsErrors,
        environment: {
          nodeEnv: import.meta.env.MODE,
          hasSupabaseUrl: !!import.meta.env.VITE_SUPABASE_URL,
          hasSupabaseKey: !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
        }
      };

      // Test database connection
      try {
        const dbTest = await invoke<boolean>('test_database_connection');
        debugData.databaseTest = dbTest;
      } catch (dbError) {
        debugData.databaseError = dbError instanceof Error ? dbError.message : String(dbError);
      }

      // Test current user
      try {
        const currentUser = await invoke('get_current_user');
        debugData.currentUser = currentUser;
      } catch (userError) {
        debugData.userError = userError instanceof Error ? userError.message : String(userError);
      }

      setDebugInfo(debugData);
      console.log('📊 Debug info collected:', debugData);
      
      return debugData;
    } catch (error) {
      console.error('❌ Failed to collect debug info:', error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  };

  // Load apps on component mount with enhanced error handling
  useEffect(() => {
    const initializePage = async () => {
      console.log('🚀 Initializing RegisterAppsPage...');
      
      // First test database connection
      await testDatabaseConnection();
      
      // Then try to load apps
      await fetchApps();
    };
    
    initializePage();
  }, []);

  // Fetch apps from database with comprehensive error handling
  const fetchApps = async () => {
    try {
      console.log('📱 Fetching user apps from database...');
      setIsLoadingApps(true);
      setError(null);
      
      const apps = await invoke<App[]>('get_my_applications');
      console.log('✅ Successfully fetched apps:', apps);
      console.log('📱 App is_tracked values:', apps.map(app => ({ name: app.name, is_tracked: app.is_tracked, type: typeof app.is_tracked })));
      setApps(apps);
    } catch (error) {
      console.error('❌ Failed to fetch apps:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Analyze error for RLS issues
      if (errorMessage.includes('42501') || errorMessage.includes('row-level security')) {
        const rlsError = 'RLS Policy Error: User may not exist or lacks permissions to read applications table.';
        setRlsErrors(prev => [...prev, rlsError]);
        setError(`RLS Error: ${rlsError}`);
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        const authError = 'Authentication Error: Invalid Supabase credentials or API key.';
        setRlsErrors(prev => [...prev, authError]);
        setError(`Auth Error: ${authError}`);
      } else {
        setError(`Failed to load applications: ${errorMessage}`);
      }
      
      setApps([]);
    } finally {
      setIsLoadingApps(false);
    }
  };

  // Fetch detected apps when dropdown opens
  const fetchDetectedApps = async () => {
    try {
      console.log('🔍 Fetching detected apps...');
      setIsLoadingDetectedApps(true);
      setError(null);
      
      const apps = await invoke<DetectedApp[]>('get_running_processes');
      console.log('📱 Raw detected apps:', apps);
      
      // Filter out background apps (only show active apps)
      const activeApps = apps.filter(app => app.is_active);
      console.log('✅ Active apps found:', activeApps.length);
      
      setDetectedApps(activeApps);
      
      if (activeApps.length === 0) {
        console.log('⚠️ No active apps detected');
        setError('No active applications detected. Please open an application and try again.');
      }
    } catch (error) {
      console.error('❌ Failed to fetch detected apps:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('permission')) {
        const permError = 'Permission denied to access running processes.';
        setRlsErrors(prev => [...prev, permError]);
        setError(`Permission Error: ${permError}`);
      } else if (errorMessage.includes('timeout')) {
        const timeoutError = 'Process detection timed out.';
        setRlsErrors(prev => [...prev, timeoutError]);
        setError(`Timeout Error: ${timeoutError}`);
      } else {
        setError(`Failed to detect applications: ${errorMessage}`);
      }
      
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

  const handleToggleApp = async (appId: string) => {
    try {
      console.log('🔄 Toggling app:', appId);
      
      const app = apps.find(a => a.id === appId);
      if (!app) {
        console.error('❌ App not found:', appId);
        setError('App not found');
        return;
      }

      const currentStatus = app.is_tracked ?? false;
      const newStatus = !currentStatus;
      
      console.log('🔍 DEBUG TOGGLE START:', {
        appId,
        appName: app.name,
        originalIsTracked: app.is_tracked,
        originalType: typeof app.is_tracked,
        currentStatus,
        currentStatusType: typeof currentStatus,
        newStatus,
        newStatusType: typeof newStatus
      });

      const payload = {
        appId: appId,
        is_tracked: Boolean(newStatus)  // Explicitly convert to boolean
      };

      console.log('🚀 SENDING PAYLOAD:', payload);
      console.log('🚀 PAYLOAD TYPES:', {
        appIdType: typeof payload.appId,
        isTrackedType: typeof payload.is_tracked,
        isTrackedValue: payload.is_tracked,
        isTrackedExplicit: Boolean(payload.is_tracked)
      });
      console.log('🚀 PAYLOAD JSON:', JSON.stringify(payload, null, 2));

      const result = await invoke('toggle_my_application_tracking', {
        appId: appId,
        isTracked: Boolean(newStatus)
      });
      
      console.log('📥 BACKEND RESULT:', result);
      console.log('📥 RESULT TYPE:', typeof result);
      console.log('📥 RESULT IS_TRACKED:', (result as any)?.is_tracked);

      console.log('✅ App status updated successfully');

      // Update local state
      setApps(prevApps => {
        console.log('🔄 UPDATING STATE - Before:', prevApps.find(app => app.id === appId));
        
        const updatedApps = prevApps.map(app =>
          app.id === appId ? { ...app, is_tracked: newStatus } : app
        );
        
        const updatedApp = updatedApps.find(app => app.id === appId);
        console.log('🔄 UPDATING STATE - After:', {
          name: updatedApp?.name, 
          newStatus: updatedApp?.is_tracked,
          newStatusType: typeof updatedApp?.is_tracked
        });
        
        return updatedApps;
      });
      
      setError(null);
    } catch (error) {
      console.error('❌ Failed to toggle app:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Analyze RLS errors
      if (errorMessage.includes('42501') || errorMessage.includes('row-level security')) {
        const rlsError = 'RLS Policy Error: User lacks permission to update applications table.';
        setRlsErrors(prev => [...prev, rlsError]);
        setError(`RLS Error: ${rlsError}`);
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        const authError = 'Authentication Error: Invalid credentials for update operation.';
        setRlsErrors(prev => [...prev, authError]);
        setError(`Auth Error: ${authError}`);
      } else {
        setError(`Failed to update application status: ${errorMessage}`);
      }
    }
  };

  const handleDeleteApp = async (appId: string) => {
    try {
      console.log('🗑️ Deleting app:', appId);
      
      const app = apps.find(a => a.id === appId);
      if (!app) {
        console.error('❌ App not found for deletion:', appId);
        setError('App not found');
        return;
      }

      console.log('📱 Deleting app:', { name: app.name, id: appId });

      await invoke('delete_my_application', { appId: appId });
      
      console.log('✅ App deleted successfully');
      
      // Update local state
      setApps(prevApps => prevApps.filter(app => app.id !== appId));
      setError(null);
    } catch (error) {
      console.error('❌ Failed to delete app:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Analyze RLS errors
      if (errorMessage.includes('42501') || errorMessage.includes('row-level security')) {
        const rlsError = 'RLS Policy Error: User lacks permission to delete from applications table.';
        setRlsErrors(prev => [...prev, rlsError]);
        setError(`RLS Error: ${rlsError}`);
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        const authError = 'Authentication Error: Invalid credentials for delete operation.';
        setRlsErrors(prev => [...prev, authError]);
        setError(`Auth Error: ${authError}`);
      } else {
        setError(`Failed to delete application: ${errorMessage}`);
      }
    }
  };


  const handleDropdownToggle = () => {
    if (!showDropdown) {
      fetchDetectedApps();
    }
    setShowDropdown(!showDropdown);
  };

  const handleAddFromDropdown = async (detectedApp: DetectedApp) => {
    try {
      console.log('➕ Adding app from dropdown:', {
        name: detectedApp.name,
        processName: detectedApp.process_name,
        windowTitle: detectedApp.window_title,
        process_name: detectedApp.process_name,
        isActive: detectedApp.is_active
      });

      // Check if app is already registered
      const isAlreadyRegistered = apps.some(app => app.name === detectedApp.name);
      if (isAlreadyRegistered) {
        console.log('⚠️ App already registered:', detectedApp.name);
        setError(`App "${detectedApp.name}" is already registered.`);
        return;
      }

      // Validate required fields
      if (!detectedApp.name || !detectedApp.process_name) {
        console.error('❌ Missing required fields:', {
          name: detectedApp.name,
          processName: detectedApp.process_name
        });
        setError('App name and process name are required.');
        return;
      }

      console.log('📝 Creating app with parameters:', {
        name: detectedApp.name,
        processName: detectedApp.process_name,
        iconPath: null,
        category: 'Detected',
        isTracked: true
      });

      const newApp = await invoke<App>('create_my_application', {
        name: detectedApp.name,
        process_name: detectedApp.process_name,
        icon_path: null,
        category: 'Detected',
        is_tracked: true
      });

      console.log('✅ Successfully created app:', newApp);
      setApps(prevApps => [...prevApps, newApp]);
      setShowDropdown(false);
      setError(null);
    } catch (error) {
      console.error('❌ Failed to add app - detailed error:', {
        error: error,
        errorMessage: error instanceof Error ? error.message : String(error),
        detectedApp: detectedApp,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Comprehensive RLS error analysis
      if (errorMessage.includes('42501') || errorMessage.includes('row-level security')) {
        const rlsError = 'RLS Policy Error: User lacks permission to insert into applications table. This usually means: 1) User does not exist in database, 2) RLS policies are too restrictive, 3) User ID mismatch.';
        setRlsErrors(prev => [...prev, rlsError]);
        setError(`RLS Error: ${rlsError}`);
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        const authError = 'Authentication Error: Invalid Supabase credentials. Check your .env file for correct SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY).';
        setRlsErrors(prev => [...prev, authError]);
        setError(`Auth Error: ${authError}`);
      } else if (errorMessage.includes('database') || errorMessage.includes('connection')) {
        const dbError = 'Database Connection Error: Unable to connect to Supabase. Check your internet connection and Supabase URL.';
        setRlsErrors(prev => [...prev, dbError]);
        setError(`Database Error: ${dbError}`);
      } else if (errorMessage.includes('validation') || errorMessage.includes('constraint')) {
        const validationError = 'Validation Error: Invalid data format or constraint violation.';
        setRlsErrors(prev => [...prev, validationError]);
        setError(`Validation Error: ${validationError}`);
      } else {
        setError(`Failed to add application: ${errorMessage}`);
      }
    }
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

  const getEnabledCount = () => apps.filter(app => app.is_tracked ?? false).length;
  const getTotalCount = () => apps.length;

  const AppCard = ({ app }: { app: App }) => (
    <div className={`app-card ${!(app.is_tracked ?? false) ? 'disabled' : ''} ${isEditMode ? 'edit-mode' : ''}`}>
      {isEditMode && (
        <button 
          className="delete-button"
          onClick={() => handleDeleteApp(app.id)}
          title="Remove app"
        >
          −
        </button>
      )}
      <div className="app-header">
        <div className="app-info">
          <h4 className="app-name">{app.name}</h4>
          <p className="app-directory">{app.process_name}</p>
        </div>
        <div className="app-actions">
          {!isEditMode && (
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={app.is_tracked ?? false}
                onChange={() => handleToggleApp(app.id)}
              />
              <span className="toggle-slider"></span>
            </label>
          )}
        </div>
      </div>
      
      <div className="app-details">
        <div className="app-meta">
          {app.last_used && (
            <span className="last-used">Last used: {app.last_used}</span>
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
              {/* Connection Status Indicator */}
              <div className={`connection-status ${connectionStatus}`}>
                <span className="status-indicator">
                  {connectionStatus === 'checking' && '🔄'}
                  {connectionStatus === 'connected' && '✅'}
                  {connectionStatus === 'disconnected' && '❌'}
                  {connectionStatus === 'error' && '🚨'}
                </span>
                <span className="status-text">
                  {connectionStatus === 'checking' && 'Checking...'}
                  {connectionStatus === 'connected' && 'Connected'}
                  {connectionStatus === 'disconnected' && 'Disconnected'}
                  {connectionStatus === 'error' && 'Error'}
                </span>
              </div>

              {/* Debug Button */}
              <button 
                className="debug-button"
                onClick={collectDebugInfo}
                title="Collect debug information"
              >
                🐛 Debug
              </button>

              {/* Test Connection Button */}
              <button 
                className="test-connection-button"
                onClick={testDatabaseConnection}
                title="Test database connection"
              >
                🔗 Test DB
              </button>

              <button 
                className="edit-button"
                onClick={() => setIsEditMode(!isEditMode)}
              >
                {isEditMode ? 'Done' : 'Edit'}
              </button>
              {!isEditMode && (
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
              )}
            </div>
          </div>
          
          <div className="content-area">
            {/* Error Display */}
            {error && (
              <div className="error-message">
                <span>⚠️ {error}</span>
                <button onClick={() => setError(null)}>×</button>
              </div>
            )}

            {/* RLS Errors Display */}
            {rlsErrors.length > 0 && (
              <div className="rls-errors">
                <h4>🚨 Row Level Security Errors Detected:</h4>
                <ul>
                  {rlsErrors.map((rlsError, index) => (
                    <li key={index}>{rlsError}</li>
                  ))}
                </ul>
                <button 
                  className="clear-rls-errors"
                  onClick={() => setRlsErrors([])}
                >
                  Clear RLS Errors
                </button>
              </div>
            )}

            {/* Debug Info Display */}
            {debugInfo && (
              <div className="debug-info">
                <h4>🐛 Debug Information:</h4>
                <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
                <button 
                  className="clear-debug-info"
                  onClick={() => setDebugInfo(null)}
                >
                  Clear Debug Info
                </button>
              </div>
            )}

            {/* Loading State */}
            {isLoadingApps ? (
              <div className="loading-state">
                <div className="loading-spinner">⏳</div>
                <p>Loading applications...</p>
              </div>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterAppsPage;
