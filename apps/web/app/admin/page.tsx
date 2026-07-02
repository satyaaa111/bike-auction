"use client";

import { useState, useEffect } from "react";

type Motorcycle = {
  id: string;
  make: string;
  model: string;
  year: number;
  mileageKm: number;
  condition: string;
};

type Auction = {
  id: string;
  motorcycleId: string;
  title: string;
  description: string;
  regStartTime: string;
  regEndTime: string;
  startTime: string;
  endTime: string;
  startingBidPaise: string;
  reservePricePaise: string | null;
  status: string;
  motorcycle?: Motorcycle;
};

const CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "NEEDS_WORK"] as const;

export default function AdminPage() {
  const [motorcycles, setMotorcycles] = useState<Motorcycle[]>([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Motorcycle State
  const [motorcycleForm, setMotorcycleForm] = useState({
    make: "",
    model: "",
    year: "" as string | number,
    mileageKm: "" as string | number,
    condition: "GOOD" as (typeof CONDITIONS)[number],
    imageUrl: "",
  });
  const [motorcycleResult, setMotorcycleResult] = useState<string | null>(null);

  // Add/Edit Auction State
  const [auctionForm, setAuctionForm] = useState({
    id: "", // present if editing
    motorcycleId: "",
    title: "",
    description: "",
    regStartTime: "",
    regEndTime: "",
    startTime: "",
    endTime: "",
    startingBid: "",
    reservePrice: "",
  });
  const [auctionResult, setAuctionResult] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Fetch initial data
  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [mRes, aRes] = await Promise.all([
        fetch("/api/motorcycles"),
        fetch("/api/auctions"),
      ]);
      const mData = await mRes.json();
      const aData = await aRes.json();
      setMotorcycles(mData.motorcycles || []);
      setAuctions(aData.auctions || []);
    } catch (e) {
      console.error("Failed to fetch admin dashboard data", e);
    } finally {
      setLoading(false);
    }
  }

  async function createMotorcycle(e: React.FormEvent) {
    e.preventDefault();
    setMotorcycleResult(null);
    try {
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
      setMotorcycleResult(`Created — id: ${data.motorcycle.id}`);
      setMotorcycleForm({
        make: "",
        model: "",
        year: "",
        mileageKm: "",
        condition: "GOOD",
        imageUrl: "",
      });
      fetchData();
    } catch {
      setMotorcycleResult("Network error.");
    }
  }

  async function handleAuctionSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuctionResult(null);

    const payload = {
      motorcycleId: auctionForm.motorcycleId,
      title: auctionForm.title,
      description: auctionForm.description,
      regStartTime: new Date(auctionForm.regStartTime).toISOString(),
      regEndTime: new Date(auctionForm.regEndTime).toISOString(),
      startTime: new Date(auctionForm.startTime).toISOString(),
      endTime: new Date(auctionForm.endTime).toISOString(),
      startingBidPaise: (Number(auctionForm.startingBid) * 100).toString(),
      reservePricePaise: auctionForm.reservePrice ? (Number(auctionForm.reservePrice) * 100).toString() : null,
    };

    try {
      const url = isEditing ? `/api/auctions/${auctionForm.id}` : "/api/auctions";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setAuctionResult(`Error: ${data.error?.message}`);
        return;
      }

      setAuctionResult(isEditing ? "Auction updated successfully!" : "Auction scheduled successfully!");
      resetAuctionForm();
      fetchData();
    } catch {
      setAuctionResult("Network error.");
    }
  }

  function handleEditClick(auction: Auction) {
    // Format ISO string to datetime-local local value (YYYY-MM-DDTHH:MM)
    const toLocalDateString = (iso: string) => {
      const d = new Date(iso);
      const pad = (num: number) => String(num).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setAuctionForm({
      id: auction.id,
      motorcycleId: auction.motorcycleId,
      title: auction.title,
      description: auction.description,
      regStartTime: toLocalDateString(auction.regStartTime),
      regEndTime: toLocalDateString(auction.regEndTime),
      startTime: toLocalDateString(auction.startTime),
      endTime: toLocalDateString(auction.endTime),
      startingBid: String(Number(auction.startingBidPaise) / 100),
      reservePrice: auction.reservePricePaise ? String(Number(auction.reservePricePaise) / 100) : "",
    });
    setIsEditing(true);
    setAuctionResult(null);
  }

  async function handleDeleteClick(auctionId: string) {
    if (!confirm("Are you sure you want to delete this auction?")) return;

    try {
      const res = await fetch(`/api/auctions/${auctionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error?.message ?? "Failed to delete auction.");
        return;
      }
      fetchData();
    } catch {
      alert("Network error.");
    }
  }

  function resetAuctionForm() {
    setAuctionForm({
      id: "",
      motorcycleId: "",
      title: "",
      description: "",
      regStartTime: "",
      regEndTime: "",
      startTime: "",
      endTime: "",
      startingBid: "",
      reservePrice: "",
    });
    setIsEditing(false);
  }

  return (
    <div className="space-y-16 max-w-5xl">
      <div>
        <h1 className="font-display text-3xl uppercase tracking-wide2 text-bone">Admin Dashboard</h1>
        <p className="text-muted mt-1">Manage motorcycles and auction lifecycles.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Motorcycle Form */}
        <section className="space-y-4 bg-surface p-6 rounded-lg border border-border">
          <h2 className="font-display text-lg text-bone uppercase tracking-wide2">Add Motorcycle</h2>
          <form onSubmit={createMotorcycle} className="space-y-3">
            <input
              placeholder="Make (e.g. Royal Enfield)"
              required
              value={motorcycleForm.make}
              onChange={(e) => setMotorcycleForm((f) => ({ ...f, make: e.target.value }))}
              className="w-full bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
            />
            <input
              placeholder="Model (e.g. Classic 350)"
              required
              value={motorcycleForm.model}
              onChange={(e) => setMotorcycleForm((f) => ({ ...f, model: e.target.value }))}
              className="w-full bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
            />
            <div className="flex gap-3">
              <input
                type="number"
                placeholder="Year"
                required
                value={motorcycleForm.year}
                onChange={(e) => setMotorcycleForm((f) => ({ ...f, year: e.target.value === "" ? "" : Number(e.target.value) }))}
                className="flex-1 bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
              />
              <input
                type="number"
                placeholder="Mileage (km)"
                required
                value={motorcycleForm.mileageKm}
                onChange={(e) => setMotorcycleForm((f) => ({ ...f, mileageKm: e.target.value === "" ? "" : Number(e.target.value) }))}
                className="flex-1 bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
              />
            </div>
            <select
              value={motorcycleForm.condition}
              onChange={(e) => setMotorcycleForm((f) => ({ ...f, condition: e.target.value as any }))}
              className="w-full bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
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
              className="w-full bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
            />
            <button
              type="submit"
              className="bg-brass hover:bg-brassLight text-charcoal font-medium px-5 py-2.5 rounded transition-colors"
            >
              Add Motorcycle
            </button>
            {motorcycleResult && <p className="text-sm text-muted font-mono">{motorcycleResult}</p>}
          </form>
        </section>

        {/* Auction Form */}
        <section className="space-y-4 bg-surface p-6 rounded-lg border border-border">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-lg text-bone uppercase tracking-wide2">
              {isEditing ? "Edit Auction" : "Schedule Auction"}
            </h2>
            {isEditing && (
              <button onClick={resetAuctionForm} className="text-xs text-muted hover:text-bone font-mono">
                Cancel Edit
              </button>
            )}
          </div>
          <form onSubmit={handleAuctionSubmit} className="space-y-3">
            <div>
              <label className="text-[10px] text-muted uppercase font-mono block mb-1">Select Motorcycle</label>
              <select
                required
                value={auctionForm.motorcycleId}
                onChange={(e) => setAuctionForm((f) => ({ ...f, motorcycleId: e.target.value }))}
                className="w-full bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
              >
                <option value="">-- Choose Bike --</option>
                {motorcycles.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.make} {m.model} ({m.year})
                  </option>
                ))}
              </select>
            </div>

            <input
              placeholder="Auction Title"
              required
              value={auctionForm.title}
              onChange={(e) => setAuctionForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
            />

            <textarea
              placeholder="Auction Description"
              required
              value={auctionForm.description}
              onChange={(e) => setAuctionForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full h-20 bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted uppercase font-mono block mb-1">Reg Start Time</label>
                <input
                  type="datetime-local"
                  required
                  value={auctionForm.regStartTime}
                  onChange={(e) => setAuctionForm((f) => ({ ...f, regStartTime: e.target.value }))}
                  className="w-full bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted uppercase font-mono block mb-1">Reg End Time</label>
                <input
                  type="datetime-local"
                  required
                  value={auctionForm.regEndTime}
                  onChange={(e) => setAuctionForm((f) => ({ ...f, regEndTime: e.target.value }))}
                  className="w-full bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted uppercase font-mono block mb-1">Auction Start Time</label>
                <input
                  type="datetime-local"
                  required
                  value={auctionForm.startTime}
                  onChange={(e) => setAuctionForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="w-full bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted uppercase font-mono block mb-1">Auction End Time</label>
                <input
                  type="datetime-local"
                  required
                  value={auctionForm.endTime}
                  onChange={(e) => setAuctionForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="w-full bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted uppercase font-mono block mb-1">Starting Bid (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 50000"
                  required
                  value={auctionForm.startingBid}
                  onChange={(e) => setAuctionForm((f) => ({ ...f, startingBid: e.target.value }))}
                  className="w-full bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted uppercase font-mono block mb-1">Reserve Price (₹, Optional)</label>
                <input
                  type="number"
                  placeholder="e.g. 100000"
                  value={auctionForm.reservePrice}
                  onChange={(e) => setAuctionForm((f) => ({ ...f, reservePrice: e.target.value }))}
                  className="w-full bg-charcoal border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
                />
              </div>
            </div>

            <button
              type="submit"
              className="bg-brass hover:bg-brassLight text-charcoal font-medium px-5 py-2.5 rounded transition-colors"
            >
              {isEditing ? "Save Changes" : "Create Auction"}
            </button>
            {auctionResult && <p className="text-sm text-muted font-mono">{auctionResult}</p>}
          </form>
        </section>
      </div>

      {/* Auction List */}
      <section className="space-y-4">
        <h2 className="font-display text-xl text-bone uppercase tracking-wide2">Scheduled & Active Auctions</h2>
        {loading ? (
          <p className="text-muted font-mono text-sm">Loading auctions...</p>
        ) : auctions.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted text-sm">
            No auctions scheduled yet. Create one using the form above.
          </div>
        ) : (
          <div className="overflow-x-auto border border-border rounded-lg bg-surface">
            <table className="w-full text-left border-collapse font-body text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceRaised text-muted font-mono text-xs uppercase">
                  <th className="p-3">Title</th>
                  <th className="p-3">Bike</th>
                  <th className="p-3">Reg Window</th>
                  <th className="p-3">Auction Window</th>
                  <th className="p-3">Starting Bid</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {auctions.map((a) => (
                  <tr key={a.id} className="border-b border-border/50 hover:bg-charcoal/20">
                    <td className="p-3 font-semibold text-bone">{a.title}</td>
                    <td className="p-3 text-muted">
                      {a.motorcycle ? `${a.motorcycle.make} ${a.motorcycle.model}` : "Unknown"}
                    </td>
                    <td className="p-3 text-muted text-xs font-mono">
                      {new Date(a.regStartTime).toLocaleString()} <br /> to <br />{" "}
                      {new Date(a.regEndTime).toLocaleString()}
                    </td>
                    <td className="p-3 text-muted text-xs font-mono">
                      {new Date(a.startTime).toLocaleString()} <br /> to <br /> {new Date(a.endTime).toLocaleString()}
                    </td>
                    <td className="p-3 text-brassLight font-mono">
                      {(Number(a.startingBidPaise) / 100).toLocaleString("en-IN", {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => handleEditClick(a)}
                        className="text-xs bg-surfaceRaised hover:bg-charcoal border border-border text-bone px-2 py-1 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteClick(a.id)}
                        className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 px-2 py-1 rounded"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
