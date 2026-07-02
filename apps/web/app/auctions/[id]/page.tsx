import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BidPanel } from "@/components/BidPanel";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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
    reservePricePaise: auction.reservePricePaise ? auction.reservePricePaise.toString() : null,
    regStartTime: auction.regStartTime.toISOString(),
    regEndTime: auction.regEndTime.toISOString(),
    endTime: auction.endTime.toISOString(),
    startTime: auction.startTime.toISOString(),
    currentHighestBid: auction.currentHighestBid
      ? {
          ...auction.currentHighestBid,
          amountPaise: auction.currentHighestBid.amountPaise.toString(),
          createdAt: auction.currentHighestBid.createdAt.toISOString(),
        }
      : null,
    bids: auction.bids.map((b) => ({
      ...b,
      amountPaise: b.amountPaise.toString(),
      createdAt: b.createdAt.toISOString(),
    })),
  };
}

export default async function AuctionDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const auction = await getAuction(params.id);
  if (!auction) notFound();

  // Check if logged-in user is registered
  const isRegistered = session?.user?.id
    ? (await prisma.auctionRegistration.findUnique({
        where: {
          auctionId_userId: {
            auctionId: params.id,
            userId: session.user.id,
          },
        },
      })) !== null
    : false;

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
          <div className="mt-4 p-4 rounded-lg bg-surfaceRaised border border-border text-sm text-bone/80 space-y-2">
            <div>
              <span className="text-muted font-mono uppercase text-xs block">Description</span>
              <p className="font-body text-bone">{auction.description}</p>
            </div>
            {auction.reservePricePaise && session?.user?.role === "ADMIN" && (
              <div className="pt-2 border-t border-border">
                <span className="text-muted font-mono uppercase text-xs block">Reserve Price (Admin Only)</span>
                <p className="font-mono text-brassLight">
                  {(Number(auction.reservePricePaise) / 100).toLocaleString("en-IN", {
                    style: "currency",
                    currency: "INR",
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-2">
        <BidPanel
          auctionId={auction.id}
          status={auction.status}
          regStartTime={auction.regStartTime}
          regEndTime={auction.regEndTime}
          startTime={auction.startTime}
          endTime={auction.endTime}
          startingBidPaise={auction.startingBidPaise}
          initialHighestBid={auction.currentHighestBid as any}
          recentBids={auction.bids as any}
          isRegisteredInitial={isRegistered}
        />
      </div>
    </div>
  );
}
