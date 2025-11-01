mod commands;
mod config;
mod current_user;
mod database;
mod default_user;
mod tracking;
mod platform;
mod ai;

use commands::*;
use tracking::{start_activity_tracking, stop_activity_tracking, update_activity, get_current_activity, get_active_applications_count, stop_tracking_for_app, stop_tracking_for_app_by_id, get_detected_os};
use tauri::{Listener, Manager};

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

            println!("🚀 App setup starting - registering window close handlers...");

            // Try multiple approaches to catch window close events
            
            // Approach 1: tauri://close-requested event
            app.handle().listen("tauri://close-requested", move |_event| {
                println!("🔴 METHOD 1: tauri://close-requested event triggered!");
                
                // Create a new runtime for this context
                match tokio::runtime::Runtime::new() {
                    Ok(rt) => {
                        rt.block_on(async {
                            println!("🔄 Executing logout cleanup...");
                            match crate::commands::logout_user().await {
                                Ok(_) => println!("✅ Logout cleanup completed on app close"),
                                Err(e) => eprintln!("❌ Error during logout cleanup on app close: {}", e),
                            }
                        });
                    }
                    Err(e) => eprintln!("❌ Failed to create runtime for cleanup: {}", e),
                }
                
                println!("🏁 Window close cleanup finished");
            });

            // Approach 2: Try the window-specific event
            let main_window = app.get_webview_window("main");
            if let Some(window) = main_window {
                println!("🪟 Found main window, setting up window-specific close handler...");
                
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::CloseRequested { .. } => {
                            println!("🔴 METHOD 2: WindowEvent::CloseRequested triggered!");
                            
                            // Create a new runtime for this context
                            match tokio::runtime::Runtime::new() {
                                Ok(rt) => {
                                    rt.block_on(async {
                                        println!("🔄 Executing logout cleanup via window event...");
                                        match crate::commands::logout_user().await {
                                            Ok(_) => println!("✅ Window event logout cleanup completed"),
                                            Err(e) => eprintln!("❌ Error during window event logout cleanup: {}", e),
                                        }
                                    });
                                }
                                Err(e) => eprintln!("❌ Failed to create runtime for window event cleanup: {}", e),
                            }
                            
                            println!("🏁 Window event cleanup finished");
                        }
                        _ => {}
                    }
                });
            } else {
                println!("⚠️ Could not find main window for event handler");
            }

            println!("✅ App setup completed with window close handlers registered");
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
            get_detected_os,
            // Utility commands
            test_database_connection,
            initialize_database_and_login,
            sign_up_user,
            logout_user,
            // E2EE team key helpers (prototype)
            get_team_key_record,
            upsert_team_key_record,
            // AI Assistant commands
            get_productivity_insights,
            ai_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
