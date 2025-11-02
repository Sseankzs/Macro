use crate::database::{Database, TimeEntry, Application};
use crate::tracking::cross_platform_tracker::CrossPlatformTracker;
use serde_json::json;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use sysinfo::System;
use tokio::time::interval;

#[cfg(target_os = "windows")]
use winapi::um::{
    winuser::{GetForegroundWindow, GetWindowThreadProcessId},
    tlhelp32::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS},
    handleapi::CloseHandle,
};

// Get the process name of the currently focused window on Windows
#[cfg(target_os = "windows")]
fn get_focused_window_process_name() -> Option<String> {
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

// Fallback for non-Windows platforms - return the most active process
#[cfg(not(target_os = "windows"))]
fn get_focused_window_process_name() -> Option<String> {
    get_most_active_process()
}

// Fallback method using CPU usage (kept as backup)
fn get_most_active_process() -> Option<String> {
    let mut system = System::new_all();
    system.refresh_all();
    
    let mut max_cpu = 0.0;
    let mut most_active_process = None;
    
    for (_pid, process) in system.processes() {
        let cpu_usage = process.cpu_usage();
        let process_name = process.name().to_string();
        
        // Skip system processes and find the most active user application
        if cpu_usage > 0.5 && cpu_usage > max_cpu && !is_system_process(&process_name) {
            max_cpu = cpu_usage;
            most_active_process = Some(process_name);
        }
    }
    
    most_active_process
}

fn is_system_process(name: &str) -> bool {
    let system_processes = [
        "dwm.exe", "winlogon.exe", "csrss.exe", "wininit.exe", 
        "services.exe", "lsass.exe", "svchost.exe", "explorer.exe",
        "System", "Registry", "smss.exe", "audiodg.exe", "conhost.exe"
    ];
    
    system_processes.iter().any(|&sys_proc| name.eq_ignore_ascii_case(sys_proc))
}

// Cross-platform tracker module
pub mod cross_platform_tracker;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CurrentActivity {
    pub app_name: String,
    pub app_category: String,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub duration_minutes: i64,
    pub duration_hours: i64,
    pub is_active: bool,
    pub active_apps_count: usize,
}

#[derive(Debug, Clone)]
pub struct TrackingState {
    pub current_focused_app: Option<String>, // process_name of currently focused app
    pub current_entry_id: Option<String>,    // entry_id of current tracking session
    pub last_activity_time: Instant,
    pub is_tracking: bool,
    pub last_focused_change: Instant,        // When focus last changed
    pub cached_current_activity: Option<CurrentActivity>, // Cached current activity
    pub cache_last_updated: Instant, // When the cache was last updated
}

impl Default for TrackingState {
    fn default() -> Self {
        Self {
            current_focused_app: None,
            current_entry_id: None,
            last_activity_time: Instant::now(),
            is_tracking: false,
            last_focused_change: Instant::now(),
            cached_current_activity: None,
            cache_last_updated: Instant::now(),
        }
    }
}

pub struct ActivityTracker {
    state: Arc<Mutex<TrackingState>>,
    db: Database,
}

impl ActivityTracker {
    pub fn new(db: Database) -> Self {
        Self {
            state: Arc::new(Mutex::new(TrackingState::default())),
            db,
        }
    }

    pub async fn start_tracking(&self) -> Result<(), String> {
        // Check if tracking is already running
        let already_tracking = {
            let state = self.state.lock().unwrap();
            state.is_tracking
        };
        
        if already_tracking {
            println!("Tracking is already running, skipping start");
            return Ok(());
        }
        
        // First, check for any existing active time entries and clean them up
        self.cleanup_existing_active_entries().await?;
        
        let mut state = self.state.lock().unwrap();
        state.is_tracking = true;
        state.last_activity_time = Instant::now();
        drop(state);

        // Start the tracking loop
        let state_clone = Arc::clone(&self.state);
        let db_clone = self.db.clone();
        
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(5)); // Check every 5 seconds
            loop {
                interval.tick().await;
                
                let should_continue = {
                    let state = state_clone.lock().unwrap();
                    state.is_tracking
                };
                
                if !should_continue {
                    break;
                }
                
                // Update activity tracking
                let tracker = ActivityTracker {
                    state: Arc::clone(&state_clone),
                    db: db_clone.clone(),
                };
                
                if let Err(e) = tracker.update_activity().await {
                    eprintln!("Error updating activity: {}", e);
                }
            }
        });

        Ok(())
    }

    pub async fn stop_tracking(&self) -> Result<(), String> {
        let entry_id_to_end = {
            let mut state = self.state.lock().unwrap();
            state.is_tracking = false;
            state.current_focused_app = None;
            state.cached_current_activity = None; // Clear cache when stopping tracking
            state.cache_last_updated = Instant::now();
            state.current_entry_id.take()
        };
        
        // End current active time entry if any
        if let Some(entry_id) = entry_id_to_end {
            let _ = Self::end_time_entry(&self.db, entry_id).await;
        }
        
        Ok(())
    }

    pub async fn update_activity(&self) -> Result<(), String> {
        // Get the currently focused window's process name
        let focused_process_name = get_focused_window_process_name();
        
        println!("🔍 Currently focused window process: {:?}", focused_process_name);
        
        // Get tracked applications from database
        let tracked_apps = self.get_tracked_applications().await?;
        
        // Find the tracked app that matches the focused process
        let focused_tracked_app = if let Some(process_name) = &focused_process_name {
            tracked_apps.iter().find(|app| app.process_name == *process_name)
        } else {
            None
        };
        
        let (should_start_new, should_end_current, new_app) = {
            let mut state = self.state.lock().unwrap();
            state.last_activity_time = Instant::now();
            
            let current_focused = &state.current_focused_app;
            let has_focus_changed = current_focused != &focused_process_name;
            
            if has_focus_changed {
                println!("🔄 Focus changed from {:?} to {:?}", current_focused, focused_process_name);
                state.last_focused_change = Instant::now();
                state.current_focused_app = focused_process_name.clone();
                
                // Invalidate cache on focus change
                state.cached_current_activity = None;
                state.cache_last_updated = Instant::now();
                
                let should_end = state.current_entry_id.is_some();
                let should_start = focused_tracked_app.is_some();
                
                (should_start, should_end, focused_tracked_app.cloned())
            } else {
                // No focus change, no action needed
                (false, false, None)
            }
        };
        
        // End current tracking if focus changed away from tracked app
        if should_end_current {
            if let Some(entry_id) = {
                let mut state = self.state.lock().unwrap();
                state.current_entry_id.take()
            } {
                println!("⏹️ Ending tracking for entry_id: {}", entry_id);
                let _ = Self::end_time_entry(&self.db, entry_id).await;
            }
        }
        
        // Start tracking new focused app if it's a tracked application
        if should_start_new {
            if let Some(app) = new_app {
                println!("▶️ Starting tracking for focused app: {}", app.name);
                match self.start_time_entry(&app).await {
                    Ok(entry_id) => {
                        let mut state = self.state.lock().unwrap();
                        state.current_entry_id = Some(entry_id.clone());
                        println!("✅ Started tracking for {} (entry_id: {})", app.name, entry_id);
                    }
                    Err(e) => {
                        eprintln!("❌ Failed to start time entry for {}: {}", app.name, e);
                    }
                }
            }
        }
        
        Ok(())
    }

    async fn get_running_processes(&self) -> Result<Vec<String>, String> {
        let mut system = System::new_all();
        system.refresh_all();
        
        let mut processes = Vec::new();
        for (_pid, process) in system.processes() {
            processes.push(process.name().to_string());
        }
        
        Ok(processes)
    }

    async fn is_app_running(&self, process_name: &str) -> bool {
        let running_processes = match self.get_running_processes().await {
            Ok(processes) => processes,
            Err(_) => return false,
        };
        
        // More robust matching - check if any running process matches the app's process name
        running_processes.iter().any(|process| {
            let process_lower = process.to_lowercase();
            let app_process_lower = process_name.to_lowercase();
            
            // Exact match or process contains the app name
            process_lower == app_process_lower || 
            process_lower.contains(&app_process_lower) ||
            app_process_lower.contains(&process_lower)
        })
    }

    async fn get_tracked_applications(&self) -> Result<Vec<Application>, String> {
        // If no user is logged in, return empty list (no tracking)
        let user_id = match crate::current_user::get_current_user_id() {
            Some(id) => id,
            None => return Ok(Vec::new())
        };
        
        let url = format!("{}/rest/v1/applications?user_id=eq.{}&is_tracked=eq.true", 
                         self.db.base_url, user_id);
        let response = self.db.client
            .get(&url)
            .header("apikey", &self.db.api_key)
            .header("Authorization", format!("Bearer {}", self.db.api_key))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch tracked applications: {}", e))?;

        if response.status().is_success() {
            let apps: Vec<Application> = response.json().await
                .map_err(|e| format!("Failed to parse applications: {}", e))?;
            Ok(apps)
        } else {
            Ok(Vec::new())
        }
    }

    async fn cleanup_existing_active_entries(&self) -> Result<(), String> {
        // If no user is logged in, skip cleanup
        let user_id = match crate::current_user::get_current_user_id() {
            Some(id) => id,
            None => return Ok(())
        };
        
        // Find any existing active time entries for this user
    let url = format!("{}/rest/v1/time_entries?user_id=eq.{}&is_active=eq.true", 
             self.db.base_url, user_id);
        let response = self.db.client
            .get(&url)
            .header("apikey", &self.db.api_key)
            .header("Authorization", format!("Bearer {}", self.db.api_key))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch active time entries: {}", e))?;

        if response.status().is_success() {
            let entries: Vec<TimeEntry> = response.json().await
                .map_err(|e| format!("Failed to parse time entries: {}", e))?;
            
            // End all existing active entries
            for entry in entries {
                let _ = Self::end_time_entry(&self.db, entry.id).await;
                println!("Cleaned up existing active entry for app_id: {:?}", entry.app_id);
            }
        }
        
        Ok(())
    }

    async fn start_time_entry(&self, app: &Application) -> Result<String, String> {
        // If no user is logged in, return error
        let user_id = match crate::current_user::get_current_user_id() {
            Some(id) => id,
            None => return Err("No user logged in".to_string())
        };
        
        // First check if there's already an active time entry for this app
    let existing_entry_url = format!("{}/rest/v1/time_entries?user_id=eq.{}&app_id=eq.{}&is_active=eq.true", 
                       self.db.base_url, user_id, app.id);
        let existing_response = self.db.client
            .get(&existing_entry_url)
            .header("apikey", &self.db.api_key)
            .header("Authorization", format!("Bearer {}", self.db.api_key))
            .send()
            .await
            .map_err(|e| format!("Failed to check existing time entries: {}", e))?;

        if existing_response.status().is_success() {
            let existing_entries: Vec<TimeEntry> = existing_response.json().await
                .map_err(|e| format!("Failed to parse existing time entries: {}", e))?;
            
            if let Some(existing_entry) = existing_entries.first() {
                println!("Found existing active time entry for {} (id: {}), reusing it", app.name, existing_entry.id);
                return Ok(existing_entry.id.clone());
            }
        }

        // No existing active entry found, create a new one
        let time_entry_data = json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "user_id": user_id,
            "app_id": app.id,
            "task_id": null,
            "start_time": chrono::Utc::now().to_rfc3339(),
            "end_time": null,
            "duration_seconds": null,
            "is_active": true,
            "created_at": chrono::Utc::now().to_rfc3339(),
            "updated_at": chrono::Utc::now().to_rfc3339()
        });

        let response = self.db
            .execute_query("time_entries", "POST", Some(time_entry_data))
            .await
            .map_err(|e| format!("Failed to create time entry: {}", e))?;

        // The response should be an array with the created record
        let created_entries: Vec<TimeEntry> = serde_json::from_value(response)
            .map_err(|e| format!("Failed to parse created time entry: {}", e))?;

        if let Some(created_entry) = created_entries.first() {
            println!("Created new time entry for {} (id: {})", app.name, created_entry.id);
            Ok(created_entry.id.clone())
        } else {
            Err("No time entry was created".to_string())
        }
    }

    async fn end_time_entry(db: &Database, entry_id: String) -> Result<(), String> {
        // First, get the current time entry to access the start_time
        let get_url = format!("{}/rest/v1/time_entries?id=eq.{}", db.base_url, entry_id);
        let get_response = db.client
            .get(&get_url)
            .header("apikey", &db.api_key)
            .header("Authorization", format!("Bearer {}", db.api_key))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch time entry: {}", e))?;

        if !get_response.status().is_success() {
            let status = get_response.status();
            let error_text = get_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("HTTP error {}: {}", status, error_text));
        }

        let time_entries: Vec<TimeEntry> = get_response.json().await
            .map_err(|e| format!("Failed to parse time entry: {}", e))?;
        
        let time_entry = time_entries.first()
            .ok_or("Time entry not found")?;

        let end_time = chrono::Utc::now();
        let start_time = time_entry.start_time;
        
        // Calculate duration in seconds
        let duration_seconds = (end_time - start_time).num_seconds();
        
        let update_data = json!({
            "end_time": end_time.to_rfc3339(),
            "duration_seconds": duration_seconds,
            "is_active": false,
            "updated_at": chrono::Utc::now().to_rfc3339()
        });

        let url = format!("{}/rest/v1/time_entries?id=eq.{}", db.base_url, entry_id);
        let response = db.client
            .patch(&url)
            .header("apikey", &db.api_key)
            .header("Authorization", format!("Bearer {}", db.api_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&update_data)
            .send()
            .await
            .map_err(|e| format!("Failed to update time entry: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("HTTP error {}: {}", status, error_text));
        }

        println!("Ended time entry {} with duration: {} seconds", entry_id, duration_seconds);
        Ok(())
    }

    pub async fn get_current_activity(&self) -> Result<Option<CurrentActivity>, String> {
        let (current_entry_id, cached_activity, cache_age) = {
            let state = self.state.lock().unwrap();
            let current_entry_id = state.current_entry_id.clone();
            let cached_activity = state.cached_current_activity.clone();
            let cache_age = state.cache_last_updated.elapsed();
            (current_entry_id, cached_activity, cache_age)
        };
        
        // If no current tracking, return None and clear cache
        if current_entry_id.is_none() {
            let mut state = self.state.lock().unwrap();
            state.cached_current_activity = None;
            state.cache_last_updated = Instant::now();
            return Ok(None);
        }
        
        // Check if we have a valid cached result (less than 2 seconds old)
        if let Some(cached) = cached_activity {
            if cache_age < Duration::from_secs(2) {
                // Return cached result with updated duration
                let now = chrono::Utc::now();
                let duration = now.signed_duration_since(cached.start_time);
                
                return Ok(Some(CurrentActivity {
                    app_name: cached.app_name,
                    app_category: cached.app_category,
                    start_time: cached.start_time,
                    duration_minutes: duration.num_minutes(),
                    duration_hours: duration.num_hours(),
                    is_active: cached.is_active,
                    active_apps_count: 1, // Always 1 since we track only focused app
                }));
            }
        }
        
        // Cache is stale or doesn't exist, fetch fresh data
        self.refresh_current_activity_cache().await
    }

    async fn refresh_current_activity_cache(&self) -> Result<Option<CurrentActivity>, String> {
        let current_entry_id = {
            let state = self.state.lock().unwrap();
            state.current_entry_id.clone()
        };
        
        if let Some(entry_id) = current_entry_id {
            // Get the time entry details
            let url = format!("{}/rest/v1/time_entries?id=eq.{}", self.db.base_url, entry_id);
            let response = self.db.client
                .get(&url)
                .header("apikey", &self.db.api_key)
                .header("Authorization", format!("Bearer {}", self.db.api_key))
                .send()
                .await
                .map_err(|e| format!("Failed to fetch time entry: {}", e))?;

            if response.status().is_success() {
                let entries: Vec<TimeEntry> = response.json().await
                    .map_err(|e| format!("Failed to parse time entry: {}", e))?;
                
                if let Some(entry) = entries.first() {
                    // Get app details if app_id exists
                    if let Some(app_id) = &entry.app_id {
                        let app_url = format!("{}/rest/v1/applications?id=eq.{}", self.db.base_url, app_id);
                        let app_response = self.db.client
                            .get(&app_url)
                            .header("apikey", &self.db.api_key)
                            .header("Authorization", format!("Bearer {}", self.db.api_key))
                            .send()
                            .await
                            .map_err(|e| format!("Failed to fetch application: {}", e))?;

                        if app_response.status().is_success() {
                            let apps: Vec<Application> = app_response.json().await
                                .map_err(|e| format!("Failed to parse application: {}", e))?;
                            
                            if let Some(app) = apps.first() {
                                let duration = chrono::Utc::now().signed_duration_since(entry.start_time);
                                let duration_minutes = duration.num_minutes();
                                let duration_hours = duration.num_hours();
                                
                                let activity = CurrentActivity {
                                    app_name: app.name.clone(),
                                    app_category: app.category.clone().unwrap_or_else(|| "Other".to_string()),
                                    start_time: entry.start_time,
                                    duration_minutes,
                                    duration_hours,
                                    is_active: entry.is_active,
                                    active_apps_count: 1, // Always 1 for focused tracking
                                };
                                
                                // Cache the result
                                {
                                    let mut state = self.state.lock().unwrap();
                                    state.cached_current_activity = Some(activity.clone());
                                    state.cache_last_updated = Instant::now();
                                }
                                
                                return Ok(Some(activity));
                            }
                        }
                    }
                }
            }
        }
        
        Ok(None)
    }

    pub async fn get_active_applications_count(&self) -> Result<usize, String> {
        let state = self.state.lock().unwrap();
        Ok(if state.current_entry_id.is_some() { 1 } else { 0 })
    }

    /// Stop tracking for a specific application by process name
    pub async fn stop_tracking_for_app(&self, process_name: &str) -> Result<(), String> {
        let should_stop = {
            let state = self.state.lock().unwrap();
            state.current_focused_app.as_ref() == Some(&process_name.to_string())
        };
        
        if should_stop {
            let entry_id_to_end = {
                let mut state = self.state.lock().unwrap();
                state.current_focused_app = None;
                state.current_entry_id.take()
            };
            
            if let Some(entry_id) = entry_id_to_end {
                println!("Stopping tracking for app: {} (entry_id: {})", process_name, entry_id);
                let _ = Self::end_time_entry(&self.db, entry_id).await;
            }
        }
        
        Ok(())
    }

    /// Stop tracking for a specific application by app ID
    pub async fn stop_tracking_for_app_by_id(&self, app_id: &str) -> Result<(), String> {
        // Find the process name for this app ID
        let process_name = {
            let url = format!("{}/rest/v1/applications?id=eq.{}", self.db.base_url, app_id);
            let response = self.db.client
                .get(&url)
                .header("apikey", &self.db.api_key)
                .header("Authorization", format!("Bearer {}", self.db.api_key))
                .send()
                .await
                .map_err(|e| format!("Failed to fetch application: {}", e))?;

            if response.status().is_success() {
                let apps: Vec<Application> = response.json().await
                    .map_err(|e| format!("Failed to parse application: {}", e))?;
                
                if let Some(app) = apps.first() {
                    Some(app.process_name.clone())
                } else {
                    None
                }
            } else {
                None
            }
        };

        if let Some(process_name) = process_name {
            self.stop_tracking_for_app(&process_name).await
        } else {
            println!("Could not find application with ID: {}", app_id);
            Ok(())
        }
    }
}

// Global tracker instance
static mut TRACKER: Option<CrossPlatformTracker> = None;

pub fn init_tracker(db: Database) {
    unsafe {
        TRACKER = Some(CrossPlatformTracker::new(db));
    }
}

pub fn get_tracker() -> Option<&'static CrossPlatformTracker> {
    unsafe {
        TRACKER.as_ref()
    }
}

// Tauri commands for the frontend
#[tauri::command]
pub async fn start_activity_tracking() -> Result<(), String> {
    if let Some(tracker) = get_tracker() {
        tracker.start_tracking().await
    } else {
        Err("Activity tracker not initialized".to_string())
    }
}

#[tauri::command]
pub async fn stop_activity_tracking() -> Result<(), String> {
    if let Some(tracker) = get_tracker() {
        tracker.stop_tracking().await
    } else {
        Err("Activity tracker not initialized".to_string())
    }
}

#[tauri::command]
pub async fn update_activity() -> Result<(), String> {
    if let Some(tracker) = get_tracker() {
        tracker.update_activity().await
    } else {
        Err("Activity tracker not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_current_activity() -> Result<Option<CurrentActivity>, String> {
    if let Some(tracker) = get_tracker() {
        tracker.get_current_activity().await
    } else {
        Err("Activity tracker not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_active_applications_count() -> Result<usize, String> {
    if let Some(tracker) = get_tracker() {
        tracker.get_active_applications_count().await
    } else {
        Err("Activity tracker not initialized".to_string())
    }
}

#[tauri::command]
pub async fn stop_tracking_for_app(process_name: String) -> Result<(), String> {
    if let Some(tracker) = get_tracker() {
        tracker.stop_tracking_for_app(&process_name).await
    } else {
        Err("Activity tracker not initialized".to_string())
    }
}

#[tauri::command]
pub async fn stop_tracking_for_app_by_id(app_id: String) -> Result<(), String> {
    if let Some(tracker) = get_tracker() {
        tracker.stop_tracking_for_app_by_id(&app_id).await
    } else {
        Err("Activity tracker not initialized".to_string())
    }
}

#[tauri::command]
pub async fn get_detected_os() -> Result<String, String> {
    let os = crate::platform::detect_os();
    Ok(format!("{:?}", os))
}
