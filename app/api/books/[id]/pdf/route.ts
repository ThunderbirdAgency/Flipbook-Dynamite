import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { getBook, pdfPath } from "@/lib/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let data: Buffer;
  try {
    data = await fs.readFile(pdfPath(id));
  } catch {
    return NextResponse.json({ error: "PDF file missing" }, { status: 404 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const safeName = book.fileName.replace(/[^\w.\- ]+/g, "_") || "document.pdf";

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.length),
      "Cache-Control": "public, max-age=3600",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
    },
  });
}
