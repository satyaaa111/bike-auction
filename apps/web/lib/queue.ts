import { Queue } from "bullmq";

// Singleton pattern, same rationale as lib/prisma.ts — without this, every
// request handler that enqueues a job would open a fresh Redis connection
// and never close it, leaking connections under load.
const globalForQueue = globalThis as unknown as {
  auctionQueueConnection?: { url: string };
  auctionQueue?: Queue;
};

const connection =
  globalForQueue.auctionQueueConnection ?? {
    url: process.env.REDIS_URL!,
  };
export const auctionQueue =
  globalForQueue.auctionQueue ?? new Queue("auction-lifecycle", { connection });

if (process.env.NODE_ENV !== "production") {
  globalForQueue.auctionQueueConnection = connection;
  globalForQueue.auctionQueue = auctionQueue;
}

/**
 * Enqueues the open/close jobs for a newly-scheduled auction. The web app
 * only needs to know the queue name and job shape — the worker (which owns
 * the actual job processor) is intentionally decoupled from this app; see
 * apps/worker/src/index.ts for the consumer side of this same queue.
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
