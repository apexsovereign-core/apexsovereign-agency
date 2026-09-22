use axum::{
    extract::State,
    response::sse::{Event, Sse},
    routing::post,
    Json, Router,
};
use futures_util::StreamExt;
use reqwest::Client;
use serde::Deserialize;
use std::{convert::Infallible, sync::Arc};
use tokio_stream::wrappers::ReceiverStream;

#[derive(Clone)]
struct AppState {
    client: Client,
    api_key: String,
}

#[derive(Deserialize)]
struct ChatRequest {
    prompt: String,
}

#[tokio::main]
async fn main() {
    // Load environment variables from local .env
    dotenvy::dotenv().ok();
    let api_key = std::env::var("OPENAI_API_KEY")
        .expect("OPENAI_API_KEY must be set in your local .env file");

    let state = Arc::new(AppState {
        client: Client::new(),
        api_key,
    });

    // Build your Axum router and add the route
    let app = Router::new()
        .route("/api/llm-stream", post(stream_llm_handler))
        .with_state(state);

    // Run the server
    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await.unwrap();
    println!("🚀 Apex Sovereign Rust Engine running on http://127.0.0.1:8080");
    axum::serve(listener, app).await.unwrap();
}

async fn stream_llm_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<ChatRequest>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let client = state.client.clone();
    let api_key = state.api_key.clone();

    let (tx, rx) = tokio::sync::mpsc::channel(100);

    tokio::spawn(async move {
        let body = serde_json::json!({
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": payload.prompt}],
            "stream": true
        });

        let res = client
            .post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await;

        match res {
            Ok(response) => {
                let mut stream = response.bytes_stream();
                while let Some(chunk_result) = stream.next().await {
                    match chunk_result {
                        Ok(bytes) => {
                            if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                                for line in text.lines() {
                                    if line.starts_with("data: ") {
                                        let data = &line[6..];
                                        if data != "[DONE]" {
                                            let _ = tx.send(Ok(Event::default().data(data))).await;
                                        }
                                    }
                                }
                            }
                        }
                        Err(_) => break,
                    }
                }
            }
            Err(_) => {
                let _ = tx.send(Ok(Event::default().data("Error connecting to OpenAI"))).await;
            }
        }
    });

    Sse::new(ReceiverStream::new(rx))
        .keep_alive(axum::response::sse::KeepAlive::default())
}
