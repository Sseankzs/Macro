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
        let url = env::var("SUPABASE_URL")
            .or_else(|_| env::var("VITE_SUPABASE_URL"))
            .map_err(|_| anyhow::anyhow!("SUPABASE_URL environment variable not found"))?;

        let anon_key = env::var("SUPABASE_ANON_KEY")
            .or_else(|_| env::var("VITE_SUPABASE_ANON_KEY"))
            .map_err(|_| anyhow::anyhow!("SUPABASE_ANON_KEY environment variable not found"))?;

        Ok(Self { url, anon_key })
    }

    pub fn new(url: String, anon_key: String) -> Self {
        Self { url, anon_key }
    }
}
