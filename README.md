# PM2 Dashboard

Dashboard web untuk mengontrol app **PM2** dari browser — termasuk app PM2 di VPS lain. Satu tampilan untuk: mulai / stop / restart / delete, status real-time, dan log viewer live.

## ✨ Features

- 🔍 **Real-time Monitoring** — Status semua PM2 processes
- 🔧 **Process Control** — Start, stop, restart, delete dari UI
- 📊 **Log Viewer** — Log berurutan (stdout + stderr merged berdasarkan timestamp)
- 🗄️ **PostgreSQL Database** — Persistent storage untuk secrets & server config
- 🔐 **Authentication** — JWT + HTTP-only cookies
- 🌐 **Multi-server** — Monitor multiple VPS dari satu dashboard
- ⚡ **Live Update** — Config changes tanpa restart PM2
- 🔄 **WebSocket Live Stream** — Log & status update real-time via `pm2.connectBus()`

## 📋 Quick Start

### Requirements

- Node.js 18+ (recommended: 20+)
- pnpm 8+
- PostgreSQL (Docker atau installed)
- PM2 installed globally

### Install & Run

```bash
# 1. Clone
git clone https://github.com/UpitWahyu/pm2-dashboard.git
cd pm2-dashboard

# 2. Install
pnpm install

# 3. Setup environment
cp apps/agent/.env.example apps/agent/.env
cp apps/dashboard/.env.example apps/dashboard/.env
# Edit .env files dengan config kamu

# 4. Setup PostgreSQL (pilih salah satu)
# Option A: Docker (recommended)
docker compose up -d

# Option B: PostgreSQL sudah berjalan
psql -U postgres -c "CREATE DATABASE pm2dashdb;"

# 5. Build
pnpm --filter @pm2-dashboard/shared build
pnpm --filter agent build
pnpm --filter dashboard build:server
pnpm --filter dashboard build:web

# 6. Start via PM2
pm2 start ecosystem.config.cjs
pm2 save

# 7. Akses
# Buka http://localhost:4100
# Login: admin / (password dari .env)
```

📖 **Dokumentasi lengkap**: [docs/INSTALL.md](docs/INSTALL.md)

## 🏗️ Architecture

```
┌─────────────┐   HTTPS    ┌──────────────┐   REST + WS (token)   ┌──────────────┐
│   Browser   │ ─────────► │  Dashboard   │ ────────────────────► │  Agent (VPS) │
│  (Vue 3 UI) │            │  (proxy +    │                       │   Fastify +  │
└─────────────┘            │   login)     │                       │  PM2 API     │
                           └──────────────┘                       └──────────────┘
                             (1 dashboard)        (1 agent per VPS)
```

- **Agent** — Fastify + PM2 programmatic API + WebSocket live streaming (`connectBus`)
- **Dashboard** — Vue 3 + Tailwind v4 + backend proxy (auth, rate limit, WS proxy)
- **Shared** — `@pm2-dashboard/shared` type & skema API bersama (Zod)
- **Database** — PostgreSQL untuk persistent secrets & server config

## 📁 Struktur

```
apps/agent/          Agent per VPS (Fastify + PM2 API)
apps/dashboard/      Dashboard pusat (Vue 3 + Fastify backend)
packages/shared/     Type & skema API bersama (Zod)
docs/                Dokumentasi (INSTALL.md, PLAN.md)
ecosystem.config.cjs Config PM2 untuk deploy agent & dashboard
docker-compose.yml   PostgreSQL container
```

## 🛠️ Development

```bash
# Hot-reload mode
pnpm --filter agent dev       # Agent (tsx watch)
pnpm --filter dashboard dev   # Dashboard (vite + tsx watch)

# Build
pnpm run build       # Build semua package

# Typecheck
pnpm run typecheck   # Typecheck semua package

# Test
pnpm run test        # Jalankan semua test (vitest)
```

## 🐳 Docker Compose (PostgreSQL)

```bash
# Jalankan PostgreSQL saja (default)
docker compose up -d

# Cek status
docker compose ps

# Stop
docker compose down
```

Database tersedia di `postgres://pm2dash:pm2dash@localhost:5432/pm2dash`. Konfigurasi ada di `docker-compose.yml`.

## 🚀 Deploy via PM2

```bash
# Start semua service (agent + dashboard)
pm2 start ecosystem.config.cjs

# Atau manual
pm2 start apps/agent/dist/index.js --name pm2dash-agent
pm2 start apps/dashboard/dist-server/index.js --name pm2dash-dashboard

# Save config
pm2 save

# Auto-start on reboot
pm2 startup
```

## 🔐 Keamanan

- ✅ `.env` files tidak di-commit ke repository
- ✅ Agent token tidak pernah sampai ke browser (backend proxy)
- ✅ Rate limiting pada login dan API endpoints
- ✅ JWT + HTTP-only cookies untuk authentication
- ✅ CORS protection
- ⚠️ **Jangan expose agent langsung ke publik** — gunakan dashboard sebagai proxy atau NPM + HTTPS + IP allowlist

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user |

### Server Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers` | List active servers |
| GET | `/api/servers/list` | List all servers (admin) |
| POST | `/api/servers` | Add server |
| PUT | `/api/servers/:id` | Update server |
| DELETE | `/api/servers/:id` | Delete server |

### PM2 Process Control
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers/:name/processes` | List processes |
| POST | `/api/servers/:name/processes/:id/restart` | Restart |
| POST | `/api/servers/:name/processes/:id/stop` | Stop |
| POST | `/api/servers/:name/processes/:id/start` | Start |
| GET | `/api/servers/:name/processes/:id/logs` | Get logs |

## 🛠️ Tech Stack

- **Backend**: Node.js, Fastify, PostgreSQL (pg)
- **Frontend**: Vue 3, TypeScript, Tailwind CSS v4, Vite
- **Process Manager**: PM2
- **Database**: PostgreSQL 16
- **Auth**: JWT (fastify-jwt)
- **Build**: pnpm workspace, TypeScript

## 📝 License

MIT
