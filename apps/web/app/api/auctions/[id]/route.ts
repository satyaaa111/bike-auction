import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withCorrelation } from "@/lib/logger";
import { randomUUID } from "crypto";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auction = await prisma.auction.findUnique({
    where: { id: params.id },
    include: {
      motorcycle: true,
      currentHighestBid: { select: { amountPaise: true, userId: true, createdAt: true } },
      bids: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { id: true, email: true } } },
      },
    },
  });

  if (!auction) {
    return NextResponse.json({ error: { code: "AUCTION_NOT_FOUND", message: "Auction not found." } }, { status: 404 });
  }

  return NextResponse.json({
    auction: {
      ...auction,
      startingBidPaise: auction.startingBidPaise.toString(),
      currentHighestBid: auction.currentHighestBid
        ? { ...auction.currentHighestBid, amountPaise: auction.currentHighestBid.amountPaise.toString() }
        : null,
      bids: auction.bids.map((b) => ({ ...b, amountPaise: b.amountPaise.toString() })),
    },
  });
}

// Admin-only cancellation. Only SCHEDULED or LIVE auctions can be cancelled —
// CLOSED is terminal (see ARCHITECTURE.md §4 status-transition invariant).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const correlationId = randomUUID();
  const log = withCorrelation(correlationId);

  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Admin access required." } }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (body?.action !== "CANCEL") {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Only { action: 'CANCEL' } is supported." } },
      { status: 400 }
    );
  }

  const result = await prisma.auction.updateMany({
    where: { id: params.id, status: { in: ["SCHEDULED", "LIVE"] } },
    data: { status: "CANCELLED" },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: { code: "INVALID_TRANSITION", message: "Auction cannot be cancelled from its current status." } },
      { status: 409 }
    );
  }

  await prisma.auditLog.create({
    data: { actorId: session.user.id, action: "AUCTION_CANCELLED", entityType: "Auction", entityId: params.id },
  });

  log.info({ auctionId: params.id }, "auction cancelled");
  return NextResponse.json({ status: "CANCELLED" });
}
