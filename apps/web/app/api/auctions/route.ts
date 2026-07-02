import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuctionSchema } from "@/lib/validation";
import { scheduleAuctionLifecycle } from "@/lib/queue";
import { withCorrelation } from "@/lib/logger";
import { randomUUID } from "crypto";
import type { AuctionStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const take = 20;

  // Fetch all non-cancelled auctions so computed status can determine their state dynamically
  const auctions = await prisma.auction.findMany({
    where: { status: { not: "CANCELLED" } },
    include: {
      motorcycle: true,
      currentHighestBid: { select: { amountPaise: true, userId: true, createdAt: true } },
    },
    orderBy: { startTime: "asc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = auctions.length > take;
  const page = hasMore ? auctions.slice(0, take) : auctions;

  return NextResponse.json({
    auctions: page.map(serializeAuction),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}

export async function POST(req: NextRequest) {
  const correlationId = randomUUID();
  const log = withCorrelation(correlationId);

  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Admin access required." } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = AuctionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid auction data.", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const existingForMotorcycle = await prisma.auction.findUnique({
    where: { motorcycleId: parsed.data.motorcycleId },
  });
  if (existingForMotorcycle) {
    return NextResponse.json(
      { error: { code: "AUCTION_EXISTS", message: "This motorcycle already has an auction." } },
      { status: 409 }
    );
  }

  const auction = await prisma.auction.create({
    data: {
      motorcycleId: parsed.data.motorcycleId,
      title: parsed.data.title,
      description: parsed.data.description,
      regStartTime: parsed.data.regStartTime,
      regEndTime: parsed.data.regEndTime,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      startingBidPaise: parsed.data.startingBidPaise,
      reservePricePaise: parsed.data.reservePricePaise,
      status: "SCHEDULED",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "AUCTION_SCHEDULED",
      entityType: "Auction",
      entityId: auction.id,
    },
  });

  // Enqueue lifecycle jobs
  await scheduleAuctionLifecycle(auction);

  log.info({ auctionId: auction.id }, "auction scheduled");
  return NextResponse.json(
    { auction: serializeAuction({ ...auction, motorcycle: undefined as any, currentHighestBid: null }) },
    { status: 201 }
  );
}

function serializeAuction(a: any) {
  return {
    ...a,
    startingBidPaise: a.startingBidPaise.toString(),
    reservePricePaise: a.reservePricePaise ? a.reservePricePaise.toString() : null,
    regStartTime: a.regStartTime ? a.regStartTime.toISOString() : null,
    regEndTime: a.regEndTime ? a.regEndTime.toISOString() : null,
    startTime: a.startTime.toISOString(),
    endTime: a.endTime.toISOString(),
    currentHighestBid: a.currentHighestBid
      ? { ...a.currentHighestBid, amountPaise: a.currentHighestBid.amountPaise.toString() }
      : null,
  };
}
