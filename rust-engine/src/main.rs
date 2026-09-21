use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, FromRow};
use std::net::SocketAddr;

#[derive(Clone)]
struct AppState {
    db: SqlitePool,
    client: reqwest::Client,
}

#[tokio::main]
async fn main() {
    // Initialize SQLite database pool (creates apex_tasks.db file locally)
    let database_url = "sqlite:apex_tasks.db?mode=rwc";
    let db = SqlitePool::connect(&database_url)
        .await
        .expect("Failed to connect to SQLite database");

    // Auto-create tasks table if it doesn't exist
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
struct TaskResponse {
    task_id: String,
    status: String,
    agent_output: String,
}

async fn handle_agent_task(
    State(state): State<AppState>,
    Json(payload): Json<TaskRequest>,
) -> Json<TaskResponse> {
    println!("Received B2B Task from Client [{}]: Type -> {}", payload.client_id, payload.task_type);

    let task_id = format!("task_{}", uuid::Uuid::new_v4());
    let agent_output = format!("ApexSovereign Engine [SQLite Persisted Mode]: Processed prompt -> '{}'", payload.prompt);
    let status = "completed".to_string();

    // Persist task record into SQLite database
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

    Json(TaskResponse {
        task_id,
        status,
        agent_output,
    })
}
