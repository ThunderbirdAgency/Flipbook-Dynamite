import { AppError } from "./errors";

export const MAX_PDF_SIZE = 100 * 1024 * 1024;
export const MAX_BOOKS = 100;
export const MAX_LIBRARY_BYTES = 1024 * 1024 * 1024;

export function validBookId(id: string) { return /^[A-Za-z0-9_-]{10,32}$/.test(id); }

export function assertValidId(id: string) {
  if (!validBookId(id)) throw new AppError(404, "Flipbook not found");
}

export function parseBookInput(body: unknown) {
  if (!body || typeof body !== "object") throw new AppError(400, "Expected a PDF filename and size");
  const { fileName, size, title } = body as Record<string, unknown>;
  if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 255 || /[\x00-\x1f/\\]/.test(fileName)) {
    throw new AppError(400, "Choose a PDF with a valid filename (up to 255 characters)");
  }
  if (!/\.pdf$/i.test(fileName)) throw new AppError(415, "Only PDF files are supported");
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) throw new AppError(400, "The PDF is empty or its size is invalid");
  if (size > MAX_PDF_SIZE) throw new AppError(413, "File exceeds the 100 MB limit");
  return { fileName, size, title: typeof title === "string" && title.trim() ? parseTitle(title) : fileName.replace(/\.pdf$/i, "").slice(0, 200) || "Untitled book" };
}

export function parseTitle(title: unknown) {
  if (typeof title !== "string" || !title.trim() || title.trim().length > 200 || /[\x00-\x1f]/.test(title)) throw new AppError(400, "Enter a title between 1 and 200 characters");
  return title.trim();
}

export function validatePdf(prefix: Uint8Array, actualSize: number, expectedSize: number) {
  if (actualSize > MAX_PDF_SIZE) throw new AppError(413, "File exceeds the 100 MB limit");
  if (!actualSize || actualSize !== expectedSize) throw new AppError(400, "The upload is incomplete or its size does not match. Please upload it again.");
  if (!new TextDecoder("latin1").decode(prefix.subarray(0, 1024)).includes("%PDF-")) throw new AppError(415, "The uploaded file is not a PDF");
}

export function safeLink(url: string) {
  try { return ["https:", "http:", "mailto:", "tel:"].includes(new URL(url).protocol); }
  catch { return false; }
}
