import { NextRequest, NextResponse } from "next/server";

// Paid checkout remains closed until verified webhooks and plan enforcement
// are implemented. Do not charge customers for an unprovisioned subscription.
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/pricing?checkout=unavailable", req.url), 303);
}
