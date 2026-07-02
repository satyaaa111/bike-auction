"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

type AuctionEvent =
  | { type: "BID_PLACED"; auctionId: string; bid: { id: string; userId: string; amountPaise: string; createdAt: string } }
  | { type: "STATUS_CHANGED"; auctionId: string; status: string };

/**
 * Joins the room for a single auction and surfaces live events. The socket
 * itself is created once per mount and reused — reconnect handling is left
 * to Socket.io's own defaults (exponential backoff), which is sufficient
 * for this scale (see ARCHITECTURE.md §6 for the horizontal-scaling note).
 */
export function useAuctionSocket(auctionId: string, onEvent: (event: AuctionEvent) => void) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-auction", auctionId);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("auction-event", (event: AuctionEvent) => {
      if (event.auctionId === auctionId) onEvent(event);
    });

    return () => {
      socket.emit("leave-auction", auctionId);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId]);

  return { connected };
}
