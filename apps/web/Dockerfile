FROM node:20-bookworm-slim AS base
RUN apt-get update && \
    apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm install --workspace=apps/web

COPY apps/web ./apps/web
WORKDIR /app/apps/web

RUN npx prisma generate
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
