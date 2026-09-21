use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub env: String,
    pub platform_name: String,
}

impl AppState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            env: std::env::var("APP_ENV").unwrap_or_else(|_| "development".into()),
            platform_name: "ApexSovereign.ai Engine".into(),
        })
    }
}
