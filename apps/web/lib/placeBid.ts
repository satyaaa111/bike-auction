import { PrismaClient, AuctionStatus } from "@prisma/client";
import { logger } from "./logger";
import { publishBidEvent } from "./realtime/publisher";

const MIN_INCREMENT_PAISE = 50000n; // ₹500, see ASSUMPTIONS.md — fixed increment for v1

export class BidError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/**
 * Places a bid inside a single serialized transaction.
 *
 * Concurrency strategy (see ARCHITECTURE.md §6):
 *   `SELECT ... FOR UPDATE` locks the auction row for the duration of this
 *   transaction. Two simultaneous callers for the SAME auction are
 *   serialized here — the second caller's SELECT blocks until the first
 *   caller's transaction commits or rolls back, then re-reads the now
 *   up-to-date highest bid. Callers bidding on DIFFERENT auctions are not
 *   blocked by each other — the lock is per-row, not global.
 *
 * This function is deliberately the single write path for bids — the
 * socket layer never writes bids directly, it only broadcasts what this
 * function publishes after a successful commit. That keeps this function
 * fully testable with plain integration tests (see __tests__/placeBid.test.ts)
 * independent of any socket infrastructure.
 */
export async function placeBid(
  prisma: PrismaClient,
  params: { auctionId: string; userId: string; amountPaise: bigint; correlationId: string }
) {
  const { auctionId, userId, amountPaise, correlationId } = params;

  const result = await prisma.$transaction(async (tx) => {
    // Row-level lock: blocks any other concurrent bid transaction on this
    // specific auction until this one finishes. This is the linchpin of
    // the whole concurrency story — everything else in this function
    // assumes the row is exclusively ours until commit.
    const [auction] = await tx.$queryRaw<
      Array<{
        id: string;
        status: AuctionStatus;
        endTime: Date;
        startingBidPaise: bigint;
        currentHighestBidId: string | null;
      }>
    >`
      SELECT id, status, "endTime", "startingBidPaise", "currentHighestBidId"
      FROM "Auction"
      WHERE id = ${auctionId}
      FOR UPDATE
    `;

    if (!auction) {
      throw new BidError("AUCTION_NOT_FOUND", "Auction does not exist.");
    }
    if (auction.status !== "LIVE") {
      throw new BidError("AUCTION_NOT_LIVE", `Auction is ${auction.status}, not accepting bids.`);
    }
    if (new Date() >= auction.endTime) {
      throw new BidError("AUCTION_ENDED", "Auction end time has passed.");
    }

    // Re-read the current highest bid INSIDE the lock — this is the value
    // that must be re-validated against, never a value read before the lock
    // was acquired.
    let currentHighestPaise = auction.startingBidPaise;
    if (auction.currentHighestBidId) {
      const currentHighestBid = await tx.bid.findUniqueOrThrow({
        where: { id: auction.currentHighestBidId },
      });
      currentHighestPaise = currentHighestBid.amountPaise;

      if (currentHighestBid.userId === userId) {
        throw new BidError("ALREADY_HIGHEST_BIDDER", "You already hold the highest bid.");
      }
    }

    if (amountPaise < currentHighestPaise + MIN_INCREMENT_PAISE) {
      throw new BidError(
        "BID_TOO_LOW",
        `Bid must be at least ${(currentHighestPaise + MIN_INCREMENT_PAISE).toString()} paise.`
      );
    }

    const bid = await tx.bid.create({
      data: { auctionId, userId, amountPaise },
    });

    await tx.auction.update({
      where: { id: auctionId },
      data: {
        currentHighestBidId: bid.id,
        version: { increment: 1 },
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "BID_PLACED",
        entityType: "Auction",
        entityId: auctionId,
        metadata: { bidId: bid.id, amountPaise: amountPaise.toString(), correlationId },
      },
    });

    return bid;
  }, { isolationLevel: "ReadCommitted" });
  // Note: ReadCommitted is sufficient here BECAUSE `FOR UPDATE` already
  // provides the serialization we need on the contended row. We don't need
  // full SERIALIZABLE isolation (which would add retry-on-conflict
  // overhead for no extra correctness benefit given the explicit lock).

  logger.info({ correlationId, auctionId, bidId: result.id, userId }, "bid placed");

  // Broadcast AFTER commit only — never publish speculative state.
  await publishBidEvent({ auctionId, bid: result, correlationId });

  return result;
}
