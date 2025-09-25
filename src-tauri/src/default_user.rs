use crate::database::User;
use chrono::Utc;

// Hardcoded default user for development
pub fn get_default_user() -> User {
    User {
        id: "550e8400-e29b-41d4-a716-446655440000".to_string(), // Fixed UUID for consistency
        name: "Dev User".to_string(),
        email: "dev@example.com".to_string(),
        team_id: None,
        current_project_id: None,
        role: crate::database::UserRole::Owner,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    }
}

// Helper function to get the default user ID
pub fn get_default_user_id() -> String {
    "550e8400-e29b-41d4-a716-446655440000".to_string()
}

// Helper function to check if a user ID matches the default user
pub fn is_default_user(user_id: &str) -> bool {
    user_id == get_default_user_id()
}
