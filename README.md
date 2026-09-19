# ConnectPort API

NestJS backend for ConnectPort: JWT sessions, PostgreSQL, and the request/quote/ops workflow used by the frontend.

Payment checkout is not implemented yet. Historical seed rows may already be `approved_paid` and beyond so the ops queue has realistic data.

## Setup

Create a Postgres database named `connectport`, then:

```bash
cp .env.example .env
# Set DATABASE_URL to your local Postgres connection string
npm install
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

Optional: `docker compose up -d` and point `DATABASE_URL` at `postgresql://connectport:connectport@localhost:5433/connectport`.

API base URL: `http://localhost:3005/api`

## Demo accounts (local seed only)

Set via env or defaults used by `prisma/seed.ts`:

- `SEED_ADMIN_EMAIL` (default `admin@connectport.local`)
- `SEED_ADMIN_PASSWORD` (default `connectport-dev-admin`)
- `SEED_SAMPLE_PASSWORD` (default `connectport-sample`) for `ada@example.com` / `kemi@shop.ng`

Ops agent: `chioma@connectport.ng` (same sample password).

Never run seed against production (`NODE_ENV=production` is blocked).


Send the JWT as `Authorization: Bearer <accessToken>`.

## Auth

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/signup` | Requester signup |
| POST | `/api/auth/login` | Requester login |
| POST | `/api/auth/ops/login` | Ops login |
| POST | `/api/auth/logout` | 204; client discards token |
| GET | `/api/auth/session` | Current session or `null` |
| GET | `/api/auth/me` | Current requester or `null` |
| GET | `/api/auth/ops/me` | Current ops user or `null` |

## Requester

| Method | Path |
|--------|------|
| GET | `/api/me/requests` |
| GET | `/api/me/requests/:id` |
| POST | `/api/me/requests` |
| POST | `/api/me/requests/guided` |
| POST | `/api/me/request-uploads` |
| POST | `/api/me/requests/:id/quotes/:quoteId/reject` |
| POST | `/api/me/requests/:id/quotes/:quoteId/approve` |
| POST | `/api/me/requests/:id/quotes/:quoteId/pay` | Demo checkout → `approved_paid` |

## Catalog

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/products` | Public (`?q=` search) |
| GET | `/api/products/:slugOrId` | Public |
| GET | `/api/ops/products` | Ops |
| POST | `/api/ops/products` | Ops |
| PATCH | `/api/ops/products/:id` | Ops |
| POST | `/api/ops/products/:id/publish` | Ops |

## Ops

| Method | Path |
|--------|------|
| GET | `/api/ops/users` |
| GET | `/api/ops/requests?status=&search=` |
| GET | `/api/ops/requests/:id` |
| POST | `/api/ops/requests/:id/claim` |
| POST | `/api/ops/requests/:id/assign` |
| POST | `/api/ops/requests/:id/quotes` |
| POST | `/api/ops/requests/:id/status` |
