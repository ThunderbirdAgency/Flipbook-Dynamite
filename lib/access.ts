import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { StoredBook } from "./types";

// Server-side access control: password hashing and signed, per-book access
// tokens. No external dependencies — everything is built on Node's crypto.

/**
 * Secret used to sign access tokens and derive anonymous visitor ids. Set
 * FLIPBOOK_SECRET in production so tokens survive restarts and can't be forged.
 * Falls back to a random per-process secret in dev (tokens reset on restart).
 */
const SECRET =
  process.env.FLIPBOOK_SECRET || randomBytes(32).toString("hex");

/* ----------------------------- Passwords ----------------------------- */

/** Hash a viewing password with scrypt. Returns `salt:hash` (hex). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Constant-time verification of a password against a stored `salt:hash`. */
export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  let actual: Buffer;
  try {
    actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  } catch {
    return false;
  }
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* --------------------------- Access tokens --------------------------- */

export const ACCESS_TTL_SECONDS = 60 * 60 * 12; // 12 hours

/** Cookie name that carries the access grant for a given book. */
export function accessCookieName(bookId: string): string {
  return `fb_acc_${bookId}`;
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/**
 * Mint a signed token proving the bearer unlocked `bookId`. The token embeds an
 * expiry and is bound to the book id, so it can't be replayed against others.
 */
export function mintAccessToken(bookId: string, nowMs: number, passwordHash: string): string {
  const exp = Math.floor(nowMs / 1000) + ACCESS_TTL_SECONDS;
  const payload = `${bookId}.${exp}.${passwordHash}`;
  return `${exp}.${sign(payload)}`;
}

/** Verify an access token for a book. */
export function verifyAccessToken(
  token: string | undefined,
  bookId: string,
  nowMs: number,
  passwordHash: string | null
): boolean {
  if (!token || !passwordHash) return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const expStr = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 <= nowMs) return false;
  const expected = sign(`${bookId}.${exp}.${passwordHash}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Pseudonymous visitor id: a keyed hash of IP + UA, used only to de-duplicate
 * unique visits. It is not stored in reversible form, but because IP+UA is
 * low-entropy a specific known pair could be confirmed by recomputation — so
 * this is a de-dup token, not an anonymization guarantee.
 */
export function visitorId(raw: string): string {
  return createHmac("sha256", SECRET).update(raw).digest("base64url").slice(0, 22);
}

/* ---------------------------- Access gate ---------------------------- */

export type AccessDecision = "ok" | "needs-password" | "denied";

/**
 * Decide whether a viewer may open a book.
 *  - public + no password           → ok
 *  - public + password              → needs the password
 *  - private + owner                → ok
 *  - private + password             → needs the password
 *  - private + no password, not owner → denied (owner-only)
 */
export function decideAccess(
  book: Pick<StoredBook, "ownerId" | "visibility" | "passwordHash">,
  viewerUserId: string | null,
  hasValidToken: boolean
): AccessDecision {
  const isOwner = Boolean(viewerUserId && viewerUserId === book.ownerId);
  if (isOwner) return "ok";
  if (book.visibility === "public") {
    if (!book.passwordHash) return "ok";
    return hasValidToken ? "ok" : "needs-password";
  }
  // private
  if (book.passwordHash) return hasValidToken ? "ok" : "needs-password";
  return "denied";
}
