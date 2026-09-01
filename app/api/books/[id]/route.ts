import { NextRequest, NextResponse } from "next/server";
import { deleteBook, getBook, updateBook, type BookPatch } from "@/lib/store";
import { authEnabled, currentUserId } from "@/lib/auth";
import { hashPassword } from "@/lib/access";
import { mergeBranding } from "@/lib/branding";
import { sanitizeOverlays } from "@/lib/overlays";
import { gateBookRequest } from "@/lib/gate";
import { StoredBook, toPublicBook } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** In auth mode, only the book's owner may modify or delete it. */
async function canManage(book: StoredBook): Promise<boolean> {
  if (!authEnabled) return true;
  const userId = await currentUserId();
  return Boolean(userId && book.ownerId === userId);
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { decision, canManage } = await gateBookRequest(book, req);
  if (decision === "denied") {
    return NextResponse.json({ error: "This flipbook is private" }, { status: 403 });
  }
  // Metadata is safe to return (never includes the password hash). `locked`
  // tells the viewer to show the password prompt before rendering.
  return NextResponse.json({
    book: toPublicBook(book),
    locked: decision === "needs-password",
    canManage,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManage(book))) {
    return NextResponse.json({ error: "Not your book" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const patch: BookPatch = {};
  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title;
  }
  if (body.visibility === "public" || body.visibility === "private") {
    patch.visibility = body.visibility;
  }
  // password: a non-empty string sets it; null or "" clears it; undefined leaves it.
  if (body.password === null || body.password === "") {
    patch.passwordHash = null;
  } else if (typeof body.password === "string") {
    patch.passwordHash = hashPassword(body.password.slice(0, 200));
  }
  if (body.branding && typeof body.branding === "object") {
    patch.branding = mergeBranding(book.branding ?? {}, body.branding);
  }
  if (Array.isArray(body.overlays)) {
    patch.overlays = sanitizeOverlays(body.overlays);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await updateBook(id, patch);
  return NextResponse.json({ book: updated ? toPublicBook(updated) : null });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManage(book))) {
    return NextResponse.json({ error: "Not your book" }, { status: 403 });
  }
  const ok = await deleteBook(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
