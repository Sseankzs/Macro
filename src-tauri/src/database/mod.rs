use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use reqwest::Client;

#[derive(Clone)]
pub struct Database {
    pub client: Arc<Client>,
    pub base_url: String,
    pub api_key: String,
}

impl Database {
    pub fn new(url: String, key: String) -> Result<Self> {
        let client = Client::new();
        Ok(Self {
            client: Arc::new(client),
            base_url: url,
            api_key: key,
        })
    }

    pub async fn test_connection(&self) -> Result<bool> {
        // Test the connection by making a simple request
        let url = format!("{}/rest/v1/", self.base_url);
        log::info!("Testing connection to: {}", url);
        log::info!("Using API key: {}...", &self.api_key[..std::cmp::min(10, self.api_key.len())]);
        
        let response = self.client
            .get(&url)
            .header("apikey", &self.api_key)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await;

        match response {
            Ok(resp) => {
                let status = resp.status();
                log::info!("Connection test response status: {}", status);
                if status.is_success() {
                    log::info!("Database connection successful");
                    Ok(true)
                } else {
                    let error_text = resp.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                    log::error!("Database connection failed with status {}: {}", status, error_text);
                    Ok(false)
                }
            },
            Err(e) => {
                log::error!("Database connection error: {}", e);
                Ok(false)
            },
        }
    }

    pub async fn execute_query(&self, table: &str, method: &str, data: Option<serde_json::Value>) -> Result<serde_json::Value> {
        let url = format!("{}/rest/v1/{}", self.base_url, table);
        
        let mut request = match method {
            "GET" => self.client.get(&url),
            "POST" => self.client.post(&url),
            "PATCH" => self.client.patch(&url),
            "DELETE" => self.client.delete(&url),
            _ => return Err(anyhow::anyhow!("Unsupported HTTP method: {}", method)),
        };

        request = request
            .header("apikey", &self.api_key)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation");

        if let Some(data) = data {
            request = request.json(&data);
        }

        let response = request.send().await?;
        
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow::anyhow!("HTTP error {}: {}", status, error_text));
        }

        let json_response: serde_json::Value = response.json().await?;
        Ok(json_response)
    }
}

// Data models based on your schema
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String, // UUID as string
    pub name: String,
    pub email: Option<String>, // Make optional to match database schema
    pub team_id: Option<String>,
    pub current_project_id: Option<String>,
    // Make role optional to tolerate schemas that don't use roles
    pub role: Option<UserRole>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>, // Make optional to match database default
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>, // Make optional to match database default
    pub image_url: Option<String>, // Add missing field from database
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Owner,
    Manager,
    Member,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: String,
    pub team_name: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub team_id: Option<String>,
    pub manager_id: Option<String>,
    pub description: Option<String>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub project_id: Option<String>,
    pub assignee_id: Option<String>,
    pub status: TaskStatus,
    pub priority: Option<TaskPriority>,
    pub due_date: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskStatus {
    #[serde(rename = "todo")]
    Todo,
    #[serde(rename = "in_progress")]
    InProgress,
    #[serde(rename = "done")]
    Done,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Application {
    pub id: String, // UUID as string
    pub name: String,
    pub process_name: String,
    pub icon_path: Option<String>,
    pub category: Option<String>,
    pub is_tracked: bool, // Boolean field with default false
    pub user_id: Option<String>, // Make optional to match database schema
    pub created_at: Option<chrono::DateTime<chrono::Utc>>, // Make optional to match database default
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>, // Make optional to match database default
    pub last_used: Option<chrono::DateTime<chrono::Utc>>, // Add missing field from database
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeEntry {
    pub id: String,
    pub user_id: String,
    pub app_id: Option<String>,
    pub task_id: Option<String>,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub end_time: Option<chrono::DateTime<chrono::Utc>>,
    pub duration_seconds: Option<i64>,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
