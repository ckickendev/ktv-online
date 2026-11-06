# KTV Online – System Architecture

## 1. System Overview

**KTV Online** is a modern Social Entertainment Platform designed for virtual karaoke lounges, real-time voice communications, synchronized lyrics playback, and social interactions.

Product positioning:
> *"Your Virtual Hangout. Your Karaoke Night."*

The architecture is implemented as a pnpm monorepo maintaining a strict boundary between frontend presentation, backend domain services, and shared contract specifications.

```
                      +-----------------------------+
                      |         Web Client          |
                      |   (Next.js 15 App Router)   |
                      +--------------+--------------+
                                     |
                                     | HTTP REST (Sprint 0)
                                     | WebSocket / LiveKit (Future Sprints)
                                     v
                      +-----------------------------+
                      |       Backend API           |
                      |      (Express + TS)         |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |          MongoDB            |
                      |       (Mongoose 8)          |
                      +-----------------------------+
                                     ^
                                     |
                      +-----------------------------+
                      |      @ktv/contracts         |
                      |  (Zod Schemas + TS Types)   |
                      +-----------------------------+
```

---

## 2. Monorepo Organization & Application Boundaries

| Package | Purpose | Runtime Dependencies |
| :--- | :--- | :--- |
| `apps/web` | Client application (landing, lounge discovery, room studio, profile) | React 19, Next.js 15, Tailwind CSS v4, Lucide React, Zustand, TanStack Query |
| `apps/api` | REST API, database models, validation, authentication foundation | Node.js 22, Express, Mongoose, Zod, bcrypt, JWT, Pino, Helmet, CORS |
| `packages/contracts` | Canonical data transfer objects (DTOs) and Zod validation schemas | Zod (Zero server-only dependencies) |

### Boundary Rules
1. **Separation of Concerns:** Core backend business logic is strictly housed in `apps/api` services and models. Next.js API routes are deliberately omitted to avoid duplicate backend logic.
2. **Contract Sharing:** All REST request/response contracts, pagination wrappers, and domain validation schemas reside in `@ktv/contracts`. Both frontend and backend consume this package.
3. **No Leaked Dependencies:** Server-only packages (`mongoose`, `bcrypt`, `jsonwebtoken`, `pino`) are never imported into `@ktv/contracts` or `apps/web`.

---

## 3. Data Flow & Communication

### REST Envelope Specification

All API endpoints follow a standardized response envelope.

**Success Response (`200 OK`, `201 Created`):**
```json
{
  "success": true,
  "message": "Request successful",
  "data": { ... }
}
```

**Error Response (`400 Bad Request`, `401 Unauthorized`, `404 Not Found`, `500 Server Error`):**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "username",
      "message": "Username must be at least 3 characters"
    }
  ]
}
```

### Health Check Specification

`GET /api/v1/health` distinguishes between available application runtime and database connectivity:
```json
{
  "success": true,
  "message": "Service healthy",
  "data": {
    "status": "ok",
    "environment": "development",
    "timestamp": "2026-11-06T00:30:00.000Z",
    "uptime": 142.5,
    "database": {
      "status": "connected",
      "name": "ktv_online"
    }
  }
}
```
If the database connection is dropped, `data.status` transitions to `degraded` while keeping the HTTP process responsive.

---

## 4. Domain Models & Indexing

### User Model (`User`)
- `username`: String (Unique, Indexed, lowercase, 3-30 chars)
- `email`: String (Unique, Indexed, lowercase, valid email)
- `passwordHash`: String (bcrypt salt rounds: 10)
- `avatar`: String (Nullable URL)
- `role`: Enum (`'admin'`, `'user'`, `'moderator'`)
- `status`: Enum (`'active'`, `'suspended'`, `'offline'`, `'online'`)
- Timestamps (`createdAt`, `updatedAt`)
- Indexes: `{ email: 1, status: 1 }`, `{ username: 1, status: 1 }`

### Room Model (`Room`)
- `name`: String (Indexed, 2-60 chars)
- `description`: String (Max 250 chars)
- `ownerId`: ObjectId ref `User` (Indexed)
- `roomType`: Enum (`'standard'`, `'vip'`, `'party'`)
- `visibility`: Enum (`'public'`, `'private'`)
- `capacity`: Number (2-50, default 10)
- `status`: Enum (`'idle'`, `'singing'`, `'paused'`, `'closed'`)
- `category`: Enum (`'all'`, `'pop'`, `'anime'`, `'rock'`, `'ballad'`, `'hiphop'`, `'rnb'`)
- `currentParticipantsCount`: Number (>= 0)
- `currentSongTitle`: String (Nullable)
- `currentSingerName`: String (Nullable)
- Timestamps (`createdAt`, `updatedAt`)
- Indexes: `{ visibility: 1, status: 1, createdAt: -1 }`, `{ category: 1, visibility: 1 }`, Text search: `{ name: 'text', description: 'text' }`

---

## 5. Security & Reliability

- **Helmet:** HTTP header hardening against XSS, clickjacking, and MIME sniffing.
- **CORS:** Explicit origin whitelisting allowing only authorized client origins (`FRONTEND_URL`).
- **Rate Limiting:** `express-rate-limit` protecting against brute-force and request flooding (default: 300 req / 15 min per IP).
- **Graceful Shutdown:** Interception of `SIGTERM` and `SIGINT` to cleanly close HTTP listeners and MongoDB connection pools within a 10s grace period.
