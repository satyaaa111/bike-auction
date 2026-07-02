import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@bikeauction.dev" },
    update: {},
    create: { email: "admin@bikeauction.dev", passwordHash, role: "ADMIN" },
  });

  const buyerA = await prisma.user.upsert({
    where: { email: "buyer1@bikeauction.dev" },
    update: {},
    create: { email: "buyer1@bikeauction.dev", passwordHash, role: "BUYER" },
  });

  const buyerB = await prisma.user.upsert({
    where: { email: "buyer2@bikeauction.dev" },
    update: {},
    create: { email: "buyer2@bikeauction.dev", passwordHash, role: "BUYER" },
  });

  const royalEnfield = await prisma.motorcycle.create({
    data: {
      make: "Royal Enfield",
      model: "Classic 350",
      year: 2021,
      mileageKm: 12500,
      condition: "GOOD",
      imageUrls: ["https://images.unsplash.com/photo-1558981806-ec527fa84c39"],
      createdByAdminId: admin.id,
    },
  });

  const kawasaki = await prisma.motorcycle.create({
    data: {
      make: "Kawasaki",
      model: "Ninja 300",
      year: 2019,
      mileageKm: 24000,
      condition: "FAIR",
      imageUrls: ["https://images.unsplash.com/photo-1568772585407-9361f9bf3a87"],
      createdByAdminId: admin.id,
    },
  });

  const now = Date.now();

  // A LIVE auction, ending in 30 minutes — ready to demo bidding on immediately.
  const liveAuction = await prisma.auction.create({
    data: {
      motorcycleId: royalEnfield.id,
      startTime: new Date(now - 5 * 60 * 1000),
      endTime: new Date(now + 30 * 60 * 1000),
      startingBidPaise: 8_000_00n, // ₹8,000 in paise
      status: "LIVE",
    },
  });

  const firstBid = await prisma.bid.create({
    data: { auctionId: liveAuction.id, userId: buyerA.id, amountPaise: 8_500_00n },
  });
  await prisma.auction.update({
    where: { id: liveAuction.id },
    data: { currentHighestBidId: firstBid.id },
  });

  // A SCHEDULED auction, starting in 2 hours — demonstrates the lifecycle worker.
  await prisma.auction.create({
    data: {
      motorcycleId: kawasaki.id,
      startTime: new Date(now + 2 * 60 * 60 * 1000),
      endTime: new Date(now + 3 * 60 * 60 * 1000),
      startingBidPaise: 15_000_00n,
      status: "SCHEDULED",
    },
  });

  console.log("Seeded:");
  console.log("  admin:  admin@bikeauction.dev / password123");
  console.log("  buyer1: buyer1@bikeauction.dev / password123");
  console.log("  buyer2: buyer2@bikeauction.dev / password123");
  console.log(`  LIVE auction id: ${liveAuction.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
