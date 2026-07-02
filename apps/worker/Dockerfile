FROM node:20-bookworm-slim AS base

RUN apt-get update && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY apps/worker/package.json ./apps/worker/package.json
RUN npm install --workspace=apps/worker

COPY apps/worker ./apps/worker
# The worker shares the web app's Prisma schema (single source of truth for
# the data model) rather than duplicating it — see docs/ASSUMPTIONS.md for
# why this isn't a separate packages/db workspace given the timebox.
COPY apps/web/prisma ./apps/web/prisma

WORKDIR /app/apps/worker
RUN npx prisma generate --schema=../web/prisma/schema.prisma

RUN npm run build

CMD ["npm", "run", "start"]
