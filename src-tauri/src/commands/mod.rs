mod ai_assistant;

use crate::database::{
    Application, Database, Project, Task, Team, TimeEntry, User, WorkspaceMemberRecord,
};
use crate::default_user::get_default_user;
use reqwest::{StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{State, Manager};
use regex;
use ai_assistant::*;
use std::collections::HashMap;

// Re-export AI assistant commands for use in lib.rs
pub use ai_assistant::get_productivity_insights;

// Helper function to generate UUID strings
fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

// Helper function to get current timestamp
fn now() -> chrono::DateTime<chrono::Utc> {
    chrono::Utc::now()
}

const USER_SELECT_WITH_MEMBERS: &str = "id,name,email,created_at,updated_at,image_url,workspace_members(role,workspace_id,user_id,joined_at)";
const USER_SELECT_WITH_MEMBERS_INNER: &str = "id,name,email,created_at,updated_at,image_url,workspace_members!inner(role,workspace_id,user_id,joined_at)";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UserWithMemberships {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
    pub image_url: Option<String>,
    #[serde(default)]
    pub workspace_members: Vec<WorkspaceMemberRecord>,
}

fn apply_membership_meta(user: &mut User, memberships: &[WorkspaceMemberRecord]) {
    if let Some(member) = memberships.first() {
        user.workspace_id = member.workspace_id.clone();
        user.team_id = member.workspace_id.clone();
    } else {
        user.workspace_id = None;
        user.team_id = None;
    }
}

fn build_users_url(base_url: &str, select: &str, filters: &[(&str, String)]) -> String {
    let mut url = format!("{}/rest/v1/users?select={}", base_url, select);
    for (key, value) in filters {
        url.push('&');
        url.push_str(key);
        url.push('=');
        url.push_str(value);
    }
    url
}

async fn fetch_users_with_memberships(
    db: &Database,
    select: &str,
    filters: &[(&str, String)],
) -> Result<Vec<User>, String> {
    let url = build_users_url(&db.base_url, select, filters);
    let response = db
        .client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch users: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to fetch users: {}", response.status()));
    }

    let rows: Vec<UserWithMemberships> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse users: {}", e))?;

    let users = rows
        .into_iter()
        .map(|row| {
            let mut user = User {
                id: row.id,
                name: row.name,
                email: row.email,
                created_at: row.created_at,
                updated_at: row.updated_at,
                image_url: row.image_url,
                role: None,
                workspace_id: None,
                team_id: None,
            };
            apply_membership_meta(&mut user, &row.workspace_members);
            user
        })
        .collect();

    Ok(users)
}

async fn fetch_user_by_id(db: &Database, user_id: &str) -> Result<Option<User>, String> {
    let users = fetch_users_with_memberships(
        db,
        USER_SELECT_WITH_MEMBERS,
        &[ ("id", format!("eq.{}", user_id)) ],
    )
    .await?;
    Ok(users.into_iter().next())
}

async fn fetch_users_by_workspace(
    db: &Database,
    workspace_id: &str,
) -> Result<Vec<User>, String> {
    fetch_users_with_memberships(
        db,
        USER_SELECT_WITH_MEMBERS_INNER,
        &[ ("workspace_members.workspace_id", format!("eq.{}", workspace_id)) ],
    )
    .await
}

async fn fetch_all_users(db: &Database) -> Result<Vec<User>, String> {
    fetch_users_with_memberships(db, USER_SELECT_WITH_MEMBERS, &[]).await
}

async fn fetch_users_without_workspace(db: &Database) -> Result<Vec<User>, String> {
    fetch_users_with_memberships(
        db,
        USER_SELECT_WITH_MEMBERS,
        &[ ("workspace_members.workspace_id", "is.null".to_string()) ],
    )
    .await
}

async fn fetch_membership_for_user(
    db: &Database,
    user_id: &str,
) -> Result<Option<WorkspaceMemberRecord>, String> {
    let url = format!(
        "{}/rest/v1/workspace_members?user_id=eq.{}&select=id,user_id,workspace_id,role,joined_at",
        db.base_url, user_id
    );

    let response = db
        .client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch workspace membership: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch workspace membership: {}",
            response.status()
        ));
    }

    let records: Vec<WorkspaceMemberRecord> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse workspace membership: {}", e))?;

    Ok(records.into_iter().next())
}

async fn fetch_memberships_for_user(
    db: &Database,
    user_id: &str,
) -> Result<Vec<WorkspaceMemberRecord>, String> {
    let url = format!(
        "{}/rest/v1/workspace_members?user_id=eq.{}&select=id,user_id,workspace_id,role,joined_at",
        db.base_url, user_id
    );

    let response = db
        .client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch workspace memberships: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch workspace memberships: {}",
            response.status()
        ));
    }

    let memberships: Vec<WorkspaceMemberRecord> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse workspace memberships: {}", e))?;

    Ok(memberships)
}

async fn upsert_workspace_membership(
    db: &Database,
    user_id: &str,
    workspace_id: Option<&str>,
    role: Option<&str>,
    clear_membership: bool,
) -> Result<Option<WorkspaceMemberRecord>, String> {
    if !clear_membership && workspace_id.is_none() && role.is_none() {
        return fetch_membership_for_user(db, user_id).await;
    }

    let membership_url = format!(
        "{}/rest/v1/workspace_members?user_id=eq.{}",
        db.base_url, user_id
    );

    let mut update_map = serde_json::Map::new();

    match (workspace_id, clear_membership) {
        (Some(id), _) => {
            update_map.insert("workspace_id".to_string(), json!(id));
        }
        (None, true) => {
            update_map.insert("workspace_id".to_string(), serde_json::Value::Null);
        }
        (None, false) => {}
    }

    if let Some(r) = role {
        update_map.insert("role".to_string(), json!(r));
    }

    let response = db
        .client
        .patch(&membership_url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&update_map)
        .send()
        .await
        .map_err(|e| format!("Failed to update workspace membership: {}", e))?;

    if response.status().is_success() {
    let status = response.status();
    if status != StatusCode::NO_CONTENT {
            let updated: Vec<WorkspaceMemberRecord> = response
                .json()
                .await
                .map_err(|e| format!("Failed to parse updated membership: {}", e))?;
            if let Some(record) = updated.into_iter().next() {
                return Ok(Some(record));
            }
        }
    }

    // If we reach here, either no membership existed or patch returned no content
    if let Some(id) = workspace_id {
            let insert_data = json!({
                "user_id": user_id,
                "workspace_id": id,
                "role": role.unwrap_or("member"),
            });

        let response = db
            .execute_query("workspace_members", "POST", Some(insert_data))
            .await
            .map_err(|e| format!("Failed to create workspace membership: {}", e))?;

    let created: Vec<WorkspaceMemberRecord> = serde_json::from_value(response)
            .map_err(|e| format!("Failed to parse created membership: {}", e))?;

        Ok(created.into_iter().next())
    } else if clear_membership {
        let mut update_map = serde_json::Map::new();
        update_map.insert("workspace_id".to_string(), serde_json::Value::Null);
        if let Some(r) = role {
            update_map.insert("role".to_string(), json!(r));
        }

        let response = db
            .client
            .patch(&membership_url)
            .header("apikey", &db.api_key)
            .header("Authorization", format!("Bearer {}", db.api_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&update_map)
            .send()
            .await
            .map_err(|e| format!("Failed to clear workspace membership: {}", e))?;

        if response.status().is_success() {
            if response.status() != StatusCode::NO_CONTENT {
                let updated: Vec<WorkspaceMemberRecord> = response
                    .json()
                    .await
                    .map_err(|e| format!("Failed to parse cleared membership: {}", e))?;
                Ok(updated.into_iter().next())
            } else {
                Ok(None)
            }
        } else {
            Err(format!(
                "Failed to clear workspace membership: {}",
                response.status()
            ))
        }
    } else {
        Ok(fetch_membership_for_user(db, user_id).await?)
    }
}

// ===== USER COMMANDS =====

#[tauri::command]
pub async fn create_user(
    db: State<'_, Database>,
    name: String,
    email: String,
    teamId: String,
    role: String,
) -> Result<User, String> {
    match role.as_str() {
        "owner" | "manager" | "member" => {},
        _ => return Err("Invalid role. Must be 'owner', 'manager', or 'member'".to_string()),
    }

    // Debug logging
    println!("Creating user with teamId: {:?}", teamId);
    let user_id = generate_id();
    let timestamp = now().to_rfc3339();

    let user_payload = json!({
        "id": &user_id,
        "name": name,
        "email": email,
        "created_at": &timestamp,
        "updated_at": &timestamp,
        "image_url": null
    });

    println!("User data being sent to database: {}", user_payload);

    db.execute_query("users", "POST", Some(user_payload))
        .await
        .map_err(|e| format!("Failed to create user: {}", e))?;

    let trimmed_team = teamId.trim();
    if !trimmed_team.is_empty() && !trimmed_team.eq_ignore_ascii_case("unassigned") {
        upsert_workspace_membership(
            &db,
            &user_id,
            Some(trimmed_team),
            Some(role.as_str()),
            false,
        )
        .await?;
    }

    fetch_user_by_id(&db, &user_id)
        .await?
        .ok_or_else(|| "User was created but could not be retrieved".to_string())
}

#[tauri::command]
pub async fn delete_user(db: State<'_, Database>, userId: String) -> Result<(), String> {
    println!("Delete user command called with userId: {}", userId);
    
    let url = format!("{}/rest/v1/users?id=eq.{}", db.base_url, userId);
    println!("Delete URL: {}", url);
    
    let response = db.client
        .delete(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to delete user: {}", e))?;

    println!("Delete response status: {}", response.status());

    if !response.status().is_success() {
        return Err(format!("Failed to delete user: {}", response.status()));
    }

    println!("User deleted successfully");
    Ok(())
}

#[tauri::command]
pub async fn get_user(db: State<'_, Database>, user_id: String) -> Result<Option<User>, String> {
    fetch_user_by_id(&db, &user_id).await
}

#[tauri::command]
pub async fn get_users_by_team(
    db: State<'_, Database>,
    teamId: Option<String>,
) -> Result<Vec<User>, String> {
    match teamId {
        Some(tid) => {
            let trimmed = tid.trim();
            if trimmed.is_empty() {
                Ok(vec![])
            } else if trimmed.eq_ignore_ascii_case("unassigned") {
                fetch_users_without_workspace(&db).await
            } else {
                fetch_users_by_workspace(&db, trimmed).await
            }
        }
        None => fetch_users_without_workspace(&db).await,
    }
}

#[tauri::command]
pub async fn get_all_users(db: State<'_, Database>) -> Result<Vec<User>, String> {
    fetch_all_users(&db).await
}

#[tauri::command]
pub async fn update_user(
    db: State<'_, Database>,
    user_id: String,
    name: Option<String>,
    email: Option<String>,
    team_id: Option<String>,
    role: Option<String>,
    image_url: Option<String>,
) -> Result<User, String> {
    let mut update_map = serde_json::Map::new();

    if name.is_some() || email.is_some() || image_url.is_some() {
        update_map.insert("updated_at".to_string(), json!(now().to_rfc3339()));
    }
    if let Some(name) = name {
        update_map.insert("name".to_string(), json!(name));
    }
    if let Some(email) = email {
        update_map.insert("email".to_string(), json!(email));
    }
    if let Some(image_url) = image_url {
        update_map.insert("image_url".to_string(), json!(image_url));
    }

    if !update_map.is_empty() {
        let url = format!("{}/rest/v1/users?id=eq.{}", db.base_url, user_id);
        db.client
            .patch(&url)
            .header("apikey", &db.api_key)
            .header("Authorization", format!("Bearer {}", db.api_key))
            .header("Content-Type", "application/json")
            .header("Prefer", "return=representation")
            .json(&update_map)
            .send()
            .await
            .map_err(|e| format!("Failed to update user: {}", e))?;
    }

    let mut workspace_assignment: Option<String> = None;
    let mut clear_membership = false;

    if let Some(team) = team_id {
        let trimmed = team.trim().to_string();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("unassigned") {
            clear_membership = true;
        } else {
            workspace_assignment = Some(trimmed);
        }
    }

    upsert_workspace_membership(
        &db,
        &user_id,
        workspace_assignment.as_deref(),
        role.as_deref(),
        clear_membership,
    )
    .await?;

    fetch_user_by_id(&db, &user_id)
        .await?
        .ok_or_else(|| "User was updated but could not be retrieved".to_string())
}

// ===== TEAM COMMANDS =====

#[tauri::command]
pub async fn create_team(
    db: State<'_, Database>,
    team_name: String,
) -> Result<Team, String> {
    let team_data = json!({
        "id": generate_id(),
        "name": team_name,
        "created_at": now().to_rfc3339(),
        "updated_at": now().to_rfc3339()
    });

    let response = db
        .execute_query("workspaces", "POST", Some(team_data))
        .await
        .map_err(|e| format!("Failed to create team: {}", e))?;

    // The response should be an array with the created record
    let created_teams: Vec<Team> = serde_json::from_value(response)
        .map_err(|e| format!("Failed to parse created team: {}", e))?;
    
    if let Some(created_team) = created_teams.into_iter().next() {
        Ok(created_team)
    } else {
        Err("No team was created".to_string())
    }
}

#[tauri::command]
pub async fn get_team(db: State<'_, Database>, teamId: String) -> Result<Option<Team>, String> {
    let url = format!("{}/rest/v1/workspaces?id=eq.{}", db.base_url, teamId);
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
    let url = format!("{}/rest/v1/workspaces", db.base_url);
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

#[tauri::command]
pub async fn get_my_workspaces(db: State<'_, Database>) -> Result<Vec<Team>, String> {
    let user_id = crate::current_user::get_current_user_id();

    let memberships = fetch_memberships_for_user(&db, &user_id).await?;
    let mut workspace_ids: Vec<String> = memberships
        .iter()
        .filter_map(|record| record.workspace_id.clone())
        .collect();
    workspace_ids.sort();
    workspace_ids.dedup();

    let mut workspaces_map: HashMap<String, Team> = HashMap::new();

    if !workspace_ids.is_empty() {
        let mut url = Url::parse(&format!("{}/rest/v1/workspaces", db.base_url))
            .map_err(|e| format!("Invalid base URL: {}", e))?;
        url.query_pairs_mut()
            .append_pair("id", &format!("in.({})", workspace_ids.join(",")));

        let response = db
            .client
            .get(url)
            .header("apikey", &db.api_key)
            .header("Authorization", format!("Bearer {}", db.api_key))
            .send()
            .await
            .map_err(|e| format!("Failed to fetch user workspaces: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Failed to fetch user workspaces: {}",
                response.status()
            ));
        }

        let mut membership_workspaces: Vec<Team> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse user workspaces: {}", e))?;

        for workspace in membership_workspaces.drain(..) {
            workspaces_map.insert(workspace.id.clone(), workspace);
        }
    }

    let mut created_url = Url::parse(&format!("{}/rest/v1/workspaces", db.base_url))
        .map_err(|e| format!("Invalid base URL: {}", e))?;
    created_url
        .query_pairs_mut()
        .append_pair("created_by", &format!("eq.{}", user_id));

    let created_response = db
        .client
        .get(created_url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch owned workspaces: {}", e))?;

    if created_response.status().is_success() {
        let created_workspaces: Vec<Team> = created_response
            .json()
            .await
            .map_err(|e| format!("Failed to parse owned workspaces: {}", e))?;

        for workspace in created_workspaces {
            workspaces_map.insert(workspace.id.clone(), workspace);
        }
    }

    let mut result: Vec<Team> = workspaces_map.into_values().collect();
    result.sort_by(|a, b| a.team_name.cmp(&b.team_name));
    Ok(result)
}

#[tauri::command]
pub async fn get_all_workspace_members(db: State<'_, Database>) -> Result<Vec<WorkspaceMemberRecord>, String> {
    let url = format!(
        "{}/rest/v1/workspace_members?select=id,user_id,workspace_id,role,joined_at",
        db.base_url
    );

    let response = db
        .client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch workspace members: {}", e))?;

    let members: Vec<WorkspaceMemberRecord> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse workspace members: {}", e))?;

    Ok(members)
}

#[tauri::command]
pub async fn delete_team(db: State<'_, Database>, teamId: String) -> Result<(), String> {
    println!("Delete team command called with teamId: {}", teamId);
    let url = format!("{}/rest/v1/workspaces?id=eq.{}", db.base_url, teamId);
    println!("Delete team URL: {}", url);
    
    let response = db.client
        .delete(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to delete team: {}", e))?;

    println!("Delete team response status: {}", response.status());

    if !response.status().is_success() {
        return Err(format!("Failed to delete team: {}", response.status()));
    }

    println!("Team deleted successfully");
    Ok(())
}

// ===== PROJECT COMMANDS =====

#[tauri::command]
pub async fn create_project(
    db: State<'_, Database>,
    name: String,
    teamId: String,
    manager_id: String,
    description: Option<String>,
) -> Result<Project, String> {
    let project_data = json!({
        "id": generate_id(),
        "name": name,
        "workspace_id": teamId,
        "manager_id": manager_id,
        "description": description,
        "created_at": now().to_rfc3339(),
        "updated_at": now().to_rfc3339()
    });

    let response = db
        .execute_query("projects", "POST", Some(project_data))
        .await
        .map_err(|e| format!("Failed to create project: {}", e))?;

    // The response should be an array with the created record
    let created_projects: Vec<Project> = serde_json::from_value(response)
        .map_err(|e| format!("Failed to parse created project: {}", e))?;
    
    if let Some(created_project) = created_projects.into_iter().next() {
        Ok(created_project)
    } else {
        Err("No project was created".to_string())
    }
}

#[tauri::command]
pub async fn get_projects_by_team(
    db: State<'_, Database>,
    teamId: String,
) -> Result<Vec<Project>, String> {
    let url = format!("{}/rest/v1/projects?workspace_id=eq.{}", db.base_url, teamId);
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

#[tauri::command]
pub async fn get_all_projects(db: State<'_, Database>) -> Result<Vec<Project>, String> {
    let url = format!("{}/rest/v1/projects", db.base_url);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to get projects: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to get projects: {}", response.status()));
    }

    let projects: Vec<Project> = response.json().await.map_err(|e| format!("Failed to parse projects: {}", e))?;
    Ok(projects)
}

// ===== TASK COMMANDS =====

#[tauri::command]
pub async fn create_task(
    db: State<'_, Database>,
    title: String,
    project_id: Option<String>,
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
    
    println!("create_task: Creating task with data: {}", task_data);

    let response = db
        .execute_query("tasks", "POST", Some(task_data))
        .await
        .map_err(|e| format!("Failed to create task: {}", e))?;

    // The response should be an array with the created record
    let created_tasks: Vec<Task> = serde_json::from_value(response)
        .map_err(|e| format!("Failed to parse created task: {}", e))?;
    
    if let Some(created_task) = created_tasks.into_iter().next() {
        Ok(created_task)
    } else {
        Err("No task was created".to_string())
    }
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
    println!("get_tasks_by_assignee: URL: {}", url);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch tasks: {}", e))?;

    println!("get_tasks_by_assignee: Response status: {}", response.status());

    let tasks: Vec<Task> = response.json().await.map_err(|e| format!("Failed to parse tasks: {}", e))?;
    println!("get_tasks_by_assignee: Found {} tasks", tasks.len());
    for task in &tasks {
        println!("  Task: {} - {} - assignee: {:?}", task.id, task.title, task.assignee_id);
    }
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

#[tauri::command]
pub async fn delete_task(db: State<'_, Database>, taskId: String) -> Result<(), String> {
    println!("Delete task command called with taskId: {}", taskId);
    
    let url = format!("{}/rest/v1/tasks?id=eq.{}", db.base_url, taskId);
    println!("Delete task URL: {}", url);
    
    let response = db.client
        .delete(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to delete task: {}", e))?;

    println!("Delete task response status: {}", response.status());

    if !response.status().is_success() {
        return Err(format!("Failed to delete task: {}", response.status()));
    }

    println!("Task deleted successfully");
    Ok(())
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

    // The response should be an array with the created record
    let created_entries: Vec<TimeEntry> = serde_json::from_value(response)
        .map_err(|e| format!("Failed to parse created time entry: {}", e))?;
    
    if let Some(created_entry) = created_entries.into_iter().next() {
        Ok(created_entry)
    } else {
        Err("No time entry was created".to_string())
    }
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
    user_id: String,
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

    // Store the current user id for runtime use
    crate::current_user::set_current_user_id(user_id);

    log::info!("Database initialized successfully");
    Ok(true)
}

#[tauri::command]
pub async fn sign_up_user(
    app_handle: tauri::AppHandle,
    email: String,
    password: String,
    name: String,
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
            log::info!("Database connection successful for sign up");
        }
        Ok(false) => {
            return Err("Database connection test failed".to_string());
        }
        Err(e) => {
            return Err(format!("Database connection error: {}", e));
        }
    }

    // Validate input
    if email.is_empty() || password.is_empty() {
        return Err("Email and password are required".to_string());
    }

    if password.len() < 6 {
        return Err("Password must be at least 6 characters long".to_string());
    }

    // Email validation regex
    let email_regex = regex::Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
        .map_err(|_| "Invalid email format validation error".to_string())?;
    
    if !email_regex.is_match(&email) {
        return Err("Invalid email format".to_string());
    }

    // Check if user already exists in our users table
    let existing_users_url = format!("{}/rest/v1/users?email=eq.{}", database.base_url, email);
    let existing_users_response = database.client
        .get(&existing_users_url)
        .header("apikey", &database.api_key)
        .header("Authorization", format!("Bearer {}", database.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to check existing users: {}", e))?;

    if existing_users_response.status().is_success() {
        let existing_users: Vec<User> = existing_users_response.json().await
            .map_err(|e| format!("Failed to parse existing users: {}", e))?;
        
        if !existing_users.is_empty() {
            return Err("A user with this email already exists".to_string());
        }
    }

    // Create user via Supabase Auth API
    let auth_url = format!("{}/auth/v1/signup", database.base_url);
    let auth_payload = json!({
        "email": email,
        "password": password,
        "data": {
            "email": email
        }
    });

    let auth_response = database.client
        .post(&auth_url)
        .header("apikey", &database.api_key)
        .header("Content-Type", "application/json")
        .json(&auth_payload)
        .send()
        .await
        .map_err(|e| format!("Failed to create auth user: {}", e))?;

    if !auth_response.status().is_success() {
        let error_text = auth_response.text().await
            .unwrap_or_else(|_| "Unknown authentication error".to_string());
        return Err(format!("Failed to create user account: {}", error_text));
    }

    let auth_result: serde_json::Value = auth_response.json().await
        .map_err(|e| format!("Failed to parse auth response: {}", e))?;

    // Log the auth response for debugging
    log::info!("Auth response: {}", serde_json::to_string_pretty(&auth_result).unwrap_or_else(|_| "Could not serialize response".to_string()));

    // Extract the user ID from the auth response - try multiple possible structures
    let user_id = auth_result
        .get("user")
        .and_then(|user| user.get("id"))
        .and_then(|id| id.as_str())
        .or_else(|| {
            // Try alternative structure: direct id field
            auth_result.get("id").and_then(|id| id.as_str())
        })
        .or_else(|| {
            // Try alternative structure: data.user.id
            auth_result
                .get("data")
                .and_then(|data| data.get("user"))
                .and_then(|user| user.get("id"))
                .and_then(|id| id.as_str())
        })
        .or_else(|| {
            // Try alternative structure: session.user.id
            auth_result
                .get("session")
                .and_then(|session| session.get("user"))
                .and_then(|user| user.get("id"))
                .and_then(|id| id.as_str())
        })
        .ok_or_else(|| {
            format!("Failed to extract user ID from auth response. Response structure: {}", 
                   serde_json::to_string(&auth_result).unwrap_or_else(|_| "Could not serialize".to_string()))
        })?;

    // Use provided name if present, otherwise fallback to email local part
    let chosen_name = if name.trim().is_empty() {
        email.split('@').next().unwrap_or("User").to_string()
    } else {
        name.clone()
    };

    // First try to update an existing users row for this id (in case Supabase
    // or another process already created a placeholder row). This avoids
    // duplicate-key conflicts when inserting.
    let patch_url = format!("{}/rest/v1/users?id=eq.{}", database.base_url, user_id);
    let patch_payload = json!({
        "name": chosen_name,
        "updated_at": now().to_rfc3339(),
    });

    let patch_response = database.client
        .patch(&patch_url)
        .header("apikey", &database.api_key)
        .header("Authorization", format!("Bearer {}", database.api_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&patch_payload)
        .send()
        .await
        .map_err(|e| format!("Failed to PATCH users record: {}", e))?;

    if patch_response.status().is_success() {
        // If PATCH succeeded, we're done (it will return the updated record(s)).
        log::info!("Updated user record for id {}", user_id);
    } else {
        // If PATCH did not succeed (e.g., no existing row), fall back to insert.
        log::info!("PATCH users returned {} - attempting INSERT", patch_response.status());

        // Create a record in our users table
        let user_data = json!({
            "id": user_id,
            "name": chosen_name,
            "email": email,
            "created_at": now().to_rfc3339(),
            "updated_at": now().to_rfc3339(),
            "image_url": null
        });

        let users_response = database
            .execute_query("users", "POST", Some(user_data))
            .await
            .map_err(|e| format!("Failed to create user record: {}", e))?;

        // Verify the user was created
        let created_users: Vec<User> = serde_json::from_value(users_response)
            .map_err(|e| format!("Failed to parse created user: {}", e))?;

        if created_users.is_empty() {
            return Err("User account was created but user record was not saved".to_string());
        }
    }

    log::info!("Successfully created user: {} with ID: {}", email, user_id);
    Ok(true)
}

// ===== DEFAULT USER CONVENIENCE COMMANDS =====
// Note: ensure_default_user_exists function removed to prevent automatic Dev User creation

/* 
#[tauri::command]
pub async fn ensure_default_user_exists(db: State<'_, Database>) -> Result<User, String> {
    // This function has been disabled to prevent automatic creation of Dev User
    // Real users should be created through sign_up_user instead
    Err("Default user creation disabled. Please sign up for a real account.".to_string())
}
*/

#[tauri::command]
pub async fn get_current_user(db: State<'_, Database>) -> Result<User, String> {
    // Resolve the current user id from runtime state and fetch the user
    // from the database. If not found, fall back to the default dev user
    // so the UI continues to work in development.
    let user_id = crate::current_user::get_current_user_id();
    match get_user(db, user_id).await {
        Ok(Some(user)) => Ok(user),
        Ok(None) => {
            log::warn!("Current user id not found in database, falling back to default user");
            Ok(get_default_user())
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn get_current_user_id() -> Result<String, String> {
    Ok(crate::current_user::get_current_user_id())
}

#[tauri::command]
pub async fn get_my_applications(db: State<'_, Database>) -> Result<Vec<Application>, String> {
    get_applications_by_user(db, crate::current_user::get_current_user_id()).await
}

#[tauri::command]
pub async fn get_my_tasks(db: State<'_, Database>) -> Result<Vec<Task>, String> {
    // For now, get ALL tasks instead of filtering by assignee
    // This will help us test if the issue is with user assignment or task retrieval
    let url = format!("{}/rest/v1/tasks", db.base_url);
    println!("get_my_tasks: Getting ALL tasks from URL: {}", url);
    
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to get tasks: {}", e))?;

    println!("get_my_tasks: Response status: {}", response.status());

    let tasks: Vec<Task> = response.json().await.map_err(|e| format!("Failed to parse tasks: {}", e))?;
    println!("get_my_tasks: Found {} tasks total", tasks.len());
    for task in &tasks {
        println!("  Task: {} - {} - assignee: {:?} - status: {:?}", task.id, task.title, task.assignee_id, task.status);
    }
    Ok(tasks)
}

#[tauri::command]
pub async fn get_my_time_entries(
    db: State<'_, Database>,
    limit: Option<u32>,
) -> Result<Vec<TimeEntry>, String> {
    get_time_entries_by_user(db, crate::current_user::get_current_user_id(), limit).await
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
    // Validate required fields
    if name.trim().is_empty() {
        return Err("Application name cannot be empty".to_string());
    }
    if process_name.trim().is_empty() {
        return Err("Process name cannot be empty".to_string());
    }
    
    println!("Creating application: {} ({})", name, process_name);
    create_application(db, name, process_name, crate::current_user::get_current_user_id(), icon_path, category, is_tracked).await
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
    create_time_entry(db, crate::current_user::get_current_user_id(), app_id, task_id, start_time, end_time, duration_seconds, is_active).await
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

// Link AppKit when compiling for macOS so we can use NSWorkspace
#[cfg(target_os = "macos")]
#[link(name = "AppKit", kind = "framework")]
extern "C" {}

#[tauri::command]
pub async fn get_running_processes() -> Result<Vec<DetectedProcess>, String> {
    // macOS: use NSWorkspace.runningApplications to list real user apps
    #[cfg(target_os = "macos")]
    unsafe {
        use objc::{class, msg_send, sel, sel_impl};
        use objc::runtime::Object;
        use std::ffi::CStr;
        use std::os::raw::c_char;

        let now = chrono::Utc::now().to_rfc3339();
        let mut results: Vec<DetectedProcess> = Vec::new();

        let ws: *mut Object = msg_send![class!(NSWorkspace), sharedWorkspace];
        if ws.is_null() {
            // Fallback to sysinfo
            return get_running_processes_fallback().await;
        }

        let apps_array: *mut Object = msg_send![ws, runningApplications];
        if apps_array.is_null() {
            return get_running_processes_fallback().await;
        }

        // NSArray count
        let count: usize = msg_send![apps_array, count];
        for i in 0..count {
            let app: *mut Object = msg_send![apps_array, objectAtIndex: i];
            if app.is_null() { continue; }

            // Only include regular (Dock) apps
            // NSApplicationActivationPolicyRegular == 0
            let activation_policy: i64 = msg_send![app, activationPolicy];
            if activation_policy != 0 { continue; }

            // Name
            let name_ns: *mut Object = msg_send![app, localizedName];
            if name_ns.is_null() { continue; }
            let name_ptr: *const c_char = msg_send![name_ns, UTF8String];
            if name_ptr.is_null() { continue; }
            let name = CStr::from_ptr(name_ptr).to_string_lossy().into_owned();

            // Bundle identifier (use as process_name fallback)
            let bundle_ns: *mut Object = msg_send![app, bundleIdentifier];
            let process_name = if bundle_ns.is_null() {
                name.clone()
            } else {
                let bid_ptr: *const c_char = msg_send![bundle_ns, UTF8String];
                if bid_ptr.is_null() { name.clone() } else { CStr::from_ptr(bid_ptr).to_string_lossy().into_owned() }
            };

            // Active
            let is_active: bool = msg_send![app, isActive];

            // Path
            let bundle_url: *mut Object = msg_send![app, bundleURL];
            let directory = if bundle_url.is_null() {
                None
            } else {
                let path_ns: *mut Object = msg_send![bundle_url, path];
                if path_ns.is_null() { None } else {
                    let path_ptr: *const c_char = msg_send![path_ns, UTF8String];
                    if path_ptr.is_null() { None } else { Some(CStr::from_ptr(path_ptr).to_string_lossy().into_owned()) }
                }
            };

            results.push(DetectedProcess {
                name,
                process_name,
                window_title: None,
                directory,
                is_active,
                last_seen: now.clone(),
            });
        }

        // Sort active first, then by name
        results.sort_by(|a, b| b.is_active.cmp(&a.is_active).then(a.name.cmp(&b.name)));
        // Limit
        results.truncate(50);
        return Ok(results);
    }

    // Other platforms: fallback to sysinfo with simple filtering (Windows-focused)
    get_running_processes_fallback().await
}

async fn get_running_processes_fallback() -> Result<Vec<DetectedProcess>, String> {
    let mut system = System::new_all();
    system.refresh_all();

    let mut processes = Vec::new();
    let mut seen_processes = std::collections::HashSet::new();
    let now = chrono::Utc::now().to_rfc3339();

    // Background/system processes list (mostly Windows); macOS path uses NSWorkspace
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
           process_name.len() < 3 ||
           process_name.starts_with('.') ||
           process_name.contains("Service") ||
           process_name.contains("Host") ||
           process_name.contains("Helper") ||
           process_name.contains("Update") ||
           process_name.contains("Installer") ||
           process_name.contains("Setup") ||
           process_name.contains("Background") {
            continue;
        }

        if seen_processes.contains(process_name) { continue; }
        seen_processes.insert(process_name.to_string());

        let is_active = is_known_user_app(process_name) || is_likely_user_app(process_name, &process);

        let detected_process = DetectedProcess {
            name: get_friendly_name(process_name),
            process_name: process_name.to_string(),
            window_title: None,
            directory: process.exe().map(|p| p.to_string_lossy().to_string()),
            is_active,
            last_seen: now.clone(),
        };

        processes.push(detected_process);
    }

    processes.sort_by(|a, b| b.is_active.cmp(&a.is_active).then(a.name.cmp(&b.name)));
    processes.truncate(30);
    Ok(processes)
}

// ===== TEAM KEY STORAGE (Prototype) =====

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TeamKeyRecord {
    pub team_id: String,
    pub key_id: String,
    pub wrapped_key_b64: String,
    pub kdf_salt_b64: Option<String>,
    pub kdf_iters: Option<i32>,
    pub wrap_iv_b64: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[tauri::command]
pub async fn get_team_key_record(db: State<'_, Database>, team_id: String) -> Result<Option<TeamKeyRecord>, String> {
    let url = format!("{}/rest/v1/team_keys?team_id=eq.{}&order=created_at.desc&limit=1", db.base_url, team_id);
    let response = db.client
        .get(&url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch team key: {}", e))?;

    if response.status().is_success() {
        let rows: Vec<TeamKeyRecord> = response.json().await
            .map_err(|e| format!("Failed to parse team key: {}", e))?;
        Ok(rows.into_iter().next())
    } else if response.status().as_u16() == 404 {
        Ok(None)
    } else {
        let status = response.status();
        let err = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        Err(format!("HTTP {}: {}", status, err))
    }
}

#[tauri::command]
pub async fn upsert_team_key_record(
    db: State<'_, Database>,
    team_id: String,
    key_id: String,
    wrapped_key_b64: String,
    kdf_salt_b64: Option<String>,
    kdf_iters: Option<i32>,
    wrap_iv_b64: Option<String>,
) -> Result<TeamKeyRecord, String> {
    let payload = serde_json::json!({
        "team_id": team_id,
        "key_id": key_id,
        "wrapped_key_b64": wrapped_key_b64,
        "kdf_salt_b64": kdf_salt_b64,
        "kdf_iters": kdf_iters,
        "wrap_iv_b64": wrap_iv_b64,
        "created_at": chrono::Utc::now().to_rfc3339(),
        "updated_at": chrono::Utc::now().to_rfc3339(),
    });

    let response = db.client
        .post(&format!("{}/rest/v1/team_keys", db.base_url))
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=representation")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to upsert team key: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let err = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("HTTP {}: {}", status, err));
    }

    let rows: Vec<TeamKeyRecord> = response.json().await
        .map_err(|e| format!("Failed to parse team key response: {}", e))?;
    rows.into_iter().next().ok_or_else(|| "No team key returned".to_string())
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

#[tauri::command]
pub async fn logout_user() -> Result<bool, String> {
    println!("🚪 logout_user() called - starting cleanup process");
    
    // Stop tracking if tracker exists
    if let Some(tracker) = crate::tracking::get_tracker() {
        println!("🎯 Tracker found, attempting to stop tracking...");
        if let Err(e) = tracker.stop_tracking().await {
            log::error!("Error stopping tracking during logout: {}", e);
            println!("❌ Error stopping tracking: {}", e);
        } else {
            log::info!("Activity tracking stopped during logout");
            println!("✅ Activity tracking stopped successfully");
        }
    } else {
        println!("⚠️ No tracker found - nothing to stop");
    }

    // Clear runtime current user id
    crate::current_user::clear_current_user_id();
    println!("🧹 Current user cleared from memory");

    println!("🎉 logout_user() completed successfully");
    Ok(true)
}

// ===== AI ASSISTANT COMMANDS =====

#[tauri::command]
pub async fn ai_chat(
    message: String,
    conversation_history: Vec<ai_assistant::ChatMessage>,
) -> Result<crate::ai::AIResponse, String> {
    use crate::ai::{AIService, GeminiService, ChatMessage as AIChatMessage};

    // Get productivity insights as context
    let insights = match get_productivity_insights_for_context().await {
        Ok(insights) => format_productivity_context(&insights),
        Err(_) => String::new(), // Continue without context if fetch fails
    };

    // Initialize AI service (Gemini)
    let ai_service = GeminiService::new()
        .map_err(|e| format!("Failed to initialize AI service: {}", e))?;

    // Build messages with system prompt
    let mut messages = vec![
        AIChatMessage {
            role: "system".to_string(),
            content: "You are a helpful productivity assistant and team management secretary for a time tracking application. You help both individual users and team managers understand work patterns, time tracking data, task management, and productivity insights. For team managers, you provide team-level analytics, member performance comparisons, and team management insights. When users mention '@username' or ask about team data, use the appropriate team-related tools. Be concise, helpful, and data-driven in your responses.".to_string(),
        },
    ];

    // Add context if available
    if !insights.is_empty() {
        messages.push(AIChatMessage {
            role: "system".to_string(),
            content: format!("User's current productivity data:\n{}", insights),
        });
    }

    // Convert conversation history to AI ChatMessage format
    let ai_conversation_history: Vec<AIChatMessage> = conversation_history
        .into_iter()
        .map(|msg| AIChatMessage {
            role: msg.role,
            content: msg.content,
        })
        .collect();

    // Add conversation history
    messages.extend(ai_conversation_history);

    // Add current user message
    messages.push(AIChatMessage {
        role: "user".to_string(),
        content: message,
    });

    // Call AI service
    let mut response = ai_service
        .chat(messages)
        .await
        .map_err(|e| format!("AI service error: {}", e))?;

    // If the AI called tools, execute them and replace the tool calls with structured data
    if let Some(ref tool_calls) = response.tools {
        let mut executed_tools = Vec::new();

        for tool_call in tool_calls {
            if let Some(executed_data) = ai_assistant::execute_tool(&tool_call.name, &tool_call.arguments) {
                // Create a new tool call with the executed data
                executed_tools.push(crate::ai::ToolCall {
                    name: tool_call.name.clone(),
                    arguments: executed_data,
                });
            }
        }

        if !executed_tools.is_empty() {
            response.tools = Some(executed_tools);
        }
    }

    Ok(response)
}

async fn get_productivity_insights_for_context() -> Result<ProductivityInsights, String> {
    // For context generation, we'll use mock data for now
    // The actual get_productivity_insights command will be called from frontend
    Ok(ai_assistant::get_mock_productivity_insights())
}

fn format_productivity_context(insights: &ProductivityInsights) -> String {
    let mut context = String::new();

    // Individual productivity data (always available)
    context.push_str(&format!("Today's time tracked: {:.1} hours\n", insights.total_time_today));
    context.push_str(&format!("This week's time tracked: {:.1} hours\n", insights.total_time_this_week));
    context.push_str(&format!("This month's time tracked: {:.1} hours\n\n", insights.total_time_this_month));

    if !insights.most_used_apps.is_empty() {
        context.push_str("Most used apps:\n");
        for app in &insights.most_used_apps {
            context.push_str(&format!("- {}: {:.1} hours ({:.1}%)\n", app.app_name, app.hours, app.percentage));
        }
        context.push_str("\n");
    }

    if let Some(activity) = &insights.current_activity {
        context.push_str(&format!("Current activity: {} ({} minutes active)\n\n",
            activity.app_name, activity.duration_seconds / 60));
    }

    context.push_str(&format!("Tasks: {} total ({} todo, {} in progress, {} done, {:.1}% completion rate)\n\n",
        insights.task_stats.total,
        insights.task_stats.todo,
        insights.task_stats.in_progress,
        insights.task_stats.done,
        insights.task_stats.completion_rate,
    ));

    if !insights.productivity_trend.peak_hours.is_empty() {
        let peak_hours_str: Vec<String> = insights.productivity_trend.peak_hours
            .iter()
            .map(|h| format!("{}:00", h))
            .collect();
        context.push_str(&format!("Peak productivity hours: {}\n", peak_hours_str.join(", ")));
    }

    // Team data (if available for managers)
    if let Some(team_summary) = &insights.team_summary {
        context.push_str("\n--- TEAM DATA ---\n");
        context.push_str(&format!("Team: {} active members out of {} total\n", team_summary.active_members, team_summary.total_members));
        context.push_str(&format!("Team total today: {:.1} hours\n", team_summary.total_team_hours_today));
        context.push_str(&format!("Team average today: {:.1} hours\n", team_summary.average_hours_today));
        context.push_str(&format!("Team total this week: {:.1} hours\n", team_summary.total_team_hours_this_week));
        context.push_str(&format!("Team average this week: {:.1} hours\n\n", team_summary.average_hours_this_week));

        if !team_summary.top_performers.is_empty() {
            context.push_str("Top performers today:\n");
            for performer in &team_summary.top_performers {
                context.push_str(&format!("- {}: {:.1} hours\n", performer.member_name, performer.hours));
            }
            context.push_str("\n");
        }
    }

    if let Some(team_members) = &insights.team_members {
        context.push_str("Team members data:\n");
        for member in team_members {
            context.push_str(&format!("- {} (ID: {}): {:.1} hours today, {:.1} hours this week, {} tasks ({}% completion)\n",
                member.member_name,
                member.member_id,
                member.total_time_today,
                member.total_time_this_week,
                member.task_stats.total,
                member.task_stats.completion_rate
            ));
        }
    }

    context
}
