use crate::database::Database;
use crate::tracking::CurrentActivity;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;

/// Platform-specific tracker implementations
pub enum PlatformTracker {
    Windows(crate::platform::windows_tracker::WindowsTracker),
    MacOS(crate::platform::macos_tracker::MacOSTracker),
}

impl PlatformTracker {
    /// Start tracking activity on this platform
    pub async fn start_tracking(&self) -> Result<(), String> {
        match self {
            PlatformTracker::Windows(tracker) => tracker.start_tracking().await,
            PlatformTracker::MacOS(tracker) => tracker.start_tracking().await,
        }
    }
    
    /// Stop tracking activity on this platform
    pub async fn stop_tracking(&self) -> Result<(), String> {
        match self {
            PlatformTracker::Windows(tracker) => tracker.stop_tracking().await,
            PlatformTracker::MacOS(tracker) => tracker.stop_tracking().await,
        }
    }
    
    /// Update activity tracking (called periodically)
    pub async fn update_activity(&self) -> Result<(), String> {
        match self {
            PlatformTracker::Windows(tracker) => tracker.update_activity().await,
            PlatformTracker::MacOS(tracker) => tracker.update_activity().await,
        }
    }
    
    /// Get current activity information
    pub async fn get_current_activity(&self) -> Result<Option<CurrentActivity>, String> {
        match self {
            PlatformTracker::Windows(tracker) => tracker.get_current_activity().await,
            PlatformTracker::MacOS(tracker) => tracker.get_current_activity().await,
        }
    }
    
    /// Get count of active applications
    pub async fn get_active_applications_count(&self) -> Result<usize, String> {
        match self {
            PlatformTracker::Windows(tracker) => tracker.get_active_applications_count().await,
            PlatformTracker::MacOS(tracker) => tracker.get_active_applications_count().await,
        }
    }
    
    /// Stop tracking for a specific app by process name
    pub async fn stop_tracking_for_app(&self, process_name: &str) -> Result<(), String> {
        match self {
            PlatformTracker::Windows(tracker) => tracker.stop_tracking_for_app(process_name).await,
            PlatformTracker::MacOS(tracker) => tracker.stop_tracking_for_app(process_name).await,
        }
    }
    
    /// Stop tracking for a specific app by ID
    pub async fn stop_tracking_for_app_by_id(&self, app_id: &str) -> Result<(), String> {
        match self {
            PlatformTracker::Windows(tracker) => tracker.stop_tracking_for_app_by_id(app_id).await,
            PlatformTracker::MacOS(tracker) => tracker.stop_tracking_for_app_by_id(app_id).await,
        }
    }
    
    /// Check if tracking is currently active
    pub async fn is_tracking(&self) -> bool {
        match self {
            PlatformTracker::Windows(tracker) => tracker.is_tracking().await,
            PlatformTracker::MacOS(tracker) => tracker.is_tracking().await,
        }
    }
}

/// Shared state for platform trackers
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

/// Base struct for platform trackers
pub struct BaseTracker {
    pub state: Arc<Mutex<TrackingState>>,
    pub db: Database,
}

impl BaseTracker {
    pub fn new(db: Database) -> Self {
        Self {
            state: Arc::new(Mutex::new(TrackingState::default())),
            db,
        }
    }
}
