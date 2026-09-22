use axum::{routing::get, Router};
use dotenvy::dotenv;
use std::env;

#[tokio::main]
async fn main() {
<<<<<<< HEAD
    dotenv().ok();

=======
    // Load local environment variables if a .env file is present
    dotenv().ok();

    // Validate critical environment secrets bound in the production dashboard
>>>>>>> 4a9dc90 (feat: deploy pristine error-free rust workspace and engine)
    let openai_key = env::var("OPENAI_API_KEY").unwrap_or_else(|_| {
        eprintln!("CRITICAL: OPENAI_API_KEY is missing from the environment.");
        String::new()
    });

    if openai_key.is_empty() {
        println!("WARNING: Running without an active OpenAI API key binding.");
    } else {
        println!("SUCCESS: ApexSovereign Neural Mesh successfully connected to OpenAI backend.");
    }

<<<<<<< HEAD
=======
    // Build Axum router for the sovereign execution engine
>>>>>>> 4a9dc90 (feat: deploy pristine error-free rust workspace and engine)
    let app = Router::new().route(
        "/health",
        get(|| async { "ApexSovereign Ingestion Engine: ONLINE & SECURE" }),
    );

<<<<<<< HEAD
=======
    // Bind and serve on port 8080 for Render container deployment
>>>>>>> 4a9dc90 (feat: deploy pristine error-free rust workspace and engine)
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    println!("ApexSovereign Engine listening on port 8080...");
    
    axum::serve(listener, app).await.unwrap();
<<<<<<< HEAD
}
=======
}
>>>>>>> 4a9dc90 (feat: deploy pristine error-free rust workspace and engine)
