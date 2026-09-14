# DSA Tracker — Editorial Paper Pro

56 chapters • 844 unique problems • PDF viewer • progress sync.

Editorial-style PWA for grinding DSA. Track topics, questions, notes, chapter-level progress, streaks. Works offline (localStorage `dsa-tracker-v3`) and syncs to server when logged in.

## Features
- **56 chapters** in 12 phases with per-chapter progress (70% questions +30% topics) + streak + next-up
- **Deduped questions** — 1235 rows → 844 unique (LC ID dedup toggle)
- **Spaced repetition** — Again/Hard/Good/Easy grades, Due-today queue, Anki TSV export
- **Status**: todo / done / revise + pen notes per question/topic/chapter, all persisted locally + server merge
- **Board ∞ wikiboard** — drag/resize cards, curved links, minimap, layout export/import
- **Dark ink mode** + offline PWA (service worker, installable)
- **Search + filters**: chapters, topics, LC, difficulty, status; command palette `⌘K` with recent jumps, keys `J/K/C/R`
- **Knowledge search** — ⌘K also searches PDF notes, reference texts, topics and your pen notes with jump-to-tab
- **Sprint mode** — timed practice sessions (chapter / due / revise / company) with scoring and auto-ink
- **PDF viewer** per chapter (`pdfs/*.pdf`) with text extracts for quick search
- **Auth**: JWT + bcrypt, password policy (min 8, letter+number), account lockout (5 fails → 60s backoff), sync merges progress
- **LC proxy** with 5-min cache (`/api/lc/:username`)
- Hardened: Helmet + CSP, CORS allow-list, rate limiting, pino logs + `X-Request-Id`, graceful shutdown
- Health `/api/health`, readiness `/api/readyz`, metrics `/api/metrics`, docs `/api/docs`

## Stack
Node 22 + Express 4, JWT, bcrypt, Helmet, CORS, compression, rate-limit, pino, Zod validation, static SPA.
Zero-build frontend: vanilla JS split into ordered classic scripts (`js/core.js`, `data.js`, `board.js`, `companies.js`, `track.js`, `srs.js`, `screens.js`), Tailwind CDN; component extracted only when needed.

## Test & QA
```bash
cd server && npm test        # API tests (isolated temp datastore, ephemeral port)
cd qa && npm install --no-audit --no-fund && npm test   # headless-browser suites, needs server on :3000 + Chrome
```
UI suites: `core-flow` (picking, companies, board, palette, knowledge search), `srs-flow` (grading, due list, Anki, target checklist), `craft-flow` (board links/minimap/import, dark mode, offline PWA), `sprint-flow` (setup, session, keyboard, timeout, auto-ink).

## Deploy (Docker)
Requires Docker Desktop (https://docs.docker.com/get-docker/).
```bash
cp .env.example .env   # optional; or export JWT_SECRET=$(openssl rand -hex 32)
docker compose up --build -d
curl localhost:3000/api/health
```
Notes: leave `JWT_SECRET` empty to auto-generate + persist one in `./server/data/jwt_secret`;
progress/users persist in `./server/data` (volume-mounted, git-ignored). Local quick run without Docker:
`Start DSA Tracker.bat` (double-click) or `cd server && npm install && npm start`.

## Quick start
```bash
cd server && npm install
copy .env.example .env  # optional — works zero-config
npm start               # http://localhost:3000  (API at /api, SPA at /)
# prod: docker compose up --build
```

Demo: register any email/password (hashed with bcrypt) → login → ink progress → export JSON.

## API
See `openapi.yaml` and `/api/docs` (live). Core: `POST /api/register`, `POST /api/login`, `GET /api/me`, `GET|POST /api/progress`, `GET /api/lc/:username`, `GET /api/health|/api/readyz`.

## Project building notes
- **Double-write protection**: unique LC keys prevent double-counting; server merge is shallow + additive.
- **Offline-first**: localStorage is source of truth, server is backup; merge on login never clobbers.
- **Why single-file SPA?** Zero build step for fast iteration; Tailwind CDN; component extracted only when needed.
- Interview: explain dedup toggle trade-off, phase progress averaging, streak logic, atomic hold vs DB unique constraint (healthcare contrast).
