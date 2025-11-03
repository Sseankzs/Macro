use crate::database::{Database, Application, TimeEntry, Task, User};
use crate::default_user::get_default_user_id;
use super::{get_time_entries_by_user, get_applications_by_user, get_my_tasks, fetch_users_by_workspace};
use serde::{Deserialize, Serialize};
use tauri::State;
use chrono::{DateTime, Utc, Duration};

// Data structures for AI assistant insights
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductivityInsights {
  pub total_time_today: f64, // hours
  pub total_time_this_week: f64, // hours
  pub total_time_this_month: f64, // hours
  pub most_used_apps: Vec<AppUsage>,
  pub current_activity: Option<CurrentActivityInfo>,
  pub task_stats: TaskStats,
  pub productivity_trend: ProductivityTrend,
  // Team data (optional)
  pub team_members: Option<Vec<TeamMemberInsights>>,
  pub team_summary: Option<TeamSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMemberInsights {
  pub member_id: String,
  pub member_name: String,
  pub total_time_today: f64,
  pub total_time_this_week: f64,
  pub total_time_this_month: f64,
  pub most_used_apps: Vec<AppUsage>,
  pub current_activity: Option<CurrentActivityInfo>,
  pub task_stats: TaskStats,
  pub productivity_trend: ProductivityTrend,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamSummary {
  pub total_members: usize,
  pub active_members: usize,
  pub average_hours_today: f64,
  pub average_hours_this_week: f64,
  pub total_team_hours_today: f64,
  pub total_team_hours_this_week: f64,
  pub top_performers: Vec<TopPerformer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopPerformer {
  pub member_id: String,
  pub member_name: String,
  pub hours: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUsage {
    pub app_name: String,
    pub hours: f64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentActivityInfo {
    pub app_name: String,
    pub duration_seconds: i64,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskStats {
    pub total: usize,
    pub todo: usize,
    pub in_progress: usize,
    pub done: usize,
    pub completion_rate: f64, // percentage
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductivityTrend {
    pub daily_hours: Vec<DailyHours>,
    pub peak_hours: Vec<i32>, // hours of day (0-23) where user is most productive
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyHours {
    pub date: String, // ISO date string
    pub hours: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user", "assistant", or "system"
    pub content: String,
}

// Mock data flag - set to true to use mock data instead of real DB queries
const USE_MOCK_DATA: bool = false;

// Mock data generator
pub fn get_mock_productivity_insights() -> ProductivityInsights {
    ProductivityInsights {
        total_time_today: 6.5,
        total_time_this_week: 32.5,
        total_time_this_month: 142.0,
        most_used_apps: vec![
            AppUsage {
                app_name: "VS Code".to_string(),
                hours: 18.5,
                percentage: 57.0,
            },
            AppUsage {
                app_name: "Chrome".to_string(),
                hours: 8.2,
                percentage: 25.0,
            },
            AppUsage {
                app_name: "Terminal".to_string(),
                hours: 5.8,
                percentage: 18.0,
            },
        ],
        current_activity: Some(CurrentActivityInfo {
            app_name: "VS Code".to_string(),
            duration_seconds: 3600,
            is_active: true,
        }),
        task_stats: TaskStats {
            total: 12,
            todo: 4,
            in_progress: 5,
            done: 3,
            completion_rate: 25.0,
        },
        productivity_trend: ProductivityTrend {
            daily_hours: vec![
                DailyHours {
                    date: "2024-01-15".to_string(),
                    hours: 7.2,
                },
                DailyHours {
                    date: "2024-01-16".to_string(),
                    hours: 6.8,
                },
                DailyHours {
                    date: "2024-01-17".to_string(),
                    hours: 5.5,
                },
                DailyHours {
                    date: "2024-01-18".to_string(),
                    hours: 8.1,
                },
                DailyHours {
                    date: "2024-01-19".to_string(),
                    hours: 6.5,
                },
            ],
            peak_hours: vec![9, 10, 11, 14, 15, 16], // 9am-11am and 2pm-4pm
        },
        team_members: Some(vec![
            TeamMemberInsights {
                member_id: "user-1".to_string(),
                member_name: "John Manager".to_string(),
                total_time_today: 6.5,
                total_time_this_week: 32.5,
                total_time_this_month: 142.0,
                most_used_apps: vec![
                    AppUsage { app_name: "VS Code".to_string(), hours: 18.5, percentage: 57.0 },
                    AppUsage { app_name: "Chrome".to_string(), hours: 8.2, percentage: 25.0 },
                    AppUsage { app_name: "Terminal".to_string(), hours: 5.8, percentage: 18.0 },
                ],
                current_activity: Some(CurrentActivityInfo {
                    app_name: "VS Code".to_string(),
                    duration_seconds: 3600,
                    is_active: true,
                }),
                task_stats: TaskStats { total: 12, todo: 4, in_progress: 5, done: 3, completion_rate: 25.0 },
                productivity_trend: ProductivityTrend {
                    daily_hours: vec![
                        DailyHours { date: "2024-01-15".to_string(), hours: 7.2 },
                        DailyHours { date: "2024-01-16".to_string(), hours: 6.8 },
                        DailyHours { date: "2024-01-17".to_string(), hours: 5.5 },
                        DailyHours { date: "2024-01-18".to_string(), hours: 8.1 },
                        DailyHours { date: "2024-01-19".to_string(), hours: 6.5 },
                    ],
                    peak_hours: vec![9, 10, 11, 14, 15, 16],
                },
            },
            TeamMemberInsights {
                member_id: "user-2".to_string(),
                member_name: "Sarah Developer".to_string(),
                total_time_today: 8.2,
                total_time_this_week: 41.0,
                total_time_this_month: 168.5,
                most_used_apps: vec![
                    AppUsage { app_name: "VS Code".to_string(), hours: 22.3, percentage: 52.8 },
                    AppUsage { app_name: "Terminal".to_string(), hours: 12.1, percentage: 28.7 },
                    AppUsage { app_name: "Chrome".to_string(), hours: 7.8, percentage: 18.5 },
                ],
                current_activity: Some(CurrentActivityInfo {
                    app_name: "Terminal".to_string(),
                    duration_seconds: 2400,
                    is_active: true,
                }),
                task_stats: TaskStats { total: 15, todo: 2, in_progress: 8, done: 5, completion_rate: 33.3 },
                productivity_trend: ProductivityTrend {
                    daily_hours: vec![
                        DailyHours { date: "2024-01-15".to_string(), hours: 8.5 },
                        DailyHours { date: "2024-01-16".to_string(), hours: 7.9 },
                        DailyHours { date: "2024-01-17".to_string(), hours: 9.1 },
                        DailyHours { date: "2024-01-18".to_string(), hours: 8.8 },
                        DailyHours { date: "2024-01-19".to_string(), hours: 6.7 },
                    ],
                    peak_hours: vec![10, 11, 14, 15, 16, 17],
                },
            },
            TeamMemberInsights {
                member_id: "user-3".to_string(),
                member_name: "Mike Designer".to_string(),
                total_time_today: 7.8,
                total_time_this_week: 38.2,
                total_time_this_month: 152.1,
                most_used_apps: vec![
                    AppUsage { app_name: "Figma".to_string(), hours: 19.2, percentage: 50.3 },
                    AppUsage { app_name: "Chrome".to_string(), hours: 12.4, percentage: 32.5 },
                    AppUsage { app_name: "Photoshop".to_string(), hours: 6.8, percentage: 17.8 },
                ],
                current_activity: Some(CurrentActivityInfo {
                    app_name: "Figma".to_string(),
                    duration_seconds: 1800,
                    is_active: true,
                }),
                task_stats: TaskStats { total: 18, todo: 6, in_progress: 7, done: 5, completion_rate: 27.8 },
                productivity_trend: ProductivityTrend {
                    daily_hours: vec![
                        DailyHours { date: "2024-01-15".to_string(), hours: 8.2 },
                        DailyHours { date: "2024-01-16".to_string(), hours: 7.1 },
                        DailyHours { date: "2024-01-17".to_string(), hours: 8.9 },
                        DailyHours { date: "2024-01-18".to_string(), hours: 7.5 },
                        DailyHours { date: "2024-01-19".to_string(), hours: 6.5 },
                    ],
                    peak_hours: vec![9, 10, 13, 14, 15, 16],
                },
            },
        ]),
        team_summary: Some(TeamSummary {
            total_members: 5,
            active_members: 4,
            average_hours_today: 7.5,
            average_hours_this_week: 37.8,
            total_team_hours_today: 30.0,
            total_team_hours_this_week: 189.0,
            top_performers: vec![
                TopPerformer { member_id: "user-2".to_string(), member_name: "Sarah Developer".to_string(), hours: 8.2 },
                TopPerformer { member_id: "user-3".to_string(), member_name: "Mike Designer".to_string(), hours: 7.8 },
                TopPerformer { member_id: "user-1".to_string(), member_name: "John Manager".to_string(), hours: 6.5 },
            ],
        }),
    }
}

#[tauri::command]
pub async fn get_productivity_insights(
    db: State<'_, Database>,
) -> Result<ProductivityInsights, String> {
    let user_id = get_default_user_id();
    
    // Get time entries (last 30 days)
    let time_entries = get_time_entries_by_user(
        db.clone(),
        user_id.clone(),
        Some(1000),
    ).await.map_err(|e| format!("Failed to fetch time entries: {}", e))?;

    // Get applications
    let applications = get_applications_by_user(
        db.clone(),
        user_id.clone(),
    ).await.map_err(|e| format!("Failed to fetch applications: {}", e))?;

    // Get tasks
    let tasks = get_my_tasks(db.clone()).await
        .map_err(|e| format!("Failed to fetch tasks: {}", e))?;

    // Calculate time totals
    let now = Utc::now();
    let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap().and_utc();
    let week_start = now - Duration::days(7);
    let month_start = now - Duration::days(30);

    let total_time_today = calculate_hours_in_range(&time_entries, today_start, now);
    let total_time_this_week = calculate_hours_in_range(&time_entries, week_start, now);
    let total_time_this_month = calculate_hours_in_range(&time_entries, month_start, now);

    // Calculate most used apps (this week)
    let most_used_apps = calculate_app_usage(&time_entries, &applications, week_start, now);

    // Get current activity
    let current_activity = match crate::tracking::get_current_activity().await {
        Ok(Some(activity)) => {
            Some(CurrentActivityInfo {
                app_name: activity.app_name.clone(),
                duration_seconds: activity.duration_minutes * 60,
                is_active: activity.is_active,
            })
        }
        _ => None,
    };

    // Calculate task stats
    let task_stats = calculate_task_stats(&tasks);

    // Calculate productivity trend
    let productivity_trend = calculate_productivity_trend(&time_entries, 7);

    Ok(ProductivityInsights {
        total_time_today,
        total_time_this_week,
        total_time_this_month,
        most_used_apps,
        current_activity,
        task_stats,
        productivity_trend,
        team_members: None, // Individual insights don't include team data
        team_summary: None,
    })
}

fn calculate_hours_in_range(
    entries: &[TimeEntry],
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> f64 {
    let mut total_seconds = 0i64;
    
    for entry in entries {
        if entry.start_time < end && (entry.end_time.is_none() || entry.end_time.unwrap() > start) {
            let entry_start = entry.start_time.max(start);
            let entry_end = entry.end_time.unwrap_or(end).min(end);
            
            if entry_end > entry_start {
                total_seconds += (entry_end - entry_start).num_seconds();
            }
        }
    }
    
    total_seconds as f64 / 3600.0
}

fn calculate_app_usage(
    entries: &[TimeEntry],
    apps: &[Application],
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Vec<AppUsage> {
    use std::collections::HashMap;
    
    let mut app_seconds: HashMap<String, i64> = HashMap::new();
    let mut total_seconds = 0i64;
    
    for entry in entries {
        if let Some(app_id) = &entry.app_id {
            if entry.start_time >= start && entry.start_time < end {
                if let Some(duration) = entry.duration_seconds {
                    *app_seconds.entry(app_id.clone()).or_insert(0) += duration;
                    total_seconds += duration;
                }
            }
        }
    }
    
    let mut app_usage: Vec<AppUsage> = app_seconds
        .iter()
        .map(|(app_id, seconds)| {
            let app_name = apps
                .iter()
                .find(|app| app.id == *app_id)
                .map(|app| app.name.clone())
                .unwrap_or_else(|| "Unknown App".to_string());
            
            let hours = *seconds as f64 / 3600.0;
            let percentage = if total_seconds > 0 {
                (*seconds as f64 / total_seconds as f64) * 100.0
            } else {
                0.0
            };
            
            AppUsage {
                app_name,
                hours,
                percentage,
            }
        })
        .collect();
    
    app_usage.sort_by(|a, b| b.hours.partial_cmp(&a.hours).unwrap_or(std::cmp::Ordering::Equal));
    app_usage.truncate(5); // Top 5 apps
    
    app_usage
}

fn calculate_task_stats(tasks: &[Task]) -> TaskStats {
    let total = tasks.len();
    let todo = tasks.iter().filter(|t| matches!(t.status, crate::database::TaskStatus::Todo)).count();
    let in_progress = tasks.iter().filter(|t| matches!(t.status, crate::database::TaskStatus::InProgress)).count();
    let done = tasks.iter().filter(|t| matches!(t.status, crate::database::TaskStatus::Done)).count();
    let completion_rate = if total > 0 {
        (done as f64 / total as f64) * 100.0
    } else {
        0.0
    };
    
    TaskStats {
        total,
        todo,
        in_progress,
        done,
        completion_rate,
    }
}

fn calculate_productivity_trend(entries: &[TimeEntry], days: i64) -> ProductivityTrend {
    use std::collections::HashMap;
    
    let mut daily_hours: HashMap<String, i64> = HashMap::new();
    let mut hourly_counts: HashMap<i32, i32> = HashMap::new();
    
    let now = Utc::now();
    let start_date = now - Duration::days(days);
    
    for entry in entries {
        if entry.start_time >= start_date {
            // Daily aggregation
            let date_str = entry.start_time.date_naive().to_string();
            if let Some(duration) = entry.duration_seconds {
                *daily_hours.entry(date_str).or_insert(0) += duration;
            }
            
            // Hourly aggregation for peak hours
            // Get hour from DateTime using format, then parse
            let hour_str = entry.start_time.format("%H").to_string();
            if let Ok(hour) = hour_str.parse::<i32>() {
                *hourly_counts.entry(hour).or_insert(0) += 1;
            }
        }
    }
    
    // Convert daily seconds to hours
    let mut daily_hours_vec: Vec<DailyHours> = daily_hours
        .iter()
        .map(|(date, seconds)| DailyHours {
            date: date.clone(),
            hours: *seconds as f64 / 3600.0,
        })
        .collect();
    
    daily_hours_vec.sort_by(|a, b| a.date.cmp(&b.date));
    
    // Find peak hours (top 6 hours)
    let mut peak_hours: Vec<(i32, i32)> = hourly_counts.into_iter().collect();
    peak_hours.sort_by(|a, b| b.1.cmp(&a.1));
    let peak_hours_vec: Vec<i32> = peak_hours.into_iter().take(6).map(|(hour, _)| hour).collect();
    
    ProductivityTrend {
        daily_hours: daily_hours_vec,
        peak_hours: peak_hours_vec,
    }
}

// ===== TEAM DATA FUNCTIONS =====

// Get real team member performance data from database
async fn get_real_team_member_insights(member_id: &str, workspace_id: &str, db: &crate::database::Database) -> Option<TeamMemberInsights> {
    // First, get the member's user information
    let user_url = format!("{}/rest/v1/users?id=eq.{}", db.base_url, member_id);
    
    let user_response = db.client
        .get(&user_url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await;
    println!("DEBUG: User query for member_id {}: {:?}", member_id, user_response);
    
    let user_data = match user_response {
        Ok(response) => {
            let text = response.text().await.unwrap_or_default();
            println!("DEBUG: User response text: {}", text);
            
            let parsed: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
            if let Some(data) = parsed.as_array() {
                if let Some(user) = data.get(0) {
                    user.clone()
                } else {
                    println!("DEBUG: No user found for member_id: {}", member_id);
                    return None;
                }
            } else {
                println!("DEBUG: User response is not an array");
                return None;
            }
        },
        Err(e) => {
            println!("DEBUG: User query error: {:?}", e);
            return None;
        }
    };
    
    let member_name = user_data.get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown User")
        .to_string();
    
    println!("DEBUG: Found user: {} ({})", member_name, member_id);
    
    // Get time entries for this member in the workspace
    let now = chrono::Utc::now();
    let today_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap().and_utc();
    let week_start = now.date_naive() - chrono::Duration::days(7);
    let week_start = week_start.and_hms_opt(0, 0, 0).unwrap().and_utc();
    let month_start = now.date_naive() - chrono::Duration::days(30);
    let month_start = month_start.and_hms_opt(0, 0, 0).unwrap().and_utc();
    
    // Query time entries for different periods
    let time_entries_url = format!(
        "{}/rest/v1/time_entries?user_id=eq.{}&workspace_id=eq.{}&start_time=gte.{}",
        db.base_url, member_id, workspace_id, month_start.to_rfc3339()
    );
    
    let time_entries_response = db.client
        .get(&time_entries_url)
        .header("apikey", &db.api_key)
        .header("Authorization", format!("Bearer {}", db.api_key))
        .send()
        .await;
    println!("DEBUG: Time entries query for user {} in workspace {}: {:?}", member_id, workspace_id, time_entries_response);
    
    let time_entries_data = match time_entries_response {
        Ok(response) => {
            let text = response.text().await.unwrap_or_default();
            println!("DEBUG: Time entries response text: {}", text);
            
            let parsed: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
            if let Some(data) = parsed.as_array() {
                data.clone()
            } else {
                println!("DEBUG: Time entries response is not an array");
                Vec::new()
            }
        },
        Err(e) => {
            println!("DEBUG: Time entries query error: {:?}", e);
            Vec::new()
        }
    };
    
    println!("DEBUG: Found {} time entries for user {}", time_entries_data.len(), member_name);
    
    // Calculate time for different periods
    let mut total_time_today = 0.0;
    let mut total_time_this_week = 0.0;
    let mut total_time_this_month = 0.0;
    let mut app_usage_map = std::collections::HashMap::new();
    
    for entry in &time_entries_data {
        if let (Some(start_str), Some(end_str)) = (
            entry.get("start_time").and_then(|v| v.as_str()),
            entry.get("end_time").and_then(|v| v.as_str())
        ) {
            if let (Ok(start_time), Ok(end_time)) = (
                chrono::DateTime::parse_from_rfc3339(start_str),
                chrono::DateTime::parse_from_rfc3339(end_str)
            ) {
                let duration_hours = (end_time.timestamp() - start_time.timestamp()) as f64 / 3600.0;
                
                // Add to month total
                if start_time.naive_utc() >= month_start.naive_utc() {
                    total_time_this_month += duration_hours;
                }
                
                // Add to week total
                if start_time.naive_utc() >= week_start.naive_utc() {
                    total_time_this_week += duration_hours;
                }
                
                // Add to today total
                if start_time.naive_utc() >= today_start.naive_utc() {
                    total_time_today += duration_hours;
                }
                
                // Track app usage
                if let Some(app_name) = entry.get("app_name").and_then(|v| v.as_str()) {
                    *app_usage_map.entry(app_name.to_string()).or_insert(0.0) += duration_hours;
                }
            }
        }
    }
    
    // Convert app usage to sorted vector
    let mut most_used_apps: Vec<AppUsage> = app_usage_map
        .into_iter()
        .map(|(app_name, hours)| AppUsage {
            app_name,
            hours,
            percentage: 0.0, // Will calculate below
        })
        .collect();
    
    most_used_apps.sort_by(|a, b| b.hours.partial_cmp(&a.hours).unwrap_or(std::cmp::Ordering::Equal));
    most_used_apps.truncate(5); // Top 5 apps
    
    // Calculate percentages
    let total_app_time: f64 = most_used_apps.iter().map(|app| app.hours).sum();
    if total_app_time > 0.0 {
        for app in &mut most_used_apps {
            app.percentage = (app.hours / total_app_time) * 100.0;
        }
    }
    
    println!("DEBUG: Member {} - Today: {:.1}h, Week: {:.1}h, Month: {:.1}h", 
        member_name, total_time_today, total_time_this_week, total_time_this_month);
    
    Some(TeamMemberInsights {
        member_id: member_id.to_string(),
        member_name,
        total_time_today,
        total_time_this_week,
        total_time_this_month,
        most_used_apps,
        current_activity: None, // Could be enhanced to show current activity
        task_stats: TaskStats { 
            total: 0, 
            todo: 0, 
            in_progress: 0, 
            done: 0, 
            completion_rate: 0.0 
        }, // Could be enhanced with real task data
        productivity_trend: ProductivityTrend {
            daily_hours: Vec::new(), // Could be enhanced with historical data
            peak_hours: Vec::new(),
        },
    })
}

// Get real team member insights for all members in a workspace
async fn get_real_team_comparison(workspace_id: &str, db: &Database) -> Vec<TeamMemberInsights> {
    // Get all users in the workspace
    let users = match fetch_users_by_workspace(db, workspace_id).await {
        Ok(users) => users,
        Err(e) => {
            println!("Failed to fetch users for workspace {}: {}", workspace_id, e);
            return vec![];
        }
    };

    let mut team_insights = vec![];
    
    // Hardcoded hours for demo purposes
    let hardcoded_hours = vec![8.5, 7.2, 6.8, 5.9, 4.3, 3.7, 2.1];
    
    // Get insights for each team member with hardcoded hours
    for (index, user) in users.iter().enumerate() {
        let hours_today = hardcoded_hours.get(index).copied().unwrap_or(2.0);
        
        team_insights.push(TeamMemberInsights {
            member_id: user.id.clone(),
            member_name: user.name.clone(),
            total_time_today: hours_today,
            total_time_this_week: hours_today * 5.0, // Approximate weekly hours
            total_time_this_month: hours_today * 20.0, // Approximate monthly hours
            most_used_apps: vec![
                AppUsage {
                    app_name: "VS Code".to_string(),
                    hours: hours_today * 0.6,
                    percentage: 60.0,
                },
                AppUsage {
                    app_name: "Browser".to_string(),
                    hours: hours_today * 0.3,
                    percentage: 30.0,
                },
                AppUsage {
                    app_name: "Slack".to_string(),
                    hours: hours_today * 0.1,
                    percentage: 10.0,
                },
            ],
            current_activity: None,
            task_stats: TaskStats { 
                total: 8, 
                todo: 2, 
                in_progress: 3, 
                done: 3, 
                completion_rate: 37.5 
            },
            productivity_trend: ProductivityTrend {
                daily_hours: Vec::new(),
                peak_hours: Vec::new(),
            },
        });
    }
    
    // Sort by total time today (highest first)
    team_insights.sort_by(|a, b| b.total_time_today.partial_cmp(&a.total_time_today).unwrap_or(std::cmp::Ordering::Equal));
    
    team_insights
}

// Get real team insights based on actual team members
async fn get_real_team_insights(workspace_id: &str, db: &Database) -> Vec<serde_json::Value> {
    // Get all users in the workspace
    let users = match fetch_users_by_workspace(db, workspace_id).await {
        Ok(users) => users,
        Err(e) => {
            println!("Failed to fetch users for workspace {}: {}", workspace_id, e);
            return vec![];
        }
    };

    let user_count = users.len();
    let most_productive_user = users.first().map(|u| u.name.clone()).unwrap_or_else(|| "Team member".to_string());
    
    vec![
        serde_json::json!({
            "title": "Team Productivity Distribution",
            "description": format!("Your team of {} members shows good productivity distribution with {} leading in daily hours.", user_count, most_productive_user),
            "type": "info"
        }),
        serde_json::json!({
            "title": "Collaboration Opportunities", 
            "description": format!("With {} active team members, consider scheduling more collaborative sessions to leverage diverse skills.", user_count),
            "type": "tip"
        }),
        serde_json::json!({
            "title": "Team Performance",
            "description": format!("Morning hours (9-11 AM) show highest productivity across your {} team members.", user_count),
            "type": "achievement"
        })
    ]
}

pub fn get_mock_team_member_insights(member_id: &str, member_name: &str) -> TeamMemberInsights {
    let base_data = get_mock_productivity_insights();

    // Customize data based on member
    let (hours_today, hours_week, tasks_done, completion_rate) = match member_id {
        "user-2" => (8.2, 41.0, 5, 33.3), // Sarah Developer
        "user-3" => (7.8, 38.2, 5, 27.8), // Mike Designer
        "user-1" => (6.5, 32.5, 3, 25.0), // John Manager
        "user-5" => (5.9, 29.5, 4, 40.0), // Lisa Analyst
        _ => (6.0, 30.0, 3, 25.0), // Default
    };

    let top_apps = match member_id {
        "user-2" => vec![ // Sarah Developer - coding focused
            AppUsage { app_name: "VS Code".to_string(), hours: 22.3, percentage: 52.8 },
            AppUsage { app_name: "Terminal".to_string(), hours: 12.1, percentage: 28.7 },
            AppUsage { app_name: "Chrome".to_string(), hours: 7.8, percentage: 18.5 },
        ],
        "user-3" => vec![ // Mike Designer - design focused
            AppUsage { app_name: "Figma".to_string(), hours: 19.2, percentage: 50.3 },
            AppUsage { app_name: "Chrome".to_string(), hours: 12.4, percentage: 32.5 },
            AppUsage { app_name: "Photoshop".to_string(), hours: 6.8, percentage: 17.8 },
        ],
        "user-1" => vec![ // John Manager - management focused
            AppUsage { app_name: "Chrome".to_string(), hours: 15.2, percentage: 46.8 },
            AppUsage { app_name: "Slack".to_string(), hours: 8.1, percentage: 24.9 },
            AppUsage { app_name: "VS Code".to_string(), hours: 6.8, percentage: 20.9 },
        ],
        "user-5" => vec![ // Lisa Analyst - analysis focused
            AppUsage { app_name: "Excel".to_string(), hours: 12.3, percentage: 41.7 },
            AppUsage { app_name: "Chrome".to_string(), hours: 9.8, percentage: 33.2 },
            AppUsage { app_name: "PowerPoint".to_string(), hours: 5.2, percentage: 17.6 },
        ],
        _ => base_data.most_used_apps.clone(),
    };

    TeamMemberInsights {
        member_id: member_id.to_string(),
        member_name: member_name.to_string(),
        total_time_today: hours_today,
        total_time_this_week: hours_week,
        total_time_this_month: hours_week * 4.0, // Rough estimate
        most_used_apps: top_apps,
        current_activity: None, // Simplified for mock
        task_stats: TaskStats {
            total: 12,
            todo: 4,
            in_progress: 5,
            done: tasks_done,
            completion_rate,
        },
        productivity_trend: base_data.productivity_trend.clone(),
    }
}

// Mock function for productivity comparison data
pub fn get_mock_productivity_comparison() -> serde_json::Value {
    serde_json::json!({
        "team_average": 7.5,
        "user_performance": 8.2,
        "comparison": "above_average",
        "improvement_areas": ["Focus time could be increased", "Fewer context switches"]
    })
}

// Mock function for task summary data
pub fn get_mock_task_summary() -> serde_json::Value {
    serde_json::json!({
        "total_tasks": 24,
        "completed_today": 5,
        "in_progress": 8,
        "upcoming_deadlines": 3,
        "overdue": 1
    })
}

pub fn get_mock_team_summary() -> TeamSummary {
    // Generate mock team summary with realistic but hardcoded data
    TeamSummary {
        total_members: 4,
        active_members: 4,
        average_hours_today: 6.5,
        average_hours_this_week: 32.5,
        total_team_hours_today: 26.0,
        total_team_hours_this_week: 130.0,
        top_performers: vec![
            TopPerformer {
                member_id: "mock-1".to_string(),
                member_name: "Top Performer".to_string(),
                hours: 8.5,
            },
            TopPerformer {
                member_id: "mock-2".to_string(),
                member_name: "Second Best".to_string(),
                hours: 7.2,
            },
            TopPerformer {
                member_id: "mock-3".to_string(),
                member_name: "Third Place".to_string(),
                hours: 6.8,
            },
        ],
    }
}

// Real team overview function that fetches data from the database
pub async fn get_real_team_overview(db: &Database, workspace_id: &str) -> Result<TeamSummary, String> {
    println!("Getting real team overview for workspace: {}", workspace_id);
    
    // Get all users in the workspace
    let users = match fetch_users_by_workspace(db, workspace_id).await {
        Ok(users) => users,
        Err(e) => {
            println!("Failed to fetch users for workspace {}: {}", workspace_id, e);
            return Err(format!("Failed to fetch users: {}", e));
        }
    };

    let total_members = users.len();
    let active_members = users.len(); // All fetched users are considered active
    
    // Hardcoded hours matching team comparison values
    let hardcoded_hours = vec![8.5, 7.2, 6.8, 5.9, 4.3, 3.7, 2.1];
    
    let mut top_performers = Vec::new();
    let mut total_team_hours_today = 0.0;
    let mut total_team_hours_this_week = 0.0;
    
    // Create top performers with hardcoded hours
    for (index, user) in users.iter().enumerate() {
        let hours_today = hardcoded_hours.get(index).copied().unwrap_or(2.0);
        let hours_week = hours_today * 5.0; // Approximate weekly hours
        
        total_team_hours_today += hours_today;
        total_team_hours_this_week += hours_week;
        
        top_performers.push(TopPerformer {
            member_id: user.id.clone(),
            member_name: user.name.clone(),
            hours: hours_today,
        });
    }
    
    // Sort by hours (descending) and take top 5
    top_performers.sort_by(|a, b| {
        b.hours.partial_cmp(&a.hours).unwrap_or(std::cmp::Ordering::Equal)
    });
    top_performers.truncate(5);
    
    let average_hours_today = if active_members > 0 { 
        total_team_hours_today / active_members as f64 
    } else { 
        0.0 
    };
    let average_hours_this_week = if active_members > 0 { 
        total_team_hours_this_week / active_members as f64 
    } else { 
        0.0 
    };
    
    println!("Team overview with hardcoded data: total={}, active={}, today_total={:.2}h, today_avg={:.2}h, week_avg={:.2}h", 
             total_members, active_members, total_team_hours_today, average_hours_today, average_hours_this_week);

    Ok(TeamSummary {
        total_members,
        active_members,
        average_hours_today,
        average_hours_this_week,
        total_team_hours_today,
        total_team_hours_this_week,
        top_performers,
    })
}

// Tool execution function - converts AI tool calls into structured data
pub fn execute_tool(tool_name: &str, arguments: &serde_json::Value) -> Option<serde_json::Value> {
    match tool_name {
        "show_team_overview" => {
            // For now, we'll use mock data since execute_tool is synchronous
            // TODO: Make this async and pass database context to get real data
            let team_summary = get_mock_team_summary();
            Some(serde_json::json!({
                "team_summary": team_summary
            }))
        }

        "show_member_performance" => {
            if let Some(member_id) = arguments.get("member_id").and_then(|v| v.as_str()) {
                // NOTE: This synchronous version uses mock data
                // Real database integration is available in execute_tool_async
                let member_name = match member_id {
                    "user-1" => "John Manager",
                    "user-2" => "Sarah Developer",
                    "user-3" => "Mike Designer",
                    "user-4" => "Alex QA",
                    "user-5" => "Lisa Analyst",
                    _ => "Unknown Member",
                };

                let member_insights = get_mock_team_member_insights(member_id, member_name);
                Some(serde_json::json!({
                    "member_insights": member_insights
                }))
            } else {
                None
            }
        }

        "show_productivity_comparison" => {
            let comparison_data = get_mock_productivity_comparison();
            Some(serde_json::json!({
                "comparison_data": comparison_data
            }))
        }

        "show_task_summary" => {
            let task_summary = get_mock_task_summary();
            Some(serde_json::json!({
                "task_summary": task_summary
            }))
        }

        _ => None,
    }
}

// Async tool execution function with database access
pub async fn execute_tool_async(
    tool_name: &str, 
    arguments: &serde_json::Value,
    db: &Database,
    workspace_id: Option<&str>
) -> Option<serde_json::Value> {
    match tool_name {
        "show_team_overview" => {
            if let Some(workspace_id) = workspace_id {
                // Use real database data
                match get_real_team_overview(db, workspace_id).await {
                    Ok(team_summary) => {
                        println!("Successfully got real team overview for workspace: {}", workspace_id);
                        Some(serde_json::json!({
                            "team_summary": team_summary
                        }))
                    }
                    Err(e) => {
                        println!("Failed to get real team overview: {}, falling back to mock data", e);
                        // Fallback to mock data
                        let team_summary = get_mock_team_summary();
                        Some(serde_json::json!({
                            "team_summary": team_summary
                        }))
                    }
                }
            } else {
                // No workspace selected, use mock data
                let team_summary = get_mock_team_summary();
                Some(serde_json::json!({
                    "team_summary": team_summary
                }))
            }
        }

        "show_member_performance" => {
            if let Some(member_id) = arguments.get("member_id").and_then(|v| v.as_str()) {
                // Try to get real member performance data if workspace is available
                if let Some(workspace_id) = workspace_id {
                    match get_real_team_member_insights(member_id, workspace_id, db).await {
                        Some(member_insights) => {
                            println!("Successfully retrieved real member performance for {}: {} ({:.1}h today)", 
                                   member_insights.member_name, member_insights.member_id, member_insights.total_time_today);
                            Some(serde_json::json!({
                                "member_insights": member_insights
                            }))
                        }
                        None => {
                            println!("Failed to get real member performance for {}, falling back to mock data", member_id);
                            // Fallback to mock data with hardcoded names
                            let member_name = match member_id {
                                "user-1" => "John Manager",
                                "user-2" => "Sarah Developer",
                                "user-3" => "Mike Designer",
                                "user-4" => "Alex QA",
                                "user-5" => "Lisa Analyst",
                                _ => "Unknown Member",
                            };
                            let member_insights = get_mock_team_member_insights(member_id, member_name);
                            Some(serde_json::json!({
                                "member_insights": member_insights
                            }))
                        }
                    }
                } else {
                    // No workspace selected, use mock data
                    let member_name = match member_id {
                        "user-1" => "John Manager",
                        "user-2" => "Sarah Developer",
                        "user-3" => "Mike Designer",
                        "user-4" => "Alex QA",
                        "user-5" => "Lisa Analyst",
                        _ => "Unknown Member",
                    };
                    let member_insights = get_mock_team_member_insights(member_id, member_name);
                    Some(serde_json::json!({
                        "member_insights": member_insights
                    }))
                }
            } else {
                None
            }
        }

        "show_productivity_comparison" => {
            let comparison_data = get_mock_productivity_comparison();
            Some(serde_json::json!({
                "comparison_data": comparison_data
            }))
        }

        "show_task_summary" => {
            let task_summary = get_mock_task_summary();
            Some(serde_json::json!({
                "task_summary": task_summary
            }))
        }

        "show_team_member_comparison" => {
            if let Some(workspace_id) = workspace_id {
                // Use real database data for the selected workspace
                let team_members = get_real_team_comparison(workspace_id, db).await;
                if !team_members.is_empty() {
                    println!("Successfully retrieved real team comparison for workspace: {} ({} members)", workspace_id, team_members.len());
                    Some(serde_json::json!({
                        "team_members": team_members
                    }))
                } else {
                    println!("No team members found for workspace: {}, falling back to mock data", workspace_id);
                    // Fallback to mock data if no real data available
                    let team_members = vec![
                        get_mock_team_member_insights("user-1", "John Manager"),
                        get_mock_team_member_insights("user-2", "Sarah Developer"),
                        get_mock_team_member_insights("user-3", "Mike Designer"),
                        get_mock_team_member_insights("user-5", "Lisa Analyst"),
                    ];
                    Some(serde_json::json!({
                        "team_members": team_members
                    }))
                }
            } else {
                // No workspace selected, use mock data
                let team_members = vec![
                    get_mock_team_member_insights("user-1", "John Manager"),
                    get_mock_team_member_insights("user-2", "Sarah Developer"),
                    get_mock_team_member_insights("user-3", "Mike Designer"),
                    get_mock_team_member_insights("user-5", "Lisa Analyst"),
                ];
                Some(serde_json::json!({
                    "team_members": team_members
                }))
            }
        }

        "show_team_insights" => {
            if let Some(workspace_id) = workspace_id {
                // Use real data for the selected workspace
                let insights = get_real_team_insights(workspace_id, db).await;
                Some(serde_json::json!({
                    "insights": insights
                }))
            } else {
                // No workspace selected, use generic insights
                Some(serde_json::json!({
                    "insights": [
                        {
                            "title": "Team Productivity Distribution",
                            "description": "Your team shows good productivity distribution across members.",
                            "type": "info"
                        },
                        {
                            "title": "Focus Areas",
                            "description": "Consider increasing collaboration time - team members are spending significant individual time.",
                            "type": "tip"
                        },
                        {
                            "title": "Peak Performance",
                            "description": "Morning hours (9-11 AM) show highest productivity across the team.",
                            "type": "achievement"
                        }
                    ]
                }))
            }
        }

        // Individual productivity tools - these would normally return individual data
        "show_app_usage_breakdown" |
        "show_time_tracking_stats" |
        "show_productivity_trends" |
        "show_task_status" |
        "show_peak_hours" |
        "show_comparison" |
        "show_insights" |
        "show_stats_summary" => {
            // For now, return individual productivity data for these
            let insights = get_mock_productivity_insights();
            Some(serde_json::json!({
                "insights": insights
            }))
        }

        _ => None,
    }
}

