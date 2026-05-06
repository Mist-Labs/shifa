# SHIFA Backend

Fastify API for SHIFA Clinic, Guard, sync, and outbreak detection.

## Production Checks

```bash
npm ci
npm test
npm run build
```

## Required Environment

Copy `.env.example` and set:

- `NODE_ENV=production`
- `JWT_SECRET` with at least 32 random characters
- `CORS_ORIGINS` to the dashboard/mobile origins allowed to call the API
- `PORT` and `HOST` as required by the deployment platform
- `SHIFA_STORE_FILE` if you want single-instance JSON persistence on a mounted volume
- `DATABASE_URL` for PostgreSQL readiness checks and multi-instance deployment planning
- `GOOGLE_API_KEY` / `CLINICAL_AI_MODEL` for configured backend clinical AI
- SHIFA Guard emergency SMS is dispatched directly by the mobile app. The backend records synced threat events and must not be on the critical alert path.

## Deploy

Docker:

```bash
docker build -t shifa-backend .
docker run --env-file .env -p 3000:3000 shifa-backend
```

Health endpoints:

- `GET /health`
- `GET /ready`
- `GET /metrics`
- `GET /docs`
