# LiveKit Realtime Voice Setup & Configuration Guide

## 1. Overview

KTVOnline integrates with **LiveKit** to provide low-latency WebRTC voice communication.
LiveKit can run via **LiveKit Cloud** (recommended for production and staging) or via a **local LiveKit server** for offline development.

---

## 2. Environment Variables Configuration

### 2.1 Backend (`apps/api/.env`)

Add the following environment variables to `apps/api/.env`:

```env
# LiveKit Realtime Voice Configuration
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_WEBHOOK_SECRET=your_livekit_webhook_secret
```

### 2.2 Variable Descriptions & Rules

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `LIVEKIT_URL` | Yes (in prod) | WebSocket/HTTP endpoint of the LiveKit server | `wss://ktv-online.livekit.cloud` |
| `LIVEKIT_API_KEY` | Yes (in prod) | LiveKit API Key for authentication | `APIxxxxxx` |
| `LIVEKIT_API_SECRET` | Yes (in prod) | LiveKit API Secret used to sign tokens | `secretxxxxxx` |
| `LIVEKIT_WEBHOOK_SECRET`| Optional | Secret used for webhook signature verification (defaults to `LIVEKIT_API_SECRET`) | `whsec_xxxxxx` |

> [!IMPORTANT]
> In production (`NODE_ENV=production`), `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are strictly validated at API boot. The server will fail to start if any of these are missing.

> [!NOTE]
> In development (`NODE_ENV=development`), if LiveKit credentials are not provided, the API boots cleanly. When a client requests a voice token, the API responds with HTTP 503 `VOICE_SERVICE_NOT_CONFIGURED` without crashing or falsely claiming voice connection.

---

## 3. Local Development Options

### Option A: LiveKit Cloud Free Tier (Recommended)
1. Sign up at [cloud.livekit.io](https://cloud.livekit.io).
2. Create a new project named `ktv-online-dev`.
3. In Project Settings -> Keys, generate an API Key and Secret.
4. Copy the WebSocket URL (e.g. `wss://ktv-online-dev.livekit.cloud`), Key, and Secret into `apps/api/.env`.

### Option B: Local LiveKit Server via Docker
If developing offline without internet connectivity, run LiveKit locally:

```bash
docker run --rm -p 7880:7880 \
  -p 7881:7881 \
  -p 7882:7882/udp \
  livekit/livekit-server \
  --dev \
  --bind 0.0.0.0 \
  --keys "devkey: secret"
```

Configure `apps/api/.env`:
```env
LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

---

## 4. Webhook Configuration

### 4.1 Endpoint URL
Configure the webhook destination in your LiveKit Cloud dashboard (or local server config):

```
https://api.yourdomain.com/api/v1/webhooks/livekit
```

For local testing with LiveKit Cloud, expose your local port with a tunnel tool (e.g., ngrok):
```bash
ngrok http 5001
# Webhook URL: https://<ngrok-id>.ngrok-free.app/api/v1/webhooks/livekit
```

### 4.2 Subscribed Events
Select the following events in the LiveKit dashboard:
- `participant_joined`: Participant joined the voice room.
- `participant_left`: Participant left or disconnected from voice.
- `room_finished`: Room was closed and terminated.

---

## 5. Token Expiration & Renewal Architecture

- **Initial Token TTL**: 5 minutes (`300` seconds).
- **Renewal Mechanism**:
  The frontend hook `useVoiceClient` tracks the `expiresAt` timestamp returned by `POST /api/v1/rooms/:roomId/voice/token`.
  At 80% of TTL (approx. 4 minutes), the client requests a renewed token in the background.
- **Authorization Enforcement**:
  Each renewal repeats database checks:
  1. Room is not closed.
  2. Member is still active in `RoomMembership`.
  3. Member has not been kicked (`kickedAt == null`).
  4. User account is active and session family is not revoked.

---

## 6. Troubleshooting & Operational Guidance

### 6.1 Microphone Permissions Denied
- **Symptom**: Client UI displays "Microphone access was denied. Please allow microphone permissions in your browser and try again."
- **Remedy**:
  - In Chrome/Firefox/Safari: Click the lock/site settings icon in the address bar -> Microphone -> Select "Allow".
  - Ensure your operating system (macOS / Windows) has permitted browser access to input audio devices in System Settings -> Privacy & Security -> Microphone.

### 6.2 Autoplay Policy Restrictions
- **Symptom**: Remote participant audio does not play immediately upon connection.
- **Remedy**:
  - Modern browsers require user interaction (e.g. clicking "Join Voice") before playing remote WebRTC audio streams.
  - Because joining voice is an explicit button click in KTVOnline, audio playback starts automatically. If blocked, LiveKit's internal autoplay handler resumes on the next user interaction.

### 6.3 ICE / Network Disconnection
- **Symptom**: Status switches to `reconnecting` with amber indicator.
- **Remedy**:
  - LiveKit client automatically attempts ICE restart and reconnection.
  - If network returns, status transitions back to `connected`.
  - If reconnect requires re-authorization, client uses `latestTokenRef` and re-validates credentials with the backend.
  - If network is permanently lost, state transitions to `disconnected` after timeout, and audio resources are released.

### 6.4 Provider Eviction Recovery & Queue Monitoring
- **Symptom**: Kicked participant or revoked session remains temporarily in WebRTC voice due to LiveKit Cloud API timeout.
- **Architecture**:
  - Unsuccessful evictions are recorded in the `VoiceEvictionTask` collection.
  - A managed worker (`VoiceEvictionWorker`) runs on API startup and reclaims ready tasks with atomic leasing.
  - The tasks retry automatically with exponential backoff up to 5 attempts.
  - Query permanently failed tasks requiring operator review in MongoDB:
    ```javascript
    db.voiceevictiontasks.find({ status: 'failed_permanent' })
    ```
  - Unresolved security tasks are preserved permanently and are never pruned by TTL.

### 6.5 Audio-Only Publication Policy
- LiveKit access tokens strictly enforce `canPublishSources: [TrackSource.MICROPHONE]`.
- Video camera publishing and screen sharing are rejected at the WebRTC signaling layer. If a client attempts to publish video tracks, LiveKit server returns `TrackPublishError: not allowed to publish this source`.
