import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { accessCookieName, decideAccess, verifyAccessToken, type AccessDecision } from "./access";
import { currentUserId } from "./auth";
import type { StoredBook } from "./types";

export interface GateResult {
  decision: AccessDecision;
  /** True ownership (a signed-in user whose id matches the book). */
  isOwner: boolean;
  /** May configure the book only when the current identity owns it. */
  canManage: boolean;
}

/** Evaluate access for a route handler (reads the cookie off the request). */
export async function gateBookRequest(
  book: StoredBook,
  req: NextRequest
): Promise<GateResult> {
  const userId = await currentUserId();
  const token = req.cookies.get(accessCookieName(book.id))?.value;
  return gate(book, userId, token);
}

/** Evaluate access from a Server Component (reads cookies via next/headers). */
export async function gateBookRSC(book: StoredBook): Promise<GateResult> {
  const userId = await currentUserId();
  const store = await cookies();
  const token = store.get(accessCookieName(book.id))?.value;
  return gate(book, userId, token);
}

function gate(
  book: StoredBook,
  userId: string | null,
  token: string | undefined
): GateResult {
  const hasValidToken = verifyAccessToken(token, book.id, Date.now(), book.passwordHash);
  const isOwner = Boolean(userId && userId === book.ownerId);
  return {
    decision: decideAccess(book, userId, hasValidToken),
    isOwner,
    canManage: isOwner,
  };
}
