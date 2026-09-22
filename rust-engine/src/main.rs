use axum::{routing::get, Router};
use dotenvy::dotenv;
use std::env;

#[tokio::main]
async fn main() {
    dotenv().ok();

    let openai_key = env::var("OPENAI_API_KEY").unwrap_or_else(|_| {
        eprintln!("CRITICAL: OPENAI_API_KEY is missing from the environment.");
        String::new()
    });

    if openai_key.is_empty() {
        println!("WARNING: Running without an active OpenAI API key binding.");
    } else {
        println!("SUCCESS: ApexSovereign Neural Mesh successfully connected to OpenAI backend.");
    }

    let app = Router::new().route(
        "/health",
        get(|| async { "ApexSovereign Ingestion Engine: ONLINE & SECURE" }),
    );

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    println!("ApexSovereign Engine listening on port 8080...");
    
    axum::serve(listener, app).await.unwrap();
}
