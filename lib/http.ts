import { NextResponse } from "next/server";
import { requireConfiguration } from "./auth";
import { AppError } from "./errors";

export async function api<T extends Response>(work: () => Promise<T>): Promise<T | NextResponse> {
  try { requireConfiguration(); return await work(); }
  catch (error) {
    if (!(error instanceof AppError)) console.error("Flipbook request failed:", error instanceof Error ? error.message : "Unexpected error");
    return NextResponse.json({ error: error instanceof AppError ? error.message : "We couldn't complete that request. Please try again." }, {
      status: error instanceof AppError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(req.url).origin)) {
    throw new AppError(403, "This request must come from Flipbook Dynamite");
  }
}

/**
 * Client address used for rate-limit buckets and visitor de-duplication.
 *
 * `X-Forwarded-For` is a client-supplied chain: every proxy APPENDS, so the
 * leftmost entry is whatever the caller sent and must never be trusted — using
 * it lets an attacker mint a fresh rate-limit bucket per request. We therefore
 * prefer a header the platform attests (Vercel rewrites both of these), and
 * otherwise take the RIGHTMOST hop, which the nearest trusted proxy appended.
 * Set FLIPBOOK_TRUSTED_PROXIES to the number of proxies in front of the app to
 * pick the correct entry when you run behind more than one.
 */
export function clientAddress(req: Request): string {
  const attested = req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-real-ip");
  if (attested?.trim()) return attested.trim();

  const hops = (req.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  if (!hops.length) return "0.0.0.0";

  const trusted = Number(process.env.FLIPBOOK_TRUSTED_PROXIES);
  const back = Number.isInteger(trusted) && trusted > 0 ? trusted : 1;
  return hops[Math.max(0, hops.length - back)];
}

export async function readBoundedBody(req: Request, limit: number) {
  if (Number(req.headers.get("content-length")) > limit) throw new AppError(413, "Request is too large");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new AppError(413, "Request is too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function readJson(req: Request, limit = 8192) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AppError(415, "Expected JSON");
  const bytes = await readBoundedBody(req, limit);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new AppError(400, "The request contains invalid JSON"); }
}
