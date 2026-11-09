# Personal AI Control Center

A personal, self-hostable AI workspace for one owner. The product interface is Lithuanian; source identifiers and developer documentation are English. Phase 1 is a locally reviewable foundation with explicitly fictional demo content.

## Local setup

Requires Node 22.13+ (Node 24 LTS recommended) and npm.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open [the local workspace](http://127.0.0.1:3000). The default example explicitly enables development access and demo mode. No database or remote service is required for demo review. Use `cp .env.example .env.local` on Linux/macOS. Keep `.env.local` private.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server, loopback only |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Meaningful boundary tests |
| `npm run build` | Production build |
| `npm start` | Production server; development bypass is rejected |

To review the UI, open each navigation page, review a sample decision, save a chat/improvement/task draft, reload to confirm browser persistence, filter tasks, and reset the demo in Settings. These actions never execute AI work.

## Environment

`.env.example` contains placeholders only. `AUTH_MODE=development` is accepted only during development/test; production requires `oidc` with `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL` and `OWNER_SUBJECT`. `APP_ORIGIN` identifies the application's own origin. `DATA_MODE=demo` uses isolated fictional fixtures. A future live data provider uses PostgreSQL via `DATABASE_URL`. Integration variables are server-only placeholders and do not establish connectivity. Do not set `NEXT_PUBLIC_*` secrets.

Read [architecture](docs/ARCHITECTURE.md), [integration boundaries](docs/INTEGRATIONS.md), and [delivery and roadmap](docs/ROADMAP.md) before future changes. The full local infrastructure/access audit, personal data, vault and credentials must never be committed to this public repository.
