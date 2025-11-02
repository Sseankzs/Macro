use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

// Global state to store the current logged-in user ID
static CURRENT_USER_ID: Lazy<Arc<Mutex<Option<String>>>> = Lazy::new(|| {
    Arc::new(Mutex::new(None))
});

/// Set the current user ID after successful authentication
pub fn set_current_user_id(user_id: String) {
    if let Ok(mut current_id) = CURRENT_USER_ID.lock() {
        *current_id = Some(user_id.clone());
        log::info!("Current user ID set to: {}", user_id);
    } else {
        log::error!("Failed to set current user ID");
    }
}

/// Get the current user ID, returns None if no user is logged in
pub fn get_current_user_id() -> Option<String> {
    if let Ok(current_id) = CURRENT_USER_ID.lock() {
        if let Some(ref id) = *current_id {
            return Some(id.clone());
        }
    }
    
    // No fallback - return None if no user is logged in
    log::info!("No current user ID set - user needs to log in");
    None
}

/// Get the current user ID as a string, or return an error if no user is logged in
pub fn get_current_user_id_or_error() -> Result<String, String> {
    match get_current_user_id() {
        Some(id) => Ok(id),
        None => Err("No user is currently logged in".to_string()),
    }
}

/// Clear the current user ID (for logout)
pub fn clear_current_user_id() {
    if let Ok(mut current_id) = CURRENT_USER_ID.lock() {
        *current_id = None;
        log::info!("Current user ID cleared");
    } else {
        log::error!("Failed to clear current user ID");
    }
}

/// Check if a user is currently logged in
pub fn has_current_user() -> bool {
    if let Ok(current_id) = CURRENT_USER_ID.lock() {
        current_id.is_some()
    } else {
        false
    }
}