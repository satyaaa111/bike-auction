import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuctionSchema } from "@/lib/validation";
import { scheduleAuctionLifecycle } from "@/lib/queue";
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
    auction: serializeAuction(auction),
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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

  const existing = await prisma.auction.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: { code: "AUCTION_NOT_FOUND", message: "Auction not found." } }, { status: 404 });
  }

  // Update the auction
  const updatedAuction = await prisma.auction.update({
    where: { id: params.id },
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
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "AUCTION_UPDATED",
      entityType: "Auction",
      entityId: params.id,
    },
  });

  // Re-enqueue lifecycle jobs with new times
  await scheduleAuctionLifecycle(updatedAuction);

  log.info({ auctionId: params.id }, "auction updated");
  return NextResponse.json({ auction: serializeAuction(updatedAuction) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const correlationId = randomUUID();
  const log = withCorrelation(correlationId);

  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Admin access required." } }, { status: 403 });
  }

  const existing = await prisma.auction.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: { code: "AUCTION_NOT_FOUND", message: "Auction not found." } }, { status: 404 });
  }

  // Delete the auction - cascade deletes will remove registrations and bids automatically
  await prisma.auction.delete({
    where: { id: params.id },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      action: "AUCTION_DELETED",
      entityType: "Auction",
      entityId: params.id,
    },
  });

  log.info({ auctionId: params.id }, "auction deleted");
  return NextResponse.json({ success: true });
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
    bids: a.bids ? a.bids.map((b: any) => ({ ...b, amountPaise: b.amountPaise.toString() })) : [],
  };
}
