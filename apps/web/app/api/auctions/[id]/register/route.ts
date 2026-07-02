import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withCorrelation } from "@/lib/logger";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const correlationId = req.headers.get("x-correlation-id") ?? randomUUID();
  const log = withCorrelation(correlationId);

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Login required." } }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id: params.id },
      });

      if (!auction) {
        throw new Error("AUCTION_NOT_FOUND");
      }

      if (auction.status === "CANCELLED" || auction.status === "CLOSED") {
        throw new Error("AUCTION_INACTIVE");
      }

      const now = new Date();
      if (now < auction.regStartTime) {
        throw new Error("REGISTRATION_NOT_OPEN");
      }
      if (now >= auction.regEndTime) {
        throw new Error("REGISTRATION_CLOSED");
      }

      // Check duplicate
      const existing = await tx.auctionRegistration.findUnique({
        where: {
          auctionId_userId: {
            auctionId: params.id,
            userId,
          },
        },
      });
      if (existing) {
        throw new Error("ALREADY_REGISTERED");
      }

      // Create registration
      const reg = await tx.auctionRegistration.create({
        data: {
          auctionId: params.id,
          userId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "AUCTION_REGISTERED",
          entityType: "Auction",
          entityId: params.id,
          metadata: { registrationId: reg.id },
        },
      });

      return reg;
    });

    log.info({ auctionId: params.id, userId }, "user registered for auction");
    return NextResponse.json({ success: true, registration: result }, { status: 201 });
  } catch (err: any) {
    if (err.message === "AUCTION_NOT_FOUND") {
      return NextResponse.json({ error: { code: "AUCTION_NOT_FOUND", message: "Auction not found." } }, { status: 404 });
    }
    if (err.message === "AUCTION_INACTIVE") {
      return NextResponse.json({ error: { code: "AUCTION_INACTIVE", message: "Auction is not active." } }, { status: 400 });
    }
    if (err.message === "REGISTRATION_NOT_OPEN") {
      return NextResponse.json({ error: { code: "REGISTRATION_NOT_OPEN", message: "Registration is not open yet." } }, { status: 400 });
    }
    if (err.message === "REGISTRATION_CLOSED") {
      return NextResponse.json({ error: { code: "REGISTRATION_CLOSED", message: "Registration has closed." } }, { status: 400 });
    }
    if (err.message === "ALREADY_REGISTERED") {
      return NextResponse.json({ error: { code: "ALREADY_REGISTERED", message: "You are already registered for this auction." } }, { status: 409 });
    }
    log.error({ err }, "unexpected error registering for auction");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }, { status: 500 });
  }
}
