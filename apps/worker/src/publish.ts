import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

export async function publishAuctionStatusEvent(payload: {
  auctionId: string;
  status: string;
  correlationId: string;
}) {
  await redis.publish(`auction:${payload.auctionId}`, JSON.stringify({ type: "STATUS_CHANGED", ...payload }));
}
