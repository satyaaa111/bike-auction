# Deployment Guide

This guide details how to deploy the **Bike Auction Platform** (Version 2) to a production environment. 

---

## 🏗️ Production Target Architecture

Because the platform uses **Socket.io** for real-time WebSocket connections and **BullMQ** for delayed background tasks, the hosting infrastructure must support **long-lived persistent processes**. 

> [!WARNING]
> **Do not deploy the web app to Vercel or Netlify serverless functions.** 
> Serverless functions cannot hold WebSocket connections open and will terminate background event subscribers. You must deploy to a container host with persistent connections (e.g., Railway, Render, Fly.io, or AWS ECS/Fargate).

The system consists of four primary components in production:
1.  **Managed PostgreSQL Database** (Neon, AWS RDS, Supabase)
2.  **Managed Redis Cache & Queue** (Upstash Redis, Redis Cloud)
3.  **Web App Container (Persistent)** (Railway service, Render Web Service)
4.  **Worker Container (Persistent)** (Railway background worker, Render Background Worker)

---

## 🛠️ Step 1: Provision Managed Data Services

### 1. PostgreSQL Database
Provision a PostgreSQL instance (v15 or higher). Once provisioned, copy the connection string. It should look like:
```env
DATABASE_URL="postgresql://username:password@hostname:5432/dbname?sslmode=require"
```
*(Ensure `sslmode=require` is appended to the connection string if using Neon or AWS RDS).*

### 2. Redis Instance
Provision a Redis instance (v7.x or higher). Note down the connection string. It should look like:
```env
REDIS_URL="redis://:password@hostname:6379"
```
*(If using Upstash Redis, choose the standard TCP connection string, not the HTTP REST endpoint, as BullMQ requires direct TCP socket connections).*

---

## 🔑 Step 2: Prepare Environment Variables

You will need to supply the following environment variables to both target containers during deployment:

| Variable Name | Required By | Description | Example Value |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Web + Worker | Production PostgreSQL Connection URI | `postgresql://...` |
| `REDIS_URL` | Web + Worker | Production Redis Connection URI | `redis://...` |
| `NEXTAUTH_SECRET` | Web | Random cryptographic key to sign Auth session cookies | *Generate using `openssl rand -base64 32`* |
| `NEXTAUTH_URL` | Web | The public URL where the web app is hosted | `https://lot-house.up.railway.app` |
| `PORT` | Web | The port the HTTP server binds to | `3000` *(Usually set by the host)* |
| `LOG_LEVEL` | Web + Worker | Verbosity level for Pino structured JSON logging | `info` or `warn` |

---

## 🚀 Step 3: Deploy the Services (Using Railway / Render)

### Option A: Railway (Recommended)

Railway is highly recommended as it reads the workspace monorepo automatically and supports persistent containers out of the box.

1.  **Initialize Project:**
    *   Create a new project in Railway and connect your GitHub repository.
2.  **Deploy the Web App Service:**
    *   Add a new service from your repository.
    *   Under **Settings**, set the build Dockerfile to: `apps/web/Dockerfile`.
    *   Under **Variables**, add the environment variables listed in Step 2.
    *   Expose port `3000` and generate a public domain (e.g. `https://your-app.up.railway.app`).
    *   Ensure the generated domain is set in the `NEXTAUTH_URL` environment variable.
3.  **Deploy the Worker Service:**
    *   Add another service in the same project from the same repository.
    *   Under **Settings**, set the build Dockerfile to: `apps/worker/Dockerfile`.
    *   Under **Variables**, add `DATABASE_URL`, `REDIS_URL`, and `LOG_LEVEL`. (The worker does not require ports exposed or Auth secrets).
4.  **Launch:**
    *   Railway will build both Docker images, run Prisma client generation, and deploy the services.

---

### Option B: Render

1.  **Deploy the Web App:**
    *   Create a new **Web Service** on Render and connect your repository.
    *   Set the Runtime to `Docker`.
    *   Set the Dockerfile path to `apps/web/Dockerfile`.
    *   Add the environment variables listed in Step 2.
2.  **Deploy the Worker:**
    *   Create a new **Background Worker** on Render.
    *   Set the Runtime to `Docker`.
    *   Set the Dockerfile path to `apps/worker/Dockerfile`.
    *   Add the database, redis, and log environment variables.

---

## 🔄 Step 4: Run Database Migrations in Production

Before users can log in, you must apply the Prisma database migrations to the production PostgreSQL instance.

### Running Migrations via local command:
From your local terminal, run the migration command pointing to your production database URL:
```bash
DATABASE_URL="your-production-db-connection-string" npx prisma db push --schema=apps/web/prisma/schema.prisma
```

### Running Seeding (Create Admin):
Seed the administrator account into your production database:
```bash
DATABASE_URL="your-production-db-connection-string" npx tsx apps/web/prisma/seed.ts
```
*(The admin account will be created with username `admin@bikeauction.dev` and password `password123`. The admin must log in immediately and update their password in the profile/auth database).*

---

## 📈 Scaling Guidelines

### 1. Scaling the Web App (Horizontal Scale)
If you scale the Next.js Web App container to multiple instances to handle heavier traffic:
*   You **must** configure the Socket.io Redis adapter.
*   By default, this project uses an in-process memory adapter for Socket.io room communication. If scaled to 2+ web containers, a socket event published on instance A won't reach a bidder connected to instance B.
*   To enable horizontal scaling, install `@socket.io/redis-adapter` and connect it to your `REDIS_URL` in `apps/web/server.ts`.

### 2. Scaling the Worker (BullMQ Workers)
*   You can scale the background worker to multiple instances safely.
*   BullMQ automatically handles job locks and distributes tasks across available worker instances, ensuring each transition job (`close-auction`, etc.) is processed exactly once.
