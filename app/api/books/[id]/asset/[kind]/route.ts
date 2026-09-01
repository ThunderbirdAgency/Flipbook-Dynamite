import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import {
  getAssetDelivery,
  getBook,
  readAssetBytes,
  saveAsset,
  updateBook,
} from "@/lib/store";
import { authEnabled, currentUserId } from "@/lib/auth";
import { mergeBranding } from "@/lib/branding";
import { gateBookRequest } from "@/lib/gate";
import { toPublicBook } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; kind: string }> };

const MAX_ASSET = 5 * 1024 * 1024; // 5 MB
const KIND_RE = /^[A-Za-z0-9_-]{1,60}$/;

// logo/background feed branding fields; any other (safe) kind is a generic
// asset (e.g. an overlay image/GIF) that just returns its URL.
function brandingField(kind: string): "logoUrl" | "bgImageUrl" | null {
  if (kind === "logo") return "logoUrl";
  if (kind === "background") return "bgImageUrl";
  return null;
}

/** Sniff an image content-type from magic bytes; null if it isn't an image. */
function sniffImage(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf.length > 11 && buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  // Deliberately NOT accepting SVG: it can carry inline <script>, and these
  // assets are served from our own origin — an SVG logo would be a stored-XSS
  // vector. Raster formats only.
  return null;
}

async function canManage(ownerId?: string): Promise<boolean> {
  if (!authEnabled) return true;
  const userId = await currentUserId();
  return Boolean(userId && ownerId === userId);
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id, kind } = await params;
  if (!KIND_RE.test(kind)) return NextResponse.json({ error: "Bad asset" }, { status: 400 });

  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Assets of a private/protected book must follow the same gate as the PDF, so
  // a logo/background can't leak the fact-or-content of a gated book.
  const gated = book.visibility === "private" || book.hasPassword;
  if (gated) {
    const { decision } = await gateBookRequest(book, req);
    if (decision === "denied") return NextResponse.json({ error: "Private" }, { status: 403 });
    if (decision === "needs-password")
      return NextResponse.json({ error: "Password required" }, { status: 401 });
    // Proxy the bytes so we never hand out a public/guessable storage URL.
    const data = await readAssetBytes(id, kind);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": sniffImage(data) || "application/octet-stream",
        "Content-Length": String(data.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Public book: fast path — filesystem streams; Supabase redirects to CDN.
  const delivery = await getAssetDelivery(id, kind);
  if (!delivery) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (delivery.kind === "redirect") return NextResponse.redirect(delivery.url, 307);

  let data: Buffer;
  try {
    data = await fs.readFile(delivery.path);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const type = sniffImage(data) || "application/octet-stream";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(data.length),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id, kind } = await params;
  if (!KIND_RE.test(kind)) return NextResponse.json({ error: "Bad asset" }, { status: 400 });

  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManage(book.ownerId))) {
    return NextResponse.json({ error: "Not your book" }, { status: 403 });
  }

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.length === 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });
  if (buffer.length > MAX_ASSET) {
    return NextResponse.json({ error: "Image exceeds the 5 MB limit" }, { status: 413 });
  }
  const contentType = sniffImage(buffer);
  if (!contentType) {
    return NextResponse.json({ error: "Not a supported image" }, { status: 415 });
  }

  const url = await saveAsset(id, kind, buffer, contentType);
  const field = brandingField(kind);
  if (field) {
    const branding = mergeBranding(book.branding ?? {}, { [field]: url });
    const updated = await updateBook(id, { branding });
    return NextResponse.json({ url, book: updated ? toPublicBook(updated) : null });
  }
  // Generic asset (overlay image/GIF) — just hand back the URL.
  return NextResponse.json({ url, book: toPublicBook(book) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, kind } = await params;
  const field = brandingField(kind);
  if (!field) return NextResponse.json({ error: "Bad asset" }, { status: 400 });

  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManage(book.ownerId))) {
    return NextResponse.json({ error: "Not your book" }, { status: 403 });
  }

  const branding = mergeBranding(book.branding ?? {}, { [field]: null });
  const updated = await updateBook(id, { branding });
  return NextResponse.json({ book: updated ? toPublicBook(updated) : null });
}
