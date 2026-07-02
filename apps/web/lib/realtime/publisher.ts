import { Redis } from "ioredis";
import type { Bid } from "@prisma/client";

const redis = new Redis(process.env.REDIS_URL!);

/**
 * Publishes a bid event AFTER the DB transaction has committed. The socket
 * server (see server.ts) subscribes to this same channel and fans the event
 * out to every client in the `auction:{id}` room.
 *
 * Using Redis pub/sub here (rather than calling the socket server's emit
 * directly, in-process) is what makes the "split socket server into its own
 * process later" migration (ARCHITECTURE.md §6) a config change rather than
 * a rewrite — the publish side doesn't change at all when the subscriber
 * moves to a different process.
 */
export async function publishBidEvent(payload: {
  auctionId: string;
  bid: Bid;
  correlationId: string;
}) {
  const channel = `auction:${payload.auctionId}`;
  await redis.publish(
    channel,
    JSON.stringify({
      type: "BID_PLACED",
      auctionId: payload.auctionId,
      bid: {
        id: payload.bid.id,
        userId: payload.bid.userId,
        amountPaise: payload.bid.amountPaise.toString(),
        createdAt: payload.bid.createdAt,
      },
      correlationId: payload.correlationId,
    })
  );
}

export async function publishAuctionStatusEvent(payload: {
  auctionId: string;
  status: string;
  correlationId: string;
}) {
  await redis.publish(
    `auction:${payload.auctionId}`,
    JSON.stringify({ type: "STATUS_CHANGED", ...payload })
  );
}
