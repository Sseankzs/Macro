use crate::database::User;
use chrono::Utc;

// Hardcoded default user for development
pub fn get_default_user() -> User {
    User {
        id: "fdbc0903-26e4-4271-8a57-34217bd2cd45".to_string(), // Fixed UUID for consistency
        name: "Dev User".to_string(),
        email: Some("dev@example.com".to_string()),
        team_id: None,
        current_project_id: None,
        role: crate::database::UserRole::Owner,
        created_at: Some(Utc::now()),
        updated_at: Some(Utc::now()),
        image_url: None,
    }
}

// Helper function to get the default user ID
pub fn get_default_user_id() -> String {
    "fdbc0903-26e4-4271-8a57-34217bd2cd45".to_string()
}

