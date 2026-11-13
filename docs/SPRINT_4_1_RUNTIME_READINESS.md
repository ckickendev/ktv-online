# KTVOnline — Sprint 4.1: Runtime Readiness & Environment Assessment

## 1. Executive Summary

This assessment establishes the exact operational capabilities and limitations of the local development environment for KTVOnline following Sprint 4.0. It documents the status of local services, configuration variables, and runtime testing capabilities in accordance with the Code-Only Development Policy.

---

## 2. Environment Configuration Audit

### 2.1 Backend API Service (`apps/api`)
- **Runtime Engine:** Node.js 22.x with Express 4.21.2 (`type: module`).
- **Development Tooling:** `tsx watch src/server.ts` for rapid TypeScript compilation.
- **Port:** `5001` (configured via `PORT` environment variable).
- **Environment Variables:**
  - `NODE_ENV`: `development`
  - `PORT`: `5001`
  - `MONGODB_URI`: Preserved target database name `test` (or `ktv_online` in dev config).
  - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: Present.
  - `FRONTEND_URL`: `http://localhost:3000` (CORS-allowed).
  - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: Defined as placeholders in `.env.example`. Live cloud credentials are not provisioned in the local environment.

### 2.2 Frontend Web Application (`apps/web`)
- **Framework:** Next.js 15.2.0, React 19.0.0, TypeScript 5.8.2.
- **State Management:** Zustand 5.0.3, TanStack Query 5.66.7.
- **Realtime Clients:** `socket.io-client` 4.8.4, `livekit-client` 2.23.0.
- **Styling:** Tailwind CSS v4.0.9, shadcn/ui.
- **Port:** `3000` (`next dev`).
- **Environment Variables:**
  - `NEXT_PUBLIC_API_URL`: `http://localhost:5001/api/v1`

### 2.3 Shared Contracts (`packages/contracts`)
- Monorepo package providing Zod validation schemas, TypeScript DTOs, and Socket.IO event enum constants (`SOCKET_EVENTS`).
- Build: `tsc --noEmit` and `tsc -b`.

### 2.4 Infrastructure & Containers (`docker-compose.yml`)
- **Database Service:** MongoDB 7.0 (`image: mongo:7.0`).
- **Daemon Status:** Docker daemon is currently offline on the host system.
- **Local Listening Ports:** Port 27017 (MongoDB), Port 5001 (API), and Port 3000 (Web) are currently unbound.

---

## 3. Logging & Error-Reporting Mechanisms

1. **Backend Logging:**
   - Powered by `pino` 9.6.0 with `pino-http` and `pino-pretty`.
   - Structured JSON output with metadata: `roomId`, `userId`, `socketId`, `correlationId`, `transitionId`, `version`.
   - Errors logged with structured stack traces and standard HTTP response error codes (`ROOM_NOT_FOUND`, `FORBIDDEN_KICKED`, `CANNOT_KICK_HOST`).

2. **Frontend Logging & Telemetry:**
   - Console logger in development mode.
   - TanStack Query global error boundary and toast notifications.
   - LiveKit audio error classifier (`classifyDeviceError`) mapping WebRTC/hardware exceptions (`NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError`).

---

## 4. Classification of Verification Capabilities

| Capability | Classification | Justification & Current State |
| :--- | :---: | :--- |
| **Two or more independent browser sessions** | **NOT AVAILABLE** | No active development server running; automated UI browsers (Playwright/Cypress) restricted by Code-Only Development Policy. |
| **Multiple authenticated users** | **AVAILABLE WITH LIMITATIONS** | REST session minting and JWT verification logic fully verifiable via static source inspection; live multi-user concurrency requires manual QA. |
| **Multiple Socket.IO connections** | **AVAILABLE WITH LIMITATIONS** | Multi-socket presence sets (`RoomPresenceManager`) and channel rooms verified statically; live network packet fan-out requires running server. |
| **Multiple LiveKit participants** | **NOT AVAILABLE** | Requires external LiveKit SFU server instance (`LIVEKIT_URL`) and hardware audio streams; credentials are placeholders in local `.env.example`. |
| **Room creation and joining** | **AVAILABLE WITH LIMITATIONS** | Verified statically via `room.service.ts` CAS counters, outbox transactions, and REST routes. Live runtime execution requires manual tester. |
| **Audio playback & synchronization** | **AVAILABLE WITH LIMITATIONS** | NTP clock synchronization offset algorithm (`clockSyncService`) verified statically; physical multi-speaker drift verification requires real devices. |

---

## 5. Operational Conclusion

Because the local Docker daemon and external LiveKit SFU instances are not active, full interactive runtime validation cannot be completed by automated agent processes. 

Therefore, static source inspection and architectural trace analysis are leveraged to verify system invariants and identify latent defects, while an executable, manual runtime QA protocol is prepared for the project owner in [`docs/SPRINT_4_1_MANUAL_RUNTIME_QA_CHECKLIST.md`](file:///Users/mac/Documents/workspace/workspace_coding/ktvonline/docs/SPRINT_4_1_MANUAL_RUNTIME_QA_CHECKLIST.md).
