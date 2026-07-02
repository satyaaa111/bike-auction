"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getComputedStatus } from "@/lib/auctionStatus";

type AuctionCardProps = {
  id: string;
  status: "SCHEDULED" | "LIVE" | "CLOSED" | "CANCELLED";
  regStartTime: string;
  regEndTime: string;
  startTime: string;
  endTime: string;
  startingBidPaise: string;
  currentHighestBid: { amountPaise: string } | null;
  motorcycle: { make: string; model: string; year: number; imageUrls: string[] };
};

function formatRupees(paise: string) {
  return (Number(paise) / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

export function AuctionCard({ auction }: { auction: AuctionCardProps }) {
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState(() => getComputedStatus(auction));

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setStatus(getComputedStatus(auction));
    }, 1000);
    return () => clearInterval(interval);
  }, [auction]);

  const price = auction.currentHighestBid?.amountPaise ?? auction.startingBidPaise;

  const STATUS_LABEL: Record<string, string> = {
    UPCOMING: "Upcoming",
    REGISTERING: "Registration Open",
    REGISTRATION_CLOSED: "Registration Closed",
    LIVE: "Live",
    CLOSED: "Ended",
    CANCELLED: "Cancelled",
  };

  const currentStatus = mounted ? status : getComputedStatus(auction);

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
              currentStatus === "LIVE"
                ? "bg-live/20 text-live"
                : currentStatus === "REGISTERING"
                ? "bg-brass/20 text-brassLight"
                : "bg-surfaceRaised text-muted"
            }`}
          >
            {STATUS_LABEL[currentStatus]}
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
        </div>
      </div>
    </Link>
  );
}
