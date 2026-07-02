import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { placeBid, BidError } from "../lib/placeBid";
import { seedLiveAuctionWithTwoBidders, cleanupTestData } from "./testUtils";

// Runs against a real Postgres instance (docker-compose test DB), not mocks.
// Mocking Prisma here would hide exactly the bug this test exists to catch —
// a race condition that only manifests against real transactional behavior.
const prisma = new PrismaClient();

afterAll(async () => {
  await cleanupTestData(prisma);
  await prisma.$disconnect();
});

describe("placeBid — concurrency", () => {
  let auctionId: string;
  let userA: string;
  let userB: string;

  beforeEach(async () => {
    // seed a fresh LIVE auction with two bidders — see test helpers for
    // full seeding logic (elided in this demo file)
    ({ auctionId, userA, userB } = await seedLiveAuctionWithTwoBidders(prisma));
  });

  it("only allows one of two simultaneous equal bids to win, other gets a clean conflict", async () => {
    const bidAmount = 100_000n; // both bidders try to bid the same amount at once

    const [resultA, resultB] = await Promise.allSettled([
      placeBid(prisma, { auctionId, userId: userA, amountPaise: bidAmount, correlationId: "test-a" }),
      placeBid(prisma, { auctionId, userId: userB, amountPaise: bidAmount, correlationId: "test-b" }),
    ]);

    const outcomes = [resultA, resultB];
    const fulfilled = outcomes.filter((r) => r.status === "fulfilled");
    const rejected = outcomes.filter((r) => r.status === "rejected");

    // Exactly one must win. If both won, the row lock isn't working. If
    // both were rejected, the happy path is broken.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectedReason).toBeInstanceOf(BidError);
    // The loser should fail because their bid is no longer high enough
    // relative to the winner's now-committed bid — not some generic error.
    expect(["BID_TOO_LOW", "ALREADY_HIGHEST_BIDDER"]).toContain(rejectedReason.code);

    const auction = await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });
    const winningBid = await prisma.bid.findUniqueOrThrow({
      where: { id: auction.currentHighestBidId! },
    });
    expect(winningBid.amountPaise).toBe(bidAmount);

    // Exactly one Bid row should exist for this contested amount — proves
    // we didn't accept both writes.
    const bidsAtAmount = await prisma.bid.count({ where: { auctionId, amountPaise: bidAmount } });
    expect(bidsAtAmount).toBe(1);
  });

  it("rejects a bid below the current highest even when submitted a moment later", async () => {
    await placeBid(prisma, { auctionId, userId: userA, amountPaise: 100_000n, correlationId: "t1" });

    await expect(
      placeBid(prisma, { auctionId, userId: userB, amountPaise: 100_100n, correlationId: "t2" })
    ).rejects.toMatchObject({ code: "BID_TOO_LOW" }); // below min increment of ₹500
  });
});

