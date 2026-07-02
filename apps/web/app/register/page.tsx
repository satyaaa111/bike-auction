"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error?.message ?? "Registration failed.");
      setSubmitting(false);
      return;
    }

    await signIn("credentials", { email, password, redirect: false });
    setSubmitting(false);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="font-display text-2xl uppercase tracking-wide2 text-bone mb-6">Create account</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="text-xs text-muted uppercase tracking-wide2 block mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-surface border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
          />
        </div>
        <div>
          <label htmlFor="password" className="text-xs text-muted uppercase tracking-wide2 block mb-1">
            Password (min. 8 characters)
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface border border-border rounded px-3 py-2 text-bone focus:outline-none focus:ring-2 focus:ring-brass"
          />
        </div>
        {error && <p className="text-live text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brass hover:bg-brassLight disabled:opacity-50 text-charcoal font-medium py-2 rounded transition-colors"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
