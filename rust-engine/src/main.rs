use axum::{
    extract::{State, Path},
    http::{HeaderMap, StatusCode},
    response::sse::{Event, Sse},
    routing::{get, post},
    Json, Router,
};
use futures_util::stream::{self, Stream};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, FromRow};
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

    let expected_key = std::env::var("APEX_CLIENT_API_KEY").unwrap_or_else(|_| "secret_alpha_key_123".to_string());
    let expected_auth = format!("Bearer {}", expected_key);

    match auth_header {
        Some(token) if token == expected_auth => Ok(()),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

async fn handle_agent_task(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TaskRequest>,
) -> Result<Json<TaskResponse>, StatusCode> {
    validate_auth(&headers)?;

    println!("Received authenticated B2B Task from Client [{}]: Type -> {}", payload.client_id, payload.task_type);

    let task_id = format!("task_{}", uuid::Uuid::new_v4());
    let agent_output = format!("ApexSovereign Engine [Standard Mode]: Processed prompt -> '{}'", payload.prompt);
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

// Real-time Streaming Endpoint using Server-Sent Events (SSE)
async fn handle_streaming_task(
    headers: HeaderMap,
    Json(payload): Json<TaskRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, StatusCode> {
    validate_auth(&headers)?;

    println!("Initiating real-time streaming task for Client [{}]", payload.client_id);

    let steps = vec![
        "Initializing autonomous agent worker...",
        "Parsing contextual constraints and parameters...",
        "Executing LLM reasoning pipeline...",
        "Synthesizing final B2B deliverable...",
        "Task execution complete successfully.",
    ];

    let stream = stream::iter(steps).then(|step| async move {
        tokio::time::sleep(Duration::from_millis(600)).await;
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
