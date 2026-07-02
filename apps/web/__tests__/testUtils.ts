import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

/**
 * Creates a fresh LIVE auction with two bidders, isolated by random emails
 * so parallel test runs (vitest runs test files concurrently by default)
 * never collide on unique constraints.
 */
export async function seedLiveAuctionWithTwoBidders(prisma: PrismaClient) {
  const suffix = randomUUID().slice(0, 8);

  const admin = await prisma.user.create({
    data: { email: `admin-${suffix}@test.dev`, passwordHash: "x", role: "ADMIN" },
  });
  const userA = await prisma.user.create({
    data: { email: `buyer-a-${suffix}@test.dev`, passwordHash: "x", role: "BUYER" },
  });
  const userB = await prisma.user.create({
    data: { email: `buyer-b-${suffix}@test.dev`, passwordHash: "x", role: "BUYER" },
  });

  const motorcycle = await prisma.motorcycle.create({
    data: {
      make: "Test",
      model: `Bike-${suffix}`,
      year: 2020,
      mileageKm: 1000,
      condition: "GOOD",
      imageUrls: ["https://example.com/x.jpg"],
      createdByAdminId: admin.id,
    },
  });

  const auction = await prisma.auction.create({
    data: {
      motorcycleId: motorcycle.id,
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date(Date.now() + 60 * 60_000),
      startingBidPaise: 50_000n,
      status: "LIVE",
    },
  });

  return { auctionId: auction.id, userA: userA.id, userB: userB.id };
}

export async function cleanupTestData(prisma: PrismaClient) {
  // FK-order-safe teardown for isolated test rows only (email pattern
  // scopes this to data created by seedLiveAuctionWithTwoBidders).
  await prisma.auditLog.deleteMany({ where: { actor: { email: { contains: "@test.dev" } } } });
  await prisma.bid.deleteMany({ where: { user: { email: { contains: "@test.dev" } } } });
  await prisma.auction.deleteMany({ where: { motorcycle: { model: { startsWith: "Bike-" } } } });
  await prisma.motorcycle.deleteMany({ where: { model: { startsWith: "Bike-" } } });
  await prisma.user.deleteMany({ where: { email: { contains: "@test.dev" } } });
}
