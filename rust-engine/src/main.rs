use axum::{
    extract::{State, Path},
    http::{HeaderMap, StatusCode},
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
    // Initialize SQLite database pool
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

// OpenAI structures
#[derive(Serialize)]
struct OpenAiRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
}

#[derive(Serialize)]
struct OpenAiMessage {
    role: String,
    content: String,
}

#[derive(Deserialize, Debug)]
struct OpenAiResponse {
    choices: Vec<OpenAiChoice>,
}

#[derive(Deserialize, Debug)]
struct OpenAiChoice {
    message: OpenAiMessageContent,
}

#[derive(Deserialize, Debug)]
struct OpenAiMessageContent {
    content: String,
}

async fn handle_agent_task(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<TaskRequest>,
) -> Result<Json<TaskResponse>, StatusCode> {
    // Validate B2B Client API Key from Authorization header
    let auth_header = headers
        .get("authorization")
        .and_then(|val| val.to_str().ok());

    let expected_key = std::env::var("APEX_CLIENT_API_KEY").unwrap_or_else(|_| "secret_alpha_key_123".to_string());
    let expected_auth = format!("Bearer {}", expected_key);

    match auth_header {
        Some(token) if token == expected_auth => {
            // Authorized! Proceed with task execution
        }
        _ => {
            return Err(StatusCode::UNAUTHORIZED);
        }
    }

    println!("Received authenticated B2B Task from Client [{}]: Type -> {}", payload.client_id, payload.task_type);

    let task_id = format!("task_{}", uuid::Uuid::new_v4());
    let api_key = std::env::var("OPENAI_API_KEY").unwrap_or_default();

    let agent_output = if api_key.is_empty() {
        format!("ApexSovereign Engine [Simulated LLM Mode]: Processed prompt -> '{}'", payload.prompt)
    } else {
        let openai_req = OpenAiRequest {
            model: "gpt-4o-mini".to_string(),
            messages: vec![
                OpenAiMessage {
                    role: "system".to_string(),
                    content: "You are an autonomous B2B AI agency engine.".to_string(),
                },
                OpenAiMessage {
                    role: "user".to_string(),
                    content: payload.prompt.clone(),
                },
            ],
        };

        match state.client
            .post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(api_key)
            .json(&openai_req)
            .send()
            .await
        {
            Ok(res) => {
                if res.status().is_success() {
                    match res.json::<OpenAiResponse>().await {
                        Ok(ai_res) => ai_res.choices.into_iter().next()
                            .map(|c| c.message.content)
                            .unwrap_or_else(|| "No response content returned from LLM.".to_string()),
                        Err(e) => format!("Failed to parse LLM JSON response: {}", e),
                    }
                } else {
                    format!("LLM API returned error status: {}", res.status())
                }
            }
            Err(e) => format!("Failed to connect to LLM provider: {}", e),
        }
    };

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
