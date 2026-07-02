import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Protects /admin/* pages: unauthenticated -> redirect to login,
// authenticated-but-not-admin -> 403. API routes do their own
// getServerSession check (see app/api/**/route.ts) since this middleware
// only guards page navigation, not the API's own authorization.
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    if (req.nextUrl.pathname.startsWith("/admin") && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: "/login" },
  }
);

export const config = {
  matcher: ["/admin/:path*"],
};
