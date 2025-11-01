use crate::database::{Database, TimeEntry, Application};
// Use the currently logged-in user id managed by runtime state, not a hardcoded default
use crate::current_user::get_current_user_id;
use serde_json::json;

/// Database helper methods for platform trackers
pub struct DatabaseHelpers;

impl DatabaseHelpers {
    /// Get all active time entries for the current user
    pub async fn get_active_time_entries(db: &Database) -> Result<Vec<TimeEntry>, String> {
        let url = format!("{}/rest/v1/time_entries?user_id=eq.{}&is_active=eq.true", 
                         db.base_url, get_current_user_id());
        let response = db.client
            .get(&url)
            .header("apikey", &db.api_key)
            .header("Authorization", format!("Bearer {}", db.api_key))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch active time entries: {}", e))?;

        if response.status().is_success() {
            let entries: Vec<TimeEntry> = response.json().await
                .map_err(|e| format!("Failed to parse time entries: {}", e))?;
            Ok(entries)
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(format!("HTTP error {}: {}", status, error_text))
        }
    }

    /// Start a new time entry for an application
    pub async fn start_time_entry(db: &Database, app: &Application) -> Result<String, String> {
        // First check if there's already an active time entry for this app
        let existing_entry_url = format!("{}/rest/v1/time_entries?user_id=eq.{}&app_id=eq.{}&is_active=eq.true", 
                                       db.base_url, get_current_user_id(), app.id);
        let existing_response = db.client
            .get(&existing_entry_url)
            .header("apikey", &db.api_key)
            .header("Authorization", format!("Bearer {}", db.api_key))
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
            "user_id": get_current_user_id(),
            "app_id": app.id,
            "task_id": null,
            "start_time": chrono::Utc::now().to_rfc3339(),
            "end_time": null,
            "duration_seconds": null,
            "is_active": true,
            "created_at": chrono::Utc::now().to_rfc3339(),
            "updated_at": chrono::Utc::now().to_rfc3339()
        });

        let response = db
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

    /// End a time entry
    pub async fn end_time_entry(db: &Database, entry_id: String) -> Result<(), String> {
        // First, get the current time entry to access the start_time
        let get_url = format!("{}/rest/v1/time_entries?id=eq.{}", db.base_url, entry_id);
        let get_response = db.client
            .get(&get_url)
            .header("apikey", &db.api_key)
            .header("Authorization", format!("Bearer {}", db.api_key))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch time entry: {}", e))?;

        if !get_response.status().is_success() {
            let status = get_response.status();
            let error_text = get_response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("HTTP error {}: {}", status, error_text));
        }

        let time_entries: Vec<TimeEntry> = get_response.json().await
            .map_err(|e| format!("Failed to parse time entry: {}", e))?;
        
        let time_entry = time_entries.first()
            .ok_or("Time entry not found")?;

        let end_time = chrono::Utc::now();
        let start_time = time_entry.start_time;
        
        // Calculate duration in seconds
        let duration_seconds = (end_time - start_time).num_seconds();
        
        let update_data = json!({
            "end_time": end_time.to_rfc3339(),
            "duration_seconds": duration_seconds,
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

        if response.status().is_success() {
            println!("Successfully ended time entry {}", entry_id);
            Ok(())
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(format!("Failed to end time entry: HTTP {} - {}", status, error_text))
        }
    }

    /// Get tracked applications for the current user
    pub async fn get_tracked_applications(db: &Database) -> Result<Vec<Application>, String> {
        let url = format!("{}/rest/v1/applications?user_id=eq.{}&is_tracked=eq.true", 
                         db.base_url, get_current_user_id());
        let response = db.client
            .get(&url)
            .header("apikey", &db.api_key)
            .header("Authorization", format!("Bearer {}", db.api_key))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch tracked applications: {}", e))?;

        if response.status().is_success() {
            let apps: Vec<Application> = response.json().await
                .map_err(|e| format!("Failed to parse applications: {}", e))?;
            Ok(apps)
        } else {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            Err(format!("HTTP error {}: {}", status, error_text))
        }
    }
}


