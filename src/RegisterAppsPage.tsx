import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './RegisterAppsPage.css';
import Sidebar from './Sidebar';
import { invoke } from '@tauri-apps/api/core';
import { formatForTable } from './utils';
import { useDashboardCache } from './contexts/DashboardCacheContext';

interface App {
  id: string;
  name: string;
  process_name: string;
  icon_path?: string;
  category?: string;
  is_tracked?: boolean;
  user_id: string; // Required field to match database schema
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
  onPageChange?: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant') => void;
}

function RegisterAppsPage({ onLogout, onPageChange }: RegisterAppsPageProps) {
  const [apps, setApps] = useState<App[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [rlsErrors, setRlsErrors] = useState<string[]>([]);

  const [showDropdown, setShowDropdown] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [detectedApps, setDetectedApps] = useState<DetectedApp[]>([]);
  const [isLoadingDetectedApps, setIsLoadingDetectedApps] = useState(false);

  // Dashboard cache context for updating applications data
  const { updateCache } = useDashboardCache();



  // Load apps on component mount - ensure default user exists first
  useEffect(() => {
    const initializePage = async () => {
      console.log('🚀 Initializing RegisterAppsPage...');
      
      try {
        // Load apps
        await fetchApps();
      } catch (error) {
        console.error('❌ Failed to initialize page:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        setError(`Failed to initialize: ${errorMessage}`);
      }
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

  // Handle category update
  const handleCategoryUpdate = async (appId: string, newCategory: string) => {
    try {
      console.log('🏷️ Updating category for app:', appId, 'to:', newCategory);
      
      const app = apps.find(a => a.id === appId);
      if (!app) {
        console.error('❌ App not found:', appId);
        setError('App not found');
        return;
      }

      // Call backend to update category using the existing update function
      await invoke('update_my_application', {
        appId: appId,
        name: null,
        processName: null,
        iconPath: null,
        category: newCategory,
        isTracked: null
      });

      console.log('✅ App category updated successfully');

      // Update local state
      const updatedApps = apps.map(app =>
        app.id === appId ? { ...app, category: newCategory } : app
      );
      setApps(updatedApps);
      
      // Update dashboard cache so the top applications table reflects the new category
      // Map to Application interface (ensure is_tracked is boolean)
      const applicationsForCache = updatedApps.map(app => ({
        ...app,
        is_tracked: app.is_tracked ?? false
      }));
      
      updateCache({
        applications: applicationsForCache,
        dataCacheTimestamp: Date.now()
      });
      
      setError(null);
    } catch (error) {
      console.error('❌ Failed to update app category:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`Failed to update application category: ${errorMessage}`);
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

  // Smart category detection based on app name
  const getSmartCategory = (appName: string): string => {
    const name = appName.toLowerCase();
    
    if (name.includes('code') || name.includes('visual studio') || name.includes('dev') || 
        name.includes('terminal') || name.includes('powershell') || name.includes('cmd') ||
        name.includes('git') || name.includes('sublime') || name.includes('atom') ||
        name.includes('vim') || name.includes('emacs') || name.includes('intellij') ||
        name.includes('eclipse') || name.includes('android studio')) {
      return 'Development';
    }
    
    if (name.includes('chrome') || name.includes('firefox') || name.includes('edge') || 
        name.includes('safari') || name.includes('browser') || name.includes('opera')) {
      return 'Browser';
    }
    
    if (name.includes('slack') || name.includes('discord') || name.includes('teams') || 
        name.includes('zoom') || name.includes('skype') || name.includes('telegram') ||
        name.includes('whatsapp') || name.includes('messenger')) {
      return 'Communication';
    }
    
    if (name.includes('figma') || name.includes('photoshop') || name.includes('illustrator') || 
        name.includes('sketch') || name.includes('canva') || name.includes('paint') ||
        name.includes('gimp') || name.includes('inkscape')) {
      return 'Design';
    }
    
    if (name.includes('spotify') || name.includes('music') || name.includes('youtube') || 
        name.includes('netflix') || name.includes('video') || name.includes('player') ||
        name.includes('game') || name.includes('steam')) {
      return 'Entertainment';
    }
    
    if (name.includes('word') || name.includes('excel') || name.includes('powerpoint') || 
        name.includes('office') || name.includes('notepad') || name.includes('calculator') ||
        name.includes('calendar') || name.includes('mail') || name.includes('outlook')) {
      return 'Productivity';
    }
    
    if (name.includes('explorer') || name.includes('finder') || name.includes('files') ||
        name.includes('archive') || name.includes('zip') || name.includes('extract')) {
      return 'Utilities';
    }
    
    return 'Other';
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

      // Trim whitespace and validate
      const trimmedName = detectedApp.name.trim();
      const trimmedProcessName = detectedApp.process_name.trim();
      
      if (trimmedName.length === 0) {
        setError('Application name cannot be empty.');
        return;
      }
      
      if (trimmedProcessName.length === 0) {
        setError('Process name cannot be empty.');
        return;
      }

      console.log('📝 Creating app with parameters:', {
        name: trimmedName,
        processName: trimmedProcessName,
        iconPath: null,
        category: getSmartCategory(trimmedName),
        isTracked: true
      });

      const newApp = await invoke<App>('create_my_application', {
        name: trimmedName,
        processName: trimmedProcessName,
        iconPath: null,
        category: getSmartCategory(trimmedName),
        isTracked: true
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

  // Get unique categories from existing apps
  const getExistingCategories = (): string[] => {
    const categories = apps
      .map(app => app.category)
      .filter((category): category is string => category !== undefined && category !== null && category.trim() !== '');
    
    const uniqueCategories = Array.from(new Set(categories));
    
    // Add some default categories if none exist
    const defaultCategories = ['Development', 'Browser', 'Communication', 'Design', 'Entertainment', 'Productivity', 'Utilities'];
    
    return Array.from(new Set([...uniqueCategories, ...defaultCategories])).sort();
  };

  // Category selector component
  const CategorySelector = ({ 
    currentCategory, 
    onCategoryChange, 
    disabled = false 
  }: { 
    currentCategory?: string; 
    onCategoryChange: (category: string) => void; 
    disabled?: boolean;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [customCategory, setCustomCategory] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const existingCategories = getExistingCategories();
    const selectorRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        const isInsideSelector = selectorRef.current && selectorRef.current.contains(target);
        const isInsideDropdown = dropdownRef.current && dropdownRef.current.contains(target);
        
        if (!isInsideSelector && !isInsideDropdown) {
          setIsOpen(false);
          setShowCustomInput(false);
          setCustomCategory('');
        }
      };

      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [isOpen]);

    const handleButtonClick = () => {
      if (!isOpen && selectorRef.current) {
        const rect = selectorRef.current.getBoundingClientRect();
        setButtonRect(rect);
      }
      setIsOpen(!isOpen);
    };

    const handleCategorySelect = (category: string) => {
      console.log('🎯 CategorySelector: handleCategorySelect called with:', category);
      if (category === 'custom') {
        console.log('🎯 CategorySelector: Opening custom input');
        setShowCustomInput(true);
        setCustomCategory('');
      } else {
        console.log('🎯 CategorySelector: Calling onCategoryChange with:', category);
        onCategoryChange(category);
        setIsOpen(false);
        setShowCustomInput(false);
      }
    };

    const handleCustomCategorySubmit = () => {
      if (customCategory.trim()) {
        onCategoryChange(customCategory.trim());
        setIsOpen(false);
        setShowCustomInput(false);
        setCustomCategory('');
      }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleCustomCategorySubmit();
      } else if (e.key === 'Escape') {
        setShowCustomInput(false);
        setIsOpen(false);
        setCustomCategory('');
      }
    };

    const dropdown = isOpen && !disabled && buttonRect ? (
      <div 
        ref={dropdownRef}
        className="category-dropdown"
        style={{
          position: 'fixed',
          top: buttonRect.bottom + window.scrollY,
          left: buttonRect.left + window.scrollX,
          width: buttonRect.width,
          minWidth: '150px',
          backgroundColor: 'white',
          border: '1px solid #ddd',
          borderRadius: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 999999,
          maxHeight: '200px',
          overflowY: 'auto'
        }}
      >
        {existingCategories.map(category => (
          <div
            key={category}
            className="category-option"
            onClick={() => handleCategorySelect(category)}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#333',
              backgroundColor: currentCategory === category ? '#e3f2fd' : 'white',
              borderBottom: '1px solid #f0f0f0'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = currentCategory === category ? '#e3f2fd' : '#f8f9fa';
              e.currentTarget.style.color = '#333';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = currentCategory === category ? '#e3f2fd' : 'white';
              e.currentTarget.style.color = '#333';
            }}
          >
            {category}
          </div>
        ))}
        <div
          className="category-option custom-option"
          onClick={() => handleCategorySelect('custom')}
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '12px',
            borderTop: '1px solid #eee',
            fontStyle: 'italic',
            color: '#666',
            backgroundColor: 'white'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f8f9fa';
            e.currentTarget.style.color = '#666';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
            e.currentTarget.style.color = '#666';
          }}
        >
          + Add new category
        </div>
        
        {showCustomInput && (
          <div style={{ padding: '8px', borderTop: '1px solid #eee', backgroundColor: 'white' }}>
            <input
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Enter new category"
              autoFocus
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: '12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                color: '#333',
                backgroundColor: 'white'
              }}
            />
            <div style={{ marginTop: '4px', display: 'flex', gap: '4px' }}>
              <button
                onClick={handleCustomCategorySubmit}
                style={{
                  padding: '2px 6px',
                  fontSize: '11px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '2px',
                  cursor: 'pointer'
                }}
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomCategory('');
                }}
                style={{
                  padding: '2px 6px',
                  fontSize: '11px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '2px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    ) : null;

    return (
      <div className="category-selector" style={{ position: 'relative' }} ref={selectorRef}>
        <button
          className="category-button"
          onClick={handleButtonClick}
          disabled={disabled}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            backgroundColor: isOpen ? '#f0f0f0' : 'white',
            color: '#333',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            minWidth: '100px',
            textAlign: 'left'
          }}
        >
          {currentCategory || 'Select category'} ▼
        </button>
        
        {dropdown && createPortal(dropdown, document.body)}
      </div>
    );
  };

  const AppCard = ({ app }: { app: App }) => (
    <div className={`app-card ${!(app.is_tracked ?? false) && !isEditMode ? 'disabled' : ''} ${isEditMode ? 'edit-mode' : ''}`}>
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
          {isEditMode && (
            <div className="app-category-edit" style={{ marginTop: '8px' }}>
              <label style={{ fontSize: '12px', color: '#666', marginRight: '8px' }}>
                Category:
              </label>
              <CategorySelector
                currentCategory={app.category}
                onCategoryChange={(category) => handleCategoryUpdate(app.id, category)}
                disabled={false}
              />
            </div>
          )}
          {!isEditMode && app.category && (
            <span className="app-category" style={{ 
              fontSize: '11px', 
              color: '#666', 
              backgroundColor: '#f0f0f0', 
              padding: '2px 6px', 
              borderRadius: '3px',
              marginTop: '4px',
              display: 'inline-block'
            }}>
              {app.category}
            </span>
          )}
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
            <span className="last-used">Last used: {formatForTable(app.last_used)}</span>
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
