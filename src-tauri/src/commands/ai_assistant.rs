use crate::database::{Database, Application, TimeEntry, Task};
use crate::default_user::get_default_user_id;
use super::{get_time_entries_by_user, get_applications_by_user, get_my_tasks};
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
const USE_MOCK_DATA: bool = true;

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
    }
}

#[tauri::command]
pub async fn get_productivity_insights(
    db: State<'_, Database>,
) -> Result<ProductivityInsights, String> {
    if USE_MOCK_DATA {
        println!("[AI Assistant] Using mock data for productivity insights");
        return Ok(get_mock_productivity_insights());
    }

    let user_id = get_default_user_id();
    
    // Get time entries (last 30 days)
    let time_entries = match get_time_entries_by_user(
        db.clone(),
        user_id.clone(),
        Some(1000),
    ).await {
        Ok(entries) => entries,
        Err(e) => {
            println!("[AI Assistant] Error fetching time entries, using mock data: {}", e);
            return Ok(get_mock_productivity_insights());
        }
    };

    // Get applications
    let applications = match get_applications_by_user(
        db.clone(),
        user_id.clone(),
    ).await {
        Ok(apps) => apps,
        Err(e) => {
            println!("[AI Assistant] Error fetching applications, using mock data: {}", e);
            return Ok(get_mock_productivity_insights());
        }
    };

    // Get tasks
    let tasks = match get_my_tasks(db.clone()).await {
        Ok(tasks) => tasks,
        Err(e) => {
            println!("[AI Assistant] Error fetching tasks, using mock data: {}", e);
            return Ok(get_mock_productivity_insights());
        }
    };

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

