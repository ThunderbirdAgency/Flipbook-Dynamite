import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createBook, getUploadTarget, listBooks, MAX_PDF_SIZE } from "@/lib/store";
import { Book } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const books = await listBooks();
  return NextResponse.json({ books });
}

/**
 * Step 1 of an upload: register the book's metadata. The response tells the
 * client where to send the PDF bytes (step 2) — either back to this app
 * (filesystem mode) or directly to object storage (Supabase mode), which
 * sidesteps serverless request-body limits.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.fileName !== "string" || !body.fileName) {
    return NextResponse.json({ error: "Expected JSON with 'fileName'" }, { status: 400 });
  }
  const size = Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Expected a positive 'size'" }, { status: 400 });
  }
  if (size > MAX_PDF_SIZE) {
    return NextResponse.json({ error: "File exceeds the 100 MB limit" }, { status: 413 });
  }
  if (!/\.pdf$/i.test(body.fileName)) {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 415 });
  }

  const fallback = body.fileName.replace(/\.pdf$/i, "") || "Untitled book";
  const title =
    (typeof body.title === "string" && body.title.trim().slice(0, 200)) || fallback;

  const book: Book = {
    id: nanoid(10),
    title,
    fileName: body.fileName.slice(0, 255),
    size,
    createdAt: new Date().toISOString(),
  };

  await createBook(book);
  return NextResponse.json({ book, upload: getUploadTarget(book.id) }, { status: 201 });
}
