import { api } from "@/lib/http";
import { NextRequest, NextResponse } from "next/server";
import { getBook, getStats } from "@/lib/store";
import { currentUserId } from "@/lib/auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Owner-only aggregated view/engagement stats for a book. */
export async function GET(req: NextRequest, { params }: Params) {
  return api(async () => {
    const { id } = await params;
    const book = await getBook(id);
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // In open mode (no auth) anyone with the link is effectively the owner.
    {
      const userId = await currentUserId();
      if (!userId || book.ownerId !== userId) {
        return NextResponse.json({ error: "Not your book" }, { status: 403 });
      }
    }

    const pageCount = Math.min(10000, Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("pages")) || 0)));
    const stats = await getStats(id, pageCount);
    return NextResponse.json({ stats, book: { id: book.id, title: book.title } });
  });
}
