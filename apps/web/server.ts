/**
 * Custom Next.js server with Socket.io attached to the same HTTP server.
 *
 * See ARCHITECTURE.md §3 and §6 for why this lives in-process for now
 * (timebox) and how it migrates to a separate service later: swap this
 * file's socket setup into its own small Node service that does nothing
 * but (a) authenticate the socket handshake and (b) subscribe to the same
 * Redis channels — no change needed on the publish side in lib/realtime.
 */
import { createServer } from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { Redis } from "ioredis";
import { logger } from "./lib/logger";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const subscriber = new Redis(process.env.REDIS_URL!);

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new SocketIOServer(httpServer, {
    cors: { origin: process.env.NEXTAUTH_URL, credentials: true },
  });

  io.on("connection", (socket) => {
    // Client joins the room for the specific auction it's viewing — this
    // is what keeps broadcasts scoped instead of fanning every bid to
    // every connected client.
    socket.on("join-auction", (auctionId: string) => {
      socket.join(`auction:${auctionId}`);
      logger.debug({ socketId: socket.id, auctionId }, "socket joined auction room");
    });

    socket.on("leave-auction", (auctionId: string) => {
      socket.leave(`auction:${auctionId}`);
    });

    socket.on("disconnect", () => {
      logger.debug({ socketId: socket.id }, "socket disconnected");
    });
  });

  // Single Redis subscriber, pattern-subscribed to all auction channels.
  // This is the piece that already anticipates multi-instance scaling:
  // when this server is split out and horizontally scaled, each instance
  // runs this same subscriber and only needs to emit to ITS OWN locally
  // connected sockets in the room — Socket.io's Redis adapter formalizes
  // this pattern; wiring it in is the concrete next step, not a redesign.
  subscriber.psubscribe("auction:*");
  subscriber.on("pmessage", (_pattern, channel, message) => {
    const auctionId = channel.split(":")[1];
    io.to(`auction:${auctionId}`).emit("auction-event", JSON.parse(message));
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  httpServer.listen(port, () => {
    logger.info({ port }, "server started");
  });
});
