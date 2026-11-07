# KTV Online – Virtual Karaoke & Social Entertainment Platform

> *"Your Virtual Hangout. Your Karaoke Night."*

KTV Online is a modern social entertainment platform designed for virtual karaoke lounges, real-time voice communications, synchronized lyrics playback, and social music experiences.

---

## 🛠️ Monorepo Architecture

```
ktv-online/
├── apps/
│   ├── web/                    # Next.js 15 (App Router), React 19, Tailwind CSS v4, Zustand
│   └── api/                    # Node.js 22, Express, TypeScript, Mongoose, Zod, Pino
├── packages/
│   └── contracts/              # Shared Zod schemas, API types, DTOs (Zero server runtime dependencies)
├── infrastructure/
│   └── docker/                 # MongoDB initialization & Docker scripts
├── docs/
│   ├── ARCHITECTURE.md         # System boundaries, data flow & envelopes
│   ├── DEVELOPMENT.md          # Local setup, testing & build guide
│   └── ROADMAP.md              # Sprints 0 to 5 & future tech integration points
├── docker-compose.yml          # Local MongoDB service definition
├── package.json                # Monorepo root scripts & dev tools
├── pnpm-workspace.yaml         # pnpm workspace definition
└── tsconfig.base.json          # Shared strict TypeScript base config
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment Variables
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 3. Launch Local MongoDB (Optional Container)
```bash
pnpm docker:up
```

### 4. Run Development Servers
```bash
# Starts contracts watcher, Express API (:5001), and Next.js Web (:3000)
pnpm dev
```

Visit:
- **Web Application**: [http://localhost:3000](http://localhost:3000)
- **API Health Check**: [http://localhost:5001/api/v1/health](http://localhost:5001/api/v1/health)

---

## 🧪 Testing, Quality & Builds

```bash
# Run all unit and integration tests across packages
pnpm test

# Run ESLint across monorepo
pnpm lint

# Strict TypeScript type check
pnpm typecheck

# Production builds
pnpm build
```

---

## 🧭 Documentation Links
- [System Architecture](file:///docs/ARCHITECTURE.md)
- [Developer & Operations Guide](file:///docs/DEVELOPMENT.md)
- [Product & Engineering Roadmap](file:///docs/ROADMAP.md)

---

## 📄 License
Private &copy; KTV Online. All rights reserved.
# ktv-online
