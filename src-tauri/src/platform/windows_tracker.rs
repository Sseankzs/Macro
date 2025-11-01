use crate::database::Database;
use crate::platform::{BaseTracker, database_helpers::DatabaseHelpers};
use crate::tracking::CurrentActivity;
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::System;
use tokio::time::interval;

pub struct WindowsTracker {
    base: BaseTracker,
    system: System,
}

impl WindowsTracker {
    pub fn new(db: Database) -> Self {
        let mut system = System::new_all();
        system.refresh_all();
        
        Self {
            base: BaseTracker::new(db),
            system,
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
        let mut system = System::new_all();
        system.refresh_processes();
        
        let mut active_processes = Vec::new();
        for (_, process) in system.processes() {
            if process.cpu_usage() > 0.0 {
                let name = process.name();
                active_processes.push(name.to_string());
            }
        }
        
        Ok(active_processes)
    }

    async fn get_foreground_process(&self) -> Result<Option<String>, String> {
        // For Windows, we'll use the process with highest CPU usage as a proxy for foreground
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
                    system: System::new_all(),
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
        let active_processes = self.get_active_processes().await?;
        let foreground_process = self.get_foreground_process().await?;
        
        let mut state = self.base.state.lock().await;
        state.last_activity_time = Instant::now();
        
        // Update app_last_seen for all active processes
        for process_name in &active_processes {
            state.app_last_seen.insert(process_name.clone(), Instant::now());
        }
        
        // Remove processes that are no longer active
        let current_time = Instant::now();
        state.app_last_seen.retain(|_, last_seen| {
            current_time.duration_since(*last_seen) < Duration::from_secs(30)
        });
        
        // Get tracked applications from database
        let tracked_apps = DatabaseHelpers::get_tracked_applications(&self.base.db).await?;
        
        // Check which tracked apps are currently running
        let mut apps_started_count = 0;
        let mut apps_stopped_count = 0;
        let mut should_invalidate_cache = false;
        
        for app in &tracked_apps {
            let is_running = active_processes.contains(&app.process_name);
            let was_tracked = state.active_apps.contains_key(&app.process_name);
            
            if is_running && !was_tracked {
                // App started - create time entry
                match DatabaseHelpers::start_time_entry(&self.base.db, app).await {
                    Ok(entry_id) => {
                        state.active_apps.insert(app.process_name.clone(), entry_id.clone());
                        state.app_last_seen.insert(app.process_name.clone(), Instant::now());
                        apps_started_count += 1;
                        should_invalidate_cache = true;
                        println!("Started tracking for {} (entry_id: {})", app.name, entry_id);
                    }
                    Err(e) => {
                        eprintln!("Failed to start time entry for {}: {}", app.name, e);
                    }
                }
            } else if !is_running && was_tracked {
                // App stopped - end time entry
                if let Some(entry_id) = state.active_apps.remove(&app.process_name) {
                    let entry_id_clone = entry_id.clone();
                    let _ = DatabaseHelpers::end_time_entry(&self.base.db, entry_id).await;
                    state.app_last_seen.remove(&app.process_name);
                    apps_stopped_count += 1;
                    should_invalidate_cache = true;
                    println!("Stopped tracking for {} (entry_id: {})", app.name, entry_id_clone);
                }
            }
        }
        
        // Clean up any active entries for apps that are no longer running
        let mut entries_to_end = Vec::new();
        for (process_name, entry_id) in &state.active_apps {
            if !active_processes.contains(process_name) {
                entries_to_end.push(entry_id.clone());
            }
        }
        
        for entry_id in entries_to_end {
            let _ = DatabaseHelpers::end_time_entry(&self.base.db, entry_id).await;
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
