import { api, assertSameOrigin, readJson } from "@/lib/http";
import { NextRequest, NextResponse } from "next/server";
import { parseBookInput } from "@/lib/validation";
import { nanoid } from "nanoid";
import { createBook, getUploadTarget, listBooks, MAX_PDF_SIZE, enforceRateLimit } from "@/lib/store";
import { StoredBook, Visibility, toPublicBook } from "@/lib/types";
import { hashPassword } from "@/lib/access";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return api(async () => {
    const userId = await requireUserId();
    const books = await listBooks(userId);
    return NextResponse.json({ books: books.map(toPublicBook) });
  });
}

/**
 * Step 1 of an upload: register the book's metadata. The response tells the
 * client where to send the PDF bytes (step 2) — either back to this app
 * (filesystem mode) or to a one-time signed storage URL (Supabase mode), which
 * sidesteps serverless request-body limits.
 */
export async function POST(req: NextRequest) {
  return api(async () => {
    assertSameOrigin(req);
    const userId = await requireUserId();
    await enforceRateLimit(`create:${userId}`, 20);
    const body = await readJson(req);
    if (!body || typeof body.fileName !== "string" || !body.fileName) {
      return NextResponse.json({ error: "Expected JSON with 'fileName'" }, { status: 400 });
    }
    const input = parseBookInput(body);
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

    const visibility: Visibility = body.visibility === "private" ? "private" : "public";
    const password =
      typeof body.password === "string" && body.password.length > 0
        ? body.password.slice(0, 200)
        : null;

    const book: StoredBook = {
      id: nanoid(10),
      status: "pending",
      title: input.title,
      fileName: body.fileName.slice(0, 255),
      size,
      createdAt: new Date().toISOString(),
      ownerId: userId,
      visibility,
      hasPassword: Boolean(password),
      passwordHash: password ? hashPassword(password) : null,
      branding: {},
      overlays: [],
    };

    await createBook(book);
    const upload = await getUploadTarget(book.id);
    return NextResponse.json({ book: toPublicBook(book), upload }, { status: 201 });
  });
}
