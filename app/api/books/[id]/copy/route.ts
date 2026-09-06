import { NextRequest, NextResponse } from "next/server";
import { api, assertSameOrigin } from "@/lib/http";
import { requireUserId } from "@/lib/auth";
import { copyBook, enforceRateLimit, getBook } from "@/lib/store";
import { toPublicBook } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    assertSameOrigin(req);
    const userId = await requireUserId();
    const book = await getBook((await params).id);
    if (!book) return NextResponse.json({ error: "Flipbook not found" }, { status: 404 });
    if (book.ownerId !== userId) return NextResponse.json({ error: "Not your book" }, { status: 403 });
    await enforceRateLimit(`copy:${userId}`, 5);
    return NextResponse.json({ book: toPublicBook(await copyBook(book)) }, { status: 201 });
  });
}
