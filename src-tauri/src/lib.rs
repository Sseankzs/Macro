mod commands;
mod config;
mod database;
mod default_user;

use commands::*;
use config::SupabaseConfig;
use database::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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

            // Initialize Supabase database
            let supabase_config = match SupabaseConfig::from_env() {
                Ok(config) => config,
                Err(e) => {
                    log::warn!("Failed to load Supabase config from environment: {}", e);
                    // You might want to provide default values or handle this differently
                    SupabaseConfig::new(
                        "https://your-project.supabase.co".to_string(),
                        "your-anon-key".to_string(),
                    )
                }
            };

            let database = Database::new(supabase_config.url, supabase_config.anon_key)
                .expect("Failed to initialize database");

            // Test database connection
            let db_clone = database.clone();
            tauri::async_runtime::spawn(async move {
                match db_clone.test_connection().await {
                    Ok(true) => log::info!("Database connection successful"),
                    Ok(false) => log::warn!("Database connection test failed"),
                    Err(e) => log::error!("Database connection error: {}", e),
                }
            });

            // Manage the database state
            app.manage(database);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // User commands
            create_user,
            get_user,
            get_users_by_team,
            update_user,
            // Team commands
            create_team,
            get_team,
            get_all_teams,
            // Project commands
            create_project,
            get_projects_by_team,
            get_project,
            // Task commands
            create_task,
            get_tasks_by_project,
            get_tasks_by_assignee,
            update_task,
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
            // Utility commands
            test_database_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
