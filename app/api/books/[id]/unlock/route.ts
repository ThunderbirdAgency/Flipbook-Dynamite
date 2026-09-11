import { api, assertSameOrigin, clientAddress, readJson } from "@/lib/http";
import { NextRequest, NextResponse } from "next/server";
import { getBook, enforceRateLimit } from "@/lib/store";
import {
  accessCookieName,
  accessCookieOptions,
  mintAccessToken,
  verifyPassword,
  visitorId,
} from "@/lib/access";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Exchange a correct password for a short-lived, httpOnly access cookie. */
export async function POST(req: NextRequest, { params }: Params) {
  return api(async () => {
    assertSameOrigin(req);
    const { id } = await params;
    const book = await getBook(id);
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await enforceRateLimit(`unlock:${id}:${visitorId(clientAddress(req))}`, 8);

    if (!book.hasPassword || !book.passwordHash) {
      // Nothing to unlock — treat as success so the viewer proceeds.
      return NextResponse.json({ ok: true });
    }

    const body = await readJson(req);
    const password = body && typeof body.password === "string" ? body.password : "";
    if (password.length > 200 || !verifyPassword(password, book.passwordHash)) {
      // The shared per-book budget is spent only by FAILED attempts. Charging it
      // up front let anyone with the share link exhaust it and lock every
      // legitimate viewer out; a correct password now always succeeds.
      await enforceRateLimit(`unlock-book:${id}`, 100);
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(
      accessCookieName(id),
      mintAccessToken(id, Date.now(), book.passwordHash),
      accessCookieOptions(body?.embed === true, process.env.NODE_ENV === "production")
    );
    return res;
  });
}
