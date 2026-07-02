"use client";

import { useState } from "react";

const CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "NEEDS_WORK"] as const;

// Client-side page; server-side admin authorization is already enforced by
// middleware.ts (page-level) and each API route (getServerSession check) —
// this page assumes it only renders for an authenticated admin.
export default function AdminPage() {
  const [motorcycleForm, setMotorcycleForm] = useState({
    make: "",
    model: "",
    year: new Date().getFullYear(),
    mileageKm: 0,
    condition: "GOOD" as (typeof CONDITIONS)[number],
    imageUrl: "",
  });
  const [motorcycleResult, setMotorcycleResult] = useState<string | null>(null);
  const [createdMotorcycleId, setCreatedMotorcycleId] = useState<string | null>(null);

  const [auctionForm, setAuctionForm] = useState({
    motorcycleId: "",
    startTime: "",
    endTime: "",
    startingBid: "",
  });
  const [auctionResult, setAuctionResult] = useState<string | null>(null);

  async function createMotorcycle(e: React.FormEvent) {
    e.preventDefault();
    setMotorcycleResult(null);
    const res = await fetch("/api/motorcycles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        make: motorcycleForm.make,
        model: motorcycleForm.model,
        year: Number(motorcycleForm.year),
        mileageKm: Number(motorcycleForm.mileageKm),
        condition: motorcycleForm.condition,
        imageUrls: [motorcycleForm.imageUrl],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMotorcycleResult(`Error: ${data.error?.message}`);
      return;
    }
    setCreatedMotorcycleId(data.motorcycle.id);
    setMotorcycleResult(`Created — id: ${data.motorcycle.id}`);
  }

  async function scheduleAuction(e: React.FormEvent) {
    e.preventDefault();
    setAuctionResult(null);
    const res = await fetch("/api/auctions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        motorcycleId: auctionForm.motorcycleId,
        startTime: new Date(auctionForm.startTime).toISOString(),
        endTime: new Date(auctionForm.endTime).toISOString(),
        startingBidPaise: (Number(auctionForm.startingBid) * 100).toString(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuctionResult(`Error: ${data.error?.message}`);
      return;
    }
    setAuctionResult(`Scheduled — id: ${data.auction.id}`);
  }

  return (
    <div className="space-y-12 max-w-xl">
      <div>
        <h1 className="font-display text-2xl uppercase tracking-wide2 text-bone mb-6">Admin</h1>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-lg text-bone uppercase tracking-wide2">Add motorcycle</h2>
        <form onSubmit={createMotorcycle} className="space-y-3">
          <input
            placeholder="Make (e.g. Royal Enfield)"
            required
            value={motorcycleForm.make}
            onChange={(e) => setMotorcycleForm((f) => ({ ...f, make: e.target.value }))}
            className="w-full bg-surface border border-border rounded px-3 py-2 text-bone"
          />
          <input
            placeholder="Model (e.g. Classic 350)"
            required
            value={motorcycleForm.model}
            onChange={(e) => setMotorcycleForm((f) => ({ ...f, model: e.target.value }))}
            className="w-full bg-surface border border-border rounded px-3 py-2 text-bone"
          />
          <div className="flex gap-3">
            <input
              type="number"
              placeholder="Year"
              required
              value={motorcycleForm.year}
              onChange={(e) => setMotorcycleForm((f) => ({ ...f, year: Number(e.target.value) }))}
              className="flex-1 bg-surface border border-border rounded px-3 py-2 text-bone"
            />
            <input
              type="number"
              placeholder="Mileage (km)"
              required
              value={motorcycleForm.mileageKm}
              onChange={(e) => setMotorcycleForm((f) => ({ ...f, mileageKm: Number(e.target.value) }))}
              className="flex-1 bg-surface border border-border rounded px-3 py-2 text-bone"
            />
          </div>
          <select
            value={motorcycleForm.condition}
            onChange={(e) => setMotorcycleForm((f) => ({ ...f, condition: e.target.value as any }))}
            className="w-full bg-surface border border-border rounded px-3 py-2 text-bone"
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            placeholder="Image URL"
            required
            value={motorcycleForm.imageUrl}
            onChange={(e) => setMotorcycleForm((f) => ({ ...f, imageUrl: e.target.value }))}
            className="w-full bg-surface border border-border rounded px-3 py-2 text-bone"
          />
          <button type="submit" className="bg-brass hover:bg-brassLight text-charcoal font-medium px-5 py-2 rounded">
            Add motorcycle
          </button>
          {motorcycleResult && <p className="text-sm text-muted font-mono">{motorcycleResult}</p>}
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg text-bone uppercase tracking-wide2">Schedule auction</h2>
        <form onSubmit={scheduleAuction} className="space-y-3">
          <input
            placeholder="Motorcycle ID"
            required
            value={auctionForm.motorcycleId || createdMotorcycleId || ""}
            onChange={(e) => setAuctionForm((f) => ({ ...f, motorcycleId: e.target.value }))}
            className="w-full bg-surface border border-border rounded px-3 py-2 text-bone font-mono text-sm"
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted block mb-1">Start time</label>
              <input
                type="datetime-local"
                required
                value={auctionForm.startTime}
                onChange={(e) => setAuctionForm((f) => ({ ...f, startTime: e.target.value }))}
                className="w-full bg-surface border border-border rounded px-3 py-2 text-bone"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted block mb-1">End time</label>
              <input
                type="datetime-local"
                required
                value={auctionForm.endTime}
                onChange={(e) => setAuctionForm((f) => ({ ...f, endTime: e.target.value }))}
                className="w-full bg-surface border border-border rounded px-3 py-2 text-bone"
              />
            </div>
          </div>
          <input
            type="number"
            placeholder="Starting bid (₹)"
            required
            value={auctionForm.startingBid}
            onChange={(e) => setAuctionForm((f) => ({ ...f, startingBid: e.target.value }))}
            className="w-full bg-surface border border-border rounded px-3 py-2 text-bone"
          />
          <button type="submit" className="bg-brass hover:bg-brassLight text-charcoal font-medium px-5 py-2 rounded">
            Schedule auction
          </button>
          {auctionResult && <p className="text-sm text-muted font-mono">{auctionResult}</p>}
        </form>
      </section>
    </div>
  );
}
