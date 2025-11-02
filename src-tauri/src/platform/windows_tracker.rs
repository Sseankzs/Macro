use crate::database::Database;
use crate::platform::{BaseTracker, database_helpers::DatabaseHelpers};
use crate::tracking::CurrentActivity;
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::System;
use tokio::time::interval;

#[cfg(target_os = "windows")]
use winapi::um::{
    winuser::{GetForegroundWindow, GetWindowThreadProcessId},
    tlhelp32::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS},
    handleapi::CloseHandle,
};

pub struct WindowsTracker {
    base: BaseTracker,
}

impl WindowsTracker {
    pub fn new(db: Database) -> Self {
        Self {
            base: BaseTracker::new(db),
        }
    }

    async fn cleanup_existing_active_entries(&self) -> Result<(), String> {
        // Get all active time entries and end them
        let active_entries = DatabaseHelpers::get_active_time_entries(&self.base.db).await?;
        
        for entry in active_entries {
            let _ = DatabaseHelpers::end_time_entry(&self.base.db, entry.id).await;
            println!("Cleaned up existing active entry for app_id: {:?}", entry.app_id);
        }
        
        Ok(())
    }

    async fn get_active_processes(&self) -> Result<Vec<String>, String> {
        // Get all running processes, not just those with CPU usage
        let mut system = System::new_all();
        system.refresh_processes();
        
        let mut running_processes = Vec::new();
        for (_, process) in system.processes() {
            let name = process.name();
            running_processes.push(name.to_string());
        }
        
        Ok(running_processes)
    }

    async fn get_foreground_process(&self) -> Result<Option<String>, String> {
        #[cfg(target_os = "windows")]
        {
            Ok(self.get_focused_window_process_name())
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            // Fallback for non-Windows platforms - use CPU usage method
            let mut system = System::new_all();
            system.refresh_processes();
            
            let mut max_cpu = 0.0;
            let mut foreground_process = None;
            
            for (_, process) in system.processes() {
                let cpu_usage = process.cpu_usage();
                if cpu_usage > max_cpu {
                    max_cpu = cpu_usage;
                    let name = process.name();
                    foreground_process = Some(name.to_string());
                }
            }
            
            Ok(foreground_process)
        }
    }

    #[cfg(target_os = "windows")]
    fn get_focused_window_process_name(&self) -> Option<String> {
        unsafe {
            // Get the handle of the currently focused window
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return None;
            }

            // Get the process ID of the window
            let mut process_id: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut process_id as *mut u32);
            
            if process_id == 0 {
                return None;
            }

            // Create a snapshot of all processes
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snapshot == winapi::um::handleapi::INVALID_HANDLE_VALUE {
                return None;
            }

            let mut process_entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                cntUsage: 0,
                th32ProcessID: 0,
                th32DefaultHeapID: 0,
                th32ModuleID: 0,
                cntThreads: 0,
                th32ParentProcessID: 0,
                pcPriClassBase: 0,
                dwFlags: 0,
                szExeFile: [0; 260],
            };

            // Find the process with the matching PID
            if Process32FirstW(snapshot, &mut process_entry) != 0 {
                loop {
                    if process_entry.th32ProcessID == process_id {
                        // Convert the process name from wide string to String
                        let process_name = String::from_utf16_lossy(&process_entry.szExeFile)
                            .trim_end_matches('\0')
                            .to_string();
                        CloseHandle(snapshot);
                        return Some(process_name);
                    }
                    
                    if Process32NextW(snapshot, &mut process_entry) == 0 {
                        break;
                    }
                }
            }
            
            CloseHandle(snapshot);
            None
        }
    }

    async fn categorize_app(&self, app_name: &str) -> String {
        // Simple categorization based on app name
        let name_lower = app_name.to_lowercase();
        
        if name_lower.contains("chrome") || name_lower.contains("firefox") || name_lower.contains("edge") || name_lower.contains("safari") {
            "Browser".to_string()
        } else if name_lower.contains("code") || name_lower.contains("studio") || name_lower.contains("vim") || name_lower.contains("emacs") {
            "Development".to_string()
        } else if name_lower.contains("word") || name_lower.contains("excel") || name_lower.contains("powerpoint") || name_lower.contains("notion") {
            "Productivity".to_string()
        } else if name_lower.contains("game") || name_lower.contains("steam") || name_lower.contains("epic") {
            "Gaming".to_string()
        } else if name_lower.contains("discord") || name_lower.contains("slack") || name_lower.contains("teams") {
            "Communication".to_string()
        } else {
            "Other".to_string()
        }
    }
}

impl WindowsTracker {
    pub async fn start_tracking(&self) -> Result<(), String> {
        let already_tracking = {
            let state = self.base.state.lock().await;
            state.is_tracking
        };
        
        if already_tracking {
            println!("Windows tracking is already running, skipping start");
            return Ok(());
        }
        
        // Clean up existing active entries
        self.cleanup_existing_active_entries().await?;
        
        let mut state = self.base.state.lock().await;
        state.is_tracking = true;
        state.last_activity_time = Instant::now();
        drop(state);

        // Start the tracking loop
        let state_clone = Arc::clone(&self.base.state);
        let db_clone = self.base.db.clone();
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(5)); // Check every 5 seconds
            loop {
                interval.tick().await;
                
                let should_continue = {
                    let state = state_clone.lock().await;
                    state.is_tracking
                };
                
                if !should_continue {
                    break;
                }
                
                // Update activity tracking
                let tracker = WindowsTracker {
                    base: BaseTracker {
                        state: Arc::clone(&state_clone),
                        db: db_clone.clone(),
                    },
                };
                
                if let Err(e) = tracker.update_activity().await {
                    eprintln!("Error updating Windows activity: {}", e);
                }
            }
        });

        Ok(())
    }

    pub async fn stop_tracking(&self) -> Result<(), String> {
        let mut state = self.base.state.lock().await;
        state.is_tracking = false;
        
        // End all active time entries
        let entry_ids_to_end: Vec<String> = state.active_apps.values().cloned().collect();
        drop(state);
        
        for entry_id in entry_ids_to_end {
            let _ = DatabaseHelpers::end_time_entry(&self.base.db, entry_id).await;
        }
        
        println!("Stopping Windows tracking");

        Ok(())
    }

    pub async fn update_activity(&self) -> Result<(), String> {
        let foreground_process = self.get_foreground_process().await?;
        
        let mut state = self.base.state.lock().await;
        state.last_activity_time = Instant::now();
        
        // Get tracked applications from database
        let tracked_apps = DatabaseHelpers::get_tracked_applications(&self.base.db).await?;
        
        // Initialize counters
        let mut apps_started_count = 0;
        let mut apps_stopped_count = 0;
        let mut should_invalidate_cache = false;
        
        // Check if the current foreground app is in the tracked list
        let foreground_is_tracked = if let Some(ref fg_process) = foreground_process {
            tracked_apps.iter().any(|app| app.process_name == *fg_process)
        } else {
            false
        };
        
        // If foreground app is not tracked, stop all active tracking
        if !foreground_is_tracked && !state.active_apps.is_empty() {
            println!("Foreground app '{}' is not in tracked list, stopping all active tracking", 
                     foreground_process.as_deref().unwrap_or("None"));
            
            // End all active time entries
            let entry_ids_to_end: Vec<String> = state.active_apps.values().cloned().collect();
            let stopped_count = entry_ids_to_end.len();
            state.active_apps.clear();
            
            for entry_id in &entry_ids_to_end {
                let _ = DatabaseHelpers::end_time_entry(&self.base.db, entry_id.clone()).await;
                println!("Ended time entry: {}", entry_id);
            }
            
            should_invalidate_cache = true;
            apps_stopped_count += stopped_count;
        }
        
        // If foreground app is tracked, ensure it's being tracked
        if foreground_is_tracked {
            if let Some(ref fg_process) = foreground_process {
                if let Some(tracked_app) = tracked_apps.iter().find(|app| app.process_name == *fg_process) {
                    let was_tracked = state.active_apps.contains_key(&tracked_app.process_name);
                    
                    if !was_tracked {
                        // Foreground app is tracked but not currently being tracked - start tracking
                        match DatabaseHelpers::start_time_entry(&self.base.db, tracked_app).await {
                            Ok(entry_id) => {
                                state.active_apps.insert(tracked_app.process_name.clone(), entry_id.clone());
                                state.app_last_seen.insert(tracked_app.process_name.clone(), Instant::now());
                                apps_started_count += 1;
                                should_invalidate_cache = true;
                                println!("Started tracking for {} (entry_id: {})", tracked_app.name, entry_id);
                            }
                            Err(e) => {
                                eprintln!("Failed to start time entry for {}: {}", tracked_app.name, e);
                            }
                        }
                    }
                    // If already tracking, continue tracking (no action needed)
                }
            }
        }
        
        // Invalidate cache if any apps started or stopped tracking
        if should_invalidate_cache {
            state.cached_current_activity = None;
            state.cache_last_updated = Instant::now();
            println!("Cache invalidated due to activity changes: {} started, {} stopped", apps_started_count, apps_stopped_count);
        }
        
        // Update cache - show current foreground app regardless of database tracking
        if let Some(foreground) = foreground_process {
            let app_category = self.categorize_app(&foreground).await;
            let start_time = chrono::Utc::now();
            
            // Check if this app is being tracked in the database
            let is_being_tracked = state.active_apps.contains_key(&foreground);
            
            state.cached_current_activity = Some(CurrentActivity {
                app_name: foreground,
                app_category,
                start_time,
                duration_minutes: 0,
                duration_hours: 0,
                is_active: is_being_tracked, // Only active if being tracked in database
                active_apps_count: state.active_apps.len(), // Count of tracked apps
            });
            state.cache_last_updated = Instant::now();
        } else {
            // No foreground process, clear cache
            state.cached_current_activity = None;
            state.cache_last_updated = Instant::now();
        }
        
        Ok(())
    }

    pub async fn get_current_activity(&self) -> Result<Option<CurrentActivity>, String> {
        // Get current foreground process directly
        let foreground_process = self.get_foreground_process().await?;
        
        if let Some(foreground) = foreground_process {
            let app_category = self.categorize_app(&foreground).await;
            let start_time = chrono::Utc::now();
            
            // Check if this app is being tracked in the database
            let state = self.base.state.lock().await;
            let is_being_tracked = state.active_apps.contains_key(&foreground);
            let active_apps_count = state.active_apps.len();
            drop(state);
            
            Ok(Some(CurrentActivity {
                app_name: foreground,
                app_category,
                start_time,
                duration_minutes: 0,
                duration_hours: 0,
                is_active: is_being_tracked,
                active_apps_count,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn get_active_applications_count(&self) -> Result<usize, String> {
        let state = self.base.state.lock().await;
        Ok(state.active_apps.len())
    }

    pub async fn stop_tracking_for_app(&self, process_name: &str) -> Result<(), String> {
        let mut state = self.base.state.lock().await;
        
        if let Some(_entry_id) = state.active_apps.remove(process_name) {
            // For now, we'll just remove from tracking without database operations
            println!("Stopped tracking for app: {}", process_name);
        }
        
        Ok(())
    }

    pub async fn stop_tracking_for_app_by_id(&self, app_id: &str) -> Result<(), String> {
        // For now, we'll skip database operations
        println!("Stopped tracking for app ID: {}", app_id);
        Ok(())
    }

    pub async fn is_tracking(&self) -> bool {
        let state = self.base.state.lock().await;
        state.is_tracking
    }
}
