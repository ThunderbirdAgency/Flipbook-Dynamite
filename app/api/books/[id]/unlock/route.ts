import { NextRequest, NextResponse } from "next/server";
import { getBook } from "@/lib/store";
import {
  ACCESS_TTL_SECONDS,
  accessCookieName,
  mintAccessToken,
  verifyPassword,
} from "@/lib/access";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Exchange a correct password for a short-lived, httpOnly access cookie. */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!book.hasPassword || !book.passwordHash) {
    // Nothing to unlock — treat as success so the viewer proceeds.
    return NextResponse.json({ ok: true });
  }

  const body = await req.json().catch(() => null);
  const password = body && typeof body.password === "string" ? body.password : "";
  if (!verifyPassword(password, book.passwordHash)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(accessCookieName(id), mintAccessToken(id, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_TTL_SECONDS,
  });
  return res;
}
