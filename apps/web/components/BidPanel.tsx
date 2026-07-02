"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAuctionSocket } from "@/lib/socket";
import { CountdownTimer } from "./CountdownTimer";
import { getComputedStatus } from "@/lib/auctionStatus";

type Bid = { id: string; userId: string; amountPaise: string; createdAt: string };

const MIN_INCREMENT_PAISE = 50000; // ₹500 - fixed increment

function formatRupees(paise: number | string) {
  return (Number(paise) / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export function BidPanel({
  auctionId,
  status: dbStatus,
  regStartTime,
  regEndTime,
  startTime,
  endTime,
  startingBidPaise,
  initialHighestBid,
  recentBids,
  isRegisteredInitial,
}: {
  auctionId: string;
  status: string;
  regStartTime: string;
  regEndTime: string;
  startTime: string;
  endTime: string;
  startingBidPaise: string;
  initialHighestBid: Bid | null;
  recentBids: Bid[];
  isRegisteredInitial: boolean;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [highestBid, setHighestBid] = useState(initialHighestBid);
  const [bids, setBids] = useState(recentBids);
  const [isRegistered, setIsRegistered] = useState(isRegisteredInitial);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [registering, setRegistering] = useState(false);

  // Notifications
  const [notification, setNotification] = useState<{ text: string; type: "success" | "info" | "error" | "warn" } | null>(null);

  // Time-based computed status
  const [computedStatus, setComputedStatus] = useState(() =>
    getComputedStatus({ status: dbStatus, regStartTime, regEndTime, startTime, endTime })
  );

  // Hook up timer to periodically re-evaluate status
  useEffect(() => {
    const interval = setInterval(() => {
      const nextStatus = getComputedStatus({ status: dbStatus, regStartTime, regEndTime, startTime, endTime });
      if (nextStatus !== computedStatus) {
        setComputedStatus(nextStatus);
        
        // Notify transitions
        if (nextStatus === "REGISTERING") {
          showNotification("Registration is now open!", "info");
        } else if (nextStatus === "REGISTRATION_CLOSED") {
          showNotification("Registration has closed.", "warn");
        } else if (nextStatus === "LIVE") {
          showNotification("Auction is live! Bidding has started.", "success");
        } else if (nextStatus === "CLOSED") {
          showNotification("Auction has ended.", "info");
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [computedStatus, dbStatus, regStartTime, regEndTime, startTime, endTime]);

  // Hook up Socket.io for live updates
  const { connected } = useAuctionSocket(auctionId, (event) => {
    if (event.type === "BID_PLACED") {
      const newBid = event.bid;

      // Detect if we were outbid
      const wasHighestBidder = highestBid?.userId === session?.user?.id;
      const isNewBidOurs = newBid.userId === session?.user?.id;

      if (wasHighestBidder && !isNewBidOurs) {
        showNotification("You have been outbid!", "warn");
      } else if (isNewBidOurs) {
        showNotification("Bid accepted! You are the highest bidder.", "success");
      }

      setHighestBid(newBid);
      setBids((prev) => [newBid, ...prev].slice(0, 20));
    }
    if (event.type === "STATUS_CHANGED") {
      // Allow websocket trigger to update status immediately
      const nextStatus = getComputedStatus({ status: event.status, regStartTime, regEndTime, startTime, endTime });
      setComputedStatus(nextStatus);
    }
  });

  function showNotification(text: string, type: "success" | "info" | "error" | "warn") {
    setNotification({ text, type });
    // Auto-dismiss after 6 seconds
    setTimeout(() => {
      setNotification((n) => (n?.text === text ? null : n));
    }, 6000);
  }

  const currentPaise = highestBid ? Number(highestBid.amountPaise) : Number(startingBidPaise);
  const minNextBid = currentPaise + MIN_INCREMENT_PAISE;

  async function handleRegister() {
    if (!session) {
      router.push("/login");
      return;
    }

    setRegistering(true);
    try {
      const res = await fetch(`/api/auctions/${auctionId}/register`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.error?.message ?? "Registration failed.", "error");
        return;
      }
      setIsRegistered(true);
      showNotification("Registration Successful!", "success");
    } catch {
      showNotification("Network error. Please try again.", "error");
    } finally {
      setRegistering(false);
    }
  }

  async function submitBid(e: React.FormEvent) {
    e.preventDefault();

    if (!session) {
      router.push("/login");
      return;
    }

    if (!isRegistered) {
      showNotification("Only registered users can bid.", "error");
      return;
    }

    const amountPaise = Math.round(Number(amount) * 100);
    if (!amountPaise || amountPaise < minNextBid) {
      showNotification(`Bid must be at least ${formatRupees(minNextBid)}.`, "error");
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
        showNotification(data.error?.message ?? "Bid could not be placed.", "error");
        return;
      }
      setAmount("");
    } catch {
      showNotification("Network error — please try again.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
      {/* Visual notifications */}
      {notification && (
        <div
          className={`p-3 rounded-lg border text-sm flex items-center justify-between transition-all animate-fade-in ${
            notification.type === "success"
              ? "bg-live/15 border-live/30 text-live"
              : notification.type === "warn"
              ? "bg-brass/15 border-brass/30 text-brassLight"
              : notification.type === "error"
              ? "bg-red-500/10 border-red-500/20 text-red-400"
              : "bg-surfaceRaised border-border text-bone"
          }`}
        >
          <span>{notification.text}</span>
          <button onClick={() => setNotification(null)} className="text-muted hover:text-bone text-xs font-mono ml-2">
            ×
          </button>
        </div>
      )}

      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted uppercase tracking-wide2">
            {highestBid ? "Current highest bid" : "Starting bid"}
          </div>
          <div className="font-mono text-brassLight text-3xl tabular-nums">{formatRupees(currentPaise)}</div>
        </div>

        {/* Timers based on status */}
        {computedStatus === "UPCOMING" && (
          <div className="text-right">
            <span className="text-xs text-muted uppercase tracking-wide2 block">Registration opens in</span>
            <CountdownTimer endTime={regStartTime} />
          </div>
        )}
        {computedStatus === "REGISTERING" && (
          <div className="text-right">
            <span className="text-xs text-brassLight uppercase tracking-wide2 block">Registration closes in</span>
            <CountdownTimer endTime={regEndTime} />
          </div>
        )}
        {computedStatus === "REGISTRATION_CLOSED" && (
          <div className="text-right">
            <span className="text-xs text-muted uppercase tracking-wide2 block">Bidding starts in</span>
            <CountdownTimer endTime={startTime} />
          </div>
        )}
        {computedStatus === "LIVE" && (
          <div className="text-right">
            <span className="text-xs text-live uppercase tracking-wide2 block">Bidding closes in</span>
            <CountdownTimer endTime={endTime} />
          </div>
        )}
      </div>

      {/* Outbid/Highest Bidder badge */}
      {session && highestBid && (
        <div className="pt-2 border-t border-border/50 text-xs">
          {highestBid.userId === session.user.id ? (
            <span className="text-live font-medium">✓ You are currently the highest bidder</span>
          ) : (
            isRegistered && <span className="text-brassLight font-medium">⚠️ You have been outbid!</span>
          )}
        </div>
      )}

      {/* Status Specific UI Controls */}

      {/* UPCOMING STATE */}
      {computedStatus === "UPCOMING" && (
        <div className="bg-surfaceRaised border border-border/50 rounded-lg p-4 text-center">
          <p className="text-sm text-muted font-body">Registration opens on {new Date(regStartTime).toLocaleString()}.</p>
        </div>
      )}

      {/* REGISTERING STATE */}
      {computedStatus === "REGISTERING" && (
        <div className="space-y-4">
          {session ? (
            isRegistered ? (
              <div className="bg-live/10 border border-live/20 text-live text-sm text-center py-3 rounded-lg font-body">
                ✓ You are registered for this auction! Bidding starts soon.
              </div>
            ) : (
              <button
                onClick={handleRegister}
                disabled={registering}
                className="w-full bg-brass hover:bg-brassLight disabled:opacity-50 text-charcoal font-medium py-3 rounded-lg transition-colors font-body"
              >
                {registering ? "Registering..." : "Register for Auction"}
              </button>
            )
          ) : (
            <button
              onClick={() => router.push("/login")}
              className="w-full bg-brass hover:bg-brassLight text-charcoal font-medium py-3 rounded-lg transition-colors font-body"
            >
              Sign in to Register
            </button>
          )}
        </div>
      )}

      {/* REGISTRATION CLOSED STATE */}
      {computedStatus === "REGISTRATION_CLOSED" && (
        <div className="bg-surfaceRaised border border-border/50 rounded-lg p-4 text-center text-sm font-body">
          {isRegistered ? (
            <p className="text-live">✓ You are registered. Get ready, bidding starts soon!</p>
          ) : (
            <p className="text-muted">Registration is closed. You did not register, so you cannot bid.</p>
          )}
        </div>
      )}

      {/* LIVE STATE */}
      {computedStatus === "LIVE" && (
        <div>
          {session ? (
            isRegistered ? (
              <form onSubmit={submitBid} className="space-y-3">
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
                    className="flex-1 bg-charcoal border border-border rounded px-3 py-2.5 font-mono text-bone focus:outline-none focus:ring-2 focus:ring-brass"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-brass hover:bg-brassLight disabled:opacity-50 text-charcoal font-body font-medium px-6 py-2.5 rounded transition-colors"
                  >
                    {submitting ? "Placing…" : "Place bid"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-surfaceRaised border border-border text-center py-4 rounded-lg text-sm text-muted font-body">
                Bidding is live! (Only registered users can place bids)
              </div>
            )
          ) : (
            <button
              onClick={() => router.push("/login")}
              className="w-full bg-brass hover:bg-brassLight text-charcoal font-medium py-3 rounded-lg transition-colors font-body"
            >
              Sign in to Bid
            </button>
          )}
          {!connected && <p className="text-muted text-xs mt-2 text-center">Reconnecting to live updates…</p>}
        </div>
      )}

      {/* CLOSED STATE */}
      {computedStatus === "CLOSED" && (
        <div className="space-y-4">
          <div className="bg-surfaceRaised border border-border rounded-lg p-4 text-center">
            <span className="text-xs text-muted uppercase font-mono tracking-wide2 block">Auction Status</span>
            <span className="text-live text-lg font-bold font-display uppercase tracking-wide block mt-1">Ended</span>
          </div>

          <div className="p-4 rounded-lg bg-surfaceRaised border border-border space-y-1">
            <span className="text-xs text-muted uppercase font-mono tracking-wide2 block">Winner</span>
            {highestBid ? (
              <div className="flex justify-between items-center">
                <span className="font-mono text-brassLight font-medium">
                  {highestBid.userId === session?.user?.id ? "You (Winner! 🎉)" : `User ID: ${highestBid.userId.substring(0, 8)}...`}
                </span>
                <span className="font-mono text-bone font-medium">{formatRupees(highestBid.amountPaise)}</span>
              </div>
            ) : (
              <span className="text-muted font-body">No bids were placed on this lot.</span>
            )}
          </div>
        </div>
      )}

      {/* Recent Bids list */}
      <div>
        <div className="text-xs text-muted uppercase tracking-wide2 mb-2">Recent bids</div>
        <ul className="space-y-1 max-h-48 overflow-y-auto font-mono text-sm">
          {bids.length === 0 && <li className="text-muted">No bids yet — be the first.</li>}
          {bids.map((b) => (
            <li key={b.id} className="flex justify-between text-bone/90 tabular-nums py-1 border-b border-border/20 last:border-b-0">
              <span className="flex items-center gap-2">
                <span>{formatRupees(b.amountPaise)}</span>
                {session && b.userId === session.user.id && (
                  <span className="text-[10px] bg-live/20 text-live px-1 rounded">You</span>
                )}
              </span>
              <span className="text-muted text-xs">{new Date(b.createdAt).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
