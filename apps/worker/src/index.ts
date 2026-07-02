/**
 * Auction lifecycle worker.
 */
import { Worker, Queue } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { logger } from "./logger";
import { publishAuctionStatusEvent } from "./publish";

const connection = { url: process.env.REDIS_URL! };
const prisma = new PrismaClient();

export const auctionQueue = new Queue("auction-lifecycle", { connection });

new Worker(
  "auction-lifecycle",
  async (job) => {
    const { auctionId } = job.data as { auctionId: string };

    if (job.name === "reg-start") {
      await publishAuctionStatusEvent({ auctionId, status: "REGISTERING", correlationId: job.id! });
      logger.info({ auctionId }, "auction registration started");
      return;
    }

    if (job.name === "reg-end") {
      await publishAuctionStatusEvent({ auctionId, status: "REGISTRATION_CLOSED", correlationId: job.id! });
      logger.info({ auctionId }, "auction registration closed");
      return;
    }

    if (job.name === "open-auction") {
      await publishAuctionStatusEvent({ auctionId, status: "LIVE", correlationId: job.id! });
      logger.info({ auctionId }, "auction opened (bidding live)");
      return;
    }

    if (job.name === "close-auction") {
      // Row lock to prevent race conditions with late-arriving bids
      await prisma.$transaction(async (tx: any) => {
        const [auction] = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT id, status FROM "Auction" WHERE id = ${auctionId} FOR UPDATE
        `;
        if (!auction || auction.status === "CLOSED" || auction.status === "CANCELLED") return;

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
