# KTV Online – Product & Engineering Roadmap

This document outlines the multi-phase evolution of KTV Online from technical foundation to production readiness.

---

## Sprint Overview

```
+---------------------------------------------------------------------------------+
| Sprint 0: Foundation & Architecture Setup (COMPLETED)                           |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
| Sprint 1: Core Platform (Auth, Room Lifecycle & Mongo Persistence)              |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
| Sprint 2: Realtime Infrastructure (Socket.io & LiveKit Voice Engine)            |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
| Sprint 3: Karaoke Engine (Synchronized Audio, Web Audio API & Lyrics Timings)   |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
| Sprint 4: Social Entertainment (Mini-games, Cheers, 3D Avatars - R3F)           |
+---------------------------------------------------------------------------------+
                                      |
                                      v
+---------------------------------------------------------------------------------+
| Sprint 5: Beta & Production Hardening (E2E, Performance, Observability, CI/CD) |
+---------------------------------------------------------------------------------+
```

---

## Detailed Sprint Specifications

### Sprint 0: Foundation & Architecture Setup *(Current)*
- [x] pnpm monorepo structure with `@ktv/web`, `@ktv/api`, and `@ktv/contracts`.
- [x] Next.js 15 App Router frontend with dark-first virtual nightlife design system.
- [x] Production Express API with Helmet, CORS, Rate Limit, Pino logging, and graceful shutdown.
- [x] Mongoose connection manager and User/Room domain models with indexes.
- [x] Health check endpoint distinguishing between app and database availability.
- [x] Landing page, Room Discovery, Room Detail Placeholder, and Profile Placeholder.
- [x] Vitest testing suite across all packages.
- [x] Local Docker Compose configuration for MongoDB.

---

### Sprint 1: Core Platform & Persistence
- **Authentication:** JWT refresh token rotation, cookie-based session management, and auth guards.
- **Room Lifecycle:** Host room creation modal, room editing, participant join/leave endpoints.
- **Data Persistence:** Replace frontend mock rooms with live TanStack Query API calls to MongoDB.
- **Search & Pagination:** Full-text search and category filtering backed by MongoDB indexes.

---

### Sprint 2: Realtime Infrastructure
- **Technology Integrations:**
  - **Socket.io:** Real-time bi-directional messaging, room state broadcasting, and queue events.
  - **Redis:** Redis Pub/Sub and adapter for horizontal scaling across multiple API instances; caching active room presence.
  - **LiveKit:** Low-latency WebRTC SFU integration for room audio, audience listening, and speaker stage management.
- **Features:**
  - Participant join/leave real-time announcements.
  - In-room live chat with emoji cheers.
  - Multi-user voice channels with automated speaker volume detection.

---

### Sprint 3: Karaoke Engine
- **Technology Integrations:**
  - **Web Audio API:** Client-side vocal processing, reverb convolution filters, microphone noise suppression, and real-time audio visualizer frequency spectrum.
  - **Clock Synchronization Protocol:** NTP-style offset compensation ensuring all clients render lyrics within &plusmn;20ms of playback.
- **Features:**
  - Dynamic song queue with add/reorder/remove operations.
  - Synchronized scrolling lyric cues with syllable highlighting.
  - Pitch detection & accuracy scoring feedback for vocalists.

---

### Sprint 4: Social Entertainment
- **Technology Integrations:**
  - **React Three Fiber (R3F) & Three.js:** 3D virtual karaoke booth environments, lighting effects, and customizable 3D user avatars.
- **Features:**
  - Stage audience reactions (flying hearts, glowsticks, soundboard airhorns).
  - Karaoke mini-games (e.g. "Guess the Song", lyric trivia between tracks).
  - VIP Room customization (lighting colors, booth themes, stage wallpapers).

---

### Sprint 5: Beta & Production Readiness
- **Infrastructure & Reliability:**
  - Full CI/CD pipeline (GitHub Actions) for automated lint, typecheck, tests, and Docker image builds.
  - Production containerization with multi-stage Dockerfiles for `@ktv/web` and `@ktv/api`.
  - Rate limiting with Redis token bucket algorithm.
  - Distributed tracing and metrics collection (Prometheus / Grafana).
- **Security & QA:**
  - Playwright E2E browser test suites covering full room join, sing, and leave journeys.
  - Penetration testing, audit of dependencies, and OWASP compliance review.
