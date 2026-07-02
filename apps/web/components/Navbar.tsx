"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

export function Navbar() {
  const { data: session } = useSession();

  return (
    <header className="border-b border-border bg-charcoal sticky top-0 z-10">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="font-display text-xl tracking-wide2 text-bone uppercase">
          Lot<span className="text-brass">/</span>House
        </Link>
        <nav className="flex items-center gap-6 font-body text-sm">
          <Link href="/" className="text-muted hover:text-bone transition-colors">
            Auctions
          </Link>
          {session?.user?.role === "ADMIN" && (
            <Link href="/admin" className="text-muted hover:text-bone transition-colors">
              Admin
            </Link>
          )}
          {session ? (
            <button
              onClick={() => signOut()}
              className="text-muted hover:text-live transition-colors"
            >
              Sign out
            </button>
          ) : (
            <Link href="/login" className="text-brass hover:text-brassLight transition-colors">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
