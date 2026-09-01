import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createBook, getUploadTarget, listBooks, MAX_PDF_SIZE } from "@/lib/store";
import { StoredBook, Visibility, toPublicBook } from "@/lib/types";
import { hashPassword } from "@/lib/access";
import { authEnabled, currentUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const userId = await currentUserId();
  if (authEnabled && !userId) {
    return NextResponse.json({ error: "Sign in to see your library" }, { status: 401 });
  }
  // With auth on, the library is per-user; in open mode it's shared.
  const books = await listBooks(authEnabled ? userId! : undefined);
  return NextResponse.json({ books: books.map(toPublicBook) });
}

/**
 * Step 1 of an upload: register the book's metadata. The response tells the
 * client where to send the PDF bytes (step 2) — either back to this app
 * (filesystem mode) or to a one-time signed storage URL (Supabase mode), which
 * sidesteps serverless request-body limits.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (authEnabled && !userId) {
    return NextResponse.json({ error: "Sign in to upload" }, { status: 401 });
  }
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
  const visibility: Visibility = body.visibility === "private" ? "private" : "public";
  const password =
    typeof body.password === "string" && body.password.length > 0
      ? body.password.slice(0, 200)
      : null;

  const book: StoredBook = {
    id: nanoid(10),
    title,
    fileName: body.fileName.slice(0, 255),
    size,
    createdAt: new Date().toISOString(),
    ownerId: userId ?? undefined,
    visibility,
    hasPassword: Boolean(password),
    passwordHash: password ? hashPassword(password) : null,
    branding: {},
    overlays: [],
  };

  await createBook(book);
  const upload = await getUploadTarget(book.id);
  return NextResponse.json({ book: toPublicBook(book), upload }, { status: 201 });
}
