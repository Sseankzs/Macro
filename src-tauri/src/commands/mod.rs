use crate::database::{
    Application, Database, Project, Task, Team, TimeEntry, User,
};
use crate::default_user::{get_default_user, get_default_user_id};
use serde_json::json;
use tauri::{State, Manager};

// Helper function to generate UUID strings
fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

// Helper function to get current timestamp
fn now() -> chrono::DateTime<chrono::Utc> {
    chrono::Utc::now()
}

// ===== USER COMMANDS =====

#[tauri::command]
pub async fn create_user(
    db: State<'_, Database>,
    name: String,
    email: String,
    team_id: Option<String>,
    role: String,
) -> Result<User, String> {
    match role.as_str() {
        "owner" | "manager" | "member" => {},
        _ => return Err("Invalid role. Must be 'owner', 'manager', or 'member'".to_string()),
    }

    let user_data = json!({
        "id": generate_id(),
        "name": name,
        "email": email,
        "team_id": team_id,
        "current_project_id": null,
        "role": role,
        "created_at": now().to_rfc3339(),
        "updated_at": now().to_rfc3339()
    });

    let response = db
        .execute_query("users", "POST", Some(user_data))
        .await
        .map_err(|e| format!("Failed to create user: {}", e))?;

    let created_user: User = serde_json::from_value(response)
        .map_err(|e| format!("Failed to parse created user: {}", e))?;

    Ok(created_user)
}

#[tauri::command]
pub async fn get_user(db: State<'_, Database>, user_id: String) -> Result<Option<User>, String> {
    let url = format!("{}/rest/v1/users?id=eq.{}", db.base_url, user_id);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch user: {}", e))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let users: Vec<User> = response.json().await.map_err(|e| format!("Failed to parse user: {}", e))?;
    Ok(users.into_iter().next())
}

#[tauri::command]
pub async fn get_users_by_team(
    db: State<'_, Database>,
    team_id: String,
) -> Result<Vec<User>, String> {
    let url = format!("{}/rest/v1/users?team_id=eq.{}", db.base_url, team_id);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch users: {}", e))?;

    let users: Vec<User> = response.json().await.map_err(|e| format!("Failed to parse users: {}", e))?;
    Ok(users)
}

#[tauri::command]
pub async fn update_user(
    db: State<'_, Database>,
    user_id: String,
    name: Option<String>,
    email: Option<String>,
    team_id: Option<String>,
    current_project_id: Option<String>,
    role: Option<String>,
) -> Result<User, String> {
    let mut update_data = json!({
        "updated_at": now().to_rfc3339()
    });

    if let Some(name) = name {
        update_data["name"] = json!(name);
    }
    if let Some(email) = email {
        update_data["email"] = json!(email);
    }
    if let Some(team_id) = team_id {
        update_data["team_id"] = json!(team_id);
    }
    if let Some(current_project_id) = current_project_id {
        update_data["current_project_id"] = json!(current_project_id);
    }
    if let Some(role) = role {
        update_data["role"] = json!(role);
    }

    let url = format!("{}/rest/v1/users?id=eq.{}", db.base_url, user_id);
    let response = db.client
        .patch(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&update_data)
        .send()
        .await
        .map_err(|e| format!("Failed to update user: {}", e))?;

    // The response should be an array with the updated record
    let updated_users: Vec<User> = response.json().await.map_err(|e| format!("Failed to parse updated user: {}", e))?;
    
    if let Some(updated_user) = updated_users.into_iter().next() {
        Ok(updated_user)
    } else {
        Err("No user was updated".to_string())
    }
}

// ===== TEAM COMMANDS =====

#[tauri::command]
pub async fn create_team(
    db: State<'_, Database>,
    team_name: String,
) -> Result<Team, String> {
    let team_data = json!({
        "id": generate_id(),
        "team_name": team_name,
        "created_at": now().to_rfc3339(),
        "updated_at": now().to_rfc3339()
    });

    let response = db
        .execute_query("teams", "POST", Some(team_data))
        .await
        .map_err(|e| format!("Failed to create team: {}", e))?;

    let created_team: Team = serde_json::from_value(response)
        .map_err(|e| format!("Failed to parse created team: {}", e))?;

    Ok(created_team)
}

#[tauri::command]
pub async fn get_team(db: State<'_, Database>, team_id: String) -> Result<Option<Team>, String> {
    let url = format!("{}/rest/v1/teams?id=eq.{}", db.base_url, team_id);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch team: {}", e))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let teams: Vec<Team> = response.json().await.map_err(|e| format!("Failed to parse team: {}", e))?;
    Ok(teams.into_iter().next())
}

#[tauri::command]
pub async fn get_all_teams(db: State<'_, Database>) -> Result<Vec<Team>, String> {
    let url = format!("{}/rest/v1/teams", db.base_url);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch teams: {}", e))?;

    let teams: Vec<Team> = response.json().await.map_err(|e| format!("Failed to parse teams: {}", e))?;
    Ok(teams)
}

// ===== PROJECT COMMANDS =====

#[tauri::command]
pub async fn create_project(
    db: State<'_, Database>,
    name: String,
    team_id: String,
    manager_id: String,
    description: Option<String>,
) -> Result<Project, String> {
    let project_data = json!({
        "id": generate_id(),
        "name": name,
        "team_id": team_id,
        "manager_id": manager_id,
        "description": description,
        "created_at": now().to_rfc3339(),
        "updated_at": now().to_rfc3339()
    });

    let response = db
        .execute_query("projects", "POST", Some(project_data))
        .await
        .map_err(|e| format!("Failed to create project: {}", e))?;

    let created_project: Project = serde_json::from_value(response)
        .map_err(|e| format!("Failed to parse created project: {}", e))?;

    Ok(created_project)
}

#[tauri::command]
pub async fn get_projects_by_team(
    db: State<'_, Database>,
    team_id: String,
) -> Result<Vec<Project>, String> {
    let url = format!("{}/rest/v1/projects?team_id=eq.{}", db.base_url, team_id);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch projects: {}", e))?;

    let projects: Vec<Project> = response.json().await.map_err(|e| format!("Failed to parse projects: {}", e))?;
    Ok(projects)
}

#[tauri::command]
pub async fn get_project(db: State<'_, Database>, project_id: String) -> Result<Option<Project>, String> {
    let url = format!("{}/rest/v1/projects?id=eq.{}", db.base_url, project_id);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch project: {}", e))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let projects: Vec<Project> = response.json().await.map_err(|e| format!("Failed to parse project: {}", e))?;
    Ok(projects.into_iter().next())
}

// ===== TASK COMMANDS =====

#[tauri::command]
pub async fn create_task(
    db: State<'_, Database>,
    title: String,
    project_id: String,
    assignee_id: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    due_date: Option<String>,
) -> Result<Task, String> {
    match status.as_deref().unwrap_or("todo") {
        "todo" | "in_progress" | "done" => {},
        _ => return Err("Invalid status. Must be 'todo', 'in_progress', or 'done'".to_string()),
    }

    if let Some(priority_val) = priority.as_deref() {
        match priority_val {
            "low" | "medium" | "high" => {},
            _ => return Err("Invalid priority. Must be 'low', 'medium', or 'high'".to_string()),
        }
    }

    let task_data = json!({
        "id": generate_id(),
        "title": title,
        "description": description,
        "project_id": project_id,
        "assignee_id": assignee_id,
        "status": status.unwrap_or("todo".to_string()),
        "priority": priority,
        "due_date": due_date,
        "created_at": now().to_rfc3339(),
        "updated_at": now().to_rfc3339()
    });

    let response = db
        .execute_query("tasks", "POST", Some(task_data))
        .await
        .map_err(|e| format!("Failed to create task: {}", e))?;

    let created_task: Task = serde_json::from_value(response)
        .map_err(|e| format!("Failed to parse created task: {}", e))?;

    Ok(created_task)
}

#[tauri::command]
pub async fn get_tasks_by_project(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<Task>, String> {
    let url = format!("{}/rest/v1/tasks?project_id=eq.{}", db.base_url, project_id);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch tasks: {}", e))?;

    let tasks: Vec<Task> = response.json().await.map_err(|e| format!("Failed to parse tasks: {}", e))?;
    Ok(tasks)
}

#[tauri::command]
pub async fn get_tasks_by_assignee(
    db: State<'_, Database>,
    assignee_id: String,
) -> Result<Vec<Task>, String> {
    let url = format!("{}/rest/v1/tasks?assignee_id=eq.{}", db.base_url, assignee_id);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch tasks: {}", e))?;

    let tasks: Vec<Task> = response.json().await.map_err(|e| format!("Failed to parse tasks: {}", e))?;
    Ok(tasks)
}

#[tauri::command]
pub async fn update_task(
    db: State<'_, Database>,
    task_id: String,
    title: Option<String>,
    description: Option<String>,
    assignee_id: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    due_date: Option<String>,
) -> Result<Task, String> {
    let mut update_data = json!({
        "updated_at": now().to_rfc3339()
    });

    if let Some(title) = title {
        update_data["title"] = json!(title);
    }
    if let Some(description) = description {
        update_data["description"] = json!(description);
    }
    if let Some(assignee_id) = assignee_id {
        update_data["assignee_id"] = json!(assignee_id);
    }
    if let Some(status) = status {
        update_data["status"] = json!(status);
    }
    if let Some(priority) = priority {
        update_data["priority"] = json!(priority);
    }
    if let Some(due_date) = due_date {
        update_data["due_date"] = json!(due_date);
    }

    let url = format!("{}/rest/v1/tasks?id=eq.{}", db.base_url, task_id);
    let response = db.client
        .patch(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&update_data)
        .send()
        .await
        .map_err(|e| format!("Failed to update task: {}", e))?;

    // The response should be an array with the updated record
    let updated_tasks: Vec<Task> = response.json().await.map_err(|e| format!("Failed to parse updated task: {}", e))?;
    
    if let Some(updated_task) = updated_tasks.into_iter().next() {
        Ok(updated_task)
    } else {
        Err("No task was updated".to_string())
    }
}

// ===== APPLICATION COMMANDS =====

#[tauri::command]
pub async fn create_application(
    db: State<'_, Database>,
    name: String,
    process_name: String,
    user_id: String,
    icon_path: Option<String>,
    category: Option<String>,
    is_tracked: Option<bool>,
) -> Result<Application, String> {
    // Don't send id, created_at, updated_at, or last_used - let database handle these
    let application_data = json!({
        "name": name,
        "process_name": process_name,
        "icon_path": icon_path,
        "category": category,
        "is_tracked": is_tracked,
        "user_id": user_id
    });

    let response = db
        .execute_query("applications", "POST", Some(application_data))
        .await
        .map_err(|e| format!("Failed to create application: {}", e))?;

    // The response should be an array with the created record
    let created_apps: Vec<Application> = serde_json::from_value(response)
        .map_err(|e| format!("Failed to parse created application: {}", e))?;

    if let Some(created_app) = created_apps.into_iter().next() {
        Ok(created_app)
    } else {
        Err("No application was created".to_string())
    }
}

#[tauri::command]
pub async fn get_applications_by_user(
    db: State<'_, Database>,
    user_id: String,
) -> Result<Vec<Application>, String> {
    let url = format!("{}/rest/v1/applications?user_id=eq.{}", db.base_url, user_id);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch applications: {}", e))?;

    let applications: Vec<Application> = response.json().await.map_err(|e| format!("Failed to parse applications: {}", e))?;
    Ok(applications)
}

#[tauri::command]
pub async fn update_application(
    db: State<'_, Database>,
    app_id: String,
    name: Option<String>,
    process_name: Option<String>,
    icon_path: Option<String>,
    category: Option<String>,
    is_tracked: Option<bool>,
) -> Result<Application, String> {
    let mut update_data = json!({
        "updated_at": now().to_rfc3339()
    });

    if let Some(name) = name {
        update_data["name"] = json!(name);
    }
    if let Some(process_name) = process_name {
        update_data["process_name"] = json!(process_name);
    }
    if let Some(icon_path) = icon_path {
        update_data["icon_path"] = json!(icon_path);
    }
    if let Some(category) = category {
        update_data["category"] = json!(category);
    }
    // Handle is_tracked specially - we need to check if it was explicitly provided
    // even if it's false, because Tauri might serialize false as None
    if is_tracked.is_some() {
        let tracked_value = is_tracked.unwrap();
        println!("DEBUG: Setting is_tracked to: {}", tracked_value);
        update_data["is_tracked"] = json!(tracked_value);
    } else {
        println!("DEBUG: is_tracked is None, not updating this field");
    }

    println!("DEBUG: Update data being sent: {}", serde_json::to_string_pretty(&update_data).unwrap_or_else(|_| "Failed to serialize".to_string()));
    
    let url = format!("{}/rest/v1/applications?id=eq.{}", db.base_url, app_id);
    let response = db.client
        .patch(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&update_data)
        .send()
        .await
        .map_err(|e| format!("Failed to update application: {}", e))?;

    // The response should be an array with the updated record
    let updated_apps: Vec<Application> = response.json().await.map_err(|e| format!("Failed to parse updated application: {}", e))?;
    
    if let Some(updated_app) = updated_apps.into_iter().next() {
        println!("DEBUG: Updated app from database: {:?}", updated_app);
        Ok(updated_app)
    } else {
        Err("No application was updated".to_string())
    }
}

// ===== TIME ENTRY COMMANDS =====

#[tauri::command]
pub async fn create_time_entry(
    db: State<'_, Database>,
    user_id: String,
    app_id: Option<String>,
    task_id: Option<String>,
    start_time: String,
    end_time: Option<String>,
    duration_seconds: Option<i64>,
    is_active: Option<bool>,
) -> Result<TimeEntry, String> {
    let time_entry_data = json!({
        "id": generate_id(),
        "user_id": user_id,
        "app_id": app_id,
        "task_id": task_id,
        "start_time": start_time,
        "end_time": end_time,
        "duration_seconds": duration_seconds,
        "is_active": is_active.unwrap_or(false),
        "created_at": now().to_rfc3339(),
        "updated_at": now().to_rfc3339()
    });

    let response = db
        .execute_query("time_entries", "POST", Some(time_entry_data))
        .await
        .map_err(|e| format!("Failed to create time entry: {}", e))?;

    let created_entry: TimeEntry = serde_json::from_value(response)
        .map_err(|e| format!("Failed to parse created time entry: {}", e))?;

    Ok(created_entry)
}

#[tauri::command]
pub async fn get_time_entries_by_user(
    db: State<'_, Database>,
    user_id: String,
    limit: Option<u32>,
) -> Result<Vec<TimeEntry>, String> {
    let mut url = format!("{}/rest/v1/time_entries?user_id=eq.{}&order=start_time.desc", db.base_url, user_id);
    if let Some(limit) = limit {
        url.push_str(&format!("&limit={}", limit));
    }

    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch time entries: {}", e))?;

    let entries: Vec<TimeEntry> = response.json().await.map_err(|e| format!("Failed to parse time entries: {}", e))?;
    Ok(entries)
}

#[tauri::command]
pub async fn get_time_entries_by_task(
    db: State<'_, Database>,
    task_id: String,
) -> Result<Vec<TimeEntry>, String> {
    let url = format!("{}/rest/v1/time_entries?task_id=eq.{}&order=start_time.desc", db.base_url, task_id);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch time entries: {}", e))?;

    let entries: Vec<TimeEntry> = response.json().await.map_err(|e| format!("Failed to parse time entries: {}", e))?;
    Ok(entries)
}

#[tauri::command]
pub async fn get_time_entries_by_app(
    db: State<'_, Database>,
    app_id: String,
) -> Result<Vec<TimeEntry>, String> {
    let url = format!("{}/rest/v1/time_entries?app_id=eq.{}&order=start_time.desc", db.base_url, app_id);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch time entries: {}", e))?;

    let entries: Vec<TimeEntry> = response.json().await.map_err(|e| format!("Failed to parse time entries: {}", e))?;
    Ok(entries)
}

#[tauri::command]
pub async fn update_time_entry(
    db: State<'_, Database>,
    entry_id: String,
    end_time: Option<String>,
    duration_seconds: Option<i64>,
    is_active: Option<bool>,
) -> Result<TimeEntry, String> {
    let mut update_data = json!({
        "updated_at": now().to_rfc3339()
    });

    // If end_time is provided but duration_seconds is not, calculate it automatically
    if let Some(end_time_str) = &end_time {
        update_data["end_time"] = json!(end_time_str);
        
        if duration_seconds.is_none() {
            // Get the current time entry to access the start_time
            let get_url = format!("{}/rest/v1/time_entries?id=eq.{}", db.base_url, entry_id);
            let get_response = db.client
                .get(&get_url)
                .header("apikey", &db.api_key)
                .header("Authorization", format!("Bearer {}", db.api_key))
                .send()
                .await
                .map_err(|e| format!("Failed to fetch time entry: {}", e))?;

            if get_response.status().is_success() {
                let time_entries: Vec<TimeEntry> = get_response.json().await
                    .map_err(|e| format!("Failed to parse time entry: {}", e))?;
                
                if let Some(time_entry) = time_entries.first() {
                    // Parse the provided end_time
                    if let Ok(end_time_parsed) = chrono::DateTime::parse_from_rfc3339(end_time_str) {
                        let end_time_utc = end_time_parsed.with_timezone(&chrono::Utc);
                        let start_time = time_entry.start_time;
                        
                        // Calculate duration in seconds
                        let calculated_duration = (end_time_utc - start_time).num_seconds();
                        update_data["duration_seconds"] = json!(calculated_duration);
                        println!("Auto-calculated duration: {} seconds for time entry {}", calculated_duration, entry_id);
                    }
                }
            }
        }
    }
    
    if let Some(duration_seconds) = duration_seconds {
        update_data["duration_seconds"] = json!(duration_seconds);
    }
    if let Some(is_active) = is_active {
        update_data["is_active"] = json!(is_active);
    }

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

    // The response should be an array with the updated record
    let updated_entries: Vec<TimeEntry> = response.json().await.map_err(|e| format!("Failed to parse updated time entry: {}", e))?;
    
    if let Some(updated_entry) = updated_entries.into_iter().next() {
        Ok(updated_entry)
    } else {
        Err("No time entry was updated".to_string())
    }
}

// ===== UTILITY COMMANDS =====

#[tauri::command]
pub async fn test_database_connection(db: State<'_, Database>) -> Result<bool, String> {
    db.test_connection().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn initialize_database_and_login(
    app_handle: tauri::AppHandle,
    _email: String,
    _password: String,
) -> Result<bool, String> {
    // Load Supabase configuration
    let supabase_config = match crate::config::SupabaseConfig::from_env() {
        Ok(config) => config,
        Err(e) => {
            log::warn!("Failed to load Supabase config from environment: {}", e);
            return Err(format!("Failed to load database configuration: {}", e));
        }
    };

    // Initialize database
    let database = Database::new(supabase_config.url, supabase_config.anon_key)
        .map_err(|e| format!("Failed to initialize database: {}", e))?;

    // Test database connection
    match database.test_connection().await {
        Ok(true) => {
            log::info!("Database connection successful");
        }
        Ok(false) => {
            return Err("Database connection test failed".to_string());
        }
        Err(e) => {
            return Err(format!("Database connection error: {}", e));
        }
    }

    // Manage the database state
    app_handle.manage(database.clone());

    // Initialize the activity tracker
    crate::tracking::init_tracker(database);

    log::info!("Database initialized successfully");
    Ok(true)
}

// ===== DEFAULT USER CONVENIENCE COMMANDS =====

#[tauri::command]
pub async fn get_current_user() -> Result<User, String> {
    Ok(get_default_user())
}

#[tauri::command]
pub async fn get_current_user_id() -> Result<String, String> {
    Ok(get_default_user_id())
}

#[tauri::command]
pub async fn get_my_applications(db: State<'_, Database>) -> Result<Vec<Application>, String> {
    get_applications_by_user(db, get_default_user_id()).await
}

#[tauri::command]
pub async fn get_my_tasks(db: State<'_, Database>) -> Result<Vec<Task>, String> {
    get_tasks_by_assignee(db, get_default_user_id()).await
}

#[tauri::command]
pub async fn get_my_time_entries(
    db: State<'_, Database>,
    limit: Option<u32>,
) -> Result<Vec<TimeEntry>, String> {
    get_time_entries_by_user(db, get_default_user_id(), limit).await
}

#[tauri::command]
pub async fn create_my_application(
    db: State<'_, Database>,
    name: String,
    process_name: String,
    icon_path: Option<String>,
    category: Option<String>,
    is_tracked: Option<bool>,
) -> Result<Application, String> {
    create_application(db, name, process_name, get_default_user_id(), icon_path, category, is_tracked).await
}

#[tauri::command]
pub async fn update_my_application(
    db: State<'_, Database>,
    app_id: String,
    name: Option<String>,
    process_name: Option<String>,
    icon_path: Option<String>,
    category: Option<String>,
    is_tracked: Option<bool>,
) -> Result<Application, String> {
    println!("DEBUG: update_my_application called with app_id: {}, is_tracked: {:?}", app_id, is_tracked);
    println!("DEBUG: All parameters - name: {:?}, process_name: {:?}, icon_path: {:?}, category: {:?}, is_tracked: {:?}", 
             name, process_name, icon_path, category, is_tracked);
    
    // If is_tracked is being set to false, stop tracking for this app
    if let Some(false) = is_tracked {
        if let Some(tracker) = crate::tracking::get_tracker() {
            if let Err(e) = tracker.stop_tracking_for_app_by_id(&app_id).await {
                println!("Warning: Failed to stop tracking for app {}: {}", app_id, e);
            } else {
                println!("Stopped tracking for app {} because is_tracked was set to false", app_id);
            }
        }
    }
    
    update_application(db, app_id, name, process_name, icon_path, category, is_tracked).await
}

#[tauri::command]
pub async fn toggle_my_application_tracking(
    db: State<'_, Database>,
    app_id: String,
    is_tracked: bool,
) -> Result<Application, String> {
    println!("DEBUG: toggle_my_application_tracking called with app_id: {}, is_tracked: {}", app_id, is_tracked);
    
    // If is_tracked is being set to false, stop tracking for this app
    if !is_tracked {
        if let Some(tracker) = crate::tracking::get_tracker() {
            if let Err(e) = tracker.stop_tracking_for_app_by_id(&app_id).await {
                println!("Warning: Failed to stop tracking for app {}: {}", app_id, e);
            } else {
                println!("Stopped tracking for app {} because is_tracked was toggled to false", app_id);
            }
        }
    }
    
    update_application(db, app_id, None, None, None, None, Some(is_tracked)).await
}

#[tauri::command]
pub async fn delete_my_application(
    db: State<'_, Database>,
    appId: String,
) -> Result<(), String> {
    println!("DEBUG: delete_my_application called with appId: {}", appId);
    
    let url = format!("{}/rest/v1/applications?id=eq.{}", db.base_url, appId);
    let response = db.client
        .delete(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to delete application: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("HTTP error {}: {}", status, error_text));
    }

    Ok(())
}

#[tauri::command]
pub async fn create_my_time_entry(
    db: State<'_, Database>,
    app_id: Option<String>,
    task_id: Option<String>,
    start_time: String,
    end_time: Option<String>,
    duration_seconds: Option<i64>,
    is_active: Option<bool>,
) -> Result<TimeEntry, String> {
    create_time_entry(db, get_default_user_id(), app_id, task_id, start_time, end_time, duration_seconds, is_active).await
}

// ===== PROCESS DETECTION COMMANDS =====

use sysinfo::System;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DetectedProcess {
    pub name: String,
    pub process_name: String,
    pub window_title: Option<String>,
    pub directory: Option<String>,
    pub is_active: bool,
    pub last_seen: String,
}

#[tauri::command]
pub async fn get_running_processes() -> Result<Vec<DetectedProcess>, String> {
    let mut system = System::new_all();
    system.refresh_all();
    
    let mut processes = Vec::new();
    let mut seen_processes = std::collections::HashSet::new();
    let now = chrono::Utc::now().to_rfc3339();
    
    // Common background/system processes to filter out
    let background_processes = [
        "svchost.exe", "dwm.exe", "winlogon.exe", "csrss.exe", "smss.exe",
        "wininit.exe", "services.exe", "lsass.exe", "conhost.exe",
        "audiodg.exe", "dllhost.exe", "rundll32.exe", "taskhost.exe", "taskhostw.exe",
        "sihost.exe", "ctfmon.exe", "WmiPrvSE.exe", "SearchIndexer.exe", "SearchProtocolHost.exe",
        "SearchFilterHost.exe", "RuntimeBroker.exe", "Registry", "System", "Idle",
        "Memory Compression", "Secure System", "System Interrupts", "spoolsv.exe",
        "winlogon.exe", "csrss.exe", "smss.exe", "wininit.exe", "services.exe",
        "lsass.exe", "audiodg.exe", "dllhost.exe", "rundll32.exe", "taskhost.exe",
        "taskhostw.exe", "sihost.exe", "ctfmon.exe", "WmiPrvSE.exe", "SearchIndexer.exe",
        "SearchProtocolHost.exe", "SearchFilterHost.exe", "RuntimeBroker.exe"
    ];
    
    for (_pid, process) in system.processes() {
        let process_name = process.name();
        let exe_name = process.exe().and_then(|p| p.file_name()).unwrap_or_default();
        
        // Skip background/system processes
        if background_processes.contains(&process_name) || 
           background_processes.contains(&exe_name.to_string_lossy().as_ref()) ||
           process_name.len() < 3 || // Skip very short process names
           process_name.contains("Windows") ||
           process_name.contains("Microsoft") ||
           process_name.starts_with(".") ||
           process_name.contains("Service") ||
           process_name.contains("Host") ||
           process_name.contains("Helper") ||
           process_name.contains("Update") ||
           process_name.contains("Installer") ||
           process_name.contains("Setup") ||
           process_name.contains("Background") {
            continue;
        }
        
        // Skip if we've already seen this process name (avoid duplicates)
        if seen_processes.contains(process_name) {
            continue;
        }
        seen_processes.insert(process_name.to_string());
        
        // Determine if process is "active" based on known patterns and additional criteria
        let is_active = is_known_user_app(process_name) || is_likely_user_app(process_name, &process);
        
        let detected_process = DetectedProcess {
            name: get_friendly_name(process_name),
            process_name: process_name.to_string(),
            window_title: None, // Could be enhanced with window 
            directory: process.exe().map(|p| p.to_string_lossy().to_string()),
            is_active,
            last_seen: now.clone(),
        };
        
        processes.push(detected_process);
    }
    
    // Sort by active status (active first), then alphabetically
    processes.sort_by(|a, b| {
        b.is_active.cmp(&a.is_active)
            .then(a.name.cmp(&b.name))
    });
    
    // Limit to top 30 processes to avoid overwhelming the UI
    processes.truncate(30);
    
    Ok(processes)
}

fn is_known_user_app(process_name: &str) -> bool {
    let user_apps = [
        "code", "chrome", "firefox", "discord", "slack", "notion", "figma", 
        "photoshop", "excel", "word", "powerpoint", "spotify", "steam", 
        "obs", "zoom", "teams", "vscode", "notepad", "calc", "mspaint",
        "edge", "brave", "opera", "safari", "thunderbird", "outlook",
        "skype", "telegram", "whatsapp", "signal", "vlc", "media",
        "adobe", "autocad", "blender", "unity", "godot", "android",
        "xcode", "intellij", "webstorm", "pycharm", "clion", "rider",
        "datagrip", "phpstorm", "rubymine", "goland", "rustrover",
        "cursor", "atom", "sublime", "vim", "emacs", "neovim",
        "terminal", "powershell", "cmd", "bash", "zsh", "fish",
        "git", "docker", "kubernetes", "postman", "insomnia",
        "mongodb", "mysql", "postgres", "redis", "elasticsearch",
        "node", "npm", "yarn", "pnpm", "python", "java", "go", "rust",
        "react", "vue", "angular", "svelte", "next", "nuxt",
        "webpack", "vite", "rollup", "parcel", "esbuild"
    ];
    
    let process_lower = process_name.to_lowercase();
    user_apps.iter().any(|&app| process_lower.contains(app))
}

fn is_likely_user_app(process_name: &str, process: &sysinfo::Process) -> bool {
    let process_lower = process_name.to_lowercase();
    
    // Check for common patterns that indicate user applications
    let user_patterns = [
        // Development tools
        "studio", "builder", "editor", "ide", "dev", "debug",
        // Media applications
        "player", "media", "music", "video", "photo", "image",
        // Communication tools
        "chat", "messenger", "call", "meeting", "conference",
        // Productivity tools
        "office", "document", "spreadsheet", "presentation",
        // Gaming
        "game", "launcher", "client", "platform",
        // Design tools
        "design", "draw", "paint", "sketch", "vector",
        // Browsers and web tools
        "browser", "web", "http", "url", "link",
        // File management
        "explorer", "finder", "manager", "organizer",
        // System utilities (but not system services)
        "utility", "tool", "helper", "assistant", "wizard"
    ];
    
    // Check if the process name contains user-friendly patterns
    let has_user_pattern = user_patterns.iter().any(|&pattern| process_lower.contains(pattern));
    
    // Check if it's a GUI application (has a window)
    let has_window = process.exe().is_some() && !process_lower.contains("service");
    
    // Check if it's not a system process
    let not_system_process = !process_lower.contains("system") && 
                           !process_lower.contains("kernel") &&
                           !process_lower.contains("driver") &&
                           !process_lower.contains("dll") &&
                           !process_lower.contains("exe") ||
                           process_lower.ends_with(".exe");
    
    // Check if it has a reasonable process name length (not too short, not too long)
    let reasonable_length = process_name.len() >= 4 && process_name.len() <= 50;
    
    // Check if it's not a temporary or cache process
    let not_temporary = !process_lower.contains("temp") &&
                       !process_lower.contains("cache") &&
                       !process_lower.contains("tmp") &&
                       !process_lower.contains("log");
    
    // A process is likely a user app if it meets multiple criteria
    let criteria_met = [
        has_user_pattern,
        has_window,
        not_system_process,
        reasonable_length,
        not_temporary
    ].iter().filter(|&&x| x).count();
    
    // Require at least 3 out of 5 criteria to be met
    criteria_met >= 3
}

fn get_friendly_name(process_name: &str) -> String {
    let friendly_names: std::collections::HashMap<&str, &str> = [
        ("Code.exe", "Visual Studio Code"),
        ("chrome.exe", "Google Chrome"),
        ("firefox.exe", "Mozilla Firefox"),
        ("Discord.exe", "Discord"),
        ("slack.exe", "Slack"),
        ("notion.exe", "Notion"),
        ("Figma.exe", "Figma"),
        ("Photoshop.exe", "Adobe Photoshop"),
        ("EXCEL.EXE", "Microsoft Excel"),
        ("WINWORD.EXE", "Microsoft Word"),
        ("POWERPNT.EXE", "Microsoft PowerPoint"),
        ("Spotify.exe", "Spotify"),
        ("steam.exe", "Steam"),
        ("obs64.exe", "OBS Studio"),
        ("Zoom.exe", "Zoom"),
        ("Teams.exe", "Microsoft Teams"),
        ("explorer.exe", "Windows Explorer"),
        ("notepad.exe", "Notepad"),
        ("calc.exe", "Calculator"),
        ("mspaint.exe", "Paint"),
        ("msedge.exe", "Microsoft Edge"),
        ("brave.exe", "Brave Browser"),
        ("opera.exe", "Opera Browser"),
        ("thunderbird.exe", "Mozilla Thunderbird"),
        ("OUTLOOK.EXE", "Microsoft Outlook"),
        ("skype.exe", "Skype"),
        ("telegram.exe", "Telegram"),
        ("vlc.exe", "VLC Media Player"),
        ("unity.exe", "Unity Editor"),
        ("blender.exe", "Blender"),
        ("autocad.exe", "AutoCAD"),
        ("intellij64.exe", "IntelliJ IDEA"),
        ("webstorm64.exe", "WebStorm"),
        ("pycharm64.exe", "PyCharm"),
        ("clion64.exe", "CLion"),
        ("rider64.exe", "Rider"),
        ("datagrip64.exe", "DataGrip"),
        ("phpstorm64.exe", "PhpStorm"),
        ("rubymine64.exe", "RubyMine"),
        ("goland64.exe", "GoLand"),
        ("rustrover64.exe", "RustRover"),
        ("Cursor.exe", "Cursor"),
        ("atom.exe", "Atom"),
        ("sublime_text.exe", "Sublime Text"),
        ("vim.exe", "Vim"),
        ("emacs.exe", "Emacs"),
        ("nvim.exe", "Neovim"),
        ("WindowsTerminal.exe", "Windows Terminal"),
        ("powershell.exe", "PowerShell"),
        ("cmd.exe", "Command Prompt"),
        ("bash.exe", "Bash"),
        ("zsh.exe", "Zsh"),
        ("fish.exe", "Fish"),
        ("git.exe", "Git"),
        ("docker.exe", "Docker"),
        ("kubectl.exe", "Kubernetes"),
        ("postman.exe", "Postman"),
        ("insomnia.exe", "Insomnia"),
        ("mongod.exe", "MongoDB"),
        ("mysqld.exe", "MySQL"),
        ("postgres.exe", "PostgreSQL"),
        ("redis-server.exe", "Redis"),
        ("elasticsearch.exe", "Elasticsearch"),
        ("node.exe", "Node.js"),
        ("npm.exe", "npm"),
        ("yarn.exe", "Yarn"),
        ("pnpm.exe", "pnpm"),
        ("python.exe", "Python"),
        ("java.exe", "Java"),
        ("go.exe", "Go"),
        ("cargo.exe", "Rust"),
    ].iter().cloned().collect();
    
    friendly_names.get(process_name).map(|s| s.to_string())
        .unwrap_or_else(|| {
            // Convert process name to friendly format
            process_name
                .split('.')
                .next()
                .unwrap_or(process_name)
                .split('_')
                .map(|s| {
                    let mut chars = s.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(first) => first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        })
}