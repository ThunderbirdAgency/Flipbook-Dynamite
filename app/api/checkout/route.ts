import { NextRequest, NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth";

export const runtime = "nodejs";

// Maps a plan id to the Stripe Price env var that holds its recurring price id.
const PRICE_ENV: Record<string, string> = {
  starter: "STRIPE_PRICE_STARTER",
  professional: "STRIPE_PRICE_PROFESSIONAL",
  business: "STRIPE_PRICE_BUSINESS",
};

/**
 * Start checkout for a plan. When Stripe is configured (STRIPE_SECRET_KEY plus
 * the plan's STRIPE_PRICE_* id) this creates a Checkout Session and redirects to
 * it. Until then it degrades to sign-up, so the pricing page works end-to-end
 * and becomes real billing the moment the keys are added.
 */
export async function GET(req: NextRequest) {
  const plan = req.nextUrl.searchParams.get("plan") || "";
  const signUp = new URL(authEnabled ? "/sign-up" : "/app", req.nextUrl.origin);

  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = PRICE_ENV[plan] ? process.env[PRICE_ENV[plan]] : undefined;
  if (!secret || !priceId) {
    // Stripe not wired yet — send them to create an account.
    return NextResponse.redirect(signUp, 303);
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${base}/app?checkout=success`,
    cancel_url: `${base}/pricing?checkout=cancelled`,
    allow_promotion_codes: "true",
  });

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) throw new Error(`Stripe ${res.status}`);
    const session = (await res.json()) as { url?: string };
    if (!session.url) throw new Error("No checkout URL");
    return NextResponse.redirect(session.url, 303);
  } catch {
    // On any Stripe error, don't dead-end the user.
    return NextResponse.redirect(new URL("/pricing?checkout=error", req.nextUrl.origin), 303);
  }
}
