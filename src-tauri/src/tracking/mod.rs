use crate::database::{Database, TimeEntry, Application};
use crate::default_user::get_default_user_id;
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use sysinfo::System;
use tokio::time::interval;

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
    pub active_apps: HashMap<String, String>, // process_name -> entry_id
    pub last_activity_time: Instant,
    pub is_tracking: bool,
    pub app_last_seen: HashMap<String, Instant>, // process_name -> last time we saw it running
    pub cached_current_activity: Option<CurrentActivity>, // Cached current activity
    pub cache_last_updated: Instant, // When the cache was last updated
}

impl Default for TrackingState {
    fn default() -> Self {
        Self {
            active_apps: HashMap::new(),
            last_activity_time: Instant::now(),
            is_tracking: false,
            app_last_seen: HashMap::new(),
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
        let entry_ids_to_end = {
            let mut state = self.state.lock().unwrap();
            state.is_tracking = false;
            state.app_last_seen.clear();
            state.cached_current_activity = None; // Clear cache when stopping tracking
            state.cache_last_updated = Instant::now();
            state.active_apps.drain().map(|(_, entry_id)| entry_id).collect::<Vec<_>>()
        };
        
        // End all active time entries
        for entry_id in entry_ids_to_end {
            let _ = Self::end_time_entry(&self.db, entry_id).await;
        }
        
        Ok(())
    }

    pub async fn update_activity(&self) -> Result<(), String> {
        // Get tracked applications from database
        let tracked_apps = self.get_tracked_applications().await?;
        
        // Check which apps are running (outside of mutex lock)
        let mut app_status = Vec::new();
        for app in &tracked_apps {
            let is_running = self.is_app_running(&app.process_name).await;
            app_status.push((app.clone(), is_running));
        }
        
        let (apps_to_start, apps_to_end) = {
            let mut state = self.state.lock().unwrap();
            state.last_activity_time = Instant::now();
            
            let mut apps_to_start = Vec::new();
            let mut apps_to_end = Vec::new();
            let now = Instant::now();
            
            // Check each tracked app
            for (app, is_running) in app_status {
                let is_tracked = state.active_apps.contains_key(&app.process_name);
                
                // Update last seen time
                if is_running {
                    state.app_last_seen.insert(app.process_name.clone(), now);
                }
                
                if is_running && !is_tracked {
                    // App is running but not being tracked - start tracking
                    apps_to_start.push(app.clone());
                    println!("Detected {} is running, will start tracking", app.name);
                } else if !is_running && is_tracked {
                    // App is not running but was being tracked
                    // Only stop tracking if we haven't seen it for at least 5 seconds (reduced cooldown)
                    if let Some(last_seen) = state.app_last_seen.get(&app.process_name) {
                        if now.duration_since(*last_seen) > Duration::from_secs(5) {
                            if let Some(entry_id) = state.active_apps.remove(&app.process_name) {
                                apps_to_end.push(entry_id);
                                println!("Stopping tracking for {} (not seen for 5+ seconds)", app.name);
                            }
                        }
                    } else {
                        // If we never recorded seeing it, stop tracking immediately
                        if let Some(entry_id) = state.active_apps.remove(&app.process_name) {
                            apps_to_end.push(entry_id);
                            println!("Stopping tracking for {} (never seen)", app.name);
                        }
                    }
                }
            }
            
            (apps_to_start, apps_to_end)
        };
        
        // Check if we need to invalidate cache before consuming the vectors
        let should_invalidate_cache = !apps_to_start.is_empty() || !apps_to_end.is_empty();
        let apps_started_count = apps_to_start.len();
        let apps_stopped_count = apps_to_end.len();
        
        // End tracking for apps that are no longer running
        for entry_id in apps_to_end {
            let _ = Self::end_time_entry(&self.db, entry_id).await;
        }
        
        // Invalidate cache if any apps started or stopped tracking
        if should_invalidate_cache {
            let mut state = self.state.lock().unwrap();
            state.cached_current_activity = None;
            state.cache_last_updated = Instant::now();
            println!("Cache invalidated due to activity changes: {} started, {} stopped", apps_started_count, apps_stopped_count);
        }
        
        // Start tracking for new apps (only if not already being tracked)
        for app in apps_to_start {
            // Use a more robust check with atomic operations
            let should_start_tracking = {
                let mut state = self.state.lock().unwrap();
                if state.active_apps.contains_key(&app.process_name) {
                    false // Already being tracked
                } else {
                    // Mark as being tracked immediately to prevent race conditions
                    state.active_apps.insert(app.process_name.clone(), "pending".to_string());
                    true
                }
            };
            
            if should_start_tracking {
                match self.start_time_entry(&app).await {
                    Ok(entry_id) => {
                        let mut state = self.state.lock().unwrap();
                        state.active_apps.insert(app.process_name.clone(), entry_id.clone());
                        state.app_last_seen.insert(app.process_name.clone(), Instant::now());
                        println!("Started tracking for {} (entry_id: {})", app.name, entry_id);
                    }
                    Err(e) => {
                        // Remove the pending entry if creation failed
                        let mut state = self.state.lock().unwrap();
                        state.active_apps.remove(&app.process_name);
                        eprintln!("Failed to start time entry for {}: {}", app.name, e);
                    }
                }
            } else {
                println!("Skipping {} - already being tracked", app.name);
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
        let url = format!("{}/rest/v1/applications?user_id=eq.{}&is_tracked=eq.true", 
                         self.db.base_url, get_default_user_id());
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
        // Find any existing active time entries for this user
        let url = format!("{}/rest/v1/time_entries?user_id=eq.{}&is_active=eq.true", 
                         self.db.base_url, get_default_user_id());
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
        // First check if there's already an active time entry for this app
        let existing_entry_url = format!("{}/rest/v1/time_entries?user_id=eq.{}&app_id=eq.{}&is_active=eq.true", 
                                       self.db.base_url, get_default_user_id(), app.id);
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
            "user_id": get_default_user_id(),
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
        let end_time = chrono::Utc::now().to_rfc3339();
        
        let update_data = json!({
            "end_time": end_time,
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

        Ok(())
    }

    pub async fn get_current_activity(&self) -> Result<Option<CurrentActivity>, String> {
        let (active_apps, cached_activity, cache_age) = {
            let state = self.state.lock().unwrap();
            let active_apps = state.active_apps.clone();
            let cached_activity = state.cached_current_activity.clone();
            let cache_age = state.cache_last_updated.elapsed();
            (active_apps, cached_activity, cache_age)
        };
        
        // If no active apps, return None and clear cache
        if active_apps.is_empty() {
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
                    active_apps_count: active_apps.len(),
                }));
            }
        }
        
        // Cache is stale or doesn't exist, fetch fresh data
        self.refresh_current_activity_cache().await
    }

    async fn refresh_current_activity_cache(&self) -> Result<Option<CurrentActivity>, String> {
        let active_apps = {
            let state = self.state.lock().unwrap();
            state.active_apps.clone()
        };
        
        if active_apps.is_empty() {
            return Ok(None);
        }
        
        // Get the first active app (we can enhance this to show the most recently active)
        if let Some((_process_name, entry_id)) = active_apps.iter().next() {
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
                    // Get app details
                    let app_url = format!("{}/rest/v1/applications?id=eq.{}", self.db.base_url, entry.app_id.as_ref().unwrap());
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
                                active_apps_count: active_apps.len(),
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
        
        Ok(None)
    }

    pub async fn get_active_applications_count(&self) -> Result<usize, String> {
        let state = self.state.lock().unwrap();
        Ok(state.active_apps.len())
    }

    /// Stop tracking for a specific application by process name
    pub async fn stop_tracking_for_app(&self, process_name: &str) -> Result<(), String> {
        let entry_id_to_end = {
            let mut state = self.state.lock().unwrap();
            state.active_apps.remove(process_name)
        };
        
        if let Some(entry_id) = entry_id_to_end {
            println!("Stopping tracking for app: {} (entry_id: {})", process_name, entry_id);
            let _ = Self::end_time_entry(&self.db, entry_id).await;
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
static mut TRACKER: Option<ActivityTracker> = None;

pub fn init_tracker(db: Database) {
    unsafe {
        TRACKER = Some(ActivityTracker::new(db));
    }
}

pub fn get_tracker() -> Option<&'static ActivityTracker> {
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