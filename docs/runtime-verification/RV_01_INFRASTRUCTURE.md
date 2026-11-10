# Workstream RV-01 — Infrastructure & Foundation Verification

## 1. Scope & Objective

Workstream **RV-01** verifies the core architectural foundation of KTVOnline:
- Runtime environment configuration and schema validation (`apps/api/src/config/env.ts`).
- MongoDB connectivity and replica-set multi-document transaction capability (`apps/api/src/database/transaction.ts`).
- Health probes: Liveness (`/health/live`), Readiness (`/health/ready`), and Consolidated (`/health`).
- Cross-Origin Resource Sharing (CORS) rules and security headers (`helmet`).
- Socket.IO handshake authentication and transport negotiation (`apps/api/src/realtime/socket.auth.ts`).
- LiveKit API credentials and signaling connectivity.
- Process lifecycle: Graceful shutdown (SIGTERM/SIGINT) with worker termination and connection draining.
- Secret redaction and end-to-end correlation ID propagation (`correlationIdMiddleware`).

---

## 2. Test Scenarios

### Scenario RV01-TC01: Health Endpoints & Process Readiness Verification
- **Scenario ID**: `RV01-TC01`
- **Priority**: `P0` (Critical Path Blocker)
- **Verification Level**: `L1 (Automated Headless API)`
- **Preconditions**: Backend process running (`PORT=5001`), MongoDB connected.
- **Environment Requirements**: Standalone or Replica Set MongoDB, Node.js `>=20.0.0`.
- **Test Accounts**: None required (public operational endpoints).
- **Exact Execution Steps**:
  1. Send `GET /api/v1/health/live` via HTTP client. Record status code and payload.
  2. Send `GET /api/v1/health/ready` via HTTP client. Record status code, database status, and response headers.
  3. Send `GET /api/v1/health` via HTTP client. Record consolidated system health.
- **Expected Result**:
  - `GET /health/live` returns HTTP 200 with `{ success: true, data: { status: "ok", uptime: > 0 } }`.
  - `GET /health/ready` returns HTTP 200 with `{ success: true, data: { status: "ready", database: { status: "connected" } } }`.
  - Response headers include `Cache-Control: no-cache, no-store, must-revalidate` and `x-request-id`.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: All three endpoints return HTTP 200 and schema-valid payloads.
  - **Fail**: Any endpoint returns non-200 or reports database disconnected.
  - **Blocked**: Backend process fails to bind port or crashes on startup.
- **Required Logs & Evidence**: HTTP response headers, JSON response bodies, Pino startup log lines.
- **Cleanup Procedure**: None.
- **Related Scenarios**: `RV01-TC02`, `RV06-TC01`.

---

### Scenario RV01-TC02: MongoDB Replica Set Transaction Topology Probe
- **Scenario ID**: `RV01-TC02`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated API & DB Inspector)`
- **Preconditions**: Backend initialized with `NODE_ENV=staging` or `NODE_ENV=production`.
- **Environment Requirements**: Single-node or multi-node MongoDB replica set configured with `rs0`.
- **Test Accounts**: None.
- **Exact Execution Steps**:
  1. Start `apps/api` with `NODE_ENV=production` against a standalone MongoDB instance. Observe process exit code.
  2. Start `apps/api` with `NODE_ENV=production` against a replica set MongoDB instance (`mongodb://127.0.0.1:27017/ktv_online?replicaSet=rs0`).
  3. Query `GET /api/v1/health/ready` and inspect the topology check result in backend logs.
- **Expected Result**:
  - Step 1: Process refuses to start, logging `❌ FATAL: Production and staging environments require a MongoDB replica set supporting multi-document ACID transactions. Standalone MongoDB detected.` and exits with code 1.
  - Step 2: Process starts cleanly, logging `📦 MongoDB deployment verified: Multi-document transactions supported (Replica Set)`.
  - Step 3: `/health/ready` returns HTTP 200 with `status: "ready"`.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Standalone fails closed in production; replica set passes probe cleanly.
  - **Fail**: Standalone starts without error in production, or replica set fails probe.
  - **Blocked**: Docker daemon unavailable or MongoDB unable to initiate replica set.
- **Required Logs & Evidence**: Standard error logs from Step 1, server startup logs from Step 2.
- **Cleanup Procedure**: Reset `NODE_ENV` back to `test` or `development`.
- **Related Scenarios**: `RV04-TC02`, `RV06-TC02`.

---

### Scenario RV01-TC03: CORS Policy & Security Headers Enforcement
- **Scenario ID**: `RV01-TC03`
- **Priority**: `P1`
- **Verification Level**: `L1 (Automated API)`
- **Preconditions**: Backend running on `PORT=5001`.
- **Environment Requirements**: Backend configured with `FRONTEND_URL=http://localhost:3000`.
- **Test Accounts**: None.
- **Exact Execution Steps**:
  1. Send `OPTIONS /api/v1/health` with header `Origin: http://localhost:3000`.
  2. Send `OPTIONS /api/v1/health` with unauthorized header `Origin: http://malicious-site.example.com`.
  3. Send `GET /api/v1/health` with `Origin: http://localhost:3000`. Inspect response headers for Helmet protection.
- **Expected Result**:
  - Step 1: Returns HTTP 204 or 200 with `Access-Control-Allow-Origin: http://localhost:3000`, `Access-Control-Allow-Credentials: true`, and `Access-Control-Expose-Headers: x-request-id`.
  - Step 2: `Access-Control-Allow-Origin` is omitted or does not reflect the malicious origin.
  - Step 3: Security headers present: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (or DENY), `Strict-Transport-Security` (if TLS configured).
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Authorized origin permitted; unauthorized origin rejected; security headers present.
  - **Fail**: Unauthorized origin granted CORS access or headers missing.
  - **Blocked**: Backend unresponsive.
- **Required Logs & Evidence**: Raw HTTP response headers for all three requests.
- **Cleanup Procedure**: None.
- **Related Scenarios**: `RV05-TC04`.

---

### Scenario RV01-TC04: Socket.IO Handshake Authentication & Transport Invariants
- **Scenario ID**: `RV01-TC04`
- **Priority**: `P0`
- **Verification Level**: `L1 (Automated Socket.IO Client)`
- **Preconditions**: Backend running, registered test user account exists.
- **Environment Requirements**: Local dev or staging API server.
- **Test Accounts**: `rv_user_socket_01@test.ktvonline.internal`.
- **Exact Execution Steps**:
  1. Attempt Socket.IO connection without authentication payload or header.
  2. Attempt Socket.IO connection with an expired JWT access token.
  3. Attempt Socket.IO connection with a forged JWT token signed with an invalid secret.
  4. Attempt Socket.IO connection with a valid JWT access token for active test user.
  5. Verify transport upgrade from `polling` to `websocket`.
- **Expected Result**:
  - Step 1: Handshake rejected with `connect_error: Authentication token is required` (data code: `AUTH_TOKEN_REQUIRED`).
  - Step 2: Handshake rejected with `connect_error: Authentication token has expired` (data code: `AUTH_TOKEN_EXPIRED`).
  - Step 3: Handshake rejected with `connect_error: Invalid authentication token` (data code: `AUTH_INVALID_TOKEN`).
  - Step 4: Socket connects successfully (`socket.connected === true`), server logs authenticated socket connection with `userId`.
  - Step 5: Socket upgrades to `websocket` transport cleanly.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: All unauthenticated/invalid attempts rejected; valid token connects and upgrades.
  - **Fail**: Socket connects without token or with forged token.
  - **Blocked**: User registration fails.
- **Required Logs & Evidence**: Socket client connect error events, server-side auth error logs.
- **Cleanup Procedure**: Disconnect socket client; delete test user.
- **Related Scenarios**: `RV02-TC01`, `RV06-TC04`.

---

### Scenario RV01-TC05: LiveKit Signaling Connectivity & Credential Validation
- **Scenario ID**: `RV01-TC05`
- **Priority**: `P1`
- **Verification Level**: `L1 (Automated API & LiveKit SDK)`
- **Preconditions**: Backend configured with `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`.
- **Environment Requirements**: Valid LiveKit Cloud project or local LiveKit dev server.
- **Test Accounts**: `rv_user_voice_admin@test.ktvonline.internal`.
- **Exact Execution Steps**:
  1. Verify environment schema accepts valid `LIVEKIT_URL` (with `wss://` or `ws://` protocol).
  2. Invoke `voiceService.getClient().listRooms()` out-of-band to verify API key and secret validity.
  3. Create a test room `rv_lk_probe_room` and generate a short-lived token via `voiceService.generateVoiceToken()`.
  4. Decode generated JWT token and verify:
     - Issuer (`iss`) equals `LIVEKIT_API_KEY`.
     - Video grant `roomJoin: true` and `room: "ktv_room_<roomId>"`.
     - Expiration is set within 10-60 minutes.
- **Expected Result**:
  - LiveKit client connects successfully without authentication errors.
  - Generated token contains valid signature and correct room claims.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Token generated and validated against LiveKit server signature.
  - **Fail**: 401 Unauthorized from LiveKit or invalid token claims.
  - **Blocked**: LiveKit cloud endpoint unreachable due to internet outage.
- **Required Logs & Evidence**: Decoded JWT claims (excluding signature secret), LiveKit API response.
- **Cleanup Procedure**: Delete test room; revoke token.
- **Related Scenarios**: `RV03-TC01`, `RV03-TC02`.

---

### Scenario RV01-TC06: Graceful Shutdown & Connection Draining Lifecycle
- **Scenario ID**: `RV01-TC06`
- **Priority**: `P1`
- **Verification Level**: `L1 (Automated Process Control)`
- **Preconditions**: Backend running with active HTTP requests and connected Socket.IO clients.
- **Environment Requirements**: Local dev or staging terminal session.
- **Test Accounts**: `rv_user_lifecycle@test.ktvonline.internal`.
- **Exact Execution Steps**:
  1. Establish 2 active Socket.IO connections.
  2. Send a `SIGTERM` signal to the API Node.js process: `kill -TERM <pid>`.
  3. Concurrently send a new HTTP request `GET /api/v1/health/ready`.
  4. Inspect shutdown log sequence and measure time until process terminates.
- **Expected Result**:
  - Process captures `SIGTERM` and sets `isAppShuttingDown = true`.
  - `/health/ready` immediately returns HTTP 503 (`Service is shutting down`).
  - Background workers (`voiceEvictionWorker`, `karaokePlaybackWorker`) stop gracefully.
  - Socket.IO server closes and disconnects active sockets cleanly.
  - Database connection closes (`📦 MongoDB disconnected cleanly`).
  - Process exits with code 0 within the 10-second timeout ceiling.
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Clean shutdown sequence completes with code 0; no hanging sockets or workers.
  - **Fail**: Process hangs past 10 seconds or exits with code 1.
  - **Blocked**: Insufficient process permissions to send SIGTERM.
- **Required Logs & Evidence**: Full console log output during shutdown sequence.
- **Cleanup Procedure**: Restart API server for subsequent tests.
- **Related Scenarios**: `RV06-TC01`.

---

### Scenario RV01-TC07: End-to-End Correlation ID Propagation & Secret Redaction
- **Scenario ID**: `RV01-TC07`
- **Priority**: `P2`
- **Verification Level**: `L1 (Automated API & Log Inspector)`
- **Preconditions**: Backend running with Pino logger configured.
- **Environment Requirements**: Local dev or staging server with stdout log capture.
- **Test Accounts**: `rv_user_logging@test.ktvonline.internal`.
- **Exact Execution Steps**:
  1. Send `POST /api/v1/auth/login` with header `x-correlation-id: test-corr-id-998811` and valid credentials.
  2. Inspect HTTP response headers for `x-request-id`.
  3. Query server logs corresponding to `test-corr-id-998811`.
  4. Verify that:
     - `password` field in request body is NOT logged in plaintext.
     - `refreshToken` cookie is NOT logged in plaintext.
     - JWT access token is NOT logged in plaintext.
- **Expected Result**:
  - Response headers include `x-request-id` matching the incoming correlation ID.
  - Pino log entries include `correlationId: "test-corr-id-998811"`.
  - Zero sensitive secrets appear in log streams (sanitized or redacted).
- **Actual Result**: `[Pending Execution - Harness Not Yet Implemented]`
- **Pass/Fail/Blocked Criteria**:
  - **Pass**: Correlation ID present in logs and responses; all secrets redacted.
  - **Fail**: Secret leakage detected in log output.
  - **Blocked**: Logger unable to write to stdout.
- **Required Logs & Evidence**: Captured server log lines containing `test-corr-id-998811`.
- **Cleanup Procedure**: Delete test user account.
- **Related Scenarios**: `RV06-TC05`.

