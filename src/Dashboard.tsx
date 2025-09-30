import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Dashboard.css';
import Sidebar from './Sidebar';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsivePie } from '@nivo/pie';
import { useDashboardCache } from './contexts/DashboardCacheContext';

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
  onPageChange: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'detected' | 'logs') => void;
}

function Dashboard({ onLogout, onPageChange }: DashboardProps) {
  const { cache, updateCache, isCacheValid } = useDashboardCache();
  
  const [user, setUser] = useState<{ name: string } | null>(null);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<'today' | 'week' | 'month'>('week');
  const [currentActivity, setCurrentActivity] = useState<CurrentActivity | null>(null);
  const [currentActivityLoading, setCurrentActivityLoading] = useState<boolean>(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [hoursTrackedToday, setHoursTrackedToday] = useState<number>(0);
  const [hoursTrackedYesterday, setHoursTrackedYesterday] = useState<number>(0);
  const [hoursTrackedThisWeek, setHoursTrackedThisWeek] = useState<number>(0);
  const [hoursDataLoading, setHoursDataLoading] = useState<boolean>(true);
  const [hoursDataError, setHoursDataError] = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationTimeData, setApplicationTimeData] = useState<AppTimeData[]>([]);
  const [tableDataLoading, setTableDataLoading] = useState<boolean>(true);
  const [tableDataError, setTableDataError] = useState<string | null>(null);
  const [mostUsedApp, setMostUsedApp] = useState<AppTimeData | null>(null);
  const [mostUsedAppLoading, setMostUsedAppLoading] = useState<boolean>(true);
  const [mostUsedAppError, setMostUsedAppError] = useState<string | null>(null);

  // Debug logging for state changes
  useEffect(() => {
    console.log('📊 hoursDataLoading state changed to:', hoursDataLoading);
  }, [hoursDataLoading]);

  useEffect(() => {
    console.log('❌ hoursDataError state changed to:', hoursDataError);
  }, [hoursDataError]);

  useEffect(() => {
    console.log('⏱️ hoursTrackedToday state changed to:', hoursTrackedToday);
  }, [hoursTrackedToday]);

  useEffect(() => {
    console.log('📱 applications state changed to:', applications.length, 'apps');
  }, [applications]);

  useEffect(() => {
    console.log('📊 applicationTimeData state changed to:', applicationTimeData.length, 'items');
  }, [applicationTimeData]);

  useEffect(() => {
    console.log('📊 tableDataLoading state changed to:', tableDataLoading);
  }, [tableDataLoading]);

  useEffect(() => {
    console.log('❌ tableDataError state changed to:', tableDataError);
  }, [tableDataError]);

  useEffect(() => {
    console.log('🏆 mostUsedApp state changed to:', mostUsedApp);
  }, [mostUsedApp]);

  useEffect(() => {
    console.log('🏆 mostUsedAppLoading state changed to:', mostUsedAppLoading);
  }, [mostUsedAppLoading]);

  useEffect(() => {
    console.log('❌ mostUsedAppError state changed to:', mostUsedAppError);
  }, [mostUsedAppError]);

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
    
    // Create a map of app_id to app name
    const appMap = new Map<string, Application>();
    apps.forEach(app => {
      appMap.set(app.id, app);
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
    
    const filteredEntries = timeEntries.filter(entry => {
      const entryDate = new Date(entry.start_time);
      return entryDate >= startDate && entry.app_id;
    });
    
    console.log('📊 Filtered entries for period:', filteredEntries.length);
    
    // Aggregate time by app_id
    const appTimeMap = new Map<string, number>();
    
    filteredEntries.forEach(entry => {
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
    
    // Convert to array and sort by time
    const result: AppTimeData[] = [];
    
    for (const [appId, hours] of appTimeMap.entries()) {
      const app = appMap.get(appId);
      if (!app) {
        console.warn('⚠️ App not found for ID:', appId);
        continue;
      }
      
      result.push({
        application: app.name,
        time: formatTimeWithFullWords(hours),
        hours: hours,
        category: app.category
      });
    }
    
    result.sort((a, b) => b.hours - a.hours);
    const topApps = result.slice(0, 6); // Top 6 applications
    
    console.log('📊 Aggregated app time data:', topApps);
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
  const fetchCurrentActivity = async (showLoading = false) => {
    if (showLoading) {
      setCurrentActivityLoading(true);
    }
    
    try {
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
    } catch (error) {
      console.error('Failed to get current activity:', error);
    } finally {
      if (showLoading) {
        setCurrentActivityLoading(false);
      }
    }
  };

  // Function to calculate hours data from cached time entries (fast)
  const calculateHoursFromCache = () => {
    console.log('⚡ Calculating hours data from cache...');
    
    if (cache.timeEntries.length === 0) {
      console.log('⚠️ No cached time entries available for hours calculation');
      return;
    }
    
    // Check if hours cache is stale (but time entries cache is fresh)
    const now = Date.now();
    const hoursCacheAge = now - cache.hoursCacheTimestamp;
    if (hoursCacheAge < 60000 && cache.hoursData) { // Use cached hours if less than 1 minute old
      console.log('⚡ Using cached hours data (fresh)');
      setHoursTrackedToday(cache.hoursData.today);
      setHoursTrackedYesterday(cache.hoursData.yesterday);
      setHoursTrackedThisWeek(cache.hoursData.week);
      return;
    }
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Calculate hours for today
    const todayHours = calculateHoursForDate(cache.timeEntries, today);
    console.log('📅 Today hours calculated from cache:', todayHours);

    // Calculate hours for yesterday
    const yesterdayHours = calculateHoursForDate(cache.timeEntries, yesterday);
    console.log('📅 Yesterday hours calculated from cache:', yesterdayHours);

    // Calculate hours for this week (Monday to Sunday)
    const weekStart = new Date(today);
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday is 0, Monday is 1
    weekStart.setDate(today.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);

    let weekHours = 0;
    for (let i = 0; i < 7; i++) {
      const weekDay = new Date(weekStart);
      weekDay.setDate(weekStart.getDate() + i);
      weekHours += calculateHoursForDate(cache.timeEntries, weekDay);
    }
    console.log('📅 Week hours calculated from cache:', weekHours);

    // Update state with calculated values
    setHoursTrackedToday(todayHours);
    setHoursTrackedYesterday(yesterdayHours);
    setHoursTrackedThisWeek(weekHours);
    
    // Cache the calculated data
    updateCache({
      hoursData: {
        today: todayHours,
        yesterday: yesterdayHours,
        week: weekHours
      },
      hoursCacheTimestamp: Date.now()
    });
    
    console.log('⚡ Hours data calculated from cache successfully');
  };

  // Function to update table data from cached data (fast)
  const updateTableDataFromCache = () => {
    console.log('⚡ Updating table data from cache for period:', selectedTimePeriod);
    
    if (cache.timeEntries.length === 0 || cache.applications.length === 0) {
      console.log('⚠️ No cached data available, skipping update');
      return;
    }
    
    // Check if cache is stale
    if (!isCacheValid()) {
      console.log('🔄 Cache is stale, refreshing data...');
      fetchApplicationsAndUpdateTable(false);
      return;
    }
    
    // Update table data based on selected time period
    const aggregatedData = aggregateTimeByApplication(cache.timeEntries, cache.applications, selectedTimePeriod);
    setApplicationTimeData(aggregatedData);
    
    // Calculate most used app for the past week
    const mostUsedAppData = findMostUsedApp(cache.timeEntries, cache.applications);
    setMostUsedApp(mostUsedAppData);
    
    // Update cache with calculated data
    updateCache({
      applicationTimeData: aggregatedData,
      mostUsedApp: mostUsedAppData
    });
    
    console.log('⚡ Table data updated from cache successfully');
  };

  // Function to fetch applications and update table data (slow - only when needed)
  const fetchApplicationsAndUpdateTable = async (showLoading = false) => {
    console.log('📱 fetchApplicationsAndUpdateTable called with showLoading:', showLoading);
    
    if (showLoading) {
      setTableDataLoading(true);
      setTableDataError(null);
    }
    
    try {
      console.log('📡 Fetching applications...');
      const apps = await invoke<Application[]>('get_my_applications');
      console.log('✅ Received applications:', apps.length, 'apps');
      setApplications(apps);
      
      console.log('📡 Fetching time entries for table...');
      const timeEntries = await invoke<TimeEntry[]>('get_my_time_entries', {
        limit: 1000
      });
      console.log('✅ Received time entries for table:', timeEntries.length, 'entries');
      
      // Update global cache
      updateCache({
        applications: apps,
        timeEntries: timeEntries,
        dataCacheTimestamp: Date.now()
      });
      
      // Update table data based on selected time period
      const aggregatedData = aggregateTimeByApplication(timeEntries, apps, selectedTimePeriod);
      setApplicationTimeData(aggregatedData);
      
      // Calculate most used app for the past week
      const mostUsedAppData = findMostUsedApp(timeEntries, apps);
      setMostUsedApp(mostUsedAppData);
      
      if (showLoading) {
        setTableDataLoading(false);
        setMostUsedAppLoading(false);
      }
      console.log('🎉 fetchApplicationsAndUpdateTable completed successfully');
    } catch (error) {
      console.error('❌ Failed to fetch applications or update table:', error);
      setTableDataError('Failed to load application data');
      setMostUsedAppError('Failed to load most used app data');
      if (showLoading) {
        setTableDataLoading(false);
        setMostUsedAppLoading(false);
      }
    }
  };

  // Function to fetch and calculate real hours data
  const fetchHoursData = async (showLoading = false) => {
    console.log('🔄 fetchHoursData called with showLoading:', showLoading);
    
    if (showLoading) {
      console.log('📊 Setting loading state to true');
      setHoursDataLoading(true);
      setHoursDataError(null);
    }
    
    try {
      console.log('📡 Calling get_my_time_entries...');
      const timeEntries = await invoke<TimeEntry[]>('get_my_time_entries', {
        limit: 1000 // Get enough entries to cover the week
      });
      console.log('✅ Received time entries:', timeEntries.length, 'entries');

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Calculate hours for today
      const todayHours = calculateHoursForDate(timeEntries, today);
      console.log('📅 Today hours calculated:', todayHours);
      setHoursTrackedToday(todayHours);

      // Calculate hours for yesterday
      const yesterdayHours = calculateHoursForDate(timeEntries, yesterday);
      console.log('📅 Yesterday hours calculated:', yesterdayHours);
      setHoursTrackedYesterday(yesterdayHours);

      // Calculate hours for this week (Monday to Sunday)
      const weekStart = new Date(today);
      const dayOfWeek = today.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday is 0, Monday is 1
      weekStart.setDate(today.getDate() - daysToMonday);
      weekStart.setHours(0, 0, 0, 0);

      let weekHours = 0;
      for (let i = 0; i < 7; i++) {
        const weekDay = new Date(weekStart);
        weekDay.setDate(weekStart.getDate() + i);
        weekHours += calculateHoursForDate(timeEntries, weekDay);
      }
      console.log('📅 Week hours calculated:', weekHours);
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

      if (showLoading) {
        console.log('✅ Setting loading state to false (success)');
        setHoursDataLoading(false);
      }
      console.log('🎉 fetchHoursData completed successfully');
    } catch (error) {
      console.error('❌ Failed to fetch hours data:', error);
      setHoursDataError('Failed to load tracking data');
      if (showLoading) {
        console.log('❌ Setting loading state to false (error)');
        setHoursDataLoading(false);
      }
    }
  };

  useEffect(() => {
    console.log('🚀 Dashboard useEffect (initial load) triggered');
    
    const fetchUser = async () => {
      try {
        console.log('👤 Fetching user data...');
        const userData = await invoke('get_current_user');
        console.log('✅ User data received:', userData);
        setUser(userData as { name: string });
      } catch (error) {
        console.error('❌ Failed to fetch user:', error);
        // Fallback to default name if fetch fails
        setUser({ name: 'Dev User' });
      }
    };

    fetchUser();
    console.log('📊 Calling fetchHoursData(true) for initial load');
    fetchHoursData(true); // Show loading on initial load
    console.log('📱 Calling fetchApplicationsAndUpdateTable(true) for initial load');
    fetchApplicationsAndUpdateTable(true); // Show loading on initial load
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    console.log('⏰ Setting up intervals...');
    
    // Update current activity duration every second (local calculation)
    const durationInterval = setInterval(() => {
      updateCurrentActivityDuration();
    }, 1000);
    
    // Fetch current activity every 10 seconds (reduced from 5 seconds)
    const activityInterval = setInterval(() => {
      fetchCurrentActivity(false);
    }, 10000);

    // Update hours data every minute
    const hoursInterval = setInterval(() => {
      console.log('🔄 Periodic hours data update triggered');
      if (cache.timeEntries.length > 0) {
        calculateHoursFromCache(); // Fast cache-based calculation
      } else {
        fetchHoursData(false); // Fallback to full fetch if no cache
      }
    }, 60000);

    // Refresh cached data every 5 minutes
    const cacheRefreshInterval = setInterval(() => {
      console.log('🔄 Periodic cache refresh triggered');
      if (cache.timeEntries.length > 0 || cache.applications.length > 0) {
        fetchApplicationsAndUpdateTable(false); // Refresh cache silently
        fetchHoursData(false); // Also refresh hours data silently
      }
    }, cache.CACHE_INVALIDATION_TIME);

    return () => {
      console.log('🧹 Cleaning up intervals');
      clearInterval(durationInterval);
      clearInterval(activityInterval);
      clearInterval(hoursInterval);
      clearInterval(cacheRefreshInterval);
      // Note: Activity tracking is now managed at App level, not here
    };
  }, []);

  const handleTimePeriodChange = (period: 'today' | 'week' | 'month') => {
    console.log('📅 Time period changed to:', period);
    setSelectedTimePeriod(period);
    
    // Show immediate loading state for table data
    if (cache.timeEntries.length > 0 && cache.applications.length > 0) {
      setTableDataLoading(true);
      // The useEffect will handle the actual update
    }
    
    // Also update hours data if we have cached time entries
    if (cache.timeEntries.length > 0) {
      setHoursDataLoading(true);
      calculateHoursFromCache();
      setHoursDataLoading(false);
    }
  };

  // Update table data when time period changes (fast - use cache)
  useEffect(() => {
    if (cache.timeEntries.length > 0 && cache.applications.length > 0) {
      console.log('📅 Time period changed, updating table data from cache...');
      updateTableDataFromCache(); // Fast update from cache
      setTableDataLoading(false); // Clear loading state
    } else if (applications.length > 0) {
      console.log('📅 Time period changed, but no cache available, fetching fresh data...');
      fetchApplicationsAndUpdateTable(false); // Fallback to slow fetch
    }
  }, [selectedTimePeriod]);

  // Calculate hours from cache when cached time entries are available
  useEffect(() => {
    if (cache.timeEntries.length > 0 && !cache.hoursData) {
      console.log('⚡ Cached time entries available, calculating hours from cache...');
      calculateHoursFromCache();
    }
  }, [cache.timeEntries]);

  // Initialize from cache when Dashboard mounts
  useEffect(() => {
    if (cache.timeEntries.length > 0 && cache.applications.length > 0) {
      console.log('🚀 Dashboard mounted with cached data, initializing...');
      
      // Set applications
      setApplications(cache.applications);
      
      // Set hours data if available
      if (cache.hoursData) {
        setHoursTrackedToday(cache.hoursData.today);
        setHoursTrackedYesterday(cache.hoursData.yesterday);
        setHoursTrackedThisWeek(cache.hoursData.week);
        setHoursDataLoading(false);
      }
      
      // Set table data if available
      if (cache.applicationTimeData.length > 0) {
        setApplicationTimeData(cache.applicationTimeData);
        setTableDataLoading(false);
      }
      
      // Set most used app if available
      if (cache.mostUsedApp) {
        setMostUsedApp(cache.mostUsedApp);
        setMostUsedAppLoading(false);
      }
      
      // Set current activity if available and fresh (less than 30 seconds old)
      if (cache.currentActivity) {
        const now = Date.now();
        const activityAge = now - cache.currentActivityTimestamp;
        if (activityAge < 30000) { // 30 seconds
          setCurrentActivity(cache.currentActivity);
          setCurrentActivityLoading(false);
          console.log('⚡ Current activity loaded from cache');
        } else {
          // Cache is stale, fetch fresh data
          fetchCurrentActivity(true);
        }
      } else {
        // No cached activity, fetch fresh data
        fetchCurrentActivity(true);
      }
      
      console.log('🚀 Dashboard initialized from cache successfully');
    }
  }, []); // Only run on mount

  return (
    <div className="dashboard-container">
      <Sidebar 
        currentPage="dashboard" 
        onLogout={onLogout} 
        onPageChange={onPageChange} 
      />
      
      <div className="main-content">
        <div className="dashboard-page-container">
          <div className="dashboard-header">
            <h1>Welcome, {user?.name || 'User'}!</h1>
            <div className="header-actions">
              <button className="btn-primary">New Project</button>
            </div>
          </div>
          
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
                  {currentActivityLoading ? (
                    <div className="loading-state">
                      <span className="loading-text">...</span>
                    </div>
                  ) : currentActivity ? (
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
                  <span className="stat-period">
                    {hoursDataError ? 'error' : hoursDataLoading ? 'loading...' : 'vs yesterday'}
                  </span>
                </div>
                <div className="stat-main">
                  {hoursDataError ? (
                    <div className="error-state">
                      <span className="error-icon">⚠️</span>
                      <span className="error-text">Data unavailable</span>
                    </div>
                  ) : hoursDataLoading ? (
                    <div className="loading-state">
                      <span className="loading-text">Calculating...</span>
                    </div>
                  ) : (
                    <>
                      <span className="stat-number">
                        {formatTimeWithFullWords(hoursTrackedToday)}
                      </span>
                  <span className={`stat-change ${hoursTrackedToday >= hoursTrackedYesterday ? 'positive' : 'negative'}`}>
                    {hoursTrackedToday >= hoursTrackedYesterday ? '+' : ''}{(hoursTrackedToday - hoursTrackedYesterday).toFixed(1)} hours
                  </span>
                    </>
                  )}
                </div>
                <div className="stat-subtitle">
                  {hoursDataError ? 'Check connection' : 
                   hoursDataLoading ? 'Loading data...' : 
                   `This week: ${hoursTrackedThisWeek.toFixed(1)} hours`}
                </div>
              </div>
              
              <div className="stat-card ios-card">
                <div className="stat-header">
                  <h3>Most Used App</h3>
                  <span className="stat-period">
                    {mostUsedAppError ? 'error' : mostUsedAppLoading ? 'loading...' : 'past week'}
                  </span>
                </div>
                <div className="stat-main">
                  {mostUsedAppError ? (
                    <div className="error-state">
                      <span className="error-icon">⚠️</span>
                      <span className="error-text">Data unavailable</span>
                    </div>
                  ) : mostUsedAppLoading ? (
                    <div className="loading-state">
                      <span className="loading-text">Calculating...</span>
                    </div>
                  ) : mostUsedApp ? (
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
                  {mostUsedAppError ? 'Check connection' : 
                   mostUsedAppLoading ? 'Loading data...' : 
                   mostUsedApp ? (
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
                >
                  Today
                </button>
                <button 
                  className={`chart-btn ${selectedTimePeriod === 'week' ? 'active' : ''}`}
                  onClick={() => handleTimePeriodChange('week')}
                >
                  Week
                </button>
                <button 
                  className={`chart-btn ${selectedTimePeriod === 'month' ? 'active' : ''}`}
                  onClick={() => handleTimePeriodChange('month')}
                >
                  Month
                </button>
              </div>
            </div>
            
            {/* Charts Grid - Two column layout */}
            <div className="charts-grid">
              {/* Left Column - Charts */}
              <div className="charts-left-column">
                {/* Daily Time Distribution Chart - Show for Week/Month */}
                {selectedTimePeriod !== 'today' && (
                  <div className="chart-card ios-card">
                    <div className="chart-header">
                      <h3>Daily Time Distribution</h3>
                    </div>
                    <div className="nivo-container">
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
                        animate={true}
                        enableLabel={false}
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
                  <div className="top-apps-table">
                    <div className="table-header-row">
                      <span className="table-header-cell app-name-header">Application</span>
                      <span className="table-header-cell time-header">Time</span>
                    </div>
                    <div className="table-body">
                      {tableDataError ? (
                        <div className="table-error-state">
                          <span className="error-icon">⚠️</span>
                          <span className="error-text">Failed to load data</span>
                        </div>
                      ) : tableDataLoading ? (
                        <div className="table-loading-state">
                          <span className="loading-text">Loading applications...</span>
                        </div>
                      ) : applicationTimeData.length === 0 ? (
                        <div className="table-empty-state">
                          <span className="empty-text">No tracked applications</span>
                        </div>
                      ) : (
                        applicationTimeData.map((item, index) => (
                        <div key={index} className="table-data-row">
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
      </div>
    </div>
  );
}

export default Dashboard;