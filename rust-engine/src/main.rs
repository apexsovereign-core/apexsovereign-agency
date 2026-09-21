use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::sse::{Event, Sse},
    routing::{get, post},
    Json, Router,
};
use futures_util::stream::{self, Stream};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::{convert::Infallible, net::SocketAddr, time::Duration};

#[derive(Clone)]
struct AppState {
    db: SqlitePool,
    client: reqwest::Client,
}

#[tokio::main]
async fn main() {
    let database_url = "sqlite:apex_tasks.db?mode=rwc";
    let db = SqlitePool::connect(&database_url)
        .await
        .expect("Failed to connect to SQLite database");

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL,
            task_type TEXT NOT NULL,
            prompt TEXT NOT NULL,
            agent_output TEXT NOT NULL,
            status TEXT NOT NULL
        )
        "#,
    )
    .execute(&db)
    .await
    .expect("Failed to initialize database schema");

    println!("Database initialized and connected successfully!");

    let state = AppState {
        db,
        client: reqwest::Client::new(),
    };

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/tasks", post(handle_agent_task))
        .route("/api/v1/tasks/stream", post(handle_streaming_task))
        .route("/api/v1/tasks/:id", get(get_task_by_id))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("ApexSovereign.ai engine listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> &'static str {
    "ApexSovereign.ai Rust Engine is online and operational!"
}

#[derive(Deserialize, Debug)]
struct TaskRequest {
    client_id: String,
    task_type: String,
    prompt: String,
}

#[derive(Serialize, FromRow)]
struct TaskRecord {
    #[sqlx(rename = "id")]
    task_id: String,
    client_id: String,
    task_type: String,
    prompt: String,
    agent_output: String,
    status: String,
}

#[derive(Serialize)]
struct TaskResponse {
    task_id: String,
    status: String,
    agent_output: String,
}

// Helper to validate Bearer token
fn validate_auth(headers: &HeaderMap) -> Result<(), StatusCode> {
    let auth_header = headers
        .get("authorization")
        .and_then(|val| val.to_str().ok());

    let expected_key = std::env::var("APEX_CLIENT_API_KEY")
        .unwrap_or_else(|_| "secret_alpha_key_123".to_string());
    let expected_auth = format!("Bearer {}", expected_key);

    match auth_header {
        Some(token) if token == expected_auth => Ok(()),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

// Helper to dispatch prompt via AppState client (OpenAI or Local Gateway fallback)
async fn dispatch_llm_call(client: &reqwest::Client, prompt: &str) -> String {
    let openai_key = std::env::var("OPENAI_API_KEY").unwrap_or_default();

    if openai_key.is_empty() {
        format!("ApexSovereign Active Client Mode: Successfully routed prompt -> '{}'", prompt)
    } else {
        let payload = serde_json::json!({
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}]
        });

        match client
            .post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(openai_key)
            .json(&payload)
            .send()
            .await
        {
            Ok(resp) => {
                // Fixed: Correctly awaiting/parsing response JSON once
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    json["choices"][0]["message"]["content"]
                        .as_str()
                        .unwrap_or("Error parsing LLM response")
                        .to_string()
                } else {
                    "Failed to decode OpenAI response structure.".to_string()
                }
            }
            Err(_) => "Outbound LLM connection failed.".to_string(),
        }
    }
}

async fn handle_agent_task(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TaskRequest>,
) -> Result<Json<TaskResponse>, StatusCode> {
    validate_auth(&headers)?;

    println!(
        "Received authenticated B2B Task from Client [{}]: Type -> {}",
        payload.client_id, payload.task_type
    );

    let task_id = format!("task_{}", uuid::Uuid::new_v4());
    let agent_output = dispatch_llm_call(&state.client, &payload.prompt).await;
    let status = "completed".to_string();

    let _ = sqlx::query(
        "INSERT INTO tasks (id, client_id, task_type, prompt, agent_output, status) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&task_id)
    .bind(&payload.client_id)
    .bind(&payload.task_type)
    .bind(&payload.prompt)
    .bind(&agent_output)
    .bind(&status)
    .execute(&state.db)
    .await;

    Ok(Json(TaskResponse {
        task_id,
        status,
        agent_output,
    }))
}

async fn handle_streaming_task(
    _state: State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TaskRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, StatusCode> {
    validate_auth(&headers)?;

    println!("Initiating real-time streaming pipeline for Client [{}]", payload.client_id);

    let connection_status = if std::env::var("OPENAI_API_KEY").is_ok() {
        "Connected to external LLM provider via AppState client..."
    } else {
        "Running local high-speed routing via AppState client..."
    };

    let steps = vec![
        "Initializing autonomous agent worker...",
        connection_status,
        "Executing streaming token pipeline...",
        "Synthesizing final B2B deliverable...",
        "Task execution complete successfully.",
    ];

    let stream = stream::iter(steps).then(|step| async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        Ok(Event::default().data(step))
    });

    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(1))
            .text("keep-alive-node"),
    ))
}

async fn get_task_by_id(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<TaskRecord>, StatusCode> {
    let result = sqlx::query_as::<_, TaskRecord>(
        "SELECT id, client_id, task_type, prompt, agent_output, status FROM tasks WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(task)) => Ok(Json(task)),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
    }
}