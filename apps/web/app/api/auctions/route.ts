import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuctionSchema } from "@/lib/validation";
import { scheduleAuctionLifecycle } from "@/lib/queue";
import { withCorrelation } from "@/lib/logger";
import { randomUUID } from "crypto";
import type { AuctionStatus } from "@prisma/client";

const STATUS_VALUES = ["SCHEDULED", "LIVE", "CLOSED", "CANCELLED"] as const;

export async function GET(req: NextRequest) {
  const statusParam = req.nextUrl.searchParams.get("status");
  const status = STATUS_VALUES.includes(statusParam as AuctionStatus)
    ? (statusParam as AuctionStatus)
    : undefined;

  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const take = 20;

  const auctions = await prisma.auction.findMany({
    where: status ? { status } : undefined,
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

  const auction = await prisma.auction.create({ data: parsed.data });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "AUCTION_SCHEDULED",
      entityType: "Auction",
      entityId: auction.id,
    },
  });

  // Enqueue lifecycle jobs on the shared queue — see lib/queue.ts. The
  // worker (apps/worker/src/index.ts) is the process that actually
  // processes these jobs; the web app only needs to know the queue name.
  await scheduleAuctionLifecycle(auction);

  log.info({ auctionId: auction.id }, "auction scheduled");
  return NextResponse.json({ auction: serializeAuction({ ...auction, motorcycle: undefined as any, currentHighestBid: null }) }, { status: 201 });
}

function serializeAuction(a: any) {
  return {
    ...a,
    startingBidPaise: a.startingBidPaise.toString(),
    currentHighestBid: a.currentHighestBid
      ? { ...a.currentHighestBid, amountPaise: a.currentHighestBid.amountPaise.toString() }
      : null,
  };
}
