import { Queue } from "bullmq";

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
 * Enqueues the dynamic lifecycle events for an auction (registration start, registration end, auction start, auction end).
 * Prior to scheduling, any outdated jobs for this auction are removed.
 */
export async function scheduleAuctionLifecycle(auction: {
  id: string;
  regStartTime: Date;
  regEndTime: Date;
  startTime: Date;
  endTime: Date;
}) {
  const now = Date.now();

  // Clear existing jobs to ensure reschedule works correctly
  const jobIds = [`regstart-${auction.id}`, `regend-${auction.id}`, `open-${auction.id}`, `close-${auction.id}`];
  for (const jobId of jobIds) {
    try {
      const job = await auctionQueue.getJob(jobId);
      if (job) {
        await job.remove();
      }
    } catch {
      // Ignore cleanup error if job doesn't exist
    }
  }

  // Schedule transition events
  await auctionQueue.add(
    "reg-start",
    { auctionId: auction.id },
    { delay: Math.max(0, new Date(auction.regStartTime).getTime() - now), jobId: `regstart-${auction.id}` }
  );

  await auctionQueue.add(
    "reg-end",
    { auctionId: auction.id },
    { delay: Math.max(0, new Date(auction.regEndTime).getTime() - now), jobId: `regend-${auction.id}` }
  );

  await auctionQueue.add(
    "open-auction",
    { auctionId: auction.id },
    { delay: Math.max(0, new Date(auction.startTime).getTime() - now), jobId: `open-${auction.id}` }
  );

  await auctionQueue.add(
    "close-auction",
    { auctionId: auction.id },
    { delay: Math.max(0, new Date(auction.endTime).getTime() - now), jobId: `close-${auction.id}` }
  );
}
