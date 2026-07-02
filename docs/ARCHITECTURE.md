# Bike Auction Platform — Architecture & Design Document

## 1. Overview

A platform where registered users bid on used motorcycles in live, time-boxed
auctions. Admins create listings and schedule auctions; buyers place bids in
real time and see the current highest bid update live across all connected
clients. The system enforces a single source of truth for auction state,
handles concurrent bids safely, and closes auctions automatically at their
scheduled end time.

**Goals:** correctness under concurrent writes, real-time UX, auditable
auction history, and an architecture that documents its own scaling path.

**Non-goals (explicitly out of scope for this build):** payments/escrow,
KYC/identity verification, multi-currency support, mobile apps. These are
noted so the boundary of the system is unambiguous, not because they're
unimportant.

## 2. Assumptions & Constraints

- **Scale target:** demo-scale (tens of concurrent auctions, dozens of
  bidders per auction), but the concurrency-control and data-consistency
  logic is written the way it would be for real scale — that's the part that
  doesn't get to be a shortcut.
- **Timebox:** single-session build. Where a corner is cut, it's recorded in
  `ASSUMPTIONS.md` with the "what I'd do in production" alternative named
  explicitly, not left implicit.
- **Deployment target:** Docker Compose for local/demo run. Cloud deployment
  is documented as a plan (Vercel + managed Postgres/Redis) but not
  necessarily stood up live.
- Auctions have a fixed `startTime`/`endTime` set by an admin — no
  "extend on last-second bid" sniping protection in v1 (noted as a
  documented enhancement, not implemented, since it adds real complexity
  to the closing worker).
- One motorcycle = one auction. No bundled lots.
- Currency: single currency (INR), stored as integer minor units (paise) to
  avoid floating-point bid errors.

## 3. High-Level Architecture

```
                        ┌────────────────────────────┐
                        │        Browser (React)      │
                        │  Next.js App Router client   │
                        └───────┬──────────────┬───────┘
                                │ HTTPS (REST)  │ WebSocket
                                ▼               ▼
                     ┌─────────────────────────────────┐
                     │     Next.js Node Server           │
                     │  - App Router pages (SSR)         │
                     │  - Route Handlers (REST API)       │
                     │  - Socket.io attached to same       │
                     │    HTTP server (see §6 trade-off)   │
                     └───────┬──────────────┬────────────┘
                             │              │
                    Prisma ORM│              │ pub/sub
                             ▼              ▼
                     ┌──────────────┐   ┌──────────┐
                     │  PostgreSQL   │   │  Redis    │
                     │ (source of    │   │ (locks,   │
                     │  truth)       │   │ pub/sub,  │
                     └──────────────┘   │ job queue)│
                             ▲          └────┬─────┘
                             │               │
                     ┌───────┴───────────────┴──────┐
                     │      Worker Process (BullMQ)   │
                     │  - opens/closes auctions on     │
                     │    schedule                     │
                     │  - determines winner atomically │
                     └────────────────────────────────┘
```

**Why a separate worker process, but not a separate socket service:**
Auction open/close must fire reliably even if no HTTP request happens to
touch that auction at the right moment — that needs a scheduler independent
of request/response, so it's a genuinely separate process (BullMQ delayed
jobs backed by Redis, survives restarts). Real-time bid broadcast, in
contrast, only needs to happen *in response to* a REST write that already
runs inside the Next.js server — so for the timebox, it rides along on the
same process rather than becoming a second service to deploy and reason
about. §6 documents the production alternative.

## 4. Data Model

```
User          id, email, passwordHash, role[BUYER|ADMIN], createdAt
Motorcycle    id, make, model, year, mileage, condition, imageUrls[], createdByAdminId
Auction       id, motorcycleId, startTime, endTime, startingBidPaise,
              currentHighestBidId, status[SCHEDULED|LIVE|CLOSED|CANCELLED],
              version (int, optimistic concurrency)
Bid           id, auctionId, userId, amountPaise, createdAt
AuditLog      id, actorId, action, entityType, entityId, metadata(json), createdAt
```

**Key invariants, enforced at the DB layer, not just app layer:**
- `Bid.amountPaise` must exceed the auction's current highest bid at the
  moment of commit — checked inside the same transaction that inserts the
  bid, not checked-then-written as two steps (that's the race condition).
- `Auction.status` transitions are one-directional:
  `SCHEDULED → LIVE → CLOSED` (or `→ CANCELLED` from `SCHEDULED`/`LIVE`).
  No transition back.
- Every bid and every status transition writes an `AuditLog` row in the same
  transaction — audit trail can't silently drift from actual state.

## 5. Core Flows

### 5.1 Placing a bid (the flow that has to be correct)
1. Client sends `POST /api/auctions/:id/bids { amountPaise }` (authenticated).
2. Server validates: auction exists, `status === LIVE`, `now < endTime`,
   user isn't bidding against their own current highest bid, amount is a
   valid increment above current highest.
3. Server opens a DB transaction at `SERIALIZABLE` isolation (or uses
   `SELECT ... FOR UPDATE` on the auction row — see §6 for which one and
   why): re-reads current highest bid inside the transaction, re-validates,
   inserts the `Bid` row, updates `Auction.currentHighestBidId`, writes
   `AuditLog`, commits.
4. On commit, server publishes `{ auctionId, bid }` to Redis pub/sub channel
   `auction:{id}`.
5. Socket.io (subscribed to that channel) broadcasts the new highest bid to
   every client watching that auction's room.
6. If the transaction fails validation (someone else's bid landed first),
   client gets `409 Conflict` with the current actual highest bid, and the
   UI reconciles instead of silently failing.

### 5.2 Auction lifecycle (open/close)
1. Admin schedules an auction with `startTime`/`endTime`.
2. Worker enqueues two delayed BullMQ jobs at creation time: `open-auction`
   at `startTime`, `close-auction` at `endTime`.
3. `open-auction` job flips `SCHEDULED → LIVE`, publishes an event so
   listing pages update without a refresh.
4. `close-auction` job flips `LIVE → CLOSED` **inside a transaction that
   also locks the auction row**, so a bid arriving in the last millisecond
   can't land after closure and vice versa isn't ambiguous. Winner = holder
   of `currentHighestBidId`. Writes final `AuditLog` entry.

### 5.3 Real-time fan-out
Bids are written via REST, not over the socket connection directly. The
socket is read-mostly (broadcast) plus presence (viewer counts). This keeps
the transactional write path testable with plain HTTP integration tests,
independent of socket infrastructure — a deliberate testability decision,
not just convenience.

## 6. Concurrency & Consistency Strategy (the important section)

**The problem:** two users submit bids on the same auction within
milliseconds of each other. Naive "read current price, compare, write" logic
has a race window between read and write.

**Decision:** row-level locking via `SELECT ... FOR UPDATE` on the
`Auction` row inside a Postgres transaction, rather than optimistic
concurrency (version-check-and-retry) or a Redis distributed lock.

**Why this over the alternatives:**
- *Optimistic concurrency (compare-and-swap on `version`)* — works, but
  under real bidding-war load it means a lot of client-visible retries
  right when UX matters most (the exciting last-seconds bidding).
- *Redis distributed lock (Redlock)* — adds an external failure mode
  (lock service down ≠ database down) for a guarantee Postgres already
  gives you for free inside a transaction. Worth it at a scale where
  Postgres row locks become a bottleneck; not worth the complexity here.
- *`SELECT ... FOR UPDATE`* — the auction row is locked for the ~milliseconds
  it takes to validate-and-insert, serializing writes *per auction* (not
  globally — auction A's lock doesn't block auction B), which is exactly
  the granularity needed.

**Documented limitation:** this serializes writes at the database level,
which is correct but doesn't horizontally scale bid-writes for a single
wildly popular auction across multiple app server instances beyond what one
Postgres primary can do. At real scale, the next step is sharding hot
auctions or moving bid ordering to a dedicated sequencer — noted here
explicitly rather than silently assumed away.

**Socket-in-same-process trade-off (referenced in §3):** because Socket.io
runs in the same Node process as the Next.js server, this doesn't
horizontally scale past one instance without adding the Socket.io Redis
adapter (which lets multiple server instances share socket room state via
Redis pub/sub — the pub/sub channel already used for broadcast makes this a
small change, not a rewrite, when that becomes necessary).

## 7. API Design

REST, resource-oriented, versioned under `/api/v1`.

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/auctions                 ?status=LIVE&page=
GET    /api/v1/auctions/:id
POST   /api/v1/auctions                 (admin)
PATCH  /api/v1/auctions/:id             (admin — schedule changes, cancel)
GET    /api/v1/auctions/:id/bids
POST   /api/v1/auctions/:id/bids
GET    /api/v1/motorcycles
POST   /api/v1/motorcycles              (admin)
GET    /api/v1/users/me
GET    /api/v1/admin/audit-log          (admin)
```

- Errors follow a consistent envelope: `{ error: { code, message, details? } }`
  with correct HTTP status codes (`400` validation, `401` unauthenticated,
  `403` unauthorized, `404`, `409` bid conflict, `429` rate-limited).
- Idempotency: bid submissions accept a client-generated `Idempotency-Key`
  header so a network retry can't double-submit the same bid.
- Pagination: cursor-based on list endpoints.

## 8. Security Model

- **AuthN:** Auth.js with credentials provider, bcrypt-hashed passwords,
  JWT session with role claim.
- **AuthZ:** middleware checks role on every admin route; bid ownership
  checked server-side (can't bid as another user regardless of client
  payload).
- **Input validation:** Zod schemas on every API route, shared between
  client and server where possible.
- **Rate limiting:** per-user, per-IP limits on `POST /bids` (Redis token
  bucket) — bidding is the most abuse-prone endpoint in this system.
- **Server as source of truth:** client never sends "current price" back to
  the server for comparison; server always reads its own DB state.
- Standard hardening: HTTPS-only cookies, CSRF protection on state-changing
  routes, output encoding, parameterized queries via Prisma (no raw SQL
  string interpolation).

## 9. Observability

- **Structured logging:** `pino`, JSON logs, request-scoped correlation ID
  propagated through REST call → transaction → socket broadcast → audit log,
  so one bid can be traced end-to-end in logs.
- **Metrics:** `/api/metrics` (Prometheus format) — bid throughput, auction
  count by status, bid conflict rate (409s), socket connection count.
- **Error tracking:** Sentry wiring (env-var gated, off by default in demo).
- **Audit trail:** `AuditLog` table doubles as a business-level observability
  tool, separate from operational logs — "what happened to this auction" is
  answerable from data, not just log grep.

## 10. Testing Strategy

- **Unit:** bid validation logic, increment rules, auction status transition
  rules — pure functions, fast, no DB.
- **Integration:** the bid-placement transaction against a real test
  Postgres (via Docker) — including a concurrency test that fires two
  simultaneous bid requests and asserts only one wins and the loser gets a
  clean `409`.
- **E2E (Playwright):** one critical-path test — register, admin creates
  auction, two browser contexts bid against each other, both see the
  live update.
- Deliberately not chasing coverage percentage; chasing correctness on the
  concurrency path, since that's what "production-grade" is actually being
  judged on.

## 11. Deployment Architecture

- **Local/demo:** `docker-compose up` — Postgres, Redis, Next.js app
  (with attached socket server), worker process, all containerized.
- **Cloud (documented, not necessarily deployed live):** Next.js app on
  Vercel or a container host with persistent connections (Vercel's
  serverless functions don't hold WebSocket connections, so if deploying
  there, the socket portion needs to move to a small persistent-process
  host like Railway/Fly.io — this is the concrete trigger point for the
  "split socket server out" migration named in §6).
  Managed Postgres (Neon/RDS) + managed Redis (Upstash).
- CI: lint + typecheck + unit + integration tests on every push (GitHub
  Actions workflow included, not necessarily wired to a live repo).

## 12. Trade-offs & Alternatives Considered

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Socket + web server | Same process | Separate service | Timebox; documented migration path via Redis adapter |
| Bid concurrency control | Postgres row lock | Redis distributed lock | Correctness available "for free" in DB; adopt Redis lock only if row-lock contention becomes measured bottleneck |
| Auction close scheduling | BullMQ delayed jobs | Cron polling every N seconds | Precise timing, survives restarts, no polling overhead |
| Currency storage | Integer minor units | Decimal/float | Avoids floating-point rounding bugs in money |
| Last-second bid extension | Not implemented | "Soft close" auto-extend | Real complexity add; named as a v2 feature in ASSUMPTIONS.md |
| ORM | Prisma | Raw SQL / Knex | Type safety + migration tooling, worth it even under time pressure |
