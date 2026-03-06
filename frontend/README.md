# PolyElection Frontend

This directory is the production web frontend for PolyElection.

## Stack

- Next.js App Router
- Vercel Analytics
- Legacy dashboard shell served from `public/legacy/index.html`

## Production Model

- Vercel serves the frontend from `frontend/`
- FastAPI remains the backend API service
- The legacy dashboard UI is preserved and loaded inside a Next.js page
- Next route handlers proxy backend data for the browser

## Local Development

```bash
cd frontend
copy .env.example .env.local
npm install
npm run dev
```

Default local URL:

- http://localhost:3000

Required environment variable:

```env
POLYELECTION_API_BASE_URL=http://127.0.0.1:8000
```

## Vercel Deployment

1. Import the repo into Vercel
2. Set Root Directory to `frontend`
3. Set `POLYELECTION_API_BASE_URL`
4. Deploy
