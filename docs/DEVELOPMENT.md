# KTV Online – Developer Setup & Operations Guide

## 1. Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: `v20.0.0` or higher (`v22` recommended)
- **pnpm**: `v9` or higher (`pnpm 12.16.1` verified)
- **Docker & Docker Compose**: For containerized MongoDB (optional if running local `mongod`)

---

## 2. Initial Setup

Clone and install all workspace dependencies from root:

```bash
# Install dependencies across all apps and packages
pnpm install
```

---

## 3. Environment Variables Configuration

Copy example environment files to their respective applications:

```bash
# Backend environment setup
cp apps/api/.env.example apps/api/.env

# Frontend environment setup
cp apps/web/.env.example apps/web/.env
```

### Backend Variables (`apps/api/.env`)
- `NODE_ENV`: Application environment (`development` | `production` | `test`)
- `PORT`: HTTP port for Express server (`5001`)
- `MONGODB_URI`: Connection string (default: `mongodb://127.0.0.1:27017/ktv_online`)
- `JWT_ACCESS_SECRET`: Secret key for signing access tokens (min 16 chars)
- `JWT_REFRESH_SECRET`: Secret key for signing refresh tokens (min 16 chars)
- `JWT_ACCESS_EXPIRES_IN`: Access token TTL (e.g. `15m`)
- `JWT_REFRESH_EXPIRES_IN`: Refresh token TTL (e.g. `7d`)
- `FRONTEND_URL`: Allowed CORS origin for web app (`http://localhost:3000`)

### Frontend Variables (`apps/web/.env`)
- `NEXT_PUBLIC_API_URL`: Base URL for API calls (`http://localhost:5001/api/v1`)

---

## 4. Local Database (Docker Compose)

To start the local MongoDB container:

```bash
# Launch MongoDB container in the background
pnpm docker:up

# Check container health and logs
pnpm docker:logs

# Stop MongoDB container
pnpm docker:down
```

Alternatively, if you run a native MongoDB instance on `mongodb://127.0.0.1:27017`, the application connects automatically.

---

## 5. Running the Applications

### Run Everything Concurrently

```bash
pnpm dev
```
This runs:
- `@ktv/contracts` build watcher
- `@ktv/api` on `http://localhost:5001`
- `@ktv/web` on `http://localhost:3000`

### Run Individually

```bash
# Run web client only
pnpm dev:web

# Run backend API only
pnpm dev:api

# Run contracts watcher only
pnpm dev:contracts
```

---

## 6. Testing

Run tests across all workspaces:

```bash
# Run all tests (API, Web, and Contracts)
pnpm test

# Run API integration tests only
pnpm --filter @ktv/api test

# Run Web frontend component tests only
pnpm --filter @ktv/web test

# Run contracts schema validation tests only
pnpm --filter @ktv/contracts test
```

---

## 7. Linting & Type Checking

```bash
# Run ESLint across monorepo
pnpm lint

# Run strict TypeScript type check across monorepo
pnpm typecheck
```

---

## 8. Production Builds

```bash
# Build contracts, API, and Next.js production bundle
pnpm build
```
Outputs:
- `@ktv/contracts`: `packages/contracts/dist/`
- `@ktv/api`: `apps/api/dist/`
- `@ktv/web`: `apps/web/.next/`
