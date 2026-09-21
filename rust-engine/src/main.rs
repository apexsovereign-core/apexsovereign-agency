use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
    Json,
};
use futures_util::StreamExt;
use std::convert::Infallible;
use tokio_stream::wrappers::ReceiverStream;

// Example payload structure from your client request
#[derive(serde::Deserialize)]
pub struct TaskRequest {
    pub client_id: String,
    pub task_type: String,
    pub prompt: String,
}

pub async fn stream_llm_task_handler(
    State(state): State<AppState>,
    Json(payload): Json<TaskRequest>,
) -> Sse<ReceiverStream<Result<Event, Infallible>>> {
    let (tx, rx) = tokio::sync::mpsc::channel(100);

    tokio::spawn(async move {
        // 1. Initialize reqwest client
        let client = reqwest::Client::new();
        
        // 2. Build the request for an OpenAI-compatible streaming API
        let api_key = std::env::var("OPENAI_API_KEY").unwrap_or_default();
        let body = serde_json::json!({
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": payload.prompt}],
            "stream": true
        });

        let res_result = client
            .post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await;

        match res_result {
            Ok(response) => {
                let mut stream = response.bytes_stream();
                while let Some(chunk_result) = stream.next().await {
                    match chunk_result {
                        Ok(bytes) => {
                            let text = String::from_utf8_lossy(&bytes);
                            // Parse SSE data chunks from OpenAI and forward to client
                            let event = Event::default().data(text.to_string());
                            let _ = tx.send(Ok(event)).await;
                        }
                        Err(_) => break,
                    }
                }
            }
            Err(e) => {
                let err_event = Event::default().data(format!("Error connecting to LLM: {}", e));
                let _ = tx.send(Ok(err_event)).await;
            }
        }
    });

    Sse::new(ReceiverStream::new(rx)).keep_alive(KeepAlive::default())
}
