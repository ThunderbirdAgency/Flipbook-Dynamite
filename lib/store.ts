import "server-only";
import { configuration } from "./config";
import { requireConfiguration } from "./auth";
import { validatePdf } from "./validation";
import { AppError } from "./errors";
import { promises as fs } from "fs";
import path from "path";
import { Branding, BookEvent, BookStats, Overlay, StoredBook, Visibility } from "./types";

// Production uses server-only credentials and private Supabase buckets.
// Filesystem storage is available only through the explicit local demo switch.
const config = configuration();
const SUPABASE_URL = config.supabaseUrl;
const PRIVILEGED_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const supabaseMode = config.storageEnabled;

const TABLE = "flipbook_books";
const EVENTS_TABLE = "flipbook_events";
const BUCKET = "flipbook-pdfs";
const ASSETS_BUCKET = "flipbook-assets";

export const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100 MB
const SIGNED_DOWNLOAD_TTL = 60 * 10; // Short-lived bearer link; rendering begins immediately.

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
  status: "pending" | "ready" | "deleted";
}

function rowToBook(row: BookRow): StoredBook {
  return {
    id: row.id,
    status: row.status,
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
  "id,title,file_name,size,created_at,owner_id,visibility,password_hash,branding,overlays,status";

async function sbList(ownerId: string): Promise<StoredBook[]> {
  const filter = ownerId ? `&owner_id=eq.${encodeURIComponent(ownerId)}` : "";
  const res = await sbRest(
    `${TABLE}?select=${BOOK_COLS}&status=neq.deleted&order=created_at.desc${filter}`
  );
  if (!res.ok) throw new Error(`Supabase list failed (${res.status})`);
  const rows = (await res.json()) as BookRow[];
  return rows.filter(row => row.status !== "deleted").map(rowToBook);
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
  const res = await sbRest("rpc/flipbook_reserve_upload", {
    method: "POST",
    body: JSON.stringify({ book_id: book.id, book_title: book.title,
      book_file_name: book.fileName, book_size: book.size, book_owner_id: book.ownerId,
      book_visibility: book.visibility, book_password_hash: book.passwordHash }),
  });
  if (!res.ok) {
    const detail = await res.text();
    if (detail.includes("library_limit")) throw new AppError(409, "Your library has reached its storage limit. Delete a book before uploading another.");
    if (detail.includes("upload_rate_limit")) throw new AppError(429, "Too many uploads. Wait a minute and try again.");
    throw new Error(`Supabase upload reservation failed (${res.status})`);
  }
  return book;
}

async function sbUpdate(id: string, patch: BookPatch): Promise<StoredBook | null> {
  const body: Record<string, unknown> = {};
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.visibility !== undefined) body.visibility = patch.visibility;
  if (patch.passwordHash !== undefined) body.password_hash = patch.passwordHash;
  if (patch.branding !== undefined) body.branding = patch.branding;
  if (patch.overlays !== undefined) body.overlays = patch.overlays;
  const res = await sbRest(`${TABLE}?id=eq.${encodeURIComponent(id)}${patch.status === "ready" ? "&status=eq.pending" : "&status=neq.deleted"}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase update failed (${res.status})`);
  const rows = (await res.json()) as BookRow[];
  return rows[0] ? rowToBook(rows[0]) : null;
}

async function sbDelete(id: string, purge = false): Promise<boolean> {
  // Batch deletion is idempotent even when the object was never uploaded.
  const pdf = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: "DELETE", headers: sbHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: [`${id}.pdf`] }),
  });
  if (!pdf.ok) throw new Error("Could not delete PDF; retry deletion");
  // Always delete the first page, then list again so folders of any size clear.
  while (true) {
    const listed = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${ASSETS_BUCKET}`, {
      method: "POST", headers: sbHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix: `${id}/`, limit: 1000 }), cache: "no-store",
    });
    if (!listed.ok) throw new Error("Could not list book images; retry deletion");
    const items = await listed.json() as Array<{ name: string }>;
    if (!items.length) break;
    const deleted = await fetch(`${SUPABASE_URL}/storage/v1/object/${ASSETS_BUCKET}`, {
      method: "DELETE", headers: sbHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: items.map(item => `${id}/${item.name}`) }),
    });
    if (!deleted.ok) throw new Error("Could not delete book images; retry deletion");
  }
  const events = await sbRest(`${EVENTS_TABLE}?book_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!events.ok) throw new Error("Could not delete analytics; retry deletion");
  const res = await sbRest(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: purge ? "DELETE" : "PATCH", headers: { Prefer: "return=representation" },
    ...(purge ? {} : { body: JSON.stringify({ status: "deleted" }) }),
  });
  if (!res.ok) throw new Error("Could not delete book metadata; retry deletion");
  return (await res.json() as BookRow[]).length > 0;
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
      status: b.status ?? "ready",
      title: b.title!,
      fileName: b.fileName!,
      size: b.size!,
      createdAt: b.createdAt!,
      ownerId: b.ownerId ?? "local-demo",
      visibility: b.visibility === "private" ? "private" : "public",
      hasPassword: Boolean(b.passwordHash),
      passwordHash: b.passwordHash ?? null,
      branding: b.branding ?? {},
      overlays: b.overlays ?? [],
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

let indexQueue: Promise<unknown> = Promise.resolve();
function withIndexLock<T>(work: () => Promise<T>): Promise<T> {
  const next = indexQueue.then(work, work);
  indexQueue = next.catch(() => {});
  return next;
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
  status?: "pending" | "ready";
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
  if (!/^[A-Za-z0-9_-]{10,32}$/.test(id)) throw new Error("invalid book id");
}

/** List books; pass an ownerId to see only that user's library. */
export async function listBooks(ownerId: string): Promise<StoredBook[]> {
  requireConfiguration();
  if (supabaseMode) return sbList(ownerId);
  const books = await readIndex();
  return books
    .filter((b) => b.status !== "deleted" && b.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBook(id: string, includePending = false): Promise<StoredBook | null> {
  if (!configuration().ready) return null;
  if (!/^[A-Za-z0-9_-]{10,32}$/.test(id)) return null;
  const book = supabaseMode ? await sbGet(id) : (await readIndex()).find(b => b.id === id);
  return book && book.status !== "deleted" && (includePending || book.status === "ready") ? book : null;
}

/** Create the metadata record. The PDF bytes are uploaded separately. */
export async function createBook(book: StoredBook): Promise<StoredBook> {
  requireConfiguration();
  if (supabaseMode) return sbCreate(book);
  return withIndexLock(async () => {
    const books = await readIndex();
    const owned = books.filter(b => b.ownerId === book.ownerId);
    if (owned.length >= 100 || owned.reduce((sum, b) => sum + (b.status === "pending" ? MAX_PDF_SIZE : b.size), 0) + MAX_PDF_SIZE > 1073741824) throw new AppError(409, "Your library has reached its storage limit");
    books.push(book);
    await writeIndex(books);
    return book;
  });
}

export async function updateBook(
  id: string,
  patch: BookPatch
): Promise<StoredBook | null> {
  requireConfiguration();
  const clean: BookPatch = {};
  if (patch.status) clean.status = patch.status;
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
  return withIndexLock(async () => {
    const books = await readIndex();
    const book = books.find((b) => b.id === id);
    if (!book) return null;
    if (clean.status) book.status = clean.status;
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
  });
}

export async function deleteBook(id: string): Promise<boolean> {
  requireConfiguration();
  assertValidId(id);
  if (supabaseMode) return sbDelete(id);
  return withIndexLock(async () => {
    const books = await readIndex();
    const idx = books.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    books.splice(idx, 1);
    await writeIndex(books);
    await fs.unlink(fsPdfPath(id)).catch(() => {});
    await fs.unlink(path.join(EVENTS_DIR, `${id}.jsonl`)).catch(() => {});
    // Remove every asset for this book (logo, background, and any ovl-* overlays).
    await fs
      .readdir(ASSETS_DIR)
      .then((files) =>
        Promise.all(
          files
            .filter((f) => f.startsWith(`${id}-`))
            .map((f) => fs.unlink(path.join(ASSETS_DIR, f)).catch(() => {}))
        )
      )
      .catch(() => {});
    return true;
  });
}

/**
 * Where the browser should send the PDF bytes after creating a book.
 * Supabase mode: a scoped signed upload URL minted with the server-only key.
 */
export async function getUploadTarget(id: string): Promise<UploadTarget> {
  requireConfiguration();
  assertValidId(id);
  if (!supabaseMode) {
    return { url: `/api/books/${id}/pdf`, method: "PUT", headers: {} };
  }

  const pending = await sbGet(id);
  if (!pending || pending.status !== "pending" || Date.now() - Date.parse(pending.createdAt) > 5 * 60 * 1000) throw new AppError(409, "This upload has expired. Start a new upload.");
  const objectPath = `${id}.pdf`;
  {
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
      headers: {},
    };
  }


}

/** How the viewer should fetch the PDF. */
export async function getPdfDelivery(
  id: string,
  download: boolean,
  fileName: string
): Promise<PdfDelivery> {
  requireConfiguration();
  assertValidId(id);
  if (!supabaseMode) return { kind: "file", path: fsPdfPath(id) };

  const objectPath = `${id}.pdf`;
  {
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


}

/** Persist PDF bytes locally (filesystem mode only). */
export async function savePdfBuffer(id: string, pdf: Buffer): Promise<void> {
  requireConfiguration();
  await ensureDirs();
  await fs.writeFile(fsPdfPath(id), pdf, { flag: "wx" });
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
  requireConfiguration();
  assertValidId(id);
  assertValidKind(kind);
  if (supabaseMode) {
    const book = await getBook(id);
    if (!book?.ownerId) throw new AppError(404, "Flipbook not found");
    const reservation = await sbRest("rpc/flipbook_reserve_asset", { method: "POST",
      body: JSON.stringify({ asset_book_id: id, asset_kind: kind, asset_owner_id: book.ownerId }) });
    if (!reservation.ok) throw new Error("Image storage reservation is unavailable");
    if (await reservation.json() !== true) throw new AppError(409, "Your image storage is full. Delete an unused flipbook to free space.");

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

/** Read an asset's raw bytes (used to proxy assets of gated books). */
export async function readAssetBytes(id: string, kind: string): Promise<Buffer | null> {
  requireConfiguration();
  assertValidId(id);
  assertValidKind(kind);
  if (supabaseMode) {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${ASSETS_BUCKET}/${id}/${kind}`,
      { headers: sbHeaders(), cache: "no-store" }
    );
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  try {
    return await fs.readFile(path.join(ASSETS_DIR, `${id}-${kind}`));
  } catch {
    return null;
  }
}

/* ---------------- Analytics ---------------- */

/** Record a view/page event. Best-effort — never throws to the caller. */
export async function recordEvent(ev: BookEvent): Promise<void> {
  requireConfiguration();
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
  requireConfiguration();
  assertValidId(bookId);
  if (supabaseMode) {
    const res = await sbRest("rpc/flipbook_get_stats", { method: "POST",
      body: JSON.stringify({ stats_book_id: bookId, stats_page_count: Number.isFinite(pageCount) ? Math.min(10000, Math.max(0, Math.floor(pageCount))) : 0 }) });
    if (!res.ok) throw new Error("Could not load analytics");
    return await res.json() as BookStats;
  }
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

  const count = Number.isFinite(pageCount) ? Math.min(10000, Math.max(0, Math.floor(pageCount))) : 0;
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

/** Publish only after actual storage bytes match the reserved PDF upload. */
export async function completeUpload(book: StoredBook): Promise<StoredBook> {
  requireConfiguration();
  if (book.status === "ready") return book;
  if (Date.now() - Date.parse(book.createdAt) > 125 * 60 * 1000) throw new AppError(409, "This upload has expired. Please start a new upload.");
  let prefix: Uint8Array;
  let actualSize: number;
  if (supabaseMode) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${book.id}.pdf`, {
      headers: sbHeaders({ Range: "bytes=0-1023" }), cache: "no-store",
    });
    if (!res.ok || !res.body) throw new AppError(409, "The PDF has not finished uploading. Please try again.");
    const range = res.headers.get("content-range")?.match(/\/(\d+)$/);
    actualSize = res.status === 206 ? Number(range?.[1] ?? 0) : Number(res.headers.get("content-length"));
    const reader = res.body.getReader();
    prefix = new Uint8Array(1024);
    let length = 0;
    try {
      while (length < 1024) {
        const { done, value } = await reader.read();
        if (done) break;
        const part = value.subarray(0, 1024 - length);
        prefix.set(part, length);
        length += part.length;
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    prefix = prefix.subarray(0, length);
  } else {
    let handle;
    try { handle = await fs.open(fsPdfPath(book.id), "r"); }
    catch { throw new AppError(409, "The PDF has not finished uploading. Please try again."); }
    try {
      actualSize = (await handle.stat()).size;
      const buffer = Buffer.alloc(1024);
      const { bytesRead } = await handle.read(buffer, 0, 1024, 0);
      prefix = buffer.subarray(0, bytesRead);
    } finally { await handle.close(); }
  }
  validatePdf(prefix, actualSize, book.size);
  const published = await updateBook(book.id, { status: "ready" });
  if (!published) throw new AppError(404, "Flipbook not found");
  return published;
}

const localRateWindows = new Map<string, { start: number; count: number }>();
export async function enforceRateLimit(key: string, limit: number, seconds = 60) {
  requireConfiguration();
  let allowed: boolean;
  if (supabaseMode) {
    const res = await sbRest("rpc/flipbook_take_rate_slot", { method: "POST",
      body: JSON.stringify({ rate_key: key, max_attempts: limit, window_seconds: seconds }) });
    if (!res.ok) throw new Error("Rate limiter is unavailable");
    allowed = await res.json() === true;
  } else {
    const now = Date.now();
    for (const [k, entry] of localRateWindows) if (now - entry.start > 3600000) localRateWindows.delete(k);
    let entry = localRateWindows.get(key);
    if (!entry || now - entry.start >= seconds * 1000) {
      if (!entry && localRateWindows.size >= 10000) throw new AppError(429, "Too many requests. Please try again later.");
      entry = { start: now, count: 0 };
      localRateWindows.set(key, entry);
    }
    allowed = ++entry.count <= limit;
  }
  if (!allowed) throw new AppError(429, "Too many requests. Please wait and try again.");
}

/** Remove cancelled/abandoned objects only after every issued upload link expired. */
export async function cleanupExpiredUploads() {
  requireConfiguration();
  if (!supabaseMode) return { removed: 0, failed: 0 };
  // A link may be issued within five minutes after metadata is reserved and
  // remains valid for two hours. Allow an extra five-minute clock margin.
  const before = new Date(Date.now() - 130 * 60 * 1000).toISOString();
  const res = await sbRest(`${TABLE}?select=id&status=in.(pending,deleted)&created_at=lt.${encodeURIComponent(before)}&order=created_at.asc&limit=200`);
  if (!res.ok) throw new Error("Could not list expired uploads");
  const rows = await res.json() as Array<{ id: string }>;
  const deadline = Date.now() + 45000;
  let removed = 0;
  let failed = 0;
  for (const row of rows) {
    if (Date.now() >= deadline) break;
    try { if (await sbDelete(row.id, true)) removed++; }
    catch { failed++; }
  }
  return { removed, failed };
}
