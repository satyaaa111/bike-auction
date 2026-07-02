"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn("credentials", { email, password, redirect: false });
    setSubmitting(false);

    if (result?.error) {
      setError("Incorrect email or password.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="font-display text-2xl uppercase tracking-wide2 text-bone mb-6">Sign in</h1>
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
            Password
          </label>
          <input
            id="password"
            type="password"
            required
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
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-muted text-sm mt-4">
        No account?{" "}
        <Link href="/register" className="text-brass hover:text-brassLight">
          Register
        </Link>
      </p>
    </div>
  );
}
