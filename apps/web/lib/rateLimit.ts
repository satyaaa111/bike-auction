import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

/**
 * Fixed-window counter — simple, sufficient for this timebox. A real
 * production system would likely use a sliding-window or token-bucket
 * algorithm to avoid burst-at-window-boundary edge cases; noted here
 * rather than silently accepted as equivalent.
 */
export async function checkRateLimit(
  key: string,
  { max, windowSeconds }: { max: number; windowSeconds: number }
): Promise<boolean> {
  const redisKey = `ratelimit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  return count <= max;
}
