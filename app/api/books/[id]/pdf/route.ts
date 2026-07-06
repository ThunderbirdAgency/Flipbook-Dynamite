import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import {
  getBook,
  getPdfDelivery,
  MAX_PDF_SIZE,
  savePdfBuffer,
  supabaseMode,
} from "@/lib/store";
import { authEnabled, currentUserId } from "@/lib/auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const download = req.nextUrl.searchParams.get("download") === "1";
  const safeName = book.fileName.replace(/[^\w.\- ]+/g, "_") || "document.pdf";
  const delivery = getPdfDelivery(id, download, safeName);

  if (delivery.kind === "redirect") {
    return NextResponse.redirect(delivery.url, 307);
  }

  let data: Buffer;
  try {
    data = await fs.readFile(delivery.path);
  } catch {
    return NextResponse.json({ error: "PDF file missing" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
    },
  });
}

/** Step 2 of an upload in filesystem mode: receive the raw PDF bytes. */
export async function PUT(req: NextRequest, { params }: Params) {
  if (supabaseMode) {
    // In Supabase mode the client uploads directly to object storage.
    return NextResponse.json({ error: "Uploads go directly to storage" }, { status: 405 });
  }
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (authEnabled) {
    const userId = await currentUserId();
    if (!userId || book.ownerId !== userId) {
      return NextResponse.json({ error: "Not your book" }, { status: 403 });
    }
  }

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.length === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (buffer.length > MAX_PDF_SIZE) {
    return NextResponse.json({ error: "File exceeds the 100 MB limit" }, { status: 413 });
  }
  // A real PDF starts with "%PDF-" (some tools prepend a little junk, so scan
  // the first KB rather than only byte 0)
  if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
    return NextResponse.json({ error: "File does not look like a PDF" }, { status: 415 });
  }

  await savePdfBuffer(id, buffer);
  return NextResponse.json({ ok: true });
}
