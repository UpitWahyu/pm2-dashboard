# PM2 Dashboard

Dashboard web untuk mengontrol app **PM2** dari browser — termasuk app PM2 di VPS lain. Satu tampilan untuk: mulai / stop / restart / delete, status real-time, dan log viewer live.

## ✨ Features

- 🔍 **Real-time Monitoring** - Status semua PM2 processes
- 🔧 **Process Control** - Start, stop, restart, delete dari UI
- 📊 **Log Viewer** - Log berurutan (stdout + stderr merged berdasarkan timestamp)
- 🗄️ **PostgreSQL Database** - Persistent storage untuk secrets & server config
- 🔐 **Authentication** - JWT + HTTP-only cookies
- 🌐 **Multi-server** - Monitor multiple VPS dari satu dashboard
- ⚡ **Live Update** - Config changes tanpa restart PM2

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

# 4. Build
pnpm --filter @pm2-dashboard/shared build
pnpm --filter agent build
pnpm --filter dashboard build:server
pnpm --filter dashboard build:web

# 5. Start
pm2 start apps/agent/dist/index.js --name pm2dash-agent
pm2 start apps/dashboard/dist-server/index.js --name pm2dash-dashboard

# 6. Akses
# Buka http://localhost:3005
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

- **Agent**: Fastify + PM2 programmatic API + WebSocket live streaming
- **Dashboard**: Vue 3 + Tailwind v4 + backend proxy (auth, rate limit, WS proxy)
- **Database**: PostgreSQL untuk persistent secrets & server config

## 📁 Struktur

```
apps/agent/          Agent per VPS (Fastify + PM2 API)
apps/dashboard/      Dashboard pusat (Vue 3 + Fastify backend)
packages/shared/     Type & skema API bersama
docs/               Dokumentasi
```

## 🔐 Keamanan

- ✅ `.env` files tidak di-commit ke repository
- ✅ Agent token tidak pernah sampai ke browser (backend proxy)
- ✅ Rate limiting pada login dan API endpoints
- ✅ JWT + HTTP-only cookies untuk authentication
- ✅ CORS protection

## 🛠️ Tech Stack

- **Backend**: Node.js, Fastify, PostgreSQL (pg)
- **Frontend**: Vue 3, TypeScript, Tailwind CSS, Vite
- **Process Manager**: PM2
- **Database**: PostgreSQL 16
- **Auth**: JWT (fastify-jwt)

## 📝 License

MIT
