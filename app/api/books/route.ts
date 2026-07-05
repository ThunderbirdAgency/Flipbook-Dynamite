import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createBook, listBooks } from "@/lib/store";
import { Book } from "@/lib/types";

export const runtime = "nodejs";

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

export async function GET() {
  const books = await listBooks();
  return NextResponse.json({ books });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File exceeds the 100 MB limit" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // A real PDF starts with "%PDF-" (some tools prepend a little junk, so scan
  // the first KB rather than only byte 0)
  if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
    return NextResponse.json({ error: "File does not look like a PDF" }, { status: 415 });
  }

  const titleField = form.get("title");
  const fallback = file.name.replace(/\.pdf$/i, "") || "Untitled book";
  const title =
    (typeof titleField === "string" && titleField.trim().slice(0, 200)) || fallback;

  const book: Book = {
    id: nanoid(10),
    title,
    fileName: file.name || "document.pdf",
    size: file.size,
    createdAt: new Date().toISOString(),
  };

  await createBook(book, buffer);
  return NextResponse.json({ book }, { status: 201 });
}
