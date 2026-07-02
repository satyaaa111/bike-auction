import Link from "next/link";
import { CountdownTimer } from "./CountdownTimer";

type AuctionCardProps = {
  id: string;
  status: "SCHEDULED" | "LIVE" | "CLOSED" | "CANCELLED";
  startTime: string;
  endTime: string;
  startingBidPaise: string;
  currentHighestBid: { amountPaise: string } | null;
  motorcycle: { make: string; model: string; year: number; imageUrls: string[] };
};

function formatRupees(paise: string) {
  return (Number(paise) / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  LIVE: "Live",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

export function AuctionCard({ auction }: { auction: AuctionCardProps }) {
  const price = auction.currentHighestBid?.amountPaise ?? auction.startingBidPaise;

  return (
    <Link
      href={`/auctions/${auction.id}`}
      className="group block bg-surface border border-border rounded-lg overflow-hidden hover:border-brass transition-colors"
    >
      <div className="aspect-[4/3] bg-surfaceRaised overflow-hidden">
        {auction.motorcycle.imageUrls[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={auction.motorcycle.imageUrls[0]}
            alt={`${auction.motorcycle.make} ${auction.motorcycle.model}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span
            className={`text-xs font-mono uppercase tracking-wide2 px-2 py-0.5 rounded ${
              auction.status === "LIVE" ? "bg-live/20 text-live" : "bg-surfaceRaised text-muted"
            }`}
          >
            {STATUS_LABEL[auction.status]}
          </span>
          <span className="text-xs text-muted font-mono">{auction.motorcycle.year}</span>
        </div>
        <h3 className="font-display text-lg text-bone">
          {auction.motorcycle.make} {auction.motorcycle.model}
        </h3>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs text-muted uppercase tracking-wide2">
              {auction.currentHighestBid ? "Current bid" : "Starting bid"}
            </div>
            <div className="font-mono text-brassLight text-xl tabular-nums">{formatRupees(price)}</div>
          </div>
          {auction.status === "LIVE" && <CountdownTimer endTime={auction.endTime} />}
        </div>
      </div>
    </Link>
  );
}
