mod commands;
mod config;
mod database;
mod default_user;
mod tracking;

use commands::*;
use tracking::{start_activity_tracking, stop_activity_tracking, update_activity, get_current_activity, get_active_applications_count, stop_tracking_for_app, stop_tracking_for_app_by_id};
use tauri::Listener;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load environment variables from .env file
    dotenv::dotenv().ok();
    
    tauri::Builder::default()
        .setup(|app| {
            // Initialize logging
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Set up cleanup when app is about to close
            app.handle().listen("tauri://close-requested", move |_event| {
                // Stop all activity tracking when the app is closing
                if let Some(tracker) = crate::tracking::get_tracker() {
                    let rt = tokio::runtime::Handle::current();
                    rt.block_on(async {
                        if let Err(e) = tracker.stop_tracking().await {
                            eprintln!("Error stopping tracking on app close: {}", e);
                        } else {
                            println!("Activity tracking stopped on app close");
                        }
                    });
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // User commands
            create_user,
            get_user,
            get_users_by_team,
            get_all_users,
            update_user,
            delete_user,
            // Team commands
            create_team,
            get_team,
            get_all_teams,
            delete_team,
            // Project commands
            create_project,
            get_projects_by_team,
            get_project,
            get_all_projects,
            // Task commands
            create_task,
            get_tasks_by_project,
            get_tasks_by_assignee,
            update_task,
            delete_task,
            // Application commands
            create_application,
            get_applications_by_user,
            update_application,
            // Time entry commands
            create_time_entry,
            get_time_entries_by_user,
            get_time_entries_by_task,
            get_time_entries_by_app,
            update_time_entry,
            // Default user convenience commands
            get_current_user,
            get_current_user_id,
            get_my_applications,
            get_my_tasks,
            get_my_time_entries,
            create_my_application,
            update_my_application,
            toggle_my_application_tracking,
            delete_my_application,
            create_my_time_entry,
            // Process detection commands
            get_running_processes,
            // Activity tracking commands
            start_activity_tracking,
            stop_activity_tracking,
            update_activity,
            get_current_activity,
            get_active_applications_count,
            stop_tracking_for_app,
            stop_tracking_for_app_by_id,
            // Utility commands
            test_database_connection,
            initialize_database_and_login,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
