import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './LogsPage.css';
import Sidebar from './Sidebar';
import { formatTimestamp } from './utils';
import { BYPASS_DB_APPS } from './config';
import PageSourceBadge from './components/PageSourceBadge';

interface TimeEntry {
  id: string;
  user_id: string;
  app_id?: string;
  task_id?: string;
  start_time: string; // ISO string from chrono::DateTime<chrono::Utc>
  end_time?: string; // ISO string from chrono::DateTime<chrono::Utc>
  duration_seconds?: number;
  is_active: boolean;
  created_at: string; // ISO string from chrono::DateTime<chrono::Utc>
  updated_at: string; // ISO string from chrono::DateTime<chrono::Utc>
}

interface Application {
  id: string;
  name: string;
  process_name: string;
  category?: string;
}

interface LogsPageProps {
  onLogout: () => void;
  onPageChange: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant' | 'debug') => void;
}

function LogsPage({ onLogout, onPageChange }: LogsPageProps) {
  // Controlled via env flag in src/config.ts
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [applications, setApplications] = useState<Map<string, Application>>(new Map());
  const [missingApps, setMissingApps] = useState<Map<string, string>>(new Map()); // app_id -> temporary name
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Filtering state
  const [timeFilter, setTimeFilter] = useState<'all' | 'day' | 'week' | 'month'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // OS detection for debugging
  const [detectedOS, setDetectedOS] = useState<string>('Unknown');

  useEffect(() => {
    // Fetch applications first, then time entries, so the lookup map is ready
    const loadData = async () => {
      await fetchApplications();
      await fetchTimeEntries();
      await fetchDetectedOS();
    };
    loadData();
  }, [timeFilter]);

  const fetchTimeEntries = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Calculate date range based on filter
      const now = new Date();
      let startDate: Date | null = null;
      
      switch (timeFilter) {
        case 'day':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'all':
        default:
          startDate = null;
          break;
      }

      const entries = await invoke<TimeEntry[]>('get_my_time_entries', {
        limit: 1000 // Get more entries for filtering
      });

      // Debug: log app_ids from time entries
      console.log('📋 LogsPage: Fetched time entries:', entries.length);
      const entriesWithAppIds = entries.filter(e => e.app_id);
      const entriesWithoutAppIds = entries.filter(e => !e.app_id);
      console.log('📋 LogsPage: Entries with app_id:', entriesWithAppIds.length);
      console.log('📋 LogsPage: Entries without app_id:', entriesWithoutAppIds.length);
      
      // Then fetch missing apps if needed
      if (entriesWithAppIds.length > 0) {
        const uniqueAppIds = [...new Set(entriesWithAppIds.map(e => e.app_id).filter((id): id is string => !!id))];
        console.log('📋 LogsPage: Unique app_ids in entries:', uniqueAppIds);
        
        // Fetch any missing apps by their IDs (will use current applications state)
        fetchMissingApps(uniqueAppIds);
      }

      // Filter by date if needed
      let filteredEntries = entries;
      if (startDate) {
        filteredEntries = entries.filter(entry => {
          const entryDate = new Date(entry.start_time);
          return entryDate >= startDate!;
        });
      }

      // Sort by start time (newest first)
      filteredEntries.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
      
      setTimeEntries(filteredEntries);
    } catch (error) {
      console.error('Failed to fetch time entries:', error);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchApplications = async () => {
    try {
      if (BYPASS_DB_APPS) {
        // Use detected processes as the applications list (temporary bypass)
        type DetectedProcess = { name: string; process_name: string };
        const detected = await invoke<DetectedProcess[]>('get_running_processes');
        const mapped: Application[] = detected.map((p, idx) => ({
          id: `detected-${idx}`,
          name: p.name || p.process_name,
          process_name: p.process_name,
          category: undefined,
        }));
        const appMap = new Map<string, Application>();
        mapped.forEach(app => appMap.set(app.id, app));
        console.log('📱 LogsPage: Loaded applications (bypass mode):', Array.from(appMap.entries()));
        setApplications(appMap);
      } else {
        // Original DB-backed fetch (restored when bypass is disabled)
        const apps = await invoke<Application[]>('get_my_applications');
        const appMap = new Map<string, Application>();
        apps.forEach(app => appMap.set(app.id, app));
        console.log('📱 LogsPage: Loaded applications from DB:', apps.length, 'apps');
        console.log('📱 LogsPage: Application IDs:', apps.map(a => ({ id: a.id, name: a.name, process_name: a.process_name })));
        setApplications(appMap);
      }
    } catch (error) {
      console.error('Failed to fetch applications:', error);
    }
  };

  const fetchDetectedOS = async () => {
    try {
      const os = await invoke<string>('get_detected_os');
      setDetectedOS(os);
    } catch (error) {
      console.error('Failed to fetch detected OS:', error);
    }
  };

  // Fetch applications that are referenced in time entries but not in our applications map
  const fetchMissingApps = async (appIds: string[]) => {
    try {
      // Use the current applications state
      setApplications(currentApps => {
        const existingIds = Array.from(currentApps.keys());
        
        // Find apps we need to fetch
        const missingIds = appIds.filter(id => !existingIds.includes(id));
        
        if (missingIds.length === 0) {
          return currentApps; // All apps are already loaded
        }

        console.log('📱 LogsPage: Fetching missing apps:', missingIds);

        // Fetch all apps to find the missing ones
        invoke<Application[]>('get_my_applications').then(allApps => {
          const allAppsMap = new Map<string, Application>();
          allApps.forEach(app => allAppsMap.set(app.id, app));

          // Update applications map with any newly found apps
          setApplications(prevApps => {
            const updatedMap = new Map(prevApps);
            missingIds.forEach(appId => {
              const app = allAppsMap.get(appId);
              if (app) {
                updatedMap.set(app.id, app);
                console.log('✅ LogsPage: Found missing app:', app.name);
              } else {
                // App doesn't exist (probably deleted) - mark as deleted
                // We'll show "Deleted App" instead of the ID
                setMissingApps(prev => new Map(prev).set(appId, 'deleted'));
                console.log('⚠️ LogsPage: App not found for ID:', appId, '- marking as deleted');
              }
            });
            return updatedMap;
          });
        }).catch(error => {
          console.error('Failed to fetch missing apps:', error);
        });

        return currentApps; // Return unchanged for now, will update async
      });
    } catch (error) {
      console.error('Failed to fetch missing apps:', error);
    }
  };

  const getAppName = (appId?: string) => {
    if (!appId) {
      return 'Unknown App';
    }
    
    // First check if we have the app in our applications map
    const app = applications.get(appId);
    if (app) {
      return app.name;
    }
    
    // Check if we have a temporary name for a deleted/missing app
    const tempName = missingApps.get(appId);
    if (tempName) {
      // If it's marked as deleted, show "Deleted App"
      if (tempName === 'deleted') {
        return 'Deleted App';
      }
      // Otherwise use the stored name
      return tempName;
    }
    
    // If we have the app_id but haven't loaded it yet
    if (applications.size > 0) {
      // Apps are loaded, so this one is missing/deleted
      // Show "Deleted App" instead of the ID
      return 'Deleted App';
    }
    
    // No apps loaded yet, show loading state
    return 'Loading...';
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  };

  const filteredEntries = timeEntries.filter(entry => {
    if (!searchTerm) return true;
    
    const appName = getAppName(entry.app_id).toLowerCase();
    return appName.includes(searchTerm.toLowerCase());
  });

  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentEntries = filteredEntries.slice(startIndex, endIndex);

  // Debug logging
  console.log('Logs Debug:', {
    totalEntries: timeEntries.length,
    filteredEntries: filteredEntries.length,
    currentPage,
    itemsPerPage,
    totalPages,
    startIndex,
    endIndex,
    currentEntriesCount: currentEntries.length
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (items: number) => {
    setItemsPerPage(items);
    setCurrentPage(1); // Reset to first page
  };

  const handleTimeFilterChange = (filter: 'all' | 'day' | 'week' | 'month') => {
    setTimeFilter(filter);
    setCurrentPage(1); // Reset to first page
  };

  return (
    <div className="dashboard-container">
      <PageSourceBadge source="src/LogsPage.tsx" />
      <Sidebar currentPage="logs" onLogout={onLogout} onPageChange={onPageChange} />
      
      <div className="main-content">
        <div className="logs-container">
          <div className="logs-header">
            <h1>Time Logs</h1>
            <div className="header-actions">
              <button className="btn-secondary" onClick={() => fetchTimeEntries()}>
                Refresh
              </button>
            </div>
            {/* OS Detection Debug Indicator */}
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: '#f0f0f0',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#666',
              border: '1px solid #ddd'
            }}>
              🖥️ OS: {detectedOS}
            </div>
          </div>
          
          <div className="logs-content">

        {/* Controls */}
        <div className="logs-controls">
          <div className="filter-controls">
            <div className="filter-group">
              <label>Time Period:</label>
              <select 
                value={timeFilter} 
                onChange={(e) => handleTimeFilterChange(e.target.value as any)}
                className="filter-select"
              >
                <option value="all">All Time</option>
                <option value="day">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Items per page:</label>
              <select 
                value={itemsPerPage} 
                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                className="filter-select"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="search-controls">
            <input
              type="text"
              placeholder="Search by app name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        {/* Results Summary */}
        <div className="results-summary">
          <span>
            Showing {startIndex + 1}-{Math.min(endIndex, filteredEntries.length)} of {filteredEntries.length} entries
            {filteredEntries.length !== timeEntries.length && (
              <span> (filtered from {timeEntries.length} total)</span>
            )}
          </span>
        </div>

        {/* Table and Pagination */}
        <div className="table-and-pagination">
          {/* Table */}
          <div className="logs-table-container">
            {isLoading ? (
              <div className="loading">Loading time entries...</div>
            ) : error ? (
              <div className="error">Error: {error}</div>
            ) : (
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Application</th>
                    <th>Start Time</th>
                    <th>End Time</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentEntries.map((entry) => (
                    <tr key={entry.id} className={entry.is_active ? 'active-entry' : ''}>
                      <td className="app-cell">
                        <div className="app-info">
                          <span className="app-name">{getAppName(entry.app_id)}</span>
                          {entry.app_id && applications.get(entry.app_id)?.category && (
                            <span className="app-category">
                              {applications.get(entry.app_id)?.category}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="start-time-cell">
                        {formatTimestamp(entry.start_time, 'datetime')}
                      </td>
                      <td className="end-time-cell">
                        {entry.end_time ? formatTimestamp(entry.end_time, 'datetime') : 'Active'}
                      </td>
                      <td className="duration-cell">
                        {formatDuration(entry.duration_seconds)}
                      </td>
                      <td className="status-cell">
                        <span className={`status-badge ${entry.is_active ? 'active' : 'completed'}`}>
                          {entry.is_active ? 'Active' : 'Completed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button 
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="pagination-btn"
              >
                Previous
              </button>
              
              <div className="pagination-info">
                Page {currentPage} of {totalPages} ({filteredEntries.length} total entries)
              </div>
              
              <button 
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                Next
              </button>
            </div>
          )}
          
          {/* Show message if no entries */}
          {!isLoading && !error && filteredEntries.length === 0 && (
            <div className="no-entries">
              <p>No time entries found for the selected criteria.</p>
              <p>Try adjusting your filters or check if you have any tracked applications.</p>
            </div>
          )}
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LogsPage;
