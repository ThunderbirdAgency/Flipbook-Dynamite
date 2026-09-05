import { NextResponse } from "next/server";
import { requireConfiguration } from "./auth";
import { AppError } from "./errors";

export async function api<T extends Response>(work: () => Promise<T>): Promise<T | NextResponse> {
  try { requireConfiguration(); return await work(); }
  catch (error) {
    if (!(error instanceof AppError)) console.error("Flipbook request failed:", error instanceof Error ? error.message : "Unexpected error");
    return NextResponse.json({ error: error instanceof AppError ? error.message : "We couldn't complete that request. Please try again." }, {
      status: error instanceof AppError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(req.url).origin)) {
    throw new AppError(403, "This request must come from Flipbook Dynamite");
  }
}

export async function readBoundedBody(req: Request, limit: number) {
  if (Number(req.headers.get("content-length")) > limit) throw new AppError(413, "Request is too large");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new AppError(413, "Request is too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function readJson(req: Request, limit = 8192) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AppError(415, "Expected JSON");
  const bytes = await readBoundedBody(req, limit);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new AppError(400, "The request contains invalid JSON"); }
}
