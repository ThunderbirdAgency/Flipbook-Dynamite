import { promises as fs } from "fs";
import path from "path";
import { Branding, BookEvent, BookStats, Overlay, StoredBook, Visibility } from "./types";

// Two storage backends behind one API:
//  - Supabase (Postgres + Storage) when NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY are
//    set — used for cloud deploys where the local disk is ephemeral.
//  - Local filesystem otherwise — zero-config for local dev / self-hosting.
//
// Security model (Supabase mode):
//  - All privileged work (table writes, issuing storage URLs) runs on the
//    server with the SERVICE ROLE key, which never reaches the browser.
//  - The storage bucket is PRIVATE. Browsers upload to a one-time signed upload
//    URL and read via short-lived signed download URLs — the anon key can no
//    longer write to the bucket or table, and PDFs aren't world-readable.
//  - If no service-role key is configured we degrade to the older anon-key
//    behavior so existing deploys keep working (see `privileged`).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseMode = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const hasServiceRole = Boolean(SUPABASE_SERVICE_KEY);

/** Key used for server-side privileged calls: service role if present. */
const PRIVILEGED_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

const TABLE = "flipbook_books";
const EVENTS_TABLE = "flipbook_events";
const BUCKET = "flipbook-pdfs";
const ASSETS_BUCKET = "flipbook-assets";

export const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB
const SIGNED_DOWNLOAD_TTL = 60 * 30; // 30 min — long enough to render big PDFs

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
  visibility: string | null;
  password_hash: string | null;
  branding: Branding | null;
  overlays: Overlay[] | null;
}

function rowToBook(row: BookRow): StoredBook {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    size: Number(row.size),
    createdAt: row.created_at,
    ownerId: row.owner_id ?? undefined,
    visibility: (row.visibility as Visibility) === "private" ? "private" : "public",
    hasPassword: Boolean(row.password_hash),
    passwordHash: row.password_hash ?? null,
    branding: row.branding ?? {},
    overlays: row.overlays ?? [],
  };
}

function sbHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: PRIVILEGED_KEY!,
    Authorization: `Bearer ${PRIVILEGED_KEY}`,
    ...extra,
  };
}

async function sbRest(pathAndQuery: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { ...sbHeaders({ "Content-Type": "application/json" }), ...init?.headers },
    cache: "no-store",
  });
}

const BOOK_COLS =
  "id,title,file_name,size,created_at,owner_id,visibility,password_hash,branding,overlays";

async function sbList(ownerId?: string): Promise<StoredBook[]> {
  const filter = ownerId ? `&owner_id=eq.${encodeURIComponent(ownerId)}` : "";
  const res = await sbRest(
    `${TABLE}?select=${BOOK_COLS}&order=created_at.desc${filter}`
  );
  if (!res.ok) throw new Error(`Supabase list failed (${res.status})`);
  const rows = (await res.json()) as BookRow[];
  return rows.map(rowToBook);
}

async function sbGet(id: string): Promise<StoredBook | null> {
  const res = await sbRest(
    `${TABLE}?select=${BOOK_COLS}&id=eq.${encodeURIComponent(id)}`
  );
  if (!res.ok) throw new Error(`Supabase get failed (${res.status})`);
  const rows = (await res.json()) as BookRow[];
  return rows[0] ? rowToBook(rows[0]) : null;
}

async function sbCreate(book: StoredBook): Promise<StoredBook> {
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
      visibility: book.visibility,
      password_hash: book.passwordHash,
      branding: book.branding ?? {},
      overlays: book.overlays ?? [],
    }),
  });
  if (!res.ok) throw new Error(`Supabase insert failed (${res.status})`);
  return book;
}

async function sbUpdate(id: string, patch: BookPatch): Promise<StoredBook | null> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.visibility !== undefined) body.visibility = patch.visibility;
  if (patch.passwordHash !== undefined) body.password_hash = patch.passwordHash;
  if (patch.branding !== undefined) body.branding = patch.branding;
  if (patch.overlays !== undefined) body.overlays = patch.overlays;
  const res = await sbRest(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
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
  await sbRest(`${EVENTS_TABLE}?book_id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {});
  for (const kind of ["logo", "background"] as const) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${ASSETS_BUCKET}/${id}/${kind}`, {
      method: "DELETE",
      headers: sbHeaders(),
    }).catch(() => {});
  }
  return true;
}

/* ---------------- Filesystem backend ---------------- */

const DATA_DIR = process.env.FLIPBOOK_DATA_DIR || path.join(process.cwd(), "data");
const PDF_DIR = path.join(DATA_DIR, "pdfs");
const EVENTS_DIR = path.join(DATA_DIR, "events");
const ASSETS_DIR = path.join(DATA_DIR, "assets");
const INDEX_FILE = path.join(DATA_DIR, "books.json");

async function ensureDirs() {
  await fs.mkdir(PDF_DIR, { recursive: true });
}

async function readIndex(): Promise<StoredBook[]> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf-8");
    const books = JSON.parse(raw) as Partial<StoredBook>[];
    // Backfill fields for records written before access control existed.
    return books.map((b) => ({
      id: b.id!,
      title: b.title!,
      fileName: b.fileName!,
      size: b.size!,
      createdAt: b.createdAt!,
      ownerId: b.ownerId,
      visibility: b.visibility === "private" ? "private" : "public",
      hasPassword: Boolean(b.passwordHash),
      passwordHash: b.passwordHash ?? null,
      branding: b.branding ?? {},
      overlays: b.overlays ?? [],
    }));
  } catch {
    return [];
  }
}

async function writeIndex(books: StoredBook[]) {
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

export interface BookPatch {
  title?: string;
  visibility?: Visibility;
  /** null clears the password, a string sets a new hash, undefined leaves it. */
  passwordHash?: string | null;
  /** Full replacement of the branding object (already merged by the caller). */
  branding?: Branding;
  /** Full replacement of the overlays array (already sanitized by the caller). */
  overlays?: Overlay[];
}

export function assertValidId(id: string) {
  // ids come from nanoid's URL-safe alphabet; reject anything else so a
  // crafted id can never traverse outside the PDF directory / bucket
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("invalid book id");
}

/** List books; pass an ownerId to see only that user's library. */
export async function listBooks(ownerId?: string): Promise<StoredBook[]> {
  if (supabaseMode) return sbList(ownerId);
  const books = await readIndex();
  return books
    .filter((b) => !ownerId || b.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBook(id: string): Promise<StoredBook | null> {
  if (supabaseMode) return sbGet(id);
  const books = await readIndex();
  return books.find((b) => b.id === id) ?? null;
}

/** Create the metadata record. The PDF bytes are uploaded separately. */
export async function createBook(book: StoredBook): Promise<StoredBook> {
  if (supabaseMode) return sbCreate(book);
  const books = await readIndex();
  books.push(book);
  await writeIndex(books);
  return book;
}

export async function updateBook(
  id: string,
  patch: BookPatch
): Promise<StoredBook | null> {
  const clean: BookPatch = {};
  if (typeof patch.title === "string" && patch.title.trim()) {
    clean.title = patch.title.trim().slice(0, 200);
  }
  if (patch.visibility === "public" || patch.visibility === "private") {
    clean.visibility = patch.visibility;
  }
  if (patch.passwordHash !== undefined) clean.passwordHash = patch.passwordHash;
  if (patch.branding !== undefined) clean.branding = patch.branding;
  if (patch.overlays !== undefined) clean.overlays = patch.overlays;
  if (Object.keys(clean).length === 0) return getBook(id);

  if (supabaseMode) return sbUpdate(id, clean);
  const books = await readIndex();
  const book = books.find((b) => b.id === id);
  if (!book) return null;
  if (clean.title !== undefined) book.title = clean.title;
  if (clean.visibility !== undefined) book.visibility = clean.visibility;
  if (clean.passwordHash !== undefined) {
    book.passwordHash = clean.passwordHash;
    book.hasPassword = Boolean(clean.passwordHash);
  }
  if (clean.branding !== undefined) book.branding = clean.branding;
  if (clean.overlays !== undefined) book.overlays = clean.overlays;
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
  await fs.unlink(path.join(EVENTS_DIR, `${id}.jsonl`)).catch(() => {});
  await fs.unlink(path.join(ASSETS_DIR, `${id}-logo`)).catch(() => {});
  await fs.unlink(path.join(ASSETS_DIR, `${id}-background`)).catch(() => {});
  return true;
}

/**
 * Where the browser should send the PDF bytes after creating a book.
 * Supabase mode: a one-time signed upload URL minted with the service role
 * (falls back to a direct anon upload only when no service key is configured).
 */
export async function getUploadTarget(id: string): Promise<UploadTarget> {
  assertValidId(id);
  if (!supabaseMode) {
    return { url: `/api/books/${id}/pdf`, method: "PUT", headers: {} };
  }

  const objectPath = `${id}.pdf`;
  if (hasServiceRole) {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${objectPath}`,
      { method: "POST", headers: sbHeaders({ "Content-Type": "application/json" }) }
    );
    if (!res.ok) {
      throw new Error(`Could not create signed upload URL (${res.status})`);
    }
    const { url } = (await res.json()) as { url: string };
    return {
      // `url` is a path like /object/upload/sign/<bucket>/<id>.pdf?token=...
      url: `${SUPABASE_URL}/storage/v1${url}`,
      method: "PUT",
      headers: { "x-upsert": "true" },
    };
  }

  // Legacy fallback: direct anon upload (requires a writable bucket policy).
  return {
    url: `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`,
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "x-upsert": "true",
    },
  };
}

/** How the viewer should fetch the PDF. */
export async function getPdfDelivery(
  id: string,
  download: boolean,
  fileName: string
): Promise<PdfDelivery> {
  assertValidId(id);
  if (!supabaseMode) return { kind: "file", path: fsPdfPath(id) };

  const objectPath = `${id}.pdf`;
  if (hasServiceRole) {
    // Short-lived signed URL against the PRIVATE bucket.
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${objectPath}`,
      {
        method: "POST",
        headers: sbHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ expiresIn: SIGNED_DOWNLOAD_TTL }),
      }
    );
    if (!res.ok) throw new Error(`Could not sign PDF URL (${res.status})`);
    const { signedURL } = (await res.json()) as { signedURL: string };
    const suffix = download ? `&download=${encodeURIComponent(fileName)}` : "";
    return { kind: "redirect", url: `${SUPABASE_URL}/storage/v1${signedURL}${suffix}` };
  }

  // Legacy fallback: public bucket URL.
  const base = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
  return {
    kind: "redirect",
    url: download ? `${base}?download=${encodeURIComponent(fileName)}` : base,
  };
}

/** Persist PDF bytes locally (filesystem mode only). */
export async function savePdfBuffer(id: string, pdf: Buffer): Promise<void> {
  await ensureDirs();
  await fs.writeFile(fsPdfPath(id), pdf);
}

/* ---------------- Branding assets (logo / background image) ---------------- */

export type AssetKind = "logo" | "background";

function assertValidKind(kind: string) {
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(kind)) throw new Error("invalid asset kind");
}

/** Persist an image (branding or overlay) and return the stable URL for it. */
export async function saveAsset(
  id: string,
  kind: string,
  buf: Buffer,
  contentType: string
): Promise<string> {
  assertValidId(id);
  assertValidKind(kind);
  if (supabaseMode) {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${ASSETS_BUCKET}/${id}/${kind}`,
      {
        method: "POST",
        headers: sbHeaders({ "Content-Type": contentType, "x-upsert": "true" }),
        body: new Uint8Array(buf),
      }
    );
    if (!res.ok) throw new Error(`Asset upload failed (${res.status})`);
  } else {
    await fs.mkdir(ASSETS_DIR, { recursive: true });
    await fs.writeFile(path.join(ASSETS_DIR, `${id}-${kind}`), buf);
  }
  // Backend-agnostic, cache-busted URL served by our own route.
  return `/api/books/${id}/asset/${kind}?v=${Date.now()}`;
}

/** How to deliver an image asset for the public GET route. */
export async function getAssetDelivery(
  id: string,
  kind: string
): Promise<PdfDelivery | null> {
  assertValidId(id);
  assertValidKind(kind);
  if (supabaseMode) {
    return {
      kind: "redirect",
      url: `${SUPABASE_URL}/storage/v1/object/public/${ASSETS_BUCKET}/${id}/${kind}`,
    };
  }
  const p = path.join(ASSETS_DIR, `${id}-${kind}`);
  try {
    await fs.access(p);
  } catch {
    return null;
  }
  return { kind: "file", path: p };
}

/* ---------------- Analytics ---------------- */

/** Record a view/page event. Best-effort — never throws to the caller. */
export async function recordEvent(ev: BookEvent): Promise<void> {
  try {
    if (supabaseMode) {
      await sbRest(EVENTS_TABLE, {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          book_id: ev.bookId,
          type: ev.type,
          page: ev.page ?? null,
          visitor: ev.visitor,
          created_at: ev.createdAt,
        }),
      });
      return;
    }
    await fs.mkdir(EVENTS_DIR, { recursive: true });
    const line = JSON.stringify(ev) + "\n";
    await fs.appendFile(path.join(EVENTS_DIR, `${ev.bookId}.jsonl`), line);
  } catch {
    // analytics are non-critical
  }
}

interface RawEvent {
  type: "view" | "page";
  page?: number | null;
  visitor: string;
  created_at?: string;
  createdAt?: string;
}

async function readEvents(bookId: string): Promise<RawEvent[]> {
  if (supabaseMode) {
    const res = await sbRest(
      `${EVENTS_TABLE}?select=type,page,visitor,created_at&book_id=eq.${encodeURIComponent(
        bookId
      )}&limit=100000`
    );
    if (!res.ok) return [];
    return (await res.json()) as RawEvent[];
  }
  try {
    const raw = await fs.readFile(path.join(EVENTS_DIR, `${bookId}.jsonl`), "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as RawEvent);
  } catch {
    return [];
  }
}

/** Aggregate a book's events into owner-facing stats. */
export async function getStats(bookId: string, pageCount: number): Promise<BookStats> {
  assertValidId(bookId);
  const events = await readEvents(bookId);

  const viewers = new Set<string>();
  const maxPageByVisitor = new Map<string, number>();
  let totalViews = 0;
  let lastViewedAt: string | null = null;

  for (const e of events) {
    const at = e.created_at ?? e.createdAt ?? null;
    if (e.type === "view") {
      totalViews++;
      viewers.add(e.visitor);
      if (at && (!lastViewedAt || at > lastViewedAt)) lastViewedAt = at;
    } else if (e.type === "page" && e.page) {
      const cur = maxPageByVisitor.get(e.visitor) ?? 0;
      if (e.page > cur) maxPageByVisitor.set(e.visitor, e.page);
    }
  }

  const count = pageCount > 0 ? pageCount : 0;
  const pagesReached = new Array(count).fill(0);
  for (const maxPage of maxPageByVisitor.values()) {
    const capped = Math.min(maxPage, count);
    for (let p = 1; p <= capped; p++) pagesReached[p - 1]++;
  }

  return {
    totalViews,
    uniqueVisitors: viewers.size,
    pagesReached,
    pageCount: count,
    lastViewedAt,
  };
}
