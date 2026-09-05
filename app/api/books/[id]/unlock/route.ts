import { api, assertSameOrigin, readJson } from "@/lib/http";
import { NextRequest, NextResponse } from "next/server";
import { getBook, enforceRateLimit } from "@/lib/store";
import {
  ACCESS_TTL_SECONDS,
  accessCookieName,
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

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "0.0.0.0";
    await enforceRateLimit(`unlock:${id}:${visitorId(ip)}`, 8);
    await enforceRateLimit(`unlock-book:${id}`, 100);

    if (!book.hasPassword || !book.passwordHash) {
      // Nothing to unlock — treat as success so the viewer proceeds.
      return NextResponse.json({ ok: true });
    }

    const body = await readJson(req);
    const password = body && typeof body.password === "string" ? body.password : "";
    if (password.length > 200 || !verifyPassword(password, book.passwordHash)) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(accessCookieName(id), mintAccessToken(id, Date.now(), book.passwordHash), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ACCESS_TTL_SECONDS,
  });
  return res;
  });
}
