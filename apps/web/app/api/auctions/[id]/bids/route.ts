import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { placeBid, BidError } from "@/lib/placeBid";
import { checkRateLimit } from "@/lib/rateLimit";
import { withCorrelation } from "@/lib/logger";

const BidSchema = z.object({
  amountPaise: z.coerce.bigint().positive(),
});

const ERROR_STATUS: Record<string, number> = {
  AUCTION_NOT_FOUND: 404,
  AUCTION_NOT_LIVE: 409,
  AUCTION_ENDED: 409,
  ALREADY_HIGHEST_BIDDER: 409,
  BID_TOO_LOW: 409,
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const correlationId = req.headers.get("x-correlation-id") ?? randomUUID();
  const log = withCorrelation(correlationId);

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Login required." } }, { status: 401 });
  }

  // Bidding is the single most abuse-prone endpoint in this system —
  // rate limit before touching the DB at all.
  const allowed = await checkRateLimit(`bid:${session.user.id}`, { max: 10, windowSeconds: 10 });
  if (!allowed) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many bids, slow down." } }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BidSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid bid payload.", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  try {
    const bid = await placeBid(prisma, {
      auctionId: params.id,
      userId: session.user.id,
      amountPaise: parsed.data.amountPaise,
      correlationId,
    });
    return NextResponse.json({ bid: { ...bid, amountPaise: bid.amountPaise.toString() } }, { status: 201 });
  } catch (err) {
    if (err instanceof BidError) {
      log.warn({ code: err.code }, "bid rejected");
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: ERROR_STATUS[err.code] ?? 400 }
      );
    }
    log.error({ err }, "unexpected error placing bid");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }, { status: 500 });
  }
}
