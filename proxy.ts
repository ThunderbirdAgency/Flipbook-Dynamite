import { clerkMiddleware } from "@clerk/nextjs/server";
import { configuration } from "./lib/config";
import { NextRequest, NextResponse } from "next/server";

const authEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

// Clerk needs to see every request when auth is on; in open mode (no keys)
// requests pass straight through.
const clerk = clerkMiddleware();
export default async function proxy(req: NextRequest, event: Parameters<typeof clerk>[1]) {
  if (req.nextUrl.pathname.startsWith("/api/") && !configuration().ready) {
    return NextResponse.json({ error: "Flipbook Dynamite is being set up. Please try again later." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return authEnabled ? clerk(req, event) : NextResponse.next();
}


export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mjs|pdf|mp3|wav)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
