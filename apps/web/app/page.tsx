import { prisma } from "@/lib/prisma";
import { AuctionCard } from "@/components/AuctionCard";
import { Key } from "react";

export const dynamic = "force-dynamic";

async function getAuctions() {
  const auctions = await prisma.auction.findMany({
    where: { status: { not: "CANCELLED" } },
    include: { motorcycle: true, currentHighestBid: { select: { amountPaise: true } } },
    orderBy: [{ startTime: "asc" }],
  });
  return auctions.map((a: any) => ({
    ...a,
    startingBidPaise: a.startingBidPaise.toString(),
    reservePricePaise: a.reservePricePaise ? a.reservePricePaise.toString() : null,
    regStartTime: a.regStartTime ? a.regStartTime.toISOString() : null,
    regEndTime: a.regEndTime ? a.regEndTime.toISOString() : null,
    startTime: a.startTime.toISOString(),
    endTime: a.endTime.toISOString(),
    currentHighestBid: a.currentHighestBid ? { amountPaise: a.currentHighestBid.amountPaise.toString() } : null,
  }));
}

export default async function HomePage() {
  const auctions = await getAuctions();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-wide2 text-bone">Current lots</h1>
        <p className="text-muted mt-1">Live and upcoming motorcycle auctions.</p>
      </div>

      {auctions.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-12 text-center text-muted">
          No auctions running right now — check back soon.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {auctions.map((auction: any) => (
            <AuctionCard key={auction.id} auction={auction} />
          ))}
        </div>
      )}
    </div>
  );
}
