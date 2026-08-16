# PM2 Dashboard

Dashboard web untuk mengontrol app **PM2** dari browser — termasuk app PM2 di VPS lain. Satu tampilan untuk: mulai / stop / restart / delete, status real-time, dan log viewer live.

## Arsitektur

```
┌─────────────┐   HTTPS    ┌──────────────┐   REST + WS (token)   ┌──────────────┐
│   Browser   │ ─────────► │  Dashboard   │ ────────────────────► │  Agent (VPS) │
│  (Vue 3 UI) │            │  (proxy +    │                       │   Fastify +  │
└─────────────┘            │   login)     │                       │  PM2 API     │
                           └──────────────┘                       └──────────────┘
                             (1 dashboard)        (1 agent per VPS, tersembunyi di belakang)
```

- **Agent** dipasang di setiap VPS → akses daemon PM2 via IPC socket lokal (programmatic API), expose REST + WebSocket dengan token auth.
- **Dashboard** pusat mengumpulkan semua agent → UI kontrol + log live. Backend dashboard jadi proxy, token agent tidak pernah sampai ke browser.

## Struktur

```
apps/agent/        Agent per VPS (Fastify + PM2 programmatic API)
apps/dashboard/    Dashboard pusat (Vue 3 + Tailwind, backend proxy)
packages/shared/   Type & skema API bersama
docs/PLAN.md       Rencana implementasi detail
```

## Status

**Fase rencana** — repo & arsitektur awal. Implementasi menyusul (agent core → logs → dashboard UI → deploy).

## Konfigurasi

Salin `.env.example` di masing-masing app, isi nilai asli **hanya di server** (jangan commit). Detail: `docs/PLAN.md`.
