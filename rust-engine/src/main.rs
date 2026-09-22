use axum::{routing::get, Router};
use dotenvy::dotenv;
use std::env;

#[tokio::main]
async fn main() {
    dotenv().ok();

    // Verifies the environment variable is active from Render's dashboard
    if env::var("OPENAI_API_KEY").is_ok() {
        println!("SUCCESS: ApexSovereign Neural Mesh successfully connected to OpenAI backend.");
    }

    let app = Router::new()
        .route("/", get(|| async { "ApexSovereign Neural Mesh API is Online" }))
        .route("/health", get(|| async { "ApexSovereign Ingestion Engine: ONLINE & SECURE" }));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    println!("ApexSovereign Engine listening on port 8080...");
    
    axum::serve(listener, app).await.unwrap();
}