import { NextRequest, NextResponse } from "next/server";
import { getBook, recordEvent } from "@/lib/store";
import { gateBookRequest } from "@/lib/gate";
import { visitorId } from "@/lib/access";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Record a viewing event (book opened, or a page reached). Called by the viewer
 * with `navigator.sendBeacon`, so it must be cheap and never block rendering.
 * Only events for books the caller is actually allowed to see are recorded.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { decision } = await gateBookRequest(book, req);
  if (decision !== "ok") {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const type = body?.type === "page" ? "page" : body?.type === "view" ? "view" : null;
  if (!type) return NextResponse.json({ error: "Bad event" }, { status: 400 });

  const page =
    type === "page" && Number.isFinite(Number(body.page))
      ? Math.max(1, Math.min(100000, Math.floor(Number(body.page))))
      : undefined;

  // Anonymous, non-reversible visitor id (IP + UA), so we can count unique
  // visits without storing anything personally identifying.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0";
  const ua = req.headers.get("user-agent") || "";
  const visitor = visitorId(`${ip}|${ua}`);

  await recordEvent({
    bookId: id,
    type,
    page,
    visitor,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
