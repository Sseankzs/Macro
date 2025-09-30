import React, { createContext, useContext, useState, ReactNode } from 'react';

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

interface HoursData {
  today: number;
  yesterday: number;
  week: number;
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

interface DashboardCache {
  // Raw data cache
  timeEntries: TimeEntry[];
  applications: Application[];
  dataCacheTimestamp: number;
  
  // Calculated data cache
  hoursData: HoursData | null;
  hoursCacheTimestamp: number;
  
  // Table data cache
  applicationTimeData: AppTimeData[];
  mostUsedApp: AppTimeData | null;
  
  // Current activity cache
  currentActivity: CurrentActivity | null;
  currentActivityTimestamp: number;
  
  // Cache invalidation time (5 minutes)
  CACHE_INVALIDATION_TIME: number;
}

interface DashboardCacheContextType {
  cache: DashboardCache;
  updateCache: (updates: Partial<DashboardCache>) => void;
  isCacheValid: () => boolean;
  clearCache: () => void;
}

const initialCache: DashboardCache = {
  timeEntries: [],
  applications: [],
  dataCacheTimestamp: 0,
  hoursData: null,
  hoursCacheTimestamp: 0,
  applicationTimeData: [],
  mostUsedApp: null,
  currentActivity: null,
  currentActivityTimestamp: 0,
  CACHE_INVALIDATION_TIME: 5 * 60 * 1000, // 5 minutes
};

const DashboardCacheContext = createContext<DashboardCacheContextType | undefined>(undefined);

interface DashboardCacheProviderProps {
  children: ReactNode;
}

export function DashboardCacheProvider({ children }: DashboardCacheProviderProps) {
  const [cache, setCache] = useState<DashboardCache>(initialCache);

  const updateCache = (updates: Partial<DashboardCache>) => {
    setCache(prevCache => ({
      ...prevCache,
      ...updates,
    }));
  };

  const isCacheValid = () => {
    const now = Date.now();
    const cacheAge = now - cache.dataCacheTimestamp;
    return cacheAge < cache.CACHE_INVALIDATION_TIME;
  };

  const clearCache = () => {
    setCache(initialCache);
  };

  return (
    <DashboardCacheContext.Provider value={{
      cache,
      updateCache,
      isCacheValid,
      clearCache,
    }}>
      {children}
    </DashboardCacheContext.Provider>
  );
}

export function useDashboardCache() {
  const context = useContext(DashboardCacheContext);
  if (context === undefined) {
    throw new Error('useDashboardCache must be used within a DashboardCacheProvider');
  }
  return context;
}
