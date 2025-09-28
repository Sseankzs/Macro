use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseConfig {
    pub url: String,
    pub anon_key: String,
}

impl SupabaseConfig {
    pub fn from_env() -> Result<Self> {
        // Try to load URL
        let url = env::var("SUPABASE_URL")
            .or_else(|_| {
                log::info!("SUPABASE_URL not found, trying VITE_SUPABASE_URL");
                env::var("VITE_SUPABASE_URL")
            })
            .map_err(|_| anyhow::anyhow!("SUPABASE_URL environment variable not found"))?;

        // Try to load API key
        let anon_key = env::var("SUPABASE_ANON_KEY")
            .or_else(|_| {
                log::info!("SUPABASE_ANON_KEY not found, trying VITE_SUPABASE_ANON_KEY");
                env::var("VITE_SUPABASE_ANON_KEY")
            })
            .or_else(|_| {
                log::info!("VITE_SUPABASE_ANON_KEY not found, trying VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY");
                env::var("VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY")
            })
            .map_err(|_| anyhow::anyhow!("SUPABASE_ANON_KEY environment variable not found"))?;

        log::info!("Loaded Supabase URL: {}", url);
        log::info!("Loaded API key: {}...", &anon_key[..std::cmp::min(10, anon_key.len())]);

        Ok(Self { url, anon_key })
    }

    pub fn new(url: String, anon_key: String) -> Self {
        Self { url, anon_key }
    }
}
