use crate::database::Database;
use crate::platform::{BaseTracker, database_helpers::DatabaseHelpers};
use crate::tracking::CurrentActivity;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::time::interval;

// Ensure AppKit is linked for NSWorkspace usage on macOS
#[cfg(target_os = "macos")]
#[link(name = "AppKit", kind = "framework")]
extern "C" {}

pub struct MacOSTracker {
    base: BaseTracker,
    idle_threshold: Duration,
    last_activity_time: Instant,
    idle_start_time: Option<Instant>,
}

impl MacOSTracker {
    pub fn new(db: Database) -> Self {
        Self {
            base: BaseTracker::new(db),
            idle_threshold: Duration::from_secs(300), // 5 minutes default
            last_activity_time: Instant::now(),
            idle_start_time: None,
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

    #[cfg(target_os = "macos")]
    async fn get_frontmost_application(&self) -> Result<Option<(String, String)>, String> {
        // Use NSWorkspace.shared.frontmostApplication for accurate foreground app detection
        unsafe {
            use objc::{class, msg_send, sel, sel_impl};
            use objc::runtime::Object;
            use std::ffi::CStr;
            use std::os::raw::c_char;

            // Helper to fallback to a lightweight sysinfo heuristic without crashing
            fn fallback_frontmost() -> Option<(String, String)> {
                use sysinfo::System;
                let mut system = System::new_all();
                system.refresh_processes();
                let mut max_cpu = 0.0;
                let mut front: Option<String> = None;
                for (_, process) in system.processes() {
                    let cpu = process.cpu_usage();
                    if cpu > max_cpu {
                        max_cpu = cpu;
                        front = Some(process.name().to_string());
                    }
                }
                front.map(|n| (n, String::from("Unknown")))
            }

            let workspace: *mut Object = msg_send![class!(NSWorkspace), sharedWorkspace];
            if workspace.is_null() {
                return Ok(fallback_frontmost());
            }

            let app: *mut Object = msg_send![workspace, frontmostApplication];
            if app.is_null() {
                return Ok(fallback_frontmost());
            }

            // Get localizedName as UTF8 (guard nils before messaging)
            let name_nsstring: *mut Object = msg_send![app, localizedName];
            let name = if name_nsstring.is_null() {
                String::from("Unknown")
            } else {
                let name_ptr: *const c_char = msg_send![name_nsstring, UTF8String];
                if name_ptr.is_null() {
                    String::from("Unknown")
                } else {
                    CStr::from_ptr(name_ptr).to_string_lossy().into_owned()
                }
            };

            // Get bundleIdentifier as UTF8 (guard nils before messaging)
            let bundle_nsstring: *mut Object = msg_send![app, bundleIdentifier];
            let bundle = if bundle_nsstring.is_null() {
                String::from("Unknown")
            } else {
                let bundle_ptr: *const c_char = msg_send![bundle_nsstring, UTF8String];
                if bundle_ptr.is_null() {
                    String::from("Unknown")
                } else {
                    CStr::from_ptr(bundle_ptr).to_string_lossy().into_owned()
                }
            };

            if name == "Unknown" && bundle == "Unknown" {
                Ok(fallback_frontmost())
            } else {
                Ok(Some((name, bundle)))
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    async fn get_frontmost_application(&self) -> Result<Option<(String, String)>, String> {
        // Fallback for non-macOS systems
        Ok(None)
    }

    async fn categorize_app(&self, app_name: &str) -> String {
        let name_lower = app_name.to_lowercase();
        
        if name_lower.contains("chrome") || name_lower.contains("firefox") || name_lower.contains("safari") {
            "Browser".to_string()
        } else if name_lower.contains("code") || name_lower.contains("xcode") || name_lower.contains("terminal") {
            "Development".to_string()
        } else if name_lower.contains("pages") || name_lower.contains("numbers") || name_lower.contains("keynote") {
            "Productivity".to_string()
        } else if name_lower.contains("steam") || name_lower.contains("game") {
            "Gaming".to_string()
        } else if name_lower.contains("discord") || name_lower.contains("slack") || name_lower.contains("messages") {
            "Communication".to_string()
        } else {
            "Other".to_string()
        }
    }

    async fn check_for_idle(&self) -> bool {
        let now = Instant::now();
        let time_since_last_activity = now.duration_since(self.last_activity_time);
        
        time_since_last_activity >= self.idle_threshold
    }

    async fn handle_idle(&mut self) -> Result<(), String> {
        if self.idle_start_time.is_none() {
            self.idle_start_time = Some(self.last_activity_time);
        }
        Ok(())
    }

    async fn handle_idle_end(&mut self) -> Result<(), String> {
        self.idle_start_time = None;
        self.last_activity_time = Instant::now();
        Ok(())
    }

    async fn is_app_excluded(&self, bundle: &str) -> bool {
        // In a real implementation, this would check UserDefaults for excluded apps
        // For now, we'll exclude system apps
        let excluded_bundles = [
            "com.apple.finder",
            "com.apple.dock",
            "com.apple.menuextra.clock",
            "com.apple.systemuiserver",
        ];
        
        excluded_bundles.contains(&bundle)
    }
}

impl MacOSTracker {
    pub async fn start_tracking(&self) -> Result<(), String> {
        let already_tracking = {
            let state = self.base.state.lock().await;
            state.is_tracking
        };
        
        if already_tracking {
            println!("macOS tracking is already running, skipping start");
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
                let tracker = MacOSTracker {
                    base: BaseTracker {
                        state: Arc::clone(&state_clone),
                        db: db_clone.clone(),
                    },
                    idle_threshold: Duration::from_secs(300),
                    last_activity_time: Instant::now(),
                    idle_start_time: None,
                };
                
                if let Err(e) = tracker.update_activity().await {
                    eprintln!("Error updating macOS activity: {}", e);
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
        
        println!("Stopping macOS tracking");

        Ok(())
    }

    pub async fn update_activity(&self) -> Result<(), String> {
        // Get frontmost application
        if let Some((app_name, bundle_id)) = self.get_frontmost_application().await? {
            // Check if app is excluded
            if self.is_app_excluded(&bundle_id).await {
                return Ok(());
            }
            
            let app_category = self.categorize_app(&app_name).await;
            let start_time = chrono::Utc::now();
            
            // Check for idle state
            if self.check_for_idle().await {
                // Handle idle state
                return Ok(());
            }
            
            let mut state = self.base.state.lock().await;
            state.last_activity_time = Instant::now();
            
            // Get tracked applications from database
            let tracked_apps = DatabaseHelpers::get_tracked_applications(&self.base.db).await?;
            
            // Debug: log current app and tracked apps
            println!("🔍 Current app: '{}' (bundle: {})", app_name, bundle_id);
            println!("🔍 Tracked apps count: {}", tracked_apps.len());
            for app in &tracked_apps {
                println!("  - {} (process_name: {})", app.name, app.process_name);
            }
            
            // Check if the current app is in the tracked list
            // On macOS, process_name is typically the bundle identifier, so match against bundle_id
            // Also try matching by name as a fallback (helps with cross-platform apps)
            let app_is_tracked = tracked_apps.iter().any(|app| {
                // Primary match: bundle identifier to process_name (both are bundle IDs on macOS)
                let bundle_match = names_match(&app.process_name, &bundle_id);
                // Secondary match: app name to localized name (both are display names)
                let name_match = names_match(&app.name, &app_name);
                // Tertiary match: process_name to app_name (for edge cases where process_name might be name)
                let fallback_match = names_match(&app.process_name, &app_name);
                // Cross-platform match: try lenient name matching (helps with Windows->macOS migration)
                let cross_platform_match = app_name_likely_matches(&app.name, &app.process_name, &app_name, &bundle_id);
                
                let matches = bundle_match || name_match || fallback_match || cross_platform_match;
                if matches {
                    println!("✅ Matched app '{}' (process_name: {}) - bundle: {}, name: {}, fallback: {}, cross-platform: {}", 
                             app.name, app.process_name, bundle_match, name_match, fallback_match, cross_platform_match);
                }
                
                matches
            });
            
            // If app is not tracked, stop all active tracking
            if !app_is_tracked && !state.active_apps.is_empty() {
                println!("Current app '{}' (bundle: {}) is not in tracked list, stopping all active tracking", app_name, bundle_id);
                
                // End all active time entries
                let entry_ids_to_end: Vec<String> = state.active_apps.values().cloned().collect();
                state.active_apps.clear();
                
                for entry_id in &entry_ids_to_end {
                    let _ = DatabaseHelpers::end_time_entry(&self.base.db, entry_id.clone()).await;
                    println!("Ended time entry: {}", entry_id);
                }
            }
            
            // Only start/continue tracking if the current app is in the tracked list
            if app_is_tracked {
                // Find the tracked app that matches the current app
                // Try bundle ID first (most reliable), then name, then cross-platform matching
                let tracked_app = tracked_apps.iter().find(|app| {
                    names_match(&app.process_name, &bundle_id) || 
                    names_match(&app.name, &app_name) ||
                    app_name_likely_matches(&app.name, &app.process_name, &app_name, &bundle_id)
                });
                
                if let Some(tracked_app) = tracked_app {
                    // Check if we're already tracking this app
                    if let Some(_entry_id) = state.active_apps.get(&app_name) {
                        // Continue existing entry
                        // No need to do anything, entry continues
                    } else {
                        // Start new entry
                        match DatabaseHelpers::start_time_entry(&self.base.db, tracked_app).await {
                            Ok(entry_id) => {
                                state.active_apps.insert(app_name.clone(), entry_id.clone());
                                println!("Started tracking for {} (entry_id: {})", tracked_app.name, entry_id);
                            }
                            Err(e) => {
                                eprintln!("Failed to start time entry for {}: {}", tracked_app.name, e);
                            }
                        }
                    }
                }
            }
            
            // Update cache - show current app even if not tracked
            let app_name_clone = app_name.clone();
            state.cached_current_activity = Some(CurrentActivity {
                app_name,
                app_category,
                start_time,
                duration_minutes: 0,
                duration_hours: 0,
                is_active: state.active_apps.contains_key(&app_name_clone), // Only active if being tracked
                active_apps_count: state.active_apps.len(),
            });
            state.cache_last_updated = Instant::now();
        }
        
        Ok(())
    }

    pub async fn get_current_activity(&self) -> Result<Option<CurrentActivity>, String> {
        // Get current frontmost application directly
        if let Some((app_name, bundle_id)) = self.get_frontmost_application().await? {
            // Check if app is excluded
            if self.is_app_excluded(&bundle_id).await {
                return Ok(None);
            }
            
            let app_category = self.categorize_app(&app_name).await;
            let start_time = chrono::Utc::now();
            
            // Check if this app is being tracked in the database
            // Match against both app_name and bundle_id since active_apps might use either as key
            let state = self.base.state.lock().await;
            let is_being_tracked = state.active_apps.keys().any(|k| {
                names_match(k, &app_name) || names_match(k, &bundle_id)
            });
            let active_apps_count = state.active_apps.len();
            drop(state);
            
            Ok(Some(CurrentActivity {
                app_name,
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

// Helpers
fn normalize_name(name: &str) -> String {
    // Remove .exe, .app extensions and normalize
    name.trim()
        .trim_end_matches(".app")
        .trim_end_matches(".exe")
        .to_lowercase()
}

fn names_match(a: &str, b: &str) -> bool {
    let a_norm = normalize_name(a);
    let b_norm = normalize_name(b);
    a_norm == b_norm || a_norm.contains(&b_norm) || b_norm.contains(&a_norm)
}

// More lenient matching for cross-platform scenarios
// Tries to match app names even if process_name formats differ
fn app_name_likely_matches(app_name: &str, process_name: &str, detected_name: &str, detected_bundle: &str) -> bool {
    // Normalize all names
    let app_norm = normalize_name(app_name);
    let proc_norm = normalize_name(process_name);
    let detected_norm = normalize_name(detected_name);
    let bundle_norm = normalize_name(detected_bundle);
    
    // Try exact matches first
    if proc_norm == bundle_norm || proc_norm == detected_norm {
        return true;
    }
    
    // Try name matches (more lenient)
    if app_norm == detected_norm {
        return true;
    }
    
    // Try partial matches
    app_norm.contains(&detected_norm) || 
    detected_norm.contains(&app_norm) ||
    proc_norm.contains(&detected_norm) ||
    detected_norm.contains(&proc_norm)
}
