import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const authEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

// Clerk needs to see every request when auth is on; in open mode (no keys)
// requests pass straight through.
const proxy = authEnabled ? clerkMiddleware() : () => NextResponse.next();
export default proxy;

export const config = {
  matcher: [
    // Skip Next.js internals and static assets
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mjs|pdf|mp3|wav)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
