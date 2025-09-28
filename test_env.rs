use std::env;

fn main() {
    println!("Testing environment variables...");
    
    // Test URL loading
    let url = env::var("SUPABASE_URL")
        .or_else(|_| {
            println!("SUPABASE_URL not found, trying VITE_SUPABASE_URL");
            env::var("VITE_SUPABASE_URL")
        });
    
    match url {
        Ok(u) => println!("✓ URL loaded: {}", u),
        Err(e) => println!("✗ URL not found: {}", e),
    }
    
    // Test API key loading
    let anon_key = env::var("SUPABASE_ANON_KEY")
        .or_else(|_| {
            println!("SUPABASE_ANON_KEY not found, trying VITE_SUPABASE_ANON_KEY");
            env::var("VITE_SUPABASE_ANON_KEY")
        })
        .or_else(|_| {
            println!("VITE_SUPABASE_ANON_KEY not found, trying VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY");
            env::var("VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY")
        });
    
    match anon_key {
        Ok(k) => println!("✓ API key loaded: {}...", &k[..std::cmp::min(10, k.len())]),
        Err(e) => println!("✗ API key not found: {}", e),
    }
}
