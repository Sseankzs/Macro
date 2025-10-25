import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Dashboard.css';
import Sidebar from './Sidebar';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsivePie } from '@nivo/pie';
import { useDashboardCache } from './contexts/DashboardCacheContext';
import { DashboardSkeletonGrid } from './components/LoadingComponents';
import MonthlyCalendar from './MonthlyCalendar';

// Check if we're running in Tauri environment
const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
}

interface CurrentActivity {
  app_name: string;
  app_category: string;
  start_time: string;
  duration_minutes: number;
  duration_hours: number;
  is_active: boolean;
  active_apps_count: number;
}

interface TimeEntry {
  id: string;
  user_id: string;
  app_id?: string;
  task_id?: string;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Application {
  id: string;
  name: string;
  process_name: string;
  icon_path?: string;
  category?: string;
  is_tracked: boolean;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  last_used?: string;
}

interface AppTimeData {
  application: string;
  time: string;
  hours: number;
  category?: string;
}


interface DashboardProps {
  onLogout: () => void;
  onPageChange: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant') => void;
}

function Dashboard({ onLogout, onPageChange }: DashboardProps) {
  const { cache, updateCache } = useDashboardCache();
  
  const [user, setUser] = useState<{ name: string } | null>(null);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<'today' | 'week' | 'month'>('week');
  const [currentActivity, setCurrentActivity] = useState<CurrentActivity | null>(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [hoursTrackedToday, setHoursTrackedToday] = useState<number>(0);
  const [hoursTrackedYesterday, setHoursTrackedYesterday] = useState<number>(0);
  const [hoursTrackedThisWeek, setHoursTrackedThisWeek] = useState<number>(0);
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationTimeData, setApplicationTimeData] = useState<AppTimeData[]>([]);
  const [mostUsedApp, setMostUsedApp] = useState<AppTimeData | null>(null);
  
  // Main dashboard loading state
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Time filter hotkeys - only work when on dashboard
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only trigger when not holding Ctrl/Cmd (to avoid conflicts with navigation shortcuts)
      if (event.ctrlKey || event.metaKey) return;
      
      // Only trigger for number keys 1, 2, 3
      switch (event.key) {
        case '1':
          event.preventDefault();
          handleTimePeriodChange('today');
          break;
        case '2':
          event.preventDefault();
          handleTimePeriodChange('week');
          break;
        case '3':
          event.preventDefault();
          handleTimePeriodChange('month');
          break;
        default:
          return;
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedTimePeriod]);


  // Function to find the most used app for the past week
  const findMostUsedApp = (timeEntries: TimeEntry[], apps: Application[]): AppTimeData | null => {
    console.log('🏆 Finding most used app for past week...');
    
    // Create a map of app_id to app name
    const appMap = new Map<string, Application>();
    apps.forEach(app => {
      appMap.set(app.id, app);
    });
    
    // Filter entries for the past week
    const now = new Date();
    const weekStart = new Date(now);
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday is 0, Monday is 1
    weekStart.setDate(now.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEntries = timeEntries.filter(entry => {
      const entryDate = new Date(entry.start_time);
      return entryDate >= weekStart && entry.app_id;
    });
    
    console.log('🏆 Week entries for most used app:', weekEntries.length);
    
    // Aggregate time by app_id
    const appTimeMap = new Map<string, number>();
    
    weekEntries.forEach(entry => {
      if (entry.app_id) {
        const startTime = new Date(entry.start_time);
        const endTime = entry.end_time ? new Date(entry.end_time) : new Date();
        
        // Calculate duration in hours
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);
        
        const currentTime = appTimeMap.get(entry.app_id) || 0;
        appTimeMap.set(entry.app_id, currentTime + durationHours);
      }
    });
    
    // Find the app with the most time
    let mostUsedAppData: AppTimeData | null = null;
    let maxHours = 0;
    
    for (const [appId, hours] of appTimeMap.entries()) {
      if (hours > maxHours) {
        const app = appMap.get(appId);
        if (app) {
          mostUsedAppData = {
            application: app.name,
            time: formatTimeWithFullWords(hours),
            hours: hours,
            category: app.category
          };
          maxHours = hours;
        }
      }
    }
    
    console.log('🏆 Most used app found:', mostUsedAppData);
    return mostUsedAppData;
  };



  // Function to aggregate time entries by application
  const aggregateTimeByApplication = (timeEntries: TimeEntry[], apps: Application[], timePeriod: 'today' | 'week' | 'month'): AppTimeData[] => {
    console.log('📊 Aggregating time by application for period:', timePeriod);
    console.log('📊 Input data:', { 
      timeEntriesCount: timeEntries.length, 
      appsCount: apps.length,
      timePeriod,
      firstTimeEntry: timeEntries[0],
      firstApp: apps[0]
    });
    
    if (!timeEntries || timeEntries.length === 0) {
      console.log('📊 No time entries available');
      return [];
    }
    
    if (!apps || apps.length === 0) {
      console.log('📊 No applications available');
      return [];
    }
    
    // Create a map of app_id to app name
    const appMap = new Map<string, Application>();
    apps.forEach(app => {
      appMap.set(app.id, app);
      console.log('📊 Mapped app:', app.id, '->', app.name);
    });
    
    // Filter entries based on time period
    const now = new Date();
    let startDate: Date;
    
    switch (timePeriod) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date(now);
        const dayOfWeek = now.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate.setDate(now.getDate() - daysToMonday);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }
    
    console.log('📊 Filtering entries from:', startDate.toISOString());
    
    const filteredEntries = timeEntries.filter(entry => {
      const entryDate = new Date(entry.start_time);
      const isValid = entryDate >= startDate && entry.app_id;
      if (isValid) {
        console.log('📊 Valid entry:', entry.app_id, entry.start_time, entry.end_time);
      }
      return isValid;
    });
    
    console.log('📊 Filtered entries for period:', filteredEntries.length);
    
    // Aggregate time by app_id
    const appTimeMap = new Map<string, number>();
    
    filteredEntries.forEach(entry => {
      if (entry.app_id) {
        const startTime = new Date(entry.start_time);
        let endTime: Date;
        
        // Handle different end time scenarios
        if (entry.end_time) {
          endTime = new Date(entry.end_time);
        } else if (entry.duration_seconds) {
          // Use duration_seconds if available and no end_time
          endTime = new Date(startTime.getTime() + (entry.duration_seconds * 1000));
        } else {
          // For active entries without end_time, use current time
          endTime = new Date();
        }
        
        // Calculate duration in hours, ensuring it's positive
        const durationMs = Math.max(0, endTime.getTime() - startTime.getTime());
        const durationHours = durationMs / (1000 * 60 * 60);
        
        // Skip entries with zero or negative duration
        if (durationHours <= 0) {
          console.warn('⚠️ Skipping entry with zero/negative duration:', entry.id);
          return;
        }
        
        const currentTime = appTimeMap.get(entry.app_id) || 0;
        appTimeMap.set(entry.app_id, currentTime + durationHours);
        
        console.log('📊 Added time for app:', entry.app_id, 'duration:', durationHours, 'total:', currentTime + durationHours);
      }
    });
    
    console.log('📊 App time map:', Array.from(appTimeMap.entries()));
    
    // Convert to array and sort by time
    const result: AppTimeData[] = [];
    
    for (const [appId, hours] of appTimeMap.entries()) {
      const app = appMap.get(appId);
      if (!app) {
        console.warn('⚠️ App not found for ID:', appId);
        continue;
      }
      
      // Only include apps with meaningful time (at least 1 minute)
      if (hours >= 1/60) {
        result.push({
          application: app.name,
          time: formatTimeWithFullWords(hours),
          hours: hours,
          category: app.category
        });
      }
    }
    
    result.sort((a, b) => b.hours - a.hours);
    const topApps = result.slice(0, 6); // Top 6 applications
    
    console.log('📊 Final aggregated app time data:', topApps);
    return topApps;
  };

  // Data for Nivo Bar Chart (Daily Time Distribution)
  const dailyTimeData = [
    { day: 'Mon', development: 4.2, communication: 2.1, research: 0, design: 0, meetings: 0 },
    { day: 'Tue', development: 5.3, communication: 0, research: 3.2, design: 0, meetings: 0 },
    { day: 'Wed', development: 3.1, communication: 1.6, research: 0, design: 0, meetings: 0 },
    { day: 'Thu', development: 4.8, communication: 0, research: 0, design: 2.7, meetings: 0 },
    { day: 'Fri', development: 6.4, communication: 0, research: 0, design: 0, meetings: 3.2 },
    { day: 'Sat', development: 3.7, communication: 2.1, research: 0, design: 0, meetings: 0 },
    { day: 'Sun', development: 5.3, communication: 0, research: 2.7, design: 0, meetings: 0 }
  ];

  // Data for Nivo Pie Chart (App Category Breakdown)
  const categoryData = [
    { id: 'Coding', label: 'Coding', value: 45 },
    { id: 'Communication', label: 'Communication', value: 25 },
    { id: 'Research', label: 'Research', value: 20 },
    { id: 'Other', label: 'Other', value: 10 }
  ];

  // Colors for the charts
  const colors = ['#5DADE2', '#48C9B0', '#52BE80', '#F4D03F', '#EB984E'];

  // Helper function to format time with full words
  const formatTimeWithFullWords = (hours: number): string => {
    if (hours >= 1) {
      const wholeHours = Math.floor(hours);
      const minutes = Math.round((hours % 1) * 60);
      if (minutes > 0) {
        return `${wholeHours} ${wholeHours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
      } else {
        return `${wholeHours} ${wholeHours === 1 ? 'hour' : 'hours'}`;
      }
    } else {
      const minutes = Math.round(hours * 60);
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }
  };

  // Helper function to format time with short units
  const formatTimeWithShortUnits = (hours: number): string => {
    if (hours >= 1) {
      const wholeHours = Math.floor(hours);
      const minutes = Math.round((hours % 1) * 60);
      if (minutes > 0) {
        return `${wholeHours}hr ${minutes}min`;
      } else {
        return `${wholeHours}hr`;
      }
    } else {
      const minutes = Math.round(hours * 60);
      return `${minutes}min`;
    }
  };

  // Helper function to format duration with full words
  const formatDurationWithFullWords = (hours: number, minutes: number): string => {
    if (hours > 0) {
      if (minutes > 0) {
        return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
      } else {
        return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
      }
    } else {
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    }
  };

  // Function to calculate hours tracked for a specific date without double counting
  const calculateHoursForDate = (timeEntries: TimeEntry[], targetDate: Date): number => {
    // Filter entries for the target date
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const dayEntries = timeEntries.filter(entry => {
      const startTime = new Date(entry.start_time);
      return startTime >= dayStart && startTime <= dayEnd;
    });

    // Sort entries by start time
    dayEntries.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    // Calculate total time without double counting overlapping periods
    let totalSeconds = 0;
    const timePeriods: { start: Date; end: Date }[] = [];

    for (const entry of dayEntries) {
      const startTime = new Date(entry.start_time);
      const endTime = entry.end_time ? new Date(entry.end_time) : new Date(); // Use current time for active entries
      
      // Ensure the entry is within the day boundaries
      const entryStart = startTime < dayStart ? dayStart : startTime;
      const entryEnd = endTime > dayEnd ? dayEnd : endTime;

      if (entryStart < entryEnd) {
        timePeriods.push({ start: entryStart, end: entryEnd });
      }
    }

    // Merge overlapping periods to avoid double counting
    const mergedPeriods: { start: Date; end: Date }[] = [];
    
    for (const period of timePeriods) {
      if (mergedPeriods.length === 0) {
        mergedPeriods.push(period);
      } else {
        const lastPeriod = mergedPeriods[mergedPeriods.length - 1];
        
        // If periods overlap or are adjacent, merge them
        if (period.start <= lastPeriod.end) {
          lastPeriod.end = new Date(Math.max(lastPeriod.end.getTime(), period.end.getTime()));
        } else {
          mergedPeriods.push(period);
        }
      }
    }

    // Calculate total seconds from merged periods
    for (const period of mergedPeriods) {
      totalSeconds += (period.end.getTime() - period.start.getTime()) / 1000;
    }

    return totalSeconds / 3600; // Convert to hours
  };

  // Function to update current activity duration locally (fast)
  const updateCurrentActivityDuration = () => {
    if (!currentActivity) return;
    
    const now = new Date();
    const startTime = new Date(currentActivity.start_time);
    const durationMs = now.getTime() - startTime.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
    
    setCurrentActivity({
      ...currentActivity,
      duration_minutes: durationMinutes,
      duration_hours: durationHours
    });
  };

  // Function to fetch current activity with caching (optimized)
  const fetchCurrentActivity = async () => {
    try {
      if (isTauri()) {
        const activity = await invoke('get_current_activity') as CurrentActivity | null;
        
        if (activity) {
          setCurrentActivity(activity);
          // Cache the activity
          updateCache({
            currentActivity: activity,
            currentActivityTimestamp: Date.now()
          });
        } else {
          setCurrentActivity(null);
          updateCache({
            currentActivity: null,
            currentActivityTimestamp: Date.now()
          });
        }
      } else {
        // Browser mode - set mock activity for development
        const mockActivity: CurrentActivity = {
          app_name: 'Browser Development',
          app_category: 'Development',
          start_time: new Date().toISOString(),
          duration_minutes: 0,
          duration_hours: 0,
          is_active: true,
          active_apps_count: 1
        };
        setCurrentActivity(mockActivity);
        updateCache({
          currentActivity: mockActivity,
          currentActivityTimestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Failed to get current activity:', error);
    }
  };


  // Load all dashboard data from backend
  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (isTauri()) {
        // Load all data in parallel for faster loading
        const [userData, timeEntries, applications] = await Promise.all([
          invoke('get_current_user') as Promise<{ name: string }>,
          invoke('get_my_time_entries', { limit: 1000 }) as Promise<TimeEntry[]>,
          invoke('get_my_applications') as Promise<Application[]>
        ]);

        console.log('✅ Dashboard data loaded:', {
          user: userData,
          timeEntries: timeEntries.length,
          applications: applications.length
        });

        // Set user data
        setUser(userData);
        
        // Set applications data
        setApplications(applications);

        // Update global cache
        updateCache({
          applications: applications,
          timeEntries: timeEntries,
          dataCacheTimestamp: Date.now()
        });

        // Calculate hours data from loaded time entries
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const todayHours = calculateHoursForDate(timeEntries, today);
        const yesterdayHours = calculateHoursForDate(timeEntries, yesterday);

        // Calculate hours for this week (Monday to Sunday)
        const weekStart = new Date(today);
        const dayOfWeek = today.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        weekStart.setDate(today.getDate() - daysToMonday);
        weekStart.setHours(0, 0, 0, 0);

        let weekHours = 0;
        for (let i = 0; i < 7; i++) {
          const weekDay = new Date(weekStart);
          weekDay.setDate(weekStart.getDate() + i);
          weekHours += calculateHoursForDate(timeEntries, weekDay);
        }

        // Set hours data
        setHoursTrackedToday(todayHours);
        setHoursTrackedYesterday(yesterdayHours);
        setHoursTrackedThisWeek(weekHours);

        // Cache the calculated hours data
        updateCache({
          hoursData: {
            today: todayHours,
            yesterday: yesterdayHours,
            week: weekHours
          },
          hoursCacheTimestamp: Date.now()
        });

        // Calculate table data based on selected time period
        const aggregatedData = aggregateTimeByApplication(timeEntries, applications, selectedTimePeriod);
        console.log('🚀 Initial aggregation result:', aggregatedData);
        setApplicationTimeData(aggregatedData);

        // Calculate most used app for the past week
        const mostUsedAppData = findMostUsedApp(timeEntries, applications);
        setMostUsedApp(mostUsedAppData);

        // Update cache with calculated data
        updateCache({
          applicationTimeData: aggregatedData,
          mostUsedApp: mostUsedAppData
        });

        // Fetch current activity
        await fetchCurrentActivity();

        console.log('✅ Dashboard initialization complete');
      } else {
        // Browser mode - minimal setup for development
        console.log('Running in browser mode - using minimal setup');
        setUser({ name: 'Dev User' });
        
        // Browser mode - minimal setup, data will come from real backend
        setApplications([]);
        setApplicationTimeData([]);
        setMostUsedApp(null);
        setCurrentActivity(null);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Update current activity duration every second (local calculation)
    const durationInterval = setInterval(() => {
      updateCurrentActivityDuration();
    }, 1000);
    
    // Fetch current activity every 10 seconds
    const activityInterval = setInterval(() => {
      fetchCurrentActivity();
    }, 10000);

    return () => {
      clearInterval(durationInterval);
      clearInterval(activityInterval);
    };
  }, []);

  // Update application time data when time period changes
  useEffect(() => {
    console.log('🔄 useEffect triggered:', { 
      applicationsLength: applications.length, 
      timeEntriesLength: cache.timeEntries?.length || 0, 
      selectedTimePeriod,
      loading
    });
    
    // Only process if we're not loading and have real data available
    if (!loading && applications.length > 0 && cache.timeEntries && cache.timeEntries.length > 0) {
      console.log('🔄 Processing real table data...');
      const aggregatedData = aggregateTimeByApplication(cache.timeEntries, applications, selectedTimePeriod);
      console.log('📊 Aggregated data for', selectedTimePeriod, ':', aggregatedData);
      setApplicationTimeData(aggregatedData);
      
      // Update cache with the new aggregated data
      updateCache({
        applicationTimeData: aggregatedData
      });
    } else if (!loading) {
      // No real data available - show empty state
      console.log('� No real data available, setting empty array...');
      setApplicationTimeData([]);
    }
  }, [selectedTimePeriod, applications, cache.timeEntries, loading]);

  const handleTimePeriodChange = (period: 'today' | 'week' | 'month') => {
    console.log('🔄 Time period changing from', selectedTimePeriod, 'to', period);
    setSelectedTimePeriod(period);
  };

  return (
    <div className="dashboard-container">
      <Sidebar 
        currentPage="dashboard" 
        onLogout={onLogout} 
        onPageChange={onPageChange} 
      />
      
      <div className="main-content">
        {loading ? (
          <DashboardSkeletonGrid />
        ) : (
          <div className="dashboard-page-container">
            <div className="dashboard-header">
              <h1>Welcome, {user?.name || 'User'}!</h1>
            </div>
            
            {error && (
              <div className="error-message" style={{ 
                background: '#ffebee', 
                color: '#c62828', 
                padding: '12px 16px', 
                borderRadius: '8px', 
                margin: '16px 0' 
              }}>
                {error}
              </div>
            )}
            
            <div className="content-area">
            {/* Top Section - Quick Stats Cards */}
            <div className="stats-section">
              <h2 className="section-title">Today's Overview</h2>
              <div className="stats-grid">
                {/* Current Activity Card - Leftmost */}
                <div className="stat-card ios-card current-activity-card">
                  <div className="stat-header">
                    <h3>Current Activity</h3>
                    <span className="stat-period">
                      {currentActivity ? 'active' : 'idle'}
                    </span>
                  </div>
                  <div className="stat-main">
                    {currentActivity ? (
                      <div className="activity-info-simple">
                        <div className="app-icon">💻</div>
                        <div className="app-name">{currentActivity.app_name}</div>
                      </div>
                    ) : (
                      <div className="no-activity">
                        <span className="no-activity-text">No tracked apps running</span>
                        <span className="no-activity-subtitle">Enable tracking for apps in Register Apps</span>
                      </div>
                    )}
                  </div>
                  <div className="stat-subtitle">
                    {currentActivity ? (
                      <div className="activity-info-horizontal">
                        <div className="app-category">{currentActivity.app_category}</div>
                        <div className="app-time">
                          {formatDurationWithFullWords(currentActivity.duration_hours, currentActivity.duration_minutes % 60)}
                        </div>
                        <div className="apps-count">
                          {currentActivity.active_apps_count > 1 
                            ? `${currentActivity.active_apps_count} apps active`
                            : 'Active'
                          }
                        </div>
                      </div>
                    ) : (
                      'Enable app tracking'
                    )}
                  </div>
                </div>

                <div className="stat-card ios-card">
                  <div className="stat-header">
                    <h3>Tracked Today</h3>
                    <span className="stat-period">vs yesterday</span>
                  </div>
                  <div className="stat-main">
                    <>
                      <span className="stat-number stat-number-small">
                        {formatTimeWithShortUnits(hoursTrackedToday)}
                      </span>
                      <span className={`stat-change ${hoursTrackedToday >= hoursTrackedYesterday ? 'positive' : 'negative'}`}>
                        {hoursTrackedToday >= hoursTrackedYesterday ? '+' : ''}{(hoursTrackedToday - hoursTrackedYesterday).toFixed(1)} hours
                      </span>
                    </>
                  </div>
                  <div className="stat-subtitle">
                    This week: {hoursTrackedThisWeek.toFixed(1)} hours
                  </div>
                </div>
                
                <div className="stat-card ios-card">
                  <div className="stat-header">
                    <h3>Most Used App</h3>
                    <span className="stat-period">past week</span>
                  </div>
                  <div className="stat-main">
                    {mostUsedApp ? (
                      <div className="activity-info-simple">
                        <div className="app-icon">💻</div>
                        <div className="app-name">{mostUsedApp.application}</div>
                      </div>
                    ) : (
                      <div className="no-data-state">
                        <span className="no-data-text">No tracked apps</span>
                      </div>
                    )}
                  </div>
                  <div className="stat-subtitle">
                    {mostUsedApp ? (
                      <div className="activity-info-horizontal">
                        <div className="app-time">{mostUsedApp.time}</div>
                      </div>
                    ) : 'Enable app tracking'}
                  </div>
                </div>
                
                <div className="stat-card ios-card">
                  <div className="stat-header">
                    <h3>Tasks Completed</h3>
                    <span className="stat-period">with AI summaries</span>
                  </div>
                  <div className="stat-main">
                    <span className="stat-number">3</span>
                    <div className="task-summary">
                      <span className="task-item">2 features added</span>
                      <span className="task-item">1 bug fixed</span>
                    </div>
                  </div>
                  <div className="stat-subtitle">Productivity boost</div>
                </div>
              </div>
            </div>
            
            {/* Middle Section - Charts & Visuals */}
            <div className="charts-section">
              <div className="charts-header">
                <h2 className="section-title">Time Distribution</h2>
                <div className="chart-controls">
                  <button 
                    className={`chart-btn ${selectedTimePeriod === 'today' ? 'active' : ''}`}
                    onClick={() => handleTimePeriodChange('today')}
                    title="Press 1 for Today"
                  >
                    Today <span className="hotkey">1</span>
                  </button>
                  <button 
                    className={`chart-btn ${selectedTimePeriod === 'week' ? 'active' : ''}`}
                    onClick={() => handleTimePeriodChange('week')}
                    title="Press 2 for Week"
                  >
                    Week <span className="hotkey">2</span>
                  </button>
                  <button 
                    className={`chart-btn ${selectedTimePeriod === 'month' ? 'active' : ''}`}
                    onClick={() => handleTimePeriodChange('month')}
                    title="Press 3 for Month"
                  >
                    Month <span className="hotkey">3</span>
                  </button>
                </div>
              </div>
              
              {/* Charts Grid - Two column layout */}
              <div className="charts-grid">
                {/* Left Column - Charts */}
                <div className="charts-left-column">
              {/* Monthly Calendar - Show for Month */}
              {selectedTimePeriod === 'month' && (
                <div className="chart-card ios-card">
                  <div className="chart-header">
                    <h3>Monthly Activity Calendar</h3>
                  </div>
                  <MonthlyCalendar 
                    timeEntries={cache.timeEntries || []}
                    applications={applications}
                    maxHoursPerDay={12}
                  />
                </div>
              )}
              
              {/* Daily Time Distribution Chart - Show for Week */}
              {selectedTimePeriod === 'week' && (
                <div className="chart-card ios-card">
                  <div className="chart-header">
                    <h3>Daily Time Distribution</h3>
                  </div>
                      <div className="nivo-container" ref={(el) => {
                        if (el) {
                          // Add custom animation after chart renders
                          setTimeout(() => {
                            const bars = el.querySelectorAll('svg g[data-testid="bar"] rect');
                            bars.forEach((bar, index) => {
                              (bar as HTMLElement).style.transformOrigin = 'bottom';
                              (bar as HTMLElement).style.animation = `growFromBottom 1.2s ease-out forwards`;
                              (bar as HTMLElement).style.animationDelay = `${index * 0.1}s`;
                              (bar as HTMLElement).style.opacity = '0';
                            });
                          }, 100);
                        }
                      }}>
                        <ResponsiveBar
                          key={`bar-${windowWidth}`}
                          data={dailyTimeData}
                          keys={['development', 'communication', 'research', 'design', 'meetings']}
                          indexBy="day"
                          margin={windowWidth > 768 ? 
                            { top: 20, right: 20, bottom: 40, left: 60 } : 
                            { top: 20, right: 10, bottom: 30, left: 50 }
                          }
                          padding={windowWidth > 768 ? 0.2 : 0.1}
                          colors={colors}
                          borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
                          axisTop={null}
                          axisRight={null}
                          axisBottom={{
                            tickSize: windowWidth > 768 ? 5 : 3,
                            tickPadding: windowWidth > 768 ? 5 : 3,
                            tickRotation: windowWidth > 768 ? 0 : -45,
                            legend: 'Day',
                            legendPosition: 'middle',
                            legendOffset: windowWidth > 768 ? 32 : 25,
                          }}
                          axisLeft={{
                            tickSize: windowWidth > 768 ? 5 : 3,
                            tickPadding: windowWidth > 768 ? 5 : 3,
                            tickRotation: 0,
                            legend: 'Hours',
                            legendPosition: 'middle',
                            legendOffset: windowWidth > 768 ? -50 : -40,
                          }}
                          labelSkipWidth={windowWidth > 768 ? 12 : 8}
                          labelSkipHeight={windowWidth > 768 ? 12 : 8}
                          labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
                          animate={false}
                          enableLabel={false}
                          enableGridX={false}
                          enableGridY={true}
                          tooltip={({ id, value, indexValue }) => (
                            <div style={{
                              background: 'rgba(0, 0, 0, 0.8)',
                              color: 'white',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              border: 'none'
                            }}>
                              <strong>{indexValue}</strong><br />
                              {id}: {value}h
                        </div>
                          )}
                        />
                  </div>
                </div>
              )}
              
              {/* App Category Breakdown Chart - Show for Today */}
              {selectedTimePeriod === 'today' && (
                    <div className="chart-card ios-card">
                  <div className="chart-header">
                    <h3>App Category Breakdown</h3>
                  </div>
                      <div className="nivo-pie-container">
                        <ResponsivePie
                          key={`pie-${windowWidth}`}
                          data={categoryData}
                          margin={windowWidth > 768 ? 
                            { top: 20, right: 120, bottom: 20, left: 20 } : 
                            { top: 20, right: 20, bottom: 20, left: 20 }
                          }
                          innerRadius={windowWidth > 768 ? 0 : 0}
                          padAngle={windowWidth > 768 ? 0.7 : 0.5}
                          cornerRadius={windowWidth > 768 ? 3 : 2}
                          colors={colors}
                          borderWidth={1}
                          borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                          arcLabelsSkipAngle={10}
                          arcLabelsTextColor="#333333"
                          animate={true}
                          enableArcLabels={false}
                          tooltip={({ datum }) => (
                            <div style={{
                              background: 'rgba(0, 0, 0, 0.8)',
                              color: 'white',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              border: 'none'
                            }}>
                              <strong>{datum.label}</strong><br />
                              {datum.value}%
                        </div>
                          )}
                        />
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Right Column - Top Applications Table */}
                <div className="charts-right-column">
                  <div className="chart-card ios-card top-apps-table-card">
                    <div className="chart-header">
                      <h3>Top Applications</h3>
                      <span className="chart-period">{selectedTimePeriod}</span>
                    </div>
                    <div className="top-apps-table" key={`table-${selectedTimePeriod}`}>
                      <div className="table-header-row">
                        <span className="table-header-cell app-name-header">Application</span>
                        <span className="table-header-cell time-header">Time</span>
                      </div>
                      <div className="table-body">
                        {loading ? (
                          <div className="table-empty-state">
                            <span className="empty-text">Loading applications...</span>
                          </div>
                        ) : applicationTimeData.length === 0 ? (
                          <div className="table-empty-state">
                            <span className="empty-text">No tracked applications</span>
                            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                              Debug: Apps({applications.length}) TimeEntries({cache.timeEntries?.length || 0}) Period({selectedTimePeriod})
                            </div>
                          </div>
                        ) : (
                          applicationTimeData.map((item, index) => (
                          <div key={`${selectedTimePeriod}-${index}-${item.application}`} className="table-data-row">
                            <div className="table-data-cell app-name-cell">
                              <div className="app-icon-small">💻</div>
                              <span className="app-name">{item.application}</span>
                      </div>
                            <span className="table-data-cell time-cell">{item.time}</span>
                      </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;