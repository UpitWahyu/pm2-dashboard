# PM2 Dashboard — Implementation Plan

> **Status:** Fase 0–5 SELESAI ✅. Agent (REST+WS+logs+kontrol) + Dashboard (login+servers+detail+aksi+log-live) deployed via PM2 + Cloudflare+NPM. Publik: https://pm2.netw.my.id

**Goal:** Dashboard web untuk mengontrol app PM2 langsung dari browser, termasuk app PM2 di VPS lain — mulai/stop/restart/delete, lihat status & log real-time, semua dari satu tampilan.

**Architecture:** Arsitektur **agent–dashboard**. Satu *agent* kecil dipasang di setiap VPS (Fastify + programmatic PM2 API, jalan via IPC socket lokal — tidak perlu expose port PM2). Agent expose REST + WebSocket dengan token auth. *Dashboard* pusat (Vue 3 + Tailwind) mengumpulkan semua agent → satu UI kontrol. Dashboard backend-proxy ke agent supaya token agent tidak pernah masuk browser.

**Tech Stack:**
- Monorepo pnpm workspace (TypeScript)
- Agent: Node 20+, Fastify, `pm2` (programmatic API), `@fastify/websocket`, Zod
- Dashboard: Vue 3 + Tailwind v4 + Vite (preferensi UI: bersih, modal, dropdown custom), backend tipis (Fastify) sebagai proxy + session login
- Shared: `@pm2-dashboard/shared` (type & skema API bersama)

---

## Struktur Repo

```
pm2-dashboard/
├── apps/
│   ├── agent/            # agent per VPS (REST + WS + akses PM2)
│   └── dashboard/        # dashboard pusat (UI + proxy backend)
├── packages/
│   └── shared/           # tipe & skema API bersama (Zod)
├── docs/
│   └── PLAN.md           # dokumen rencana ini
├── package.json          # workspace root
├── pnpm-workspace.yaml
├── .gitignore
└── README.md
```

---

## Agent API (apps/agent)

Base: `http://<host>:<port>` — bind `127.0.0.1` default, proxy via NPM kalau mau publik. Semua route (kecuali `/health`) butuh header `Authorization: Bearer <AGENT_TOKEN>`.

| Method | Path | Deskripsi |
|---|---|---|
| GET | `/health` | status agent (tanpa auth) |
| GET | `/api/processes` | `pm2.list()` → semua app: name, pm_id, status, cpu, memory, uptime, restarts, unstopable, log paths |
| GET | `/api/processes/:id` | detail satu app (`pm2.describe`) |
| POST | `/api/processes/:id/restart` | restart |
| POST | `/api/processes/:id/stop` | stop |
| POST | `/api/processes/:id/start` | start |
| POST | `/api/processes/:id/delete` | delete dari PM2 |
| GET | `/api/processes/:id/logs?lines=100&stream=all\|out\|err` | tail N baris terakhir dari file log (out/err) |
| WS | `/api/live?token=...` | live stream: `process:list` (perubahan status) + `log:out`/`log:err` via `pm2.connectBus()` |

Catatan teknis agent:
- `pm2.connect()` (daemon IPC — hanya user yang punya daemon PM2 yang bisa connect; di VPS biasanya root).
- Log tail: baca `pm2_env.pm_out_log_path` / `pm2_env.pm_err_log_path`, ambil N baris terakhir (jangan load file penuh).
- Live: `pm2.connectBus()` → filter event per `process.name`/`pm_id`, kirim ke klien WS. Backpressure/throttle untuk mencegah flood.
- Validasi body/query pakai Zod. Error → format JSON konsisten `{ error: { code, message } }`.

## Dashboard (apps/dashboard)

- **Login** (session cookie, `SESSION_SECRET`), username/password dari env (fase 1).
- **Halaman Servers**: kartu per agent — nama, status (online/offline), jumlah app (online/stopped/errored), total CPU/mem, latency.
- **Halaman Detail Server**: tabel app — nama, status badge (warna), pm_id, CPU, mem, uptime, restarts; tombol aksi per baris (restart/stop/start/delete) dengan **modal konfirmasi**; status toggle berwarna sesuai preferensi UI.
- **Modal Log Viewer**: klik baris → modal, auto-load 100 baris terakhir, lanjut live-stream, auto-scroll, tombol pause, filter teks, tab Out/Err.
- Backend dashboard (Fastify) melakukan proxy ke agent → token agent tersimpan di env server, **tidak pernah dikirim ke browser**.

## Konfigurasi (env, placeholder di repo)

`apps/agent/.env.example`: `PORT`, `AGENT_TOKEN` (wajib diganti), `AGENT_NAME`.
`apps/dashboard/.env.example`: `PORT`, `SESSION_SECRET`, `DASHBOARD_USER`, `DASHBOARD_PASSWORD`, `DASHBOARD_SERVERS` (JSON array: `[{name, url, token}]`).

## Keamanan

- Token agent: random kuat; agent jangan di-expose publik langsung — cukup `127.0.0.1` + akses via proxy dashboard, atau NPM + HTTPS + IP allowlist.
- Dashboard punya login; semua aksi mutasi (restart/stop/delete) butuh konfirmasi di UI.
- Rate limit di agent (mis. aksi mutasi per menit) sebagai anti-spam.
- Tidak ada credential/domain asli di repo — semua placeholder (kebiasaan: docs pakai placeholder).

## Fase Implementasi

1. **Fase 0 — Scaffold**: pnpm workspace, tsconfig, vitest, shared types. *(repo + rencana sudah dibuat)*
2. **Fase 1 — Agent core**: connect PM2, `/health`, `/api/processes`, aksi kontrol (restart/stop/start/delete), auth bearer. Tes: vitest + verifikasi nyata `curl` di VPS.
3. **Fase 2 — Agent logs**: endpoint tail + WebSocket live (`connectBus`). Verifikasi: buka WS, stream log app sungguhan.
4. **Fase 3 — Dashboard**: login, daftar server dari env, tabel app + aksi dengan konfirmasi, modal log viewer live.
5. **Fase 4 — Proxy & hardening**: proxy backend ke agent, rate limit, HTTPS via NPM.
6. **Fase 5 — Deploy & verifikasi nyata**: ecosystem PM2 untuk agent & dashboard (dijalankan via PM2 — meta 😄), NPM proxy host, cek kontrol lintas VPS dari browser. Manual check nyata sebelum dinyatakan selesai.

## Verifikasi (tidak hanya build lulus)

- `curl -H "Authorization: Bearer $TOKEN" .../api/processes` → daftar app sesuai `pm2 list`.
- Restart satu app sungguhan → status berubah online, uptime reset.
- Buka WS live → log mengalir real-time.
- Dari browser: login → pilih server → restart app → log viewer jalan.
- Uji 2 agent (VPS berbeda) terdaftar & terkontrol dari satu dashboard.

## Risiko / Open Questions

- **PM2 daemon per-user**: agent harus jalan sebagai user yang memiliki daemon PM2 (root di VPS ini). Kalau ada VPS dengan user non-root, agent di-deploy sebagai user itu.
- **RCE via token**: token bocor = bisa jalanin apa pun. Mitigasi: proxy dashboard, HTTPS, IP allowlist, rate limit.
- **Log besar**: hanya tail; batasi ukuran response; kalau perlu, dukung `pm2 logs --lines` ala stream.
- **connectBus flood**: throttle/backpressure di sisi WS.
- Open: perlu dukung aksi `pm2 start` dari dashboard (script baru)? → keputusan nanti, fase 2.5.
- Open: auto-refresh daftar proses vs event-driven? → prefer event-driven (bus) + fallback polling 10s.
