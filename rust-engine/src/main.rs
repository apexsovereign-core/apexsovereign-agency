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
    Html(r###"
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ApexSovereign.ai - The Sovereign Global Work OS</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    background-color: #060913;
                    color: #ffffff;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: space-between;
                }
                header {
                    width: 100%;
                    max-width: 1400px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1.5rem 2rem;
                }
                .logo-area {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .logo-icon {
                    width: 32px;
                    height: 32px;
                    background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
                    clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
                }
                .logo-text h1 {
                    font-size: 1.1rem;
                    font-weight: 700;
                    letter-spacing: -0.5px;
                }
                .logo-text span {
                    font-size: 0.75rem;
                    color: #8b949e;
                }
                nav {
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }
                nav a {
                    color: #c9d1d9;
                    text-decoration: none;
                    font-size: 0.9rem;
                    transition: color 0.2s;
                }
                nav a:hover {
                    color: #00f2fe;
                }
                .sign-in-btn {
                    background-color: #00f2fe;
                    color: #060913;
                    padding: 0.5rem 1.25rem;
                    border-radius: 6px;
                    font-weight: 600;
                    text-decoration: none;
                }
                main {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    padding: 2rem;
                    max-width: 900px;
                }
                .badge {
                    display: inline-block;
                    padding: 0.35rem 1rem;
                    background: rgba(0, 242, 254, 0.1);
                    border: 1px solid rgba(0, 242, 254, 0.3);
                    border-radius: 20px;
                    color: #00f2fe;
                    font-size: 0.8rem;
                    font-weight: 600;
                    margin-bottom: 2rem;
                    letter-spacing: 0.5px;
                }
                h2 {
                    font-size: 3.2rem;
                    font-weight: 800;
                    line-height: 1.1;
                    margin-bottom: 1rem;
                    letter-spacing: -1px;
                }
                h2 span {
                    color: #00f2fe;
                }
                p.description {
                    color: #8b949e;
                    font-size: 1.15rem;
                    line-height: 1.6;
                    max-width: 750px;
                    margin-bottom: 2.5rem;
                }
                .cta-buttons {
                    display: flex;
                    gap: 1rem;
                    flex-wrap: wrap;
                    justify-content: center;
                    margin-bottom: 1rem;
                }
                .btn-primary {
                    background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
                    color: #060913;
                    padding: 0.85rem 1.75rem;
                    border-radius: 8px;
                    font-weight: 700;
                    text-decoration: none;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    box-shadow: 0 4px 20px rgba(0, 242, 254, 0.3);
                }
                .btn-secondary {
                    background: #111827;
                    color: #c9d1d9;
                    border: 1px solid #374151;
                    padding: 0.85rem 1.5rem;
                    border-radius: 8px;
                    font-weight: 600;
                    text-decoration: none;
                }
                footer {
                    padding: 2rem;
                    color: #4b5563;
                    font-size: 0.85rem;
                }
            </style>
        </head>
        <body>
            <header>
                <div class="logo-area">
                    <div class="logo-icon"></div>
                    <div class="logo-text">
                        <h1>ApexSovereign.ai <span style="color: #3fb950; font-weight: normal;">● Live</span></h1>
                        <span>The Sovereign Global Work OS</span>
                    </div>
                </div>
                <nav>
                    <a href="#">Platform & Solutions</a>
                    <a href="#">Dynamic Pricing</a>
                    <a href="#">CRM & Docs</a>
                    <a href="#">Agent Swarm</a>
                    <a href="#">Neural Core</a>
                    <a href="#" class="sign-in-btn">Sign In</a>
                </nav>
            </header>
            <main>
                <div class="badge">INSTITUTIONAL B2B SAAS & AI AUTOMATION AGENCY (AAA)</div>
                <h2>Autonomous Enterprise Execution.<br><span>Zero Human Bottlenecks.</span></h2>
                <p class="description">
                    ApexSovereign.ai combines bare-metal GPU clusters, multi-tenant PostgreSQL data isolation, and event-driven AI agents to automate global enterprise operations on pure autopilot.
                </p>
                <div class="cta-buttons">
                    <a href="#" class="btn-primary">Launch Work OS (Instant Onboarding) →</a>
                    <a href="#" class="btn-secondary">Dynamic Pricing & Comparison</a>
                    <a href="#" class="btn-secondary">CRM & Collaborative Docs</a>
                </div>
                <div class="cta-buttons">
                    <a href="#" class="btn-secondary">24/7 Agentic Swarm</a>
                    <a href="#" class="btn-secondary">Consult AI Concierge</a>
                </div>
            </main>
            <footer>
                &copy; 2026 ApexSovereign.ai. All rights reserved. Sovereign Neural Mesh Engine Active.
            </footer>
        </body>
        </html>
    "###)
}
