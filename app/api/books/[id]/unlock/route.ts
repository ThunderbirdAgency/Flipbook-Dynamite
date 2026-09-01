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

// Best-effort in-memory throttle (per instance): slows password guessing on top
// of scrypt's per-attempt cost. Not a substitute for a shared limiter at scale.
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; ts: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const e = attempts.get(key);
  if (!e || now - e.ts > WINDOW_MS) {
    attempts.set(key, { count: 1, ts: now });
    if (attempts.size > 5000) {
      for (const [k, v] of attempts) if (now - v.ts > WINDOW_MS) attempts.delete(k);
    }
    return false;
  }
  e.count++;
  return e.count > MAX_ATTEMPTS;
}

/** Exchange a correct password for a short-lived, httpOnly access cookie. */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0";
  if (rateLimited(`${ip}|${id}`)) {
    return NextResponse.json(
      { error: "Too many attempts — wait a minute and try again." },
      { status: 429 }
    );
  }

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
