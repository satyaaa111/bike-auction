/**
 * Auction lifecycle worker.
 *
 * Why this is its own process (see ARCHITECTURE.md §3): opening and closing
 * an auction must happen at an exact scheduled time regardless of whether
 * any HTTP request touches that auction around that moment. A request/response
 * server can't guarantee that on its own — this process's only job is to
 * guarantee it, and it survives restarts because the jobs are persisted in
 * Redis (BullMQ), not in this process's memory.
 */
import { Worker, Queue } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { logger } from "./logger";
import { publishAuctionStatusEvent } from "./publish";

const connection = { url: process.env.REDIS_URL! };
const prisma = new PrismaClient();

export const auctionQueue = new Queue("auction-lifecycle", { connection });

/**
 * Call this when an admin creates/schedules an auction (from the web app's
 * POST /api/v1/auctions handler). Enqueues both transitions up front so
 * they're durable immediately, not dependent on this worker having been
 * running at creation time.
 */
export async function scheduleAuctionLifecycle(auction: {
  id: string;
  startTime: Date;
  endTime: Date;
}) {
  const now = Date.now();
  await auctionQueue.add(
    "open-auction",
    { auctionId: auction.id },
    { delay: Math.max(0, auction.startTime.getTime() - now), jobId: `open-${auction.id}` }
  );
  await auctionQueue.add(
    "close-auction",
    { auctionId: auction.id },
    { delay: Math.max(0, auction.endTime.getTime() - now), jobId: `close-${auction.id}` }
  );
}

new Worker(
  "auction-lifecycle",
  async (job) => {
    const { auctionId } = job.data as { auctionId: string };

    if (job.name === "open-auction") {
      await prisma.auction.updateMany({
        where: { id: auctionId, status: "SCHEDULED" }, // guards against double-processing
        data: { status: "LIVE" },
      });
      await publishAuctionStatusEvent({ auctionId, status: "LIVE", correlationId: job.id! });
      logger.info({ auctionId }, "auction opened");
      return;
    }

    if (job.name === "close-auction") {
      // Row lock here too — a bid could theoretically be mid-transaction
      // in placeBid() at the exact close instant. Locking the same row
      // this worker and placeBid() both touch is what makes "did this bid
      // land before or after close" unambiguous rather than a race.
      await prisma.$transaction(async (tx : any) => {
        const [auction] = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT id, status FROM "Auction" WHERE id = ${auctionId} FOR UPDATE
        `;
        if (!auction || auction.status !== "LIVE") return; // already closed/cancelled

        await tx.auction.update({ where: { id: auctionId }, data: { status: "CLOSED" } });
        await tx.auditLog.create({
          data: { action: "AUCTION_CLOSED", entityType: "Auction", entityId: auctionId },
        });
      });
      await publishAuctionStatusEvent({ auctionId, status: "CLOSED", correlationId: job.id! });
      logger.info({ auctionId }, "auction closed");
      return;
    }
  },
  { connection }
);

logger.info("auction lifecycle worker started");
