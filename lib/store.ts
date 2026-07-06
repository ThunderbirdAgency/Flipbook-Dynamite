import { promises as fs } from "fs";
import path from "path";
import { Book } from "./types";

// Two storage backends behind one API:
//  - Supabase (Postgres + Storage) when NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY are
//    set — used for cloud deploys where the local disk is ephemeral.
//  - Local filesystem otherwise — zero-config for local dev / self-hosting.
// The anon key is safe to expose (it ships in the browser bundle by design);
// access is governed by row-level-security policies scoped to this app's
// table and bucket.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseMode = Boolean(SUPABASE_URL && SUPABASE_KEY);

const TABLE = "flipbook_books";
const BUCKET = "flipbook-pdfs";

export const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB

export interface UploadTarget {
  url: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
}

export type PdfDelivery =
  | { kind: "file"; path: string }
  | { kind: "redirect"; url: string };

/* ---------------- Supabase backend (REST, no SDK needed) ---------------- */

interface BookRow {
  id: string;
  title: string;
  file_name: string;
  size: number;
  created_at: string;
  owner_id: string | null;
}

function rowToBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    size: Number(row.size),
    createdAt: row.created_at,
    ownerId: row.owner_id ?? undefined,
  };
}

function sbHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SUPABASE_KEY!,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

async function sbRest(pathAndQuery: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { ...sbHeaders({ "Content-Type": "application/json" }), ...init?.headers },
    cache: "no-store",
  });
  return res;
}

async function sbList(ownerId?: string): Promise<Book[]> {
  const filter = ownerId ? `&owner_id=eq.${encodeURIComponent(ownerId)}` : "";
  const res = await sbRest(`${TABLE}?select=*&order=created_at.desc${filter}`);
  if (!res.ok) throw new Error(`Supabase list failed (${res.status})`);
  const rows = (await res.json()) as BookRow[];
  return rows.map(rowToBook);
}

async function sbGet(id: string): Promise<Book | null> {
  const res = await sbRest(`${TABLE}?select=*&id=eq.${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Supabase get failed (${res.status})`);
  const rows = (await res.json()) as BookRow[];
  return rows[0] ? rowToBook(rows[0]) : null;
}

async function sbCreate(book: Book): Promise<Book> {
  const res = await sbRest(TABLE, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: book.id,
      title: book.title,
      file_name: book.fileName,
      size: book.size,
      created_at: book.createdAt,
      owner_id: book.ownerId ?? null,
    }),
  });
  if (!res.ok) throw new Error(`Supabase insert failed (${res.status})`);
  return book;
}

async function sbUpdate(id: string, patch: { title?: string }): Promise<Book | null> {
  const res = await sbRest(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ title: patch.title }),
  });
  if (!res.ok) throw new Error(`Supabase update failed (${res.status})`);
  const rows = (await res.json()) as BookRow[];
  return rows[0] ? rowToBook(rows[0]) : null;
}

async function sbDelete(id: string): Promise<boolean> {
  const res = await sbRest(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (!res.ok) return false;
  const rows = (await res.json()) as BookRow[];
  if (rows.length === 0) return false;
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${id}.pdf`, {
    method: "DELETE",
    headers: sbHeaders(),
  }).catch(() => {});
  return true;
}

/* ---------------- Filesystem backend ---------------- */

const DATA_DIR = process.env.FLIPBOOK_DATA_DIR || path.join(process.cwd(), "data");
const PDF_DIR = path.join(DATA_DIR, "pdfs");
const INDEX_FILE = path.join(DATA_DIR, "books.json");

async function ensureDirs() {
  await fs.mkdir(PDF_DIR, { recursive: true });
}

async function readIndex(): Promise<Book[]> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf-8");
    return JSON.parse(raw) as Book[];
  } catch {
    return [];
  }
}

async function writeIndex(books: Book[]) {
  await ensureDirs();
  const tmp = INDEX_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(books, null, 2));
  await fs.rename(tmp, INDEX_FILE);
}

function fsPdfPath(id: string): string {
  assertValidId(id);
  return path.join(PDF_DIR, `${id}.pdf`);
}

/* ---------------- Public API ---------------- */

export function assertValidId(id: string) {
  // ids come from nanoid's URL-safe alphabet; reject anything else so a
  // crafted id can never traverse outside the PDF directory / bucket
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("invalid book id");
}

/** List books; pass an ownerId to see only that user's library. */
export async function listBooks(ownerId?: string): Promise<Book[]> {
  if (supabaseMode) return sbList(ownerId);
  const books = await readIndex();
  return books
    .filter((b) => !ownerId || b.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBook(id: string): Promise<Book | null> {
  if (supabaseMode) return sbGet(id);
  const books = await readIndex();
  return books.find((b) => b.id === id) ?? null;
}

/** Create the metadata record. The PDF bytes are uploaded separately. */
export async function createBook(book: Book): Promise<Book> {
  if (supabaseMode) return sbCreate(book);
  const books = await readIndex();
  books.push(book);
  await writeIndex(books);
  return book;
}

export async function updateBook(
  id: string,
  patch: Partial<Pick<Book, "title">>
): Promise<Book | null> {
  const title =
    typeof patch.title === "string" && patch.title.trim()
      ? patch.title.trim().slice(0, 200)
      : undefined;
  if (!title) return getBook(id);
  if (supabaseMode) return sbUpdate(id, { title });
  const books = await readIndex();
  const book = books.find((b) => b.id === id);
  if (!book) return null;
  book.title = title;
  await writeIndex(books);
  return book;
}

export async function deleteBook(id: string): Promise<boolean> {
  assertValidId(id);
  if (supabaseMode) return sbDelete(id);
  const books = await readIndex();
  const idx = books.findIndex((b) => b.id === id);
  if (idx === -1) return false;
  books.splice(idx, 1);
  await writeIndex(books);
  await fs.unlink(fsPdfPath(id)).catch(() => {});
  return true;
}

/** Where the browser should send the PDF bytes after creating a book. */
export function getUploadTarget(id: string): UploadTarget {
  assertValidId(id);
  if (supabaseMode) {
    return {
      url: `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${id}.pdf`,
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY!,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "x-upsert": "true",
      },
    };
  }
  return { url: `/api/books/${id}/pdf`, method: "PUT", headers: {} };
}

/** How the viewer should fetch the PDF. */
export function getPdfDelivery(id: string, download: boolean, fileName: string): PdfDelivery {
  assertValidId(id);
  if (supabaseMode) {
    const base = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${id}.pdf`;
    return {
      kind: "redirect",
      url: download ? `${base}?download=${encodeURIComponent(fileName)}` : base,
    };
  }
  return { kind: "file", path: fsPdfPath(id) };
}

/** Persist PDF bytes locally (filesystem mode only). */
export async function savePdfBuffer(id: string, pdf: Buffer): Promise<void> {
  await ensureDirs();
  await fs.writeFile(fsPdfPath(id), pdf);
}
