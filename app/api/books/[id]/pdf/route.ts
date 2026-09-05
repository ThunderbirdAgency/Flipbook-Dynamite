import { api, assertSameOrigin, readBoundedBody } from "@/lib/http";
import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import {
  getBook,
  getPdfDelivery,
  MAX_PDF_SIZE,
  savePdfBuffer,
  supabaseMode,
} from "@/lib/store";
import { currentUserId } from "@/lib/auth";
import { gateBookRequest } from "@/lib/gate";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  return api(async () => {
    const { id } = await params;
    const book = await getBook(id);
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Enforce visibility/password before handing over any bytes.
    const { decision } = await gateBookRequest(book, req);
    if (decision === "denied") {
      return NextResponse.json({ error: "This flipbook is private" }, { status: 403 });
    }
    if (decision === "needs-password") {
      return NextResponse.json({ error: "Password required" }, { status: 401 });
    }

    const download = req.nextUrl.searchParams.get("download") === "1";
    const safeName = book.fileName.replace(/[^\w.\- ]+/g, "_") || "document.pdf";
    const delivery = await getPdfDelivery(id, download, safeName);

    if (delivery.kind === "redirect") {
      return new NextResponse(null, {
        status: 307,
        headers: {
          Location: delivery.url,
          // A gated book's signed URL must not be cached by shared caches/CDNs.
          "Cache-Control": "private, no-store",
        },
      });
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
        // Private books must never be cached by shared caches/CDNs.
        "Cache-Control":
          "private, no-store",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      },
  });
  });
}

/** Step 2 of an upload in filesystem mode: receive the raw PDF bytes. */
export async function PUT(req: NextRequest, { params }: Params) {
  return api(async () => {
    assertSameOrigin(req);
    if (supabaseMode) {
      // In Supabase mode the client uploads directly to signed storage.
      return NextResponse.json({ error: "Uploads go directly to storage" }, { status: 405 });
    }
    const { id } = await params;
    const book = await getBook(id, true);
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
    {
      const userId = await currentUserId();
      if (!userId || book.ownerId !== userId) {
        return NextResponse.json({ error: "Not your book" }, { status: 403 });
      }
    }

    if (book.status !== "pending") return NextResponse.json({ error: "PDF is already uploaded" }, { status: 409 });
    const buffer = Buffer.from(await readBoundedBody(req, MAX_PDF_SIZE));
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

    if (buffer.length !== book.size) return NextResponse.json({ error: "File size does not match" }, { status: 400 });
    await savePdfBuffer(id, buffer);
    return NextResponse.json({ ok: true });
  });
}
