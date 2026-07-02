"use client";

import { useEffect, useState } from "react";

function format(msRemaining: number) {
  if (msRemaining <= 0) return { h: "00", m: "00", s: "00", ended: true };
  const totalSeconds = Math.floor(msRemaining / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return { h, m, s, ended: false };
}

/** Odometer-style countdown — tabular mono digits, ticks every second. */
export function CountdownTimer({ endTime }: { endTime: string }) {
  const [remaining, setRemaining] = useState(() => new Date(endTime).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(new Date(endTime).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  const { h, m, s, ended } = format(remaining);

  if (ended) {
    return <span className="font-mono text-live tracking-wide2 text-sm uppercase">Auction ended</span>;
  }

  return (
    <div className="flex items-baseline gap-1 font-mono tabular-nums">
      {[h, m, s].map((unit, i) => (
        <span key={i} className="flex items-baseline">
          <span className="bg-surfaceRaised border border-border rounded px-2 py-1 text-brassLight text-lg">
            {unit}
          </span>
          {i < 2 && <span className="text-muted mx-0.5">:</span>}
        </span>
      ))}
    </div>
  );
}
