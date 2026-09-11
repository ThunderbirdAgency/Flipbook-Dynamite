import { hasPermission } from "@/lib/team";
import { NextRequest, NextResponse } from "next/server";
import { api, assertSameOrigin } from "@/lib/http";
import { requireUserId } from "@/lib/auth";
import { getBook, completeUpload } from "@/lib/store";
import { toPublicBook } from "@/lib/types";

export const runtime = "nodejs";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
      assertSameOrigin(req);
      await requireUserId();
      const { id } = await params;
      const book = await getBook(id, true);
      if (!book || !await hasPermission(book.ownerId, "edit")) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ book: toPublicBook(await completeUpload(book)) });
  });
}
