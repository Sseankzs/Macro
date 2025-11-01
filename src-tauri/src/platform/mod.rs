use std::env;

pub mod tracking_trait;
pub mod windows_tracker;
pub mod macos_tracker;
pub mod factory;
pub mod database_helpers;

pub use tracking_trait::{PlatformTracker, BaseTracker};
pub use factory::TrackerFactory;

#[derive(Debug, Clone, PartialEq)]
pub enum OperatingSystem {
    Windows,
    MacOS,
    Linux,
    Unknown,
}

pub fn detect_os() -> OperatingSystem {
    match env::consts::OS {
        "windows" => OperatingSystem::Windows,
        "macos" => OperatingSystem::MacOS,
        "linux" => OperatingSystem::Linux,
        _ => OperatingSystem::Unknown,
    }
}

pub fn is_windows() -> bool {
    detect_os() == OperatingSystem::Windows
}

pub fn is_macos() -> bool {
    detect_os() == OperatingSystem::MacOS
}

pub fn is_linux() -> bool {
    detect_os() == OperatingSystem::Linux
}
