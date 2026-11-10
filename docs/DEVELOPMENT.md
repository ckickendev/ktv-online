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

### Standalone vs. Replica Set Development Note
- **Default Standalone Mode**: The default `docker-compose.yml` runs a standalone MongoDB container. Standalone MongoDB **does not support multi-document ACID transactions**. In standalone mode, `reorderQueue` is disabled (Option A) and will return HTTP 501 / `UNSUPPORTED_TOPOLOGY_FOR_REORDER`.
- **Testing Queue Reordering Locally**: If you need to test multi-document queue reordering locally or match production transaction semantics, run MongoDB with a single-node replica set:
  ```bash
  # Start native mongod with replica set rs0
  mongod --dbpath /data/db --replSet rs0 --bind_ip 127.0.0.1
  
  # In another terminal, initiate the replica set (once)
  mongosh --eval "rs.initiate()"
  ```

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

---

## 9. Development Karaoke Audio & Sample Catalog

During local development and testing, commercial karaoke catalog APIs are not connected. Instead, KTVOnline includes:
- **Procedural Development Audio Generator**: Pure PCM stereo WAV 44.1kHz 16-bit generator built into `apps/api/src/modules/karaoke/fixture-audio.generator.ts`.
- **4 Playable Authorized Tracks**:
  - `Auld Lang Syne` (Public Domain) — ID: `fix_auld_lang_syne`
  - `Amazing Grace` (Public Domain) — ID: `fix_amazing_grace`
  - `Scarborough Fair` (Public Domain) — ID: `fix_scarborough_fair`
  - `Neon City Synthwave` (Royalty-Free) — ID: `fix_synth_groove`
- **Synchronized Timed Lyrics**: Available for all 4 tracks.
- **Audio Streaming Endpoint**: `GET /api/v1/songs/:songId/audio/stream` supporting HTTP 206 Partial Content range requests for native seeking.
- **Commercial Metadata-Only Tracks**: The database seeds sample metadata for commercial tracks. These tracks are explicitly marked `audioAvailability: 'metadata_only'` and cannot be started until a commercial audio provider is integrated.
