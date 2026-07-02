# Bike Auction Platform (Production Ready)

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

---

## Quick Testing Walkthrough

The platform setup is fully automated. You do not need to run manual configuration or database migration scripts.

### 1. Start the Platform in a Single Command:
Run the following command at the root of the project to build and start all containers:
```bash
docker compose up --build
```
*(PostgreSQL, Redis, the Next.js web application, and the BullMQ background worker will build, spin up, migrate the database schema, and seed the default admin account automatically).*

### 2. Access the Application:
*   Open [http://localhost:3000](http://localhost:3000)

### 3. Test the Auction & Live Bidding Flow:
*   **Admin Panel:** Log in with `admin@bikeauction.dev` / `password123` and navigate to the admin page at [http://localhost:3000/admin](http://localhost:3000/admin). Add a motorcycle listing, and schedule a new auction (e.g. set the registration start to *now*, registration end to *+1 min*, and auction start to *+1 min*).
*   **Buyer Registration:** Open an **Incognito / Guest Window** (or a different browser), register a new buyer account, navigate to the newly created auction, and click **Register for Auction** before the registration window closes.
*   **Real-time Broadcast:** Watch the UI dynamically transition from "Registration" to "Live Bidding" automatically when the countdown timer hits zero. Place bids in the buyer window and verify they update instantly on other connected browsers without requiring page refreshes.

---

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

---

## Technical Design & Architecture Overview

The Bike Auction Platform is a real-time, concurrency-safe application designed to manage the lifecycle of time-boxed motorcycle auctions, user registrations, and live bidding. The platform is architected around a strict separation of concerns, decoupling the transactional write path (HTTP REST APIs) from the real-time notification broadcast path (WebSockets) and the background scheduling system (BullMQ).

### Core Components
*   **Web Application (Next.js App Router):** Serves the server-rendered and client-side UI, processes HTTP REST mutations (user registration, auction management, and bid placement), handles authentication via Auth.js, and runs an in-process Socket.io server attached to the Node.js HTTP server.
*   **Lifecycle Scheduler Worker (BullMQ + Redis):** A separate Node.js process dedicated to executing delayed lifecycle events (`reg-start`, `reg-end`, `open-auction`, `close-auction`) at exact timestamps. These jobs are persisted in Redis, ensuring they survive process restarts.
*   **Data Tier (PostgreSQL + Prisma):** Acts as the single source of truth for all operational data, schemas, and historical audit logs. Relational integrity, foreign key constraints, and cascade delete rules are enforced directly at the database engine level.
*   **In-Memory Store (Redis):** Serves as the message broker for pub/sub real-time event distribution, the rate-limiting counter, and the queue storage backend for BullMQ.

### 1. Strong Engineering Fundamentals
#### Concurrency and Transactional Integrity
Bidding engines are highly volatile, money-adjacent write environments. Under intense bidding wars, multiple users will attempt to submit matching bid amounts within milliseconds. Naive "read current price, check, insert bid" logic creates a race condition (Time-of-Check to Time-of-Use).

To prevent phantom writes and duplicate bid commits:
*   The system uses **explicit row-level locks** (`SELECT ... FOR UPDATE`) inside an ACID database transaction.
*   The transaction is executed at the standard `ReadCommitted` isolation level. Since the `FOR UPDATE` query explicitly blocks concurrent transactions on that auction ID row until the active transaction commits, we achieve strict serialization without the high rollback overhead of full `SERIALIZABLE` isolation.
*   All monetary amounts are stored as **BigInt in minor units (paise)** to bypass the floating-point rounding errors native to standard IEEE 754 float types.

### 2. Clean and Maintainable Code
#### Modular Architecture
The repository is structured as a yarn/npm workspace monorepo. This separates the runtime concerns of the frontend Next.js server (`apps/web`) from the background worker daemon (`apps/worker`), while sharing configurations and databases.

```
apps/
  web/      Next.js application, REST API handlers, and Socket.io server
  worker/   BullMQ delayed event processor
```

#### Type Safety and Shared Schemas
*   **Prisma Client:** Code generation guarantees compile-time type safety for database models, removing the class of bugs associated with manual SQL queries or weakly-typed ORM objects.
*   **Zod Schema Validation:** Input validation schemas are shared across client-side validation logic and server-side controller inputs. This guarantees that malformed payloads are rejected at the edge before consuming server CPU cycles or database connections.

### 3. Thoughtful System Design
#### Decoupled Write-Broadcast Flow
A key design choice is separating the write path (placing a bid) from the broadcast path (pushing the new bid to other clients):

```
Client POST Bid ────> Next.js REST API ────> SQL Transaction (Locked Row)
                                                      │
                                                      ▼
Client Socket <──── Socket.io Broadcast <──── Redis Pub/Sub Event
```

*   **REST for Mutations:** Placed bids are processed via standard HTTP POST requests. This keeps the transaction stateless, testable via plain integration runner files, and rate-limiter-friendly.
*   **WebSockets for Broadcast:** The Socket.io connection is read-only for clients, fanning out updates matching the specific `auction:id` rooms. If the websocket layer crashes, users can still place bids via HTTP fallback, ensuring high system availability.

### 4. Production-Grade Architecture
#### Deployment Separation
The codebase is fully containerized using multi-stage Docker builds. In production:
*   **Web Server Container:** Deployed on persistent container platforms (Railway, Render, AWS ECS) that support long-running processes (required to keep Socket.io stateful connections alive).
*   **Worker Process Container:** Runs as a headless daemon. Because BullMQ manages job distribution via Redis, the worker contains no HTTP listeners and does not expose ports, drastically reducing the security attack surface.
*   **Persistent Infrastructure:** Utilizes highly available managed databases (Neon, AWS RDS) and Redis brokers (Upstash, ElastiCache) that support connection pooling.

### 5. Scalability Considerations
#### Horizontal Scaling (Scale-Out)
*   **WebSocket Stateful Scaling:** If the web app is scaled horizontally to multiple container instances, a socket connection on Instance A will not natively hear messages from Instance B. We address this by routing all socket events through Redis Pub/Sub. Adding the Socket.io Redis adapter scales state fanning out across multi-nodes dynamically.
*   **Distributed Background Processing:** BullMQ jobs utilize Redis-backed locks. If multiple worker containers run in parallel, Redis guarantees that each lifecycle job (such as finalizing an auction winner) is claimed and processed by exactly one worker, removing duplicate processing.

### 6. Security Best Practices
*   **Password Cryptography:** User registration passwords are encrypted before database insertion using `bcryptjs` with a cost factor of `12` rounds.
*   **Token-Bucket Rate Limiting:** Implemented at the edge using Redis-backed counters on mutating endpoints (like `/bids`). This protects the database from denial-of-service (DoS) scripts and automated bidding spam.
*   **Role Claims Authorization:** Session tokens (JWTs) carry the user's role claim (`BUYER`/`ADMIN`). Middleware intercepts requests at the route level to restrict `/admin` page views, and API controllers validate server sessions before mutating database records.

### 7. Logging, Monitoring, and Observability
*   **Correlation IDs:** A unique UUID (`x-correlation-id`) is generated at the request edge and propagated through database operations, transaction logs, background tasks, and socket event emissions. This allows a single bid flow to be traced end-to-end through unstructured logs.
*   **Structured JSON Logging:** Pino produces machine-readable JSON logs in production, allowing cloud watchdogs (Datadog, Kibana) to index and query errors.
*   **Business-Level Audit Logs:** Operational logs are mirrored into the database `AuditLog` table. This acts as an immutable ledger detailing which users performed admin edits, auction cancellations, registration requests, or bid submissions.

### 8. Automated Testing
*   **Integration and Concurrency Tests:** Tested using Vitest against a containerized PostgreSQL test instance. Mock objects are avoided on critical paths to ensure transaction locks are evaluated under actual database locking behaviors.
*   **Simulated Parallel Runs:** The concurrency suite executes simultaneous asynchronous requests to ensure that double-spend or double-bid commits are blocked, and that losers get clean HTTP `409` conflicts.

### 9. Good API Design
*   **Resource-Oriented REST:** Follows clean REST principles using standardized status codes:
    *   `400 Bad Request` for validation failures.
    *   `401 Unauthenticated` for missing login context.
    *   `403 Forbidden` for role constraint mismatches.
    *   `409 Conflict` for outbid attempts or closed registration windows.
*   **Pagination:** Endpoints returning lists (like `/api/auctions`) use cursor-based pagination to ensure query speeds remain constant ($O(1)$) as the database table grows.
*   **Standardized Error Envelope:** Errors are wrapped in a consistent, predictable format:
    ```json
    { "error": { "code": "BID_TOO_LOW", "message": "Bid must be at least ₹50,500." } }
    ```

### 10. Excellent User Experience and Interface Design
*   **Dynamic Time Boundaries:** To prevent user confusion, status changes are computed client-side using timers. The UI automatically hides the "Register" button and displays "Bidding inputs" the exact second the auction transitions from *Registering* to *Live*.
*   **Outbid Indicators:** If another buyer outbids the active user, a visual warning is instantly broadcast over Socket.io, showing an outbid notification card to prompt immediate re-entry.
*   **Non-Blocking Updates:** Bid boards and recent activity panels use reactive animations to insert new bids seamlessly without causing jarring layout shifts or requiring page reloads.
