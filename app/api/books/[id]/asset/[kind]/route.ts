import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import {
  getAssetDelivery,
  getBook,
  saveAsset,
  updateBook,
  type AssetKind,
} from "@/lib/store";
import { authEnabled, currentUserId } from "@/lib/auth";
import { mergeBranding } from "@/lib/branding";
import { toPublicBook } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; kind: string }> };

const MAX_ASSET = 5 * 1024 * 1024; // 5 MB
const KINDS: Record<string, { asset: AssetKind; field: "logoUrl" | "bgImageUrl" }> = {
  logo: { asset: "logo", field: "logoUrl" },
  background: { asset: "background", field: "bgImageUrl" },
};

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
  const head = buf.subarray(0, 256).toString("utf-8").trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  return null;
}

async function canManage(ownerId?: string): Promise<boolean> {
  if (!authEnabled) return true;
  const userId = await currentUserId();
  return Boolean(userId && ownerId === userId);
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id, kind } = await params;
  const spec = KINDS[kind];
  if (!spec) return NextResponse.json({ error: "Bad asset" }, { status: 400 });

  const delivery = await getAssetDelivery(id, spec.asset);
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
    },
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id, kind } = await params;
  const spec = KINDS[kind];
  if (!spec) return NextResponse.json({ error: "Bad asset" }, { status: 400 });

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

  const url = await saveAsset(id, spec.asset, buffer, contentType);
  const branding = mergeBranding(book.branding ?? {}, { [spec.field]: url });
  const updated = await updateBook(id, { branding });
  return NextResponse.json({ url, book: updated ? toPublicBook(updated) : null });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, kind } = await params;
  const spec = KINDS[kind];
  if (!spec) return NextResponse.json({ error: "Bad asset" }, { status: 400 });

  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canManage(book.ownerId))) {
    return NextResponse.json({ error: "Not your book" }, { status: 403 });
  }

  const branding = mergeBranding(book.branding ?? {}, { [spec.field]: null });
  const updated = await updateBook(id, { branding });
  return NextResponse.json({ book: updated ? toPublicBook(updated) : null });
}
