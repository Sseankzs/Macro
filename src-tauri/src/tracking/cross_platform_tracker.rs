use crate::database::Database;
use crate::platform::{PlatformTracker, TrackerFactory};
use crate::tracking::CurrentActivity;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Cross-platform activity tracker that delegates to platform-specific implementations
pub struct CrossPlatformTracker {
    platform_tracker: Arc<Mutex<PlatformTracker>>,
}

impl CrossPlatformTracker {
    pub fn new(db: Database) -> Self {
        let platform_tracker = TrackerFactory::create_tracker(db);
        
        Self {
            platform_tracker: Arc::new(Mutex::new(platform_tracker)),
        }
    }

    pub async fn start_tracking(&self) -> Result<(), String> {
        let tracker = self.platform_tracker.lock().await;
        tracker.start_tracking().await
    }

    pub async fn stop_tracking(&self) -> Result<(), String> {
        let tracker = self.platform_tracker.lock().await;
        tracker.stop_tracking().await
    }

    pub async fn update_activity(&self) -> Result<(), String> {
        let tracker = self.platform_tracker.lock().await;
        tracker.update_activity().await
    }

    pub async fn get_current_activity(&self) -> Result<Option<CurrentActivity>, String> {
        let tracker = self.platform_tracker.lock().await;
        tracker.get_current_activity().await
    }

    pub async fn get_active_applications_count(&self) -> Result<usize, String> {
        let tracker = self.platform_tracker.lock().await;
        tracker.get_active_applications_count().await
    }

    pub async fn stop_tracking_for_app(&self, process_name: &str) -> Result<(), String> {
        let tracker = self.platform_tracker.lock().await;
        tracker.stop_tracking_for_app(process_name).await
    }

    pub async fn stop_tracking_for_app_by_id(&self, app_id: &str) -> Result<(), String> {
        let tracker = self.platform_tracker.lock().await;
        tracker.stop_tracking_for_app_by_id(app_id).await
    }

    pub async fn is_tracking(&self) -> bool {
        let tracker = self.platform_tracker.lock().await;
        tracker.is_tracking().await
    }
}
