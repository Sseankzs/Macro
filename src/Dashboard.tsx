import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Dashboard.css';
import Sidebar from './Sidebar';
import { ResponsiveBar } from '@nivo/bar';
import { ResponsivePie } from '@nivo/pie';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useDashboardCache } from './contexts/DashboardCacheContext';
import { DashboardSkeletonGrid } from './components/LoadingComponents';
import MonthlyCalendar from './MonthlyCalendar';
import { BYPASS_DB_APPS } from './config';
import PageSourceBadge from './components/PageSourceBadge';

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
  onPageChange: (page: 'dashboard' | 'tasks' | 'teams' | 'register-apps' | 'metric-builder' | 'logs' | 'ai-assistant' | 'debug') => void;
}

interface BackendTask {
  id: string;
  title: string;
  description?: string;
  project_id?: string;
  assignee_id?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority?: 'low' | 'medium' | 'high';
  due_date?: string;
  created_at: string;
  updated_at: string;
}

function Dashboard({ onLogout, onPageChange }: DashboardProps) {
  const { cache, updateCache } = useDashboardCache();
  
  const [user, setUser] = useState<{ name: string } | null>(null);
  const [tasks, setTasks] = useState<BackendTask[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // State for stats cards
  const [currentActivity, setCurrentActivity] = useState<CurrentActivity | null>(null);
  const [hoursTrackedToday, setHoursTrackedToday] = useState<number>(0);
  const [hoursTrackedYesterday, setHoursTrackedYesterday] = useState<number>(0);
  const [hoursTrackedThisWeek, setHoursTrackedThisWeek] = useState<number>(0);
  const [mostUsedApp, setMostUsedApp] = useState<AppTimeData | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  
  // State for charts
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<'today' | 'week' | 'month'>('week');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [categoryData, setCategoryData] = useState<Array<{id: string, label: string, value: number, hours: number}>>([]);
  const [dailyTimeData, setDailyTimeData] = useState<Array<{[key: string]: number | string}>>([]);
  const [chartCategories, setChartCategories] = useState<string[]>([]);
  const [applicationTimeData, setApplicationTimeData] = useState<AppTimeData[]>([]);

  // Commented out time filter hotkeys
  // useEffect(() => {
  //   const handleKeyDown = (event: KeyboardEvent) => {
  //     if (event.ctrlKey || event.metaKey) return;
  //     switch (event.key) {
  //       case '1':
  //         event.preventDefault();
  //         handleTimePeriodChange('today');
  //         break;
  //       case '2':
  //         event.preventDefault();
  //         handleTimePeriodChange('week');
  //         break;
  //       case '3':
  //         event.preventDefault();
  //         handleTimePeriodChange('month');
  //         break;
  //       default:
  //         return;
  //     }
  //   };
  //   document.addEventListener('keydown', handleKeyDown);
  //   return () => {
  //     document.removeEventListener('keydown', handleKeyDown);
  //   };
  // }, [selectedTimePeriod]);


  // Helper function to get time of day greeting
  const getTimeOfDay = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  // Helper function to format date and time
  const formatDateTime = (dateString: string): string => {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dateStr} at ${timeStr}`;
  };

  // Load user, tasks, and stats data
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      if (isTauri()) {
        const [userData, backendTasks, timeEntries] = await Promise.all([
          invoke('get_current_user') as Promise<{ name: string }>,
          invoke('get_my_tasks') as Promise<BackendTask[]>,
          invoke('get_my_time_entries', { limit: 1000 }) as Promise<TimeEntry[]>
        ]);
        setUser(userData);
        setTasks(backendTasks);

        // Load applications
        let appsForCalc: Application[] = [];
        if (BYPASS_DB_APPS) {
          type DetectedProcess = { name: string; process_name: string };
          const detected = await invoke<DetectedProcess[]>('get_running_processes');
          appsForCalc = detected.map((p, idx) => ({
            id: `detected-${idx}`,
            name: p.name || p.process_name,
            process_name: p.process_name,
            category: undefined,
            icon_path: undefined,
            is_tracked: true,
            user_id: 'local',
            created_at: undefined,
            updated_at: undefined,
            last_used: undefined,
          }));
        } else {
          appsForCalc = await invoke('get_my_applications') as Application[];
        }
        setApplications(appsForCalc);

        // Store timeEntries in local state for direct access
        setTimeEntries(timeEntries);

        // Store data in cache for use by other effects
        updateCache({
          timeEntries: timeEntries,
          applications: appsForCalc,
          dataCacheTimestamp: Date.now()
        });

        // Calculate hours tracked
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const todayHours = calculateHoursForDate(timeEntries, today);
        const yesterdayHours = calculateHoursForDate(timeEntries, yesterday);

        // Calculate hours for this week
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

        setHoursTrackedToday(todayHours);
        setHoursTrackedYesterday(yesterdayHours);
        setHoursTrackedThisWeek(weekHours);

        // Find most used app
        const mostUsedAppData = findMostUsedApp(timeEntries, appsForCalc);
        setMostUsedApp(mostUsedAppData);

        // Fetch current activity
        await fetchCurrentActivity();
      } else {
        // Browser mode
        setUser({ name: 'Dev User' });
        setTasks([]);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Update current activity duration every second
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
  }, [currentActivity]);

  // Recalculate chart and table data when time period changes
  useEffect(() => {
    if (!loading && applications.length > 0) {
      // Use local timeEntries state, fallback to cache if needed
      const entries = timeEntries.length > 0 ? timeEntries : (cache.timeEntries || []);
      
      console.log('🔄 Recalculating data for period:', selectedTimePeriod, {
        entriesCount: entries.length,
        appsCount: applications.length
      });
      
      if (entries.length > 0) {
        // Calculate application time data for table
        const aggregatedData = aggregateTimeByApplication(entries, applications, selectedTimePeriod);
        setApplicationTimeData(aggregatedData);
        
        // Calculate category data for pie chart
        const categoryChartData = aggregateTimeByCategory(entries, applications, selectedTimePeriod);
        setCategoryData(categoryChartData);
        
        // Calculate daily time data for bar chart
        const dailyTimeResult = aggregateDailyTimeByCategory(entries, applications, selectedTimePeriod);
        setDailyTimeData(dailyTimeResult.data);
        setChartCategories(dailyTimeResult.categories);
      } else {
        // No time entries - clear all data
        setApplicationTimeData([]);
        setCategoryData([]);
        setDailyTimeData([]);
        setChartCategories([]);
      }
    }
  }, [selectedTimePeriod, applications, timeEntries, loading]);

  // Calculate task statistics
  const getTaskStats = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayTasks = tasks.filter(task => {
      if (!task.due_date) return false;
      const dueDate = new Date(task.due_date);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate.getTime() === today.getTime();
    });

    const highPriorityTasks = todayTasks.filter(task => task.priority === 'high');
    
    // Find closest deadline (including future dates)
    const tasksWithDeadlines = tasks
      .filter(task => task.due_date)
      .map(task => ({
        ...task,
        dueDate: new Date(task.due_date!)
      }))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    const closestDeadline = tasksWithDeadlines.length > 0 ? tasksWithDeadlines[0] : null;

    return {
      todayCount: todayTasks.length,
      highPriorityCount: highPriorityTasks.length,
      closestDeadline: closestDeadline ? formatDateTime(closestDeadline.due_date!) : null
    };
  };

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
    
    // Proceed even if apps list is empty; fall back to unknown labels
    
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
      // Only include apps with meaningful time (at least 1 minute)
      if (hours >= 1/60) {
        result.push({
          application: app ? app.name : `Unknown App (${appId.slice(0, 6)})`,
          time: formatTimeWithFullWords(hours),
          hours: hours,
          category: app ? app.category : 'Uncategorized'
        });
      }
    }
    
    result.sort((a, b) => b.hours - a.hours);
    const topApps = result.slice(0, 6); // Top 6 applications
    
    console.log('📊 Final aggregated app time data:', topApps);
    return topApps;
  };

  // Aggregate time by category for pie chart
  const aggregateTimeByCategory = (timeEntries: TimeEntry[], apps: Application[], timePeriod: 'today' | 'week' | 'month') => {
    console.log('🥧 Aggregating time by category for period:', timePeriod);
    
    if (!timeEntries || timeEntries.length === 0) {
      console.log('🥧 No data available for category aggregation');
      return [];
    }

    // Create a map of app_id to app category
    const appCategoryMap = new Map<string, string>();
    apps.forEach(app => {
      appCategoryMap.set(app.id, app.category || 'Uncategorized');
    });

    // Filter entries based on time period (same logic as aggregateTimeByApplication)
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

    // Aggregate time by category
    const categoryTimeMap = new Map<string, number>();
    
    filteredEntries.forEach(entry => {
      if (entry.app_id) {
        const category = appCategoryMap.get(entry.app_id) || 'Uncategorized';
        const startTime = new Date(entry.start_time);
        let endTime: Date;
        
        // Handle different end time scenarios
        if (entry.end_time) {
          endTime = new Date(entry.end_time);
        } else if (entry.duration_seconds) {
          endTime = new Date(startTime.getTime() + (entry.duration_seconds * 1000));
        } else {
          endTime = new Date();
        }
        
        // Calculate duration in hours
        const durationMs = Math.max(0, endTime.getTime() - startTime.getTime());
        const durationHours = durationMs / (1000 * 60 * 60);
        
        if (durationHours > 0) {
          const currentTime = categoryTimeMap.get(category) || 0;
          categoryTimeMap.set(category, currentTime + durationHours);
        }
      }
    });

    // Convert to pie chart format and calculate percentages
    const totalHours = Array.from(categoryTimeMap.values()).reduce((sum, hours) => sum + hours, 0);
    
    if (totalHours === 0) {
      console.log('🥧 No category data available');
      return [];
    }

    const result = Array.from(categoryTimeMap.entries())
      .filter(([_, hours]) => hours >= 1/60) // At least 1 minute
      .map(([category, hours]) => ({
        id: category,
        label: category,
        value: Math.round((hours / totalHours) * 100), // Percentage
        hours: hours
      }))
      .sort((a, b) => b.value - a.value);

    console.log('🥧 Category data:', result);
    return result;
  };

  // Aggregate time by day and category for bar chart
  const aggregateDailyTimeByCategory = (timeEntries: TimeEntry[], apps: Application[], timePeriod: 'today' | 'week' | 'month') => {
    console.log('📊 Aggregating daily time by category for period:', timePeriod);
    
    if (!timeEntries || timeEntries.length === 0) {
      console.log('📊 No data available for daily aggregation');
      return { data: [], categories: [] };
    }

    // Create a map of app_id to app category
    const appCategoryMap = new Map<string, string>();
    apps.forEach(app => {
      appCategoryMap.set(app.id, app.category || 'Uncategorized');
    });

    // Get unique categories for dynamic keys
    let allCategories = Array.from(new Set(apps.map(app => app.category || 'Uncategorized')));
    if (allCategories.length === 0) {
      allCategories = ['Uncategorized'];
    }
    
    // Determine the date range based on time period
    const now = new Date();
    let startDate: Date;
    let days: string[] = [];
    
    switch (timePeriod) {
      case 'today':
        // Show hourly data for today
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        for (let hour = 0; hour < 24; hour += 2) { // Every 2 hours
          days.push(`${hour.toString().padStart(2, '0')}:00`);
        }
        break;
      case 'week':
        // Show daily data for this week
        startDate = new Date(now);
        const dayOfWeek = now.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate.setDate(now.getDate() - daysToMonday);
        startDate.setHours(0, 0, 0, 0);
        days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        break;
      case 'month':
        // Show weekly data for this month (4 weeks)
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        days = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        break;
    }

    // Initialize data structure
    const dailyData: { [key: string]: { [category: string]: number } } = {};
    days.forEach(day => {
      dailyData[day] = {};
      allCategories.forEach(category => {
        dailyData[day][category] = 0;
      });
    });

    // Filter and process entries
    const filteredEntries = timeEntries.filter(entry => {
      const entryDate = new Date(entry.start_time);
      return entryDate >= startDate && entry.app_id;
    });

    filteredEntries.forEach(entry => {
      if (entry.app_id) {
        const category = appCategoryMap.get(entry.app_id) || 'Uncategorized';
        const startTime = new Date(entry.start_time);
        let endTime: Date;
        
        // Handle different end time scenarios
        if (entry.end_time) {
          endTime = new Date(entry.end_time);
        } else if (entry.duration_seconds) {
          endTime = new Date(startTime.getTime() + (entry.duration_seconds * 1000));
        } else {
          endTime = new Date();
        }
        
        // Calculate duration in hours
        const durationMs = Math.max(0, endTime.getTime() - startTime.getTime());
        const durationHours = durationMs / (1000 * 60 * 60);
        
        if (durationHours > 0) {
          let dayKey: string;
          
          switch (timePeriod) {
            case 'today':
              // Group by 2-hour intervals
              const hour = startTime.getHours();
              const interval = Math.floor(hour / 2) * 2;
              dayKey = `${interval.toString().padStart(2, '0')}:00`;
              break;
            case 'week':
              // Group by day of week
              const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              dayKey = dayNames[startTime.getDay()];
              break;
            case 'month':
              // Group by week of month
              const dayOfMonth = startTime.getDate();
              const weekOfMonth = Math.ceil(dayOfMonth / 7);
              dayKey = `Week ${Math.min(weekOfMonth, 4)}`; // Cap at week 4
              break;
            default:
              dayKey = days[0];
          }
          
          if (dailyData[dayKey] && category in dailyData[dayKey]) {
            dailyData[dayKey][category] += durationHours;
          }
        }
      }
    });

    // Convert to chart format
    const result = days.map(day => {
      const dayData: { [key: string]: number | string } = { day };
      allCategories.forEach(category => {
        dayData[category.toLowerCase().replace(/\s+/g, '_')] = Math.round((dailyData[day][category] || 0) * 100) / 100; // Round to 2 decimals
      });
      return dayData;
    });

    console.log('📊 Daily time data:', result);
    console.log('📊 Categories found:', allCategories);
    return { data: result, categories: allCategories.map(cat => cat.toLowerCase().replace(/\s+/g, '_')) };
  };

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
          updateCache({ currentActivity: activity, currentActivityTimestamp: Date.now() });
        } else {
          // Fallback: derive current activity from detected processes
          try {
            type DetectedProcess = { name: string; process_name: string; is_active: boolean };
            const processes = await invoke<DetectedProcess[]>('get_running_processes');
            const active = processes.find(p => p.is_active) || processes[0];
            if (active) {
              const fallback: CurrentActivity = {
                app_name: active.name || active.process_name,
                app_category: 'Other',
                start_time: new Date().toISOString(),
                duration_minutes: 0,
                duration_hours: 0,
                is_active: true,
                active_apps_count: 1,
              };
              setCurrentActivity(fallback);
              updateCache({ currentActivity: fallback, currentActivityTimestamp: Date.now() });
            } else {
              setCurrentActivity(null);
              updateCache({ currentActivity: null, currentActivityTimestamp: Date.now() });
            }
          } catch (e) {
            // If process detection fails, keep idle
            setCurrentActivity(null);
            updateCache({ currentActivity: null, currentActivityTimestamp: Date.now() });
          }
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

  // Commented out old loadAllData function
  /*
  // Load all dashboard data from backend
  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (isTauri()) {
        // Load mandatory data in parallel for faster loading
        const [userData, timeEntries, detectedOS] = await Promise.all([
          invoke('get_current_user') as Promise<{ name: string }>,
          invoke('get_my_time_entries', { limit: 1000 }) as Promise<TimeEntry[]>,
          invoke('get_detected_os') as Promise<string>
        ]);

        console.log('✅ Dashboard data loaded:', {
          user: userData,
          timeEntries: timeEntries.length
        });

        // Set user data
        setUser(userData);
        
        // Set detected OS for debugging
        setDetectedOS(detectedOS);

        // Choose applications source
        let appsForCalc: Application[] = [];
        if (BYPASS_DB_APPS) {
          // Bypass DB apps: use detected processes as applications (temporary)
          // const dbApplications = await invoke('get_my_applications') as Application[]; // original code
          type DetectedProcess = { name: string; process_name: string };
          const detected = await invoke<DetectedProcess[]>('get_running_processes');
          appsForCalc = detected.map((p, idx) => ({
            id: `detected-${idx}`,
            name: p.name || p.process_name,
            process_name: p.process_name,
            category: undefined,
            icon_path: undefined,
            is_tracked: true,
            user_id: 'local',
            created_at: undefined,
            updated_at: undefined,
            last_used: undefined,
          }));
        } else {
          // Use registered apps from DB
          const dbApplications = await invoke('get_my_applications') as Application[];
          appsForCalc = dbApplications;
        }

        // Set applications in local state
        setApplications(appsForCalc);

        // Update global cache
        updateCache({
          applications: appsForCalc,
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
        const aggregatedData = aggregateTimeByApplication(timeEntries, appsForCalc, selectedTimePeriod);
        setApplicationTimeData(aggregatedData);

        // Calculate category data for pie chart
        const categoryChartData = aggregateTimeByCategory(timeEntries, applications, selectedTimePeriod);
        setCategoryData(categoryChartData);

        // Calculate daily time data for bar chart
        const dailyTimeResult = aggregateDailyTimeByCategory(timeEntries, applications, selectedTimePeriod);
        if (Array.isArray(dailyTimeResult)) {
          setDailyTimeData([]);
          setChartCategories([]);
        } else {
          setDailyTimeData(dailyTimeResult.data);
          setChartCategories(dailyTimeResult.categories);
        }

        // Calculate most used app for the past week
        const mostUsedAppData = findMostUsedApp(timeEntries, appsForCalc);
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

  // Commented out old useEffects
  /*
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

  // Commented out old handler
  // const handleTimePeriodChange = (period: 'today' | 'week' | 'month') => {
  //   console.log('🔄 Time period changing from', selectedTimePeriod, 'to', period);
  //   setSelectedTimePeriod(period);
  // };

  const taskStats = getTaskStats();
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'short' });
  const month = now.toLocaleDateString('en-US', { month: 'long' });
  const day = now.getDate().toString().padStart(2, '0');
  const year = now.toLocaleDateString('en-US', { year: 'numeric' });
  const timeOfDay = getTimeOfDay();

  return (
    <div className="dashboard-container">
      <PageSourceBadge source="src/Dashboard.tsx" />
      <Sidebar 
        currentPage="dashboard" 
        onLogout={onLogout} 
        onPageChange={onPageChange} 
      />
      
      <div className="main-content">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div>Loading...</div>
          </div>
        ) : (
          <div className="dashboard-page-container">
            {/* Top Section - Overview and Stats */}
            <div className="dashboard-top-section">
              {/* Bento Box - Square box on the left */}
              <div className="bento-box-square">
                <div className="bento-box-content">
                  <div className="bento-date-header">
                    <div className="bento-day-of-week">{dayOfWeek}</div>
                    <div className="bento-date-container">
                      <div className="bento-month-date">
                        <span className="bento-month">{month}</span>
                        <span className="bento-day">{day}</span>
                      </div>
                      <div className="bento-year">{year}</div>
                    </div>
                  </div>
                  <div className="bento-greeting">
                    <span className="greeting-static">Good </span>
                    <span className="greeting-dynamic">{timeOfDay}</span>
                    <span className="greeting-static">, </span>
                    <span className="greeting-dynamic">{user?.name || 'User'}</span>
                    <span className="greeting-static">. You have </span>
                    <span className="greeting-dynamic">{taskStats.todayCount}</span>
                    <span className="greeting-dynamic"> {taskStats.todayCount === 1 ? 'task' : 'tasks'}</span>
                    <span className="greeting-static"> today, </span>
                    <span className="greeting-static">of them </span>
                    <span className="greeting-dynamic">{taskStats.highPriorityCount}</span>
                    <span className="greeting-dynamic"> high priority</span>
                    <span className="greeting-static">. </span>
                    {taskStats.closestDeadline ? (
                      <>
                        <span className="greeting-static">Your closest deadline is </span>
                        <span className="greeting-dynamic">{taskStats.closestDeadline}</span>
                        <span className="greeting-static">.</span>
                      </>
                    ) : (
                      <span className="greeting-static">No upcoming deadlines.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats Cards - Right side */}
              <div className="stats-cards-container">
                <div className="stats-grid">
                  {/* Current Activity Card */}
                  <div className="stat-card ios-card current-activity-card">
                    <div className="stat-header">
                      <h3>Current Activity</h3>
                      <span className="stat-period">
                        {currentActivity ? '' : 'idle'}
                      </span>
                    </div>
                    <div className="stat-main">
                      {currentActivity ? (
                        <div className="app-name">{currentActivity?.app_name || ''}</div>
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
                          <div className="app-time">
                            {formatDurationWithFullWords(currentActivity?.duration_hours || 0, (currentActivity?.duration_minutes || 0) % 60)}
                          </div>
                          <div className="apps-count">
                            {(currentActivity?.active_apps_count || 0) > 1 
                              ? `${currentActivity?.active_apps_count || 0} apps`
                              : ''
                            }
                          </div>
                        </div>
                      ) : (
                        'Enable app tracking'
                      )}
                    </div>
                  </div>

                  {/* Tasks Left Card */}
                  <div className="stat-card ios-card tasks-left-card">
                    <div className="stat-header">
                      <h3>Tasks Left</h3>
                      <span className="stat-period"></span>
                    </div>
                    <div className="stat-main">
                      <div className="circular-progress-container">
                        <CircularProgressbar
                          value={0}
                          strokeWidth={10}
                          styles={buildStyles({
                            pathColor: '#6c757d',
                            trailColor: '#E5E5E7',
                            pathTransitionDuration: 0.5,
                            strokeLinecap: 'round',
                          })}
                        />
                        <div className="progress-text">
                          <span className="progress-number">0</span>
                          <span className="progress-label">tasks</span>
                        </div>
                      </div>
                    </div>
                    <div className="stat-subtitle">
                    </div>
                  </div>
                  
                  {/* Tracked Today Card */}
                  <div className="stat-card ios-card tracked-today-card">
                    <div className="stat-header">
                      <h3>Tracked Today</h3>
                      <span className="stat-period"></span>
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

                  {/* Top Applications Card */}
                  <div className="top-apps-card">
                    <div className="bento-box-content">
                      <div className="stat-header" style={{ marginBottom: '16px' }}>
                        <h3 style={{ fontSize: 'var(--font-xl)', fontWeight: 600, color: 'var(--text)', margin: 0 }}>Top Applications</h3>
                        <span className="stat-period">{selectedTimePeriod}</span>
                      </div>
                      <div className="top-apps-table" key={`table-${selectedTimePeriod}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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

            {/* Charts Section - Below both */}
            <div className="charts-section">
              <div className="charts-header">
                <h2 className="section-title">Time Distribution</h2>
              </div>
              
              {/* App Category Breakdown and Month Calendar Section */}
              <div className="category-calendar-section">
                {/* Chart Card - Switches between Today (Pie) and Week (Bar) */}
                <div className="chart-card ios-card">
                  <div className="chart-header">
                    <h3>{selectedTimePeriod === 'today' ? 'App Category Breakdown' : 'Daily Distribution'}</h3>
                    <div className="chart-controls">
                      <button 
                        className={`chart-btn ${selectedTimePeriod === 'today' ? 'active' : ''}`}
                        onClick={() => setSelectedTimePeriod('today')}
                        title="Press 1 for Today"
                      >
                        Today <span className="hotkey">1</span>
                      </button>
                      <button 
                        className={`chart-btn ${selectedTimePeriod === 'week' ? 'active' : ''}`}
                        onClick={() => setSelectedTimePeriod('week')}
                        title="Press 2 for Week"
                      >
                        Week <span className="hotkey">2</span>
                      </button>
                    </div>
                  </div>
                  
                  {/* Today View - Pie Chart */}
                  {selectedTimePeriod === 'today' && (
                    <>
                      {loading ? (
                        <div className="chart-empty-state">
                          <span className="empty-text">Loading categories...</span>
                        </div>
                      ) : categoryData.length === 0 ? (
                        <div className="chart-empty-state">
                          <span className="empty-text">No category data</span>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            Track some applications to see category breakdown
                          </div>
                        </div>
                      ) : (
                        <div className="nivo-pie-container">
                          <ResponsivePie
                            key={`pie-${windowWidth}-${selectedTimePeriod}`}
                            data={categoryData}
                            margin={windowWidth > 768 ? 
                              { top: 20, right: 120, bottom: 20, left: 20 } : 
                              { top: 20, right: 20, bottom: 20, left: 20 }
                            }
                            innerRadius={windowWidth > 768 ? 0 : 0}
                            padAngle={windowWidth > 768 ? 0.7 : 0.5}
                            cornerRadius={windowWidth > 768 ? 3 : 2}
                            colors={['#5DADE2', '#48C9B0', '#52BE80', '#F4D03F', '#EB984E']}
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
                                {datum.value}% ({formatTimeWithFullWords(datum.data.hours || 0)})
                              </div>
                            )}
                          />
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Week View - Bar Chart */}
                  {selectedTimePeriod === 'week' && (
                    <>
                      {loading ? (
                        <div className="chart-empty-state">
                          <span className="empty-text">Loading daily data...</span>
                        </div>
                      ) : dailyTimeData.length === 0 || chartCategories.length === 0 ? (
                        <div className="chart-empty-state">
                          <span className="empty-text">No daily data</span>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            Track some applications to see daily breakdown
                          </div>
                        </div>
                      ) : (
                        <div className="nivo-container">
                          <ResponsiveBar
                            key={`bar-${windowWidth}-${selectedTimePeriod}`}
                            data={dailyTimeData}
                            keys={chartCategories.length > 0 ? chartCategories : ['uncategorized']}
                            indexBy="day"
                            margin={windowWidth > 768 ? 
                              { top: 20, right: 20, bottom: 40, left: 60 } : 
                              { top: 20, right: 10, bottom: 30, left: 50 }
                            }
                            padding={windowWidth > 768 ? 0.2 : 0.1}
                            colors={['#5DADE2', '#48C9B0', '#52BE80', '#F4D03F', '#EB984E']}
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
                                {String(id).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}: {value}h
                              </div>
                            )}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
                
                {/* Month Calendar */}
                <div className="month-calendar-header">
                  <MonthlyCalendar 
                    timeEntries={timeEntries.length > 0 ? timeEntries : (cache.timeEntries || [])}
                    applications={applications}
                    maxHoursPerDay={12}
                  />
                </div>
              </div>
              
            </div>

            {/* Commented out old content - removed to avoid parsing issues */}
            {false && (
            <div className="dashboard-page-container">
            <div className="dashboard-header">
              <h1>Welcome, {user?.name || 'User'}!</h1>
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
                OS Detection Debug Indicator
              </div>
            </div>
            
            {false && (
              <div className="error-message" style={{ 
                background: '#ffebee', 
                color: '#c62828', 
                padding: '12px 16px', 
                borderRadius: '8px', 
                margin: '16px 0' 
              }}>
                Error message
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
                        <div className="app-name">{currentActivity?.app_name || ''}</div>
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
                        <div className="app-category">{currentActivity?.app_category || ''}</div>
                        <div className="app-time">
                          {formatDurationWithFullWords(currentActivity?.duration_hours || 0, (currentActivity?.duration_minutes || 0) % 60)}
                        </div>
                        <div className="apps-count">
                          {(currentActivity?.active_apps_count || 0) > 1 
                            ? `${currentActivity?.active_apps_count || 0} apps active`
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
                          <div className="app-name">{mostUsedApp?.application || ''}</div>
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
                          <div className="app-time">{mostUsedApp?.time || ''}</div>
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
                    onClick={() => setSelectedTimePeriod('today')}
                    title="Press 1 for Today"
                  >
                    Today <span className="hotkey">1</span>
                  </button>
                  <button 
                    className={`chart-btn ${selectedTimePeriod === 'week' ? 'active' : ''}`}
                    onClick={() => setSelectedTimePeriod('week')}
                    title="Press 2 for Week"
                  >
                    Week <span className="hotkey">2</span>
                  </button>
                  <button 
                    className={`chart-btn ${selectedTimePeriod === 'month' ? 'active' : ''}`}
                    onClick={() => setSelectedTimePeriod('month')}
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
                  
                  {/* Monthly Calendar - Show for Month view only */}
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
                  
                  {/* Daily Time Distribution Chart - Show for Week view only */}
                  {selectedTimePeriod === 'week' && (
                    <div className="chart-card ios-card">
                      <div className="chart-header">
                        <h3>Daily Distribution</h3>
                        <span className="chart-period">{selectedTimePeriod}</span>
                      </div>
                      {loading ? (
                        <div className="chart-empty-state">
                          <span className="empty-text">Loading daily data...</span>
                        </div>
                      ) : dailyTimeData.length === 0 || chartCategories.length === 0 ? (
                        <div className="chart-empty-state">
                          <span className="empty-text">No daily data</span>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            Track some applications to see daily breakdown
                          </div>
                        </div>
                      ) : (
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
                            key={`bar-${windowWidth}-${selectedTimePeriod}`}
                            data={dailyTimeData}
                            keys={chartCategories.length > 0 ? chartCategories : ['uncategorized']}
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
                                {String(id).replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}: {value}h
                              </div>
                            )}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* App Category Breakdown Chart - Show for Today view only */}
                  {selectedTimePeriod === 'today' && (
                    <div className="chart-card ios-card">
                      <div className="chart-header">
                        <h3>App Category Breakdown</h3>
                        <span className="chart-period">{selectedTimePeriod}</span>
                      </div>
                      {loading ? (
                        <div className="chart-empty-state">
                          <span className="empty-text">Loading categories...</span>
                        </div>
                      ) : categoryData.length === 0 ? (
                        <div className="chart-empty-state">
                          <span className="empty-text">No category data</span>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            Track some applications to see category breakdown
                          </div>
                        </div>
                      ) : (
                        <div className="nivo-pie-container">
                          <ResponsivePie
                            key={`pie-${windowWidth}-${selectedTimePeriod}`}
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
                                {datum.value}% ({formatTimeWithFullWords(datum.data.hours || 0)})
                              </div>
                            )}
                          />
                        </div>
                      )}
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
        )}
      </div>
    </div>
  );
}

export default Dashboard;
