import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BidPanel } from "@/components/BidPanel";

export const dynamic = "force-dynamic";

async function getAuction(id: string) {
  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      motorcycle: true,
      currentHighestBid: true,
      bids: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!auction) return null;

  return {
    ...auction,
    startingBidPaise: auction.startingBidPaise.toString(),
    endTime: auction.endTime.toISOString(),
    startTime: auction.startTime.toISOString(),
    currentHighestBid: auction.currentHighestBid
      ? { ...auction.currentHighestBid, amountPaise: auction.currentHighestBid.amountPaise.toString(), createdAt: auction.currentHighestBid.createdAt.toISOString() }
      : null,
    bids: auction.bids.map((b) => ({ ...b, amountPaise: b.amountPaise.toString(), createdAt: b.createdAt.toISOString() })),
  };
}

export default async function AuctionDetailPage({ params }: { params: { id: string } }) {
  const auction = await getAuction(params.id);
  if (!auction) notFound();

  const { motorcycle } = auction;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
      <div className="lg:col-span-3 space-y-4">
        <div className="aspect-[4/3] bg-surfaceRaised rounded-lg overflow-hidden border border-border">
          {motorcycle.imageUrls[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={motorcycle.imageUrls[0]}
              alt={`${motorcycle.make} ${motorcycle.model}`}
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <div>
          <h1 className="font-display text-3xl text-bone uppercase tracking-wide2">
            {motorcycle.make} {motorcycle.model}
          </h1>
          <p className="text-muted mt-1">
            {motorcycle.year} · {motorcycle.mileageKm.toLocaleString("en-IN")} km · {motorcycle.condition}
          </p>
        </div>
      </div>

      <div className="lg:col-span-2">
        <BidPanel
          auctionId={auction.id}
          status={auction.status}
          endTime={auction.endTime}
          startingBidPaise={auction.startingBidPaise}
          initialHighestBid={auction.currentHighestBid as any}
          recentBids={auction.bids as any}
        />
      </div>
    </div>
  );
}
