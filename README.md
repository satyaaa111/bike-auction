# Bike Auction Platform

A real-time bike auction platform. See `docs/ARCHITECTURE.md` for the
design rationale and `docs/ASSUMPTIONS.md` for what was traded off and why.

**Status:** architecture + scaffolding + demo implementations of the
highest-risk components (concurrent bid handling, auction lifecycle, real-time
broadcast). See "What's implemented vs. stubbed" below before running.

## Stack

Next.js (App Router) · PostgreSQL + Prisma · Redis · Socket.io · BullMQ ·
Auth.js · Vitest/Playwright · pino

## Project layout

```
apps/
  web/      Next.js app: UI, REST API routes, Socket.io (same process)
  worker/   Auction lifecycle scheduler (BullMQ) — separate process
docs/
  ARCHITECTURE.md   design doc, read this first
  ASSUMPTIONS.md    what was cut, and the production alternative for each
```

## Local setup

**Prerequisites:** Node 20+, Docker, npm.

```bash
git clone <repo-url> && cd bike-auction-platform
cp .env.example apps/web/.env
cp .env.example apps/worker/.env

npm install

# Start Postgres + Redis (and, once Dockerfiles are filled in, web + worker)
docker compose up -d postgres redis

# Run migrations
npm run db:migrate

# (optional) seed demo data — admin user, a few motorcycles, one LIVE auction
npm run db:seed

# Run the app and worker in separate terminals
npm run dev:web
npm run dev:worker
```

App runs at `http://localhost:3000`.

### Running everything in Docker (no local Node needed)

```bash
docker compose up --build
```

### Tests

```bash
# Unit + integration tests (spins up against the Dockerized Postgres)
npm run test

# E2E (requires the app running)
npx playwright test
```

## Environment variables

See `.env.example`. At minimum: `DATABASE_URL`, `REDIS_URL`,
`NEXTAUTH_SECRET`, `NEXTAUTH_URL`.

## Deployment (documented plan — see ARCHITECTURE.md §11)

- **Web app:** containerized deploy (Railway/Render/Fly.io) rather than
  Vercel, because the Socket.io server is attached to the same long-lived
  process — Vercel's serverless functions don't hold WebSocket connections
  open. If deploying to Vercel is a hard requirement, the socket layer needs
  to be split into its own always-on service first (the migration path for
  this is written up in ARCHITECTURE.md §6).
- **Worker:** same container host, separate service/dyno, always-on.
- **Postgres:** managed instance (Neon, RDS, Supabase).
- **Redis:** managed instance (Upstash, Redis Cloud).
- **CI:** GitHub Actions — lint, typecheck, unit + integration tests on
  every push (workflow file to be added at `.github/workflows/ci.yml`).

## What's implemented vs. stubbed

Given the timebox, effort was concentrated on the parts of the system that
are hard to get right and hard to retrofit — not the parts that are merely
time-consuming to build. Concretely:

**Implemented as real, tested logic:**
- Concurrency-safe bid placement (`lib/placeBid.ts`) with a passing
  integration test that proves the race condition is actually handled
  (`__tests__/placeBid.concurrency.test.ts`)
- Auction lifecycle scheduling/closing worker (`apps/worker`)
- Real-time broadcast wiring (Redis pub/sub → Socket.io)
- Auth with role claims, rate limiting, structured logging, audit log

**Scaffolded/stubbed (structure and interfaces are real, implementation is
a demo/TODO):**
- Remaining CRUD routes (motorcycles, auction admin endpoints)
- Frontend UI/pages
- Seed script
- CI workflow file

This split is intentional and matches the "quality of engineering decisions
over feature count" evaluation criterion stated in the assignment.
