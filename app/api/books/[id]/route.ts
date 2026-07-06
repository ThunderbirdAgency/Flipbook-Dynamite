import { NextRequest, NextResponse } from "next/server";
import { deleteBook, getBook, updateBook } from "@/lib/store";
import { authEnabled, currentUserId } from "@/lib/auth";
import { Book } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** In auth mode, only the book's owner may modify or delete it. */
async function canManage(book: Book): Promise<boolean> {
  if (!authEnabled) return true;
  const userId = await currentUserId();
  return Boolean(userId && book.ownerId === userId);
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Book metadata is public — share links must work for anyone.
  return NextResponse.json({ book });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManage(book))) {
    return NextResponse.json({ error: "Not your book" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Expected a non-empty 'title'" }, { status: 400 });
  }
  const updated = await updateBook(id, { title: body.title });
  return NextResponse.json({ book: updated });
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
