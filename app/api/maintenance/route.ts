import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { api } from "@/lib/http";
import { cleanupExpiredUploads } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  const actual = Buffer.from(req.headers.get("authorization") || "");
  if (!secret || secret.length < 32 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return api(async () => {
    const result = await cleanupExpiredUploads();
    return NextResponse.json(result, { status: result.failed ? 503 : 200 });
  });
}
