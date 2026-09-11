import { api, assertSameOrigin, clientAddress, readJson } from "@/lib/http";
import { NextRequest, NextResponse } from "next/server";
import { getBook, recordEvent, enforceRateLimit } from "@/lib/store";
import { gateBookRequest } from "@/lib/gate";
import { trackEvent } from "@/lib/publishing";
import { visitorId } from "@/lib/access";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Record a viewing event (book opened, or a page reached). Called by the viewer
 * with `navigator.sendBeacon`, so it must be cheap and never block rendering.
 * Only events for books the caller is actually allowed to see are recorded.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return api(async () => {
    assertSameOrigin(req);
    const { id } = await params;
    const book = await getBook(id);
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { decision } = await gateBookRequest(book, req);
    if (decision !== "ok") {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }

    const body = await readJson(req);
    const type = body?.type === "page" ? "page" : body?.type === "view" ? "view" : null;
    if (!type) return NextResponse.json({ error: "Bad event" }, { status: 400 });

    const page =
      type === "page" && Number.isFinite(Number(body.page))
        ? Math.max(1, Math.min(100000, Math.floor(Number(body.page))))
        : undefined;

    // Pseudonymous visitor id (keyed hash of address + UA) used only to
    // de-duplicate unique visits — we never store the raw address or user agent.
    // The address must come from a trusted hop, otherwise a caller can rotate
    // the header to forge unlimited "unique" visitors in the owner's analytics.
    const ua = req.headers.get("user-agent") || "";
    const visitor = visitorId(`${clientAddress(req)}|${ua}`);

    await enforceRateLimit(`events:${id}:${visitor}`, 120);
    await recordEvent({
      bookId: id,
      type,
      page,
      visitor,
      createdAt: new Date().toISOString(),
  });

  if(typeof body.track === "string" && /^track_[A-Za-z0-9_-]{16}$/.test(body.track)) await trackEvent(body.track,id,page);
  return NextResponse.json({ ok: true });
  });
}
