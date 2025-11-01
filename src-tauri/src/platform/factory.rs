use crate::database::Database;
use crate::platform::{PlatformTracker, OperatingSystem};
use crate::platform::windows_tracker::WindowsTracker;
use crate::platform::macos_tracker::MacOSTracker;

/// Factory for creating platform-specific trackers
pub struct TrackerFactory;

impl TrackerFactory {
    /// Create a platform-specific tracker based on the current OS
    pub fn create_tracker(db: Database) -> PlatformTracker {
        match crate::platform::detect_os() {
            OperatingSystem::Windows => {
                println!("Creating Windows tracker");
                PlatformTracker::Windows(WindowsTracker::new(db))
            },
            OperatingSystem::MacOS => {
                println!("Creating macOS tracker");
                PlatformTracker::MacOS(MacOSTracker::new(db))
            },
            OperatingSystem::Linux => {
                println!("Creating Windows tracker for Linux (fallback)");
                PlatformTracker::Windows(WindowsTracker::new(db))
            },
            OperatingSystem::Unknown => {
                println!("Unknown OS, using Windows tracker as fallback");
                PlatformTracker::Windows(WindowsTracker::new(db))
            },
        }
    }
    
    /// Create a tracker for a specific OS (useful for testing)
    pub fn create_tracker_for_os(db: Database, os: OperatingSystem) -> PlatformTracker {
        match os {
            OperatingSystem::Windows => {
                println!("Creating Windows tracker");
                PlatformTracker::Windows(WindowsTracker::new(db))
            },
            OperatingSystem::MacOS => {
                println!("Creating macOS tracker");
                PlatformTracker::MacOS(MacOSTracker::new(db))
            },
            OperatingSystem::Linux => {
                println!("Creating Windows tracker for Linux (fallback)");
                PlatformTracker::Windows(WindowsTracker::new(db))
            },
            OperatingSystem::Unknown => {
                println!("Unknown OS, using Windows tracker as fallback");
                PlatformTracker::Windows(WindowsTracker::new(db))
            },
        }
    }
}
