"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAuctionSocket } from "@/lib/socket";
import { CountdownTimer } from "./CountdownTimer";

type Bid = { id: string; userId: string; amountPaise: string; createdAt: string };

const MIN_INCREMENT_PAISE = 50000; // ₹500 — kept in sync with lib/placeBid.ts MIN_INCREMENT_PAISE

function formatRupees(paise: number | string) {
  return (Number(paise) / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

export function BidPanel({
  auctionId,
  status,
  endTime,
  startingBidPaise,
  initialHighestBid,
  recentBids,
}: {
  auctionId: string;
  status: string;
  endTime: string;
  startingBidPaise: string;
  initialHighestBid: Bid | null;
  recentBids: Bid[];
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [highestBid, setHighestBid] = useState(initialHighestBid);
  const [bids, setBids] = useState(recentBids);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [auctionStatus, setAuctionStatus] = useState(status);

  const { connected } = useAuctionSocket(auctionId, (event) => {
    if (event.type === "BID_PLACED") {
      setHighestBid(event.bid);
      setBids((prev) => [event.bid, ...prev].slice(0, 20));
    }
    if (event.type === "STATUS_CHANGED") {
      setAuctionStatus(event.status);
    }
  });

  const currentPaise = highestBid ? Number(highestBid.amountPaise) : Number(startingBidPaise);
  const minNextBid = currentPaise + MIN_INCREMENT_PAISE;

  async function submitBid(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!session) {
      router.push("/login");
      return;
    }

    const amountPaise = Math.round(Number(amount) * 100);
    if (!amountPaise || amountPaise < minNextBid) {
      setError(`Bid must be at least ${formatRupees(minNextBid)}.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/auctions/${auctionId}/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaise: amountPaise.toString() }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Server is the source of truth — reconcile our local view with
        // whatever it says actually happened, rather than trusting our
        // optimistic guess.
        setError(data.error?.message ?? "Bid could not be placed.");
        return;
      }
      setAmount("");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const isLive = auctionStatus === "LIVE";

  return (
    <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted uppercase tracking-wide2">
            {highestBid ? "Current highest bid" : "Starting bid"}
          </div>
          <div className="font-mono text-brassLight text-3xl tabular-nums">{formatRupees(currentPaise)}</div>
        </div>
        {isLive && <CountdownTimer endTime={endTime} />}
      </div>

      {!isLive && (
        <p className="text-sm text-muted font-body">
          This auction is {auctionStatus.toLowerCase()} and no longer accepting bids.
        </p>
      )}

      {isLive && (
        <form onSubmit={submitBid} className="space-y-2">
          <label htmlFor="bid-amount" className="text-xs text-muted uppercase tracking-wide2 block">
            Your bid (min {formatRupees(minNextBid)})
          </label>
          <div className="flex gap-2">
            <input
              id="bid-amount"
              type="number"
              inputMode="decimal"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(minNextBid / 100)}
              className="flex-1 bg-charcoal border border-border rounded px-3 py-2 font-mono text-bone focus:outline-none focus:ring-2 focus:ring-brass"
            />
            <button
              type="submit"
              disabled={submitting}
              className="bg-brass hover:bg-brassLight disabled:opacity-50 text-charcoal font-body font-medium px-5 py-2 rounded transition-colors"
            >
              {submitting ? "Placing…" : "Place bid"}
            </button>
          </div>
          {error && <p className="text-live text-sm">{error}</p>}
          {!connected && <p className="text-muted text-xs">Reconnecting to live updates…</p>}
        </form>
      )}

      <div>
        <div className="text-xs text-muted uppercase tracking-wide2 mb-2">Recent bids</div>
        <ul className="space-y-1 max-h-48 overflow-y-auto font-mono text-sm">
          {bids.length === 0 && <li className="text-muted">No bids yet — be the first.</li>}
          {bids.map((b) => (
            <li key={b.id} className="flex justify-between text-bone/90 tabular-nums">
              <span>{formatRupees(b.amountPaise)}</span>
              <span className="text-muted">{new Date(b.createdAt).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
