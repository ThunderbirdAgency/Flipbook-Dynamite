import { NextRequest, NextResponse } from "next/server";
import { deleteBook, getBook, updateBook } from "@/lib/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ book });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Expected a non-empty 'title'" }, { status: 400 });
  }
  const book = await updateBook(id, { title: body.title });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ book });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ok = await deleteBook(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
