# PM2 Dashboard

Dashboard untuk monitoring dan management PM2 processes di multiple servers.

## Features

- 🔍 **Real-time Monitoring** - Status semua PM2 processes
- 🔧 **Process Control** - Start, stop, restart, delete dari UI
- 📊 **Log Viewer** - Log berurutan (stdout + stderr merged)
- 🗄️ **PostgreSQL Database** - Secrets & server config persistent
- 🔐 **Authentication** - JWT + HTTP-only cookies
- 🌐 **Multi-server** - Monitor multiple VPS dari satu dashboard
- ⚡ **Live Update** - Config changes tanpa restart

---

## Prerequisites

- Node.js 18+ (recommended: 20+)
- pnpm 8+
- PostgreSQL (Docker atau installed)
- PM2 installed globally

---

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/UpitWahyu/pm2-dashboard.git
cd pm2-dashboard
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Setup PostgreSQL

#### Option A: Menggunakan Docker (Recommended)

```bash
# Jalankan PostgreSQL container
docker run -d \
  --name postgres-pm2 \
  -e POSTGRES_USER=pm2admin \
  -e POSTGRES_PASSWORD=your_secure_password \
  -e POSTGRES_DB=pm2dashdb \
  -p 5432:5432 \
  -v pgdata:/var/lib/postgresql/data \
  postgres:16-alpine
```

#### Option B: PostgreSQL sudah berjalan

Pastikan PostgreSQL sudah running, lalu buat database:

```bash
psql -U postgres -c "CREATE DATABASE pm2dashdb;"
```

### 4. Setup Environment Variables

```bash
# Buat .env files dari contoh
cp apps/agent/.env.example apps/agent/.env
cp apps/dashboard/.env.example apps/dashboard/.env
```

#### apps/agent/.env

```env
# Port agent listening
PORT=4001

# Token untuk authenticasi (generate: openssl rand -hex 32)
AGENT_TOKEN=your_secure_token_here

# Nama server ini (ditampilkan di dashboard)
AGENT_NAME=production-vps
```

#### apps/dashboard/.env

```env
# Port dashboard
PORT=3005

# Host binding (0.0.0.0 untuk remote access, 127.0.0.1 untuk local only)
HOST=0.0.0.0

# Secret untuk JWT session (generate: openssl rand -hex 32)
SESSION_SECRET=your_session_secret_here

# Login credentials
DASHBOARD_USER=admin
DASHBOARD_PASSWORD=your_secure_password

# Database connection
DATABASE_URL=postgresql://pm2admin:your_secure_password@127.0.0.1:5432/pm2dashdb

# Initial servers (JSON array)
DASHBOARD_SERVERS=[{"name":"local","url":"http://127.0.0.1:4001","token":"agent_token_here"}]
```

### 5. Build

```bash
# Build shared package first
pnpm --filter @pm2-dashboard/shared build

# Build agent
pnpm --filter agent build

# Build dashboard
pnpm --filter dashboard build:server
pnpm --filter dashboard build:web
```

### 6. Initialize Database

```bash
# Login ke dashboard
curl -X POST http://localhost:3005/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}' \
  -c cookies.txt

# Sync servers dari .env ke database
curl -X POST http://localhost:3005/api/servers/sync \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

---

## Running Services

### Method 1: PM2 (Recommended for Production)

```bash
# Start agent
pm2 start apps/agent/dist/index.js --name pm2dash-agent

# Start dashboard
pm2 start apps/dashboard/dist-server/index.js --name pm2dash-dashboard

# Save PM2 config
pm2 save
```

### Method 2: Systemd Service

#### /etc/systemd/system/pm2dash-agent.service

```ini
[Unit]
Description=PM2 Dashboard Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/path/to/pm2-dashboard/apps/agent
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### /etc/systemd/system/pm2dash-dashboard.service

```ini
[Unit]
Description=PM2 Dashboard
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/path/to/pm2-dashboard/apps/dashboard
ExecStart=/usr/bin/node dist-server/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable pm2dash-agent pm2dash-dashboard
sudo systemctl start pm2dash-agent pm2dash-dashboard
```

### Method 3: Docker Compose (Full Stack)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pm2admin
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: pm2dashdb
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  agent:
    build:
      context: .
      dockerfile: Dockerfile.agent
    environment:
      - PORT=4001
      - AGENT_TOKEN=${AGENT_TOKEN}
      - AGENT_NAME=docker-agent
    ports:
      - "4001:4001"
    depends_on:
      - postgres

  dashboard:
    build:
      context: .
      dockerfile: Dockerfile.dashboard
    environment:
      - PORT=3005
      - HOST=0.0.0.0
      - SESSION_SECRET=${SESSION_SECRET}
      - DASHBOARD_USER=admin
      - DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
      - DATABASE_URL=postgresql://pm2admin:${DB_PASSWORD}@postgres:5432/pm2dashdb
    ports:
      - "3005:3005"
    depends_on:
      - postgres
      - agent

volumes:
  pgdata:
```

---

## Configuration

### Database Tables

Automatically created on first run:

```sql
-- Secrets (SESSION_SECRET, DASHBOARD_PASSWORD, etc.)
CREATE TABLE secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Server configurations
CREATE TABLE servers (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  port INTEGER,
  token TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | Yes | 3005 |
| `HOST` | Bind address | No | 127.0.0.1 |
| `SESSION_SECRET` | JWT secret | Yes | - |
| `DASHBOARD_USER` | Login username | Yes | - |
| `DASHBOARD_PASSWORD` | Login password | Yes | - |
| `DATABASE_URL` | PostgreSQL connection | No* | - |
| `AGENT_TOKEN` | Auth token for agent | Yes | - |
| `AGENT_NAME` | Server display name | No | hostname |

*Database is optional; dashboard works with .env fallback.

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |

### Server Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers` | List active servers (for monitoring) |
| GET | `/api/servers/list` | List all servers (for admin) |
| POST | `/api/servers` | Add new server |
| PUT | `/api/servers/:id` | Update server |
| DELETE | `/api/servers/:id` | Delete server |
| POST | `/api/servers/sync` | Sync from .env to database |
| GET | `/api/servers/sync/status` | Check sync status |

### PM2 Process Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers/:name/processes` | List processes |
| POST | `/api/servers/:name/processes/:id/restart` | Restart process |
| POST | `/api/servers/:name/processes/:id/stop` | Stop process |
| POST | `/api/servers/:name/processes/:id/start` | Start process |
| GET | `/api/servers/:name/processes/:id/logs` | Get logs |

---

## Troubleshooting

### Agent tidak bisa connect ke PM2

```bash
# Pastikan PM2 running
pm2 status

# Cek agent logs
pm2 logs pm2dash-agent

# Test connection
curl http://localhost:4001/api/health
```

### Database connection error

```bash
# Test database connection
docker exec postgres-pm2 psql -U pm2admin -d pm2dashdb -c "SELECT 1"

# Cek .env
grep DATABASE_URL apps/dashboard/.env
```

### Dashboard tidak bisa akses dari luar

```bash
# Pastikan HOST=0.0.0.0 di .env
grep HOST apps/dashboard/.env

# Cek firewall
sudo ufw status
sudo ufw allow 3005

# Cek port listening
netstat -tlnp | grep 3005
```

---

## Security Notes

1. **Jangan commit .env files** - sudah di .gitignore
2. **Gunakan password kuat** - minimal 12 karakter
3. **Enable HTTPS** - gunakan reverse proxy (Caddy/Nginx)
4. **Restrict access** - gunakan firewall atau IP whitelist
5. **Backup database** -定期 backup PostgreSQL

---

## Development

```bash
# Development mode
pnpm run dev:agent    # Agent dengan hot-reload
pnpm run dev:dashboard # Dashboard dengan hot-reload

# Build all
pnpm run build

# Typecheck
pnpm run typecheck

# Test
pnpm run test
```

---

## License

MIT
