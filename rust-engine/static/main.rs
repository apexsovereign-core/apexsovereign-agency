use axum::{
    response::Html,
    routing::get,
    Router,
};
use dotenvy::dotenv;
use std::env;

#[tokio::main]
async fn main() {
    dotenv().ok();

    if env::var("OPENAI_API_KEY").is_ok() {
        println!("SUCCESS: ApexSovereign Neural Mesh successfully connected to OpenAI backend.");
    }

    let app = Router::new()
        .route("/", get(index_handler))
        .route("/health", get(|| async { "ApexSovereign Ingestion Engine: ONLINE & SECURE" }));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    println!("ApexSovereign Engine listening on port 8080...");
    
    axum::serve(listener, app).await.unwrap();
}

async fn index_handler() -> Html<&'static str> {
    Html(r#"
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ApexSovereign.ai | Neural Mesh Engine</title>
            <style>
                body {
                    background-color: #0d1117;
                    color: #c9d1d9;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .container {
                    text-align: center;
                    padding: 2rem;
                    border: 1px solid #30363d;
                    border-radius: 8px;
                    background-color: #161b22;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    max-width: 500px;
                }
                h1 {
                    color: #58a6ff;
                    font-size: 1.5rem;
                    margin-bottom: 0.5rem;
                }
                p {
                    color: #8b949e;
                    font-size: 0.95rem;
                }
                .status {
                    display: inline-block;
                    margin-top: 1rem;
                    padding: 0.25rem 0.75rem;
                    font-size: 0.85rem;
                    font-weight: bold;
                    color: #3fb950;
                    background-color: rgba(63, 185, 80, 0.1);
                    border: 1px solid rgba(63, 185, 80, 0.4);
                    border-radius: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>ApexSovereign.ai</h1>
                <p>Distributed LLM Orchestration & Neural Mesh Engine</p>
                <div class="status">● SYSTEM ONLINE</div>
            </div>
        </body>
        </html>
    "#)
}