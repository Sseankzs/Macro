import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './LogsPage.css';
import Sidebar from './Sidebar';
import { formatTimestamp } from './utils';

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
  onPageChange: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'detected' | 'logs') => void;
}

function LogsPage({ onLogout, onPageChange }: LogsPageProps) {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [applications, setApplications] = useState<Map<string, Application>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Filtering state
  const [timeFilter, setTimeFilter] = useState<'all' | 'day' | 'week' | 'month'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTimeEntries();
    fetchApplications();
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
      const apps = await invoke<Application[]>('get_my_applications');
      const appMap = new Map<string, Application>();
      apps.forEach(app => appMap.set(app.id, app));
      setApplications(appMap);
    } catch (error) {
      console.error('Failed to fetch applications:', error);
    }
  };

  const getAppName = (appId?: string) => {
    if (!appId) return 'Unknown App';
    return applications.get(appId)?.name || 'Unknown App';
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
          </span>
        </div>

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
                    <td className="time-cell">
                      {formatTimestamp(entry.start_time, 'datetime')}
                    </td>
                    <td className="time-cell">
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
              Page {currentPage} of {totalPages}
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default LogsPage;
