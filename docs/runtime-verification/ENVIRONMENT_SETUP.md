# Runtime Verification — Environment Setup & Preflight Guide

## 1. System Prerequisites

The verification environment must satisfy the following host requirements before executing runtime scenarios:

| Component | Minimum Version | Verified Monorepo Requirement | Check Command |
| :--- | :--- | :--- | :--- |
| **Node.js** | `>= 20.0.0 LTS` | Monorepo engine constraint: `>=20.0.0` | `node -v` |
| **pnpm** | `12.16.1` (or `>= 9.0`) | Root `packageManager` specification: `pnpm@12.16.1` | `pnpm -v` |
| **Docker** | `>= 24.0.0` | Container runtime for MongoDB 7.0 container | `docker -v` |
| **Docker Compose** | `>= 2.20.0` | Service orchestration for `docker-compose.yml` | `docker compose version` |
| **mongosh** | `>= 2.0.0` | MongoDB CLI for verifying replica set topology | `mongosh --version` |
| **LiveKit CLI** *(optional)* | `>= 2.0.0` | Provider-side token and room inspection | `livekit-cli --version` |

---

## 2. Monorepo Repository Structure & Startup Commands

The repository contains three primary workspace packages governed by `pnpm-workspace.yaml`:
- `packages/contracts`: Core TypeScript definitions, Zod schemas, and DTOs.
- `apps/api`: Backend Express & Socket.IO server (Port `5001`).
- `apps/web`: Frontend Next.js 15 application (Port `3000`).

### Standard Development Startup Commands

All commands are executed from the monorepo root `/Users/mac/Documents/workspace/workspace_coding/ktvonline`:

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Build shared contracts (mandatory before running API or Web)
pnpm build:contracts

# 3. Start MongoDB local container
pnpm docker:up

# 4. Start all three components concurrently (Contracts watch, API watch, Web dev)
pnpm dev

# Or start individually in separate terminal sessions:
pnpm dev:contracts
pnpm dev:api
pnpm dev:web
```

---

## 3. MongoDB Configuration & Topology Requirements

KTVOnline enforces strict data consistency invariants:
1. **Multi-Document ACID Transactions**: Handled by `apps/api/src/database/transaction.ts`.
2. **Topology Verification Rules**:
   - In `production` and `staging`: The API will **fail to start** (`UnsupportedTopologyError`) if MongoDB is not running as a replica set.
   - In `development` and `test`: Standalone MongoDB is supported via **Recoverable Compare-And-Swap (CAS)** fallback, but atomic multi-document queue reordering is disabled.

### Option A: Standard Local Docker Standalone (Default Dev)
The default `docker-compose.yml` provides a standalone MongoDB 7.0 instance:
```bash
pnpm docker:up
# Verification:
mongosh "mongodb://ktv_admin:ktv_dev_secret_password@127.0.0.1:27017/ktv_online?authSource=admin" --eval "db.adminCommand('ping')"
```
*Note: In this mode, `apps/api` logs a warning about Standalone mode and executes in CAS fallback mode.*

### Option B: Local Single-Node Replica Set (Mandatory for Full Transaction Verification)
To verify full multi-document ACID transactions and queue reordering locally without a multi-server cluster, initiate a single-node replica set:

1. Update container startup or execute mongod with `--replSet rs0`:
```bash
docker run -d --name ktv-mongo-rs -p 27017:27017 mongo:7.0 --replSet rs0 --bind_ip_all
```
2. Initiate the replica set:
```bash
mongosh --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })'
```
3. Update `MONGODB_URI` in `apps/api/.env`:
```env
MONGODB_URI=mongodb://127.0.0.1:27017/ktv_online?replicaSet=rs0
```

---

## 4. Environment Variables Inventory & Secret Management

### Backend Configuration (`apps/api/.env`)
Validated at startup via Zod schema in `apps/api/src/config/env.ts`.

| Variable | Dev Default / Example | Required in Prod/Staging | Security & Redaction Notes |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `development` | Yes (`production`, `staging`, `test`) | Drives transaction fail-closed behavior |
| `PORT` | `5001` | No (default: 5001) | HTTP and Socket.IO listening port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/ktv_online` | Yes | Redact credentials from logs |
| `JWT_ACCESS_SECRET` | *(built-in dev fallback allowed only in dev)* | Yes (min 32 chars) | **NEVER** expose in test reports |
| `JWT_REFRESH_SECRET` | *(built-in dev fallback allowed only in dev)* | Yes (min 32 chars) | Must differ from `JWT_ACCESS_SECRET` |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | No | Short-lived access token validity |
| `JWT_REFRESH_EXPIRES_IN`| `7d` | No | Refresh token session validity |
| `FRONTEND_URL` | `http://localhost:3000` | Yes | Permitted CORS origin |
| `LIVEKIT_URL` | `wss://your-project.livekit.cloud` | Yes | Realtime WebRTC voice signaling endpoint |
| `LIVEKIT_API_KEY` | `your_livekit_api_key` | Yes | API key for token signing & management |
| `LIVEKIT_API_SECRET` | `your_livekit_api_secret` | Yes | Shared secret for signing JWT tokens |
| `LIVEKIT_WEBHOOK_SECRET`| `your_livekit_webhook_secret` | No (falls back to API_SECRET) | Webhook HMAC verification |

### Frontend Configuration (`apps/web/.env`)
Validated at initialization via Zod schema in `apps/web/src/lib/env.ts`.

| Variable | Dev Default / Example | Required | Purpose |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5001/api/v1` | Yes | Base URL for REST endpoints and Socket.IO handshake |

---

## 5. Test Data Isolation & Pre-Seeding

To guarantee scenario repeatability and prevent pollution:
1. **Entity Prefixing**:
   - All verification rooms created must start with: `rv_room_*` (e.g. `rv_room_infra_01`).
   - All verification user accounts must use emails formatted: `rv_user_<role>_<timestamp>@test.ktvonline.internal`.
2. **Built-in Fixture Songs**:
   - The backend automatically seeds built-in fixture songs on startup via `songService.ensureSeedSongs()`:
     - `fix_synth_groove`: Includes word-level timestamps (`TimedLyricWord`) and synthetic audio.
     - `fix_ballad_acoustic`: Acoustic backing track for vocal clarity evaluation.
     - `fix_rock_anthem`: Dynamic track for bass boost and clipping verification.
3. **Automated Teardown Hygiene**:
   - Verification scripts must invoke room deletion (`DELETE /api/v1/rooms/:roomId`) or room closure (`POST /api/v1/rooms/:roomId/close`) upon scenario completion.
   - Database cleanup queries must target documents where `name: { $regex: '^rv_room_' }` or `email: { $regex: '@test\\.ktvonline\\.internal$' }`.

---

## 6. Preflight Health Verification Checklist

Before starting any verification suite, run the following HTTP preflight queries:

```bash
# 1. Verify process liveness
curl -s http://localhost:5001/api/v1/health/live | jq .

# Expected output:
# { "success": true, "data": { "status": "ok", "uptime": ... } }

# 2. Verify service readiness (Database + Topology + Workers)
curl -s http://localhost:5001/api/v1/health/ready | jq .

# Expected output:
# { "success": true, "data": { "status": "ready", "database": { "status": "connected" } } }

# 3. Verify Frontend accessibility
curl -s -I http://localhost:3000 | grep "HTTP/"

# Expected output: HTTP/1.1 200 OK (or HTTP/2 200)
```

