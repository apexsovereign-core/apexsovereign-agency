# ApexSovereign.ai - Frontend Client

Clean, standalone, dark-themed customer-facing dashboard for **ApexSovereign.ai**, an Autonomous Work OS and Sovereign Compute Broker powered by FastAPI.

## Directory Structure
```text
frontend/
├── index.html        # High-performance dashboard with Tailwind CSS CDN & Lucide Icons
├── app.js            # Client-side controller communicating with FastAPI backend
├── vercel.json       # Zero-configuration SPA routing rule preventing 404 errors
└── README.md         # Documentation and deployment instructions
```

## Quick Start
To test locally, run any local HTTP server:
```bash
npx serve frontend
# or
python3 -m http.server 3000 --directory frontend
```

## Deploying to Vercel
1. Push this folder to a GitHub repository.
2. In Vercel, click **Add New Project** and select your repository.
3. Keep default settings:
   - **Framework Preset**: Other
   - **Root Directory**: `./`
   - **Output Directory**: `./` (or leave blank)
4. The included `vercel.json` ensures that all routes rewrite directly to `index.html`, eliminating all 404 "This page doesn't exist" errors.
