# Bike Auction Platform — Architecture & Design Document (Version 2)

## 1. Overview

A platform where registered users bid on used motorcycles in live, time-boxed auctions. Admins create listings, manage motorcycles, and schedule auctions; buyers register for individual auctions, place bids in real time, and see the current highest bid and status updates live across all connected clients. The system enforces a single source of truth for auction state, handles concurrent bids safely, and updates states automatically at scheduled transition times.

**Goals:** correctness under concurrent writes, real-time UX, registration windows, bid authorization, and an architecture that documents its own scaling path.

**Non-goals:** payments/escrow, KYC/identity verification, multi-currency support, mobile apps.

---

## 2. Assumptions & Constraints

-   **Scale target:** demo-scale (tens of concurrent auctions, dozens of bidders per auction), but the concurrency-control and data-consistency logic is written for real scale.
-   **Auctions have a fixed schedule:** defined by registration start (`regStartTime`), registration end (`regEndTime`), auction start (`startTime`), and auction end (`endTime`).
-   **One motorcycle = one auction:** no bundled lots.
-   **Currency:** single currency (INR), stored as integer minor units (paise) to avoid floating-point bid errors.

---

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
                     │    HTTP server                      │
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
                     │  - open/close notifications     │
                     │  - finalizes winner             │
                     └────────────────────────────────┘
```

---

## 4. Data Model

```
User          id, email, passwordHash, role[BUYER|ADMIN], createdAt
Motorcycle    id, make, model, year, mileageKm, condition, imageUrls[], createdByAdminId
Auction       id, motorcycleId, title, description, regStartTime, regEndTime, startTime, endTime,
              startingBidPaise, reservePricePaise, currentHighestBidId, status[SCHEDULED|CLOSED|CANCELLED]
Bid           id, auctionId, userId, amountPaise, createdAt
AuctionRegistration id, auctionId, userId, createdAt
AuditLog      id, actorId, action, entityType, entityId, metadata(json), createdAt
```

**Key Invariants:**
-   **Computed Lifecycle Status:** The active state of an auction is calculated dynamically on the fly based on the server's current time:
    -   `UPCOMING`: `now < regStartTime`
    -   `REGISTERING`: `regStartTime <= now < regEndTime`
    -   `REGISTRATION_CLOSED`: `regEndTime <= now < startTime`
    -   `LIVE`: `startTime <= now < endTime`
    -   `CLOSED`: `now >= endTime` (or if database `status === CLOSED`)
-   **Cascade Deletes:** Deleting an auction automatically cascades and deletes related `Bid` and `AuctionRegistration` rows.
-   **Audit Trail:** Every bid, registration, and status transition writes an `AuditLog` row in the same transaction.

---

## 5. Core Flows

### 5.1 Placing a Bid (Concurrency-Safe)
1.  Client sends `POST /api/auctions/:id/bids { amountPaise }` (authenticated).
2.  Server validates:
    *   Auction exists and status is not `CANCELLED` or `CLOSED`.
    *   Current time is inside the bidding window (`startTime <= now < endTime`).
    *   User is registered for the auction (exists in `AuctionRegistration`).
    *   Amount is a valid increment above the current highest bid.
3.  Server opens a database transaction at `ReadCommitted` isolation and acquires a row lock:
    ```sql
    SELECT id, status, "startTime", "endTime" FROM "Auction" WHERE id = ? FOR UPDATE;
    ```
4.  Re-reads current highest bid inside the lock, checks user constraints, inserts the `Bid` row, updates `currentHighestBidId`, writes `AuditLog`, and commits.
5.  On commit, server publishes the bid to Redis pub/sub. Socket.io broadcasts it to the room.

### 5.2 Dynamic Lifecycle Transitions (Scheduler)
1.  When an admin schedules or updates an auction, `scheduleAuctionLifecycle` removes any existing jobs for that auction and enqueues four delayed BullMQ jobs:
    *   `reg-start` at `regStartTime`
    *   `reg-end` at `regEndTime`
    *   `open-auction` at `startTime`
    *   `close-auction` at `endTime`
2.  When a job fires, the background worker publishes a Socket.io status update to all connected browser clients.
3.  When the `close-auction` job fires:
    *   It locks the auction row (`FOR UPDATE`).
    *   It updates the database `status` to `CLOSED`.
    *   It writes the `AUCTION_CLOSED` audit log and announces the winner.

---

## 6. Concurrency & Consistency Strategy

-   **Postgres Row Locks (`FOR UPDATE`):** Primary mechanism. It serializes writes *per auction* for the milliseconds it takes to write a bid, ensuring the "check bid amount -> write bid" sequence is race-free.
-   **Redis Pub/Sub & WebSockets:** Isolates the transactional write path (HTTP POST) from the broadcast path (WebSocket). WebSockets are read-mostly, keeping performance high.

---

## 7. API Design

### User & Authentication
*   `POST /api/auth/register` - Signup
*   `POST /api/auth/login` - Login

### Auctions (Public / Buyer)
*   `GET  /api/auctions` - List non-cancelled auctions
*   `GET  /api/auctions/:id` - Fetch auction details & bids
*   `POST /api/auctions/:id/register` - Register for an auction (during registration window)
*   `POST /api/auctions/:id/bids` - Place a bid (registered users only)

### Admin Console
*   `POST   /api/motorcycles` - Add a motorcycle
*   `GET    /api/motorcycles` - List all motorcycles (for selection dropdown)
*   `POST   /api/auctions` - Schedule a new auction
*   `PUT    /api/auctions/:id` - Edit auction schedule and parameters
*   `DELETE /api/auctions/:id` - Delete an auction (cascade deletes bids/registrations)
