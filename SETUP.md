# Setup and Local Run Guide

This document outlines how to set up, run, and test the **Bike Auction Platform** (Version 2) on your local development machine.

---

## Prerequisites

Ensure you have the following installed on your host machine:
1.  **Node.js 20+**
2.  **Docker & Docker Compose** (e.g., Docker Desktop)
3.  **npm** (comes packaged with Node.js)

---

## Environment Configuration

The application requires environment configuration in both the **web app** and the **lifecycle worker** packages.

1.  Create the `.env` file for the **web app**:
    *   Create a file at `apps/web/.env`
    *   Paste the following configuration:
        ```env
        DATABASE_URL=postgresql://bikeauction:bikeauction@localhost:5432/bikeauction
        REDIS_URL=redis://localhost:6379
        NEXTAUTH_SECRET=dev-secret-change-in-production
        NEXTAUTH_URL=http://localhost:3000
        LOG_LEVEL=info
        ```
2.  Create the `.env` file for the **lifecycle worker**:
    *   Create a file at `apps/worker/.env`
    *   Paste the following configuration:
        ```env
        DATABASE_URL=postgresql://bikeauction:bikeauction@localhost:5432/bikeauction
        REDIS_URL=redis://localhost:6379
        LOG_LEVEL=info
        ```

---

## Option 1: Running Everything inside Docker (Recommended)

This option is the fastest and cleanest way to run the entire app stack, database, redis, and scheduler inside Docker without needing local node dependencies.

### 1. Build and Launch Containers
Run the following command at the root of the project to build and start the PostgreSQL database, Redis instance, next.js web server, and lifecycle worker:
```bash
docker compose up --build -d
```

### 2. Setup Database Tables (Non-interactive)
Once the containers are running and healthy, push the database schema and tables into the Dockerized PostgreSQL database:
```bash
docker compose exec web npx prisma db push
```

### 3. Seed Admin Credentials
Seed the database with the initial administrator account:
```bash
docker compose exec web npm run prisma:seed
```

### 4. Stop the Environment
To shut down all containers and clean up volumes:
```bash
docker compose down -v
```

---

## Option 2: Running Services Locally (on Host Machine)

Use this option if you want to run the web server and background worker directly on your host machine (highly recommended for live debugging or hot-reloading).

### 1. Start Database & Cache Infrastructures (Docker)
Start only the PostgreSQL database and Redis services in the background:
```bash
docker compose up -d postgres redis
```

### 2. Install Dependencies
Install all workspace node packages from the root of the repository:
```bash
npm install
```

### 3. Setup database
Push the prisma schema and run the seed script to populate the initial admin:
```bash
npm run db:migrate
npm run db:seed
```

### 4. Start the Applications
Open two separate terminals to run the web server and background worker processes:

*   **Terminal 1 (Web Application):**
    ```bash
    npm run dev:web
    ```
    *The site will be hosted at [http://localhost:3000](http://localhost:3000).*

*   **Terminal 2 (Lifecycle Worker Process):**
    ```bash
    npm run dev:worker
    ```

---

## Running Integration Tests

To run the automated Vitest integration suite (which verifies the serializable transaction lock against concurrent bid races):

1.  Make sure the PostgreSQL database container is up (`docker compose up -d postgres`).
2.  Run the tests:
    ```bash
    npm run test
    ```

---

## Simulating a Multi-User Bidding War

To experience the real-time WebSocket broadcast and dynamic countdown behaviors of the app locally:

### 1. Access the Admin Dashboard
1.  Navigate to [http://localhost:3000/login](http://localhost:3000/login) in your standard browser.
2.  Login using the seeded administrator credentials:
    *   **Email:** `admin@bikeauction.dev`
    *   **Password:** `password123`
3.  Go to [http://localhost:3000/admin](http://localhost:3000/admin).
4.  **Add a Motorcycle:** Input the make, model, year, mileage, and a demo image URL.
5.  **Schedule an Auction:** Select your new bike, choose an auction title/description, and input times:
    *   *Registration Start:* Set to current system time.
    *   *Registration End:* Set to 1 minute in the future.
    *   *Auction Start:* Set to 1 minute in the future.
    *   *Auction End:* Set to 5 minutes in the future.
    *   *Starting Bid:* Set to e.g. `50000`.
6.  Click **Create Auction**.

### 2. Simulate Bidders
1.  Open an **Incognito / Private Window** in your browser.
2.  Go to [http://localhost:3000/register](http://localhost:3000/register) and create a buyer account.
3.  Open a **Different Browser** (e.g., Firefox, Edge, Safari) and register another buyer account.
4.  Navigate both windows to the newly created auction detail page.
5.  **Register:** Both users will see the status set to **Registration Open**. Click **Register for Auction** on both browsers.
6.  **Bidding transitions live:** Once the registration window ends, the Bid Panel will automatically transition to **Live Bidding** on all screens simultaneously without requiring a page refresh.
7.  **Bid war:** Place bids in one window and watch the current highest bid update instantly on the other window via real-time WebSocket fan-out.
