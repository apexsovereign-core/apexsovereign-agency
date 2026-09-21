use axum::{
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    // Initialize shared Reqwest client for LLM communication
    let llm_client = reqwest::Client::new();

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/tasks", post(handle_agent_task))
        .with_state(llm_client);

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

#[derive(Serialize)]
struct TaskResponse {
    task_id: String,
    status: String,
    agent_output: String,
}

// OpenAI Chat Completion Payload Structures
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
    axum::extract::State(client): axum::extract::State<reqwest::Client>,
    Json(payload): Json<TaskRequest>,
) -> Json<TaskResponse> {
    println!("Received B2B Task from Client [{}]: Type -> {}", payload.client_id, payload.task_type);

    // Check if an API key is provided, otherwise fall back to a local model endpoint (e.g., Ollama) or simulated echo
    let api_key = std::env::var("OPENAI_API_KEY").unwrap_or_default();
    
    let agent_output = if api_key.is_empty() {
        // Fallback or Local LLM integration demo (e.g., local Ollama instance on port 11434)
        format!("ApexSovereign Engine [Simulated LLM Mode]: Processed prompt -> '{}'", payload.prompt)
    } else {
        // Live OpenAI API integration call via Reqwest
        let openai_req = OpenAiRequest {
            model: "gpt-4o-mini".to_string(),
            messages: vec![
                OpenAiMessage {
                    role: "system".to_string(),
                    content: "You are an autonomous B2B AI agency engine.".to_string(),
                },
                OpenAiMessage {
                    role: "role".to_string(),
                    content: payload.prompt,
                },
            ],
        };

        match client
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

    Json(TaskResponse {
        task_id: "task_uuid_live_01".to_string(),
        status: "completed".to_string(),
        agent_output,
    })
}
