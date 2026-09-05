import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { api, assertSameOrigin, readJson } from "@/lib/http";
import { requireUserId } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/store";
import { changeWorkspace, getWorkspace, type WorkspaceChange } from "@/lib/workspace";
import { AppError } from "@/lib/errors";
export const runtime = "nodejs";
export async function GET() { return api(async () => NextResponse.json(await getWorkspace(await requireUserId()))); }
export async function POST(req: NextRequest) {
 return api(async () => {
  assertSameOrigin(req);
  const actor = await requireUserId();
  await enforceRateLimit(`workspace:${actor}`,60);
  const body = await readJson(req);
  if (!body || !["create","rename","delete","move"].includes(body.action)) throw new AppError(400,"Choose a valid workspace action.");
  const change: WorkspaceChange = { action:body.action };
  if (body.action === "create" || body.action === "rename") {
   if (typeof body.label !== "string" || !body.label.trim() || body.label.trim().length>80) throw new AppError(400,"Folder names must contain 1–80 characters.");
   change.label = body.label.trim();
  }
  if (body.action === "create") change.folder = nanoid(12);
  else {
   if (body.folder !== null && (typeof body.folder !== "string" || !/^[A-Za-z0-9_-]{10,32}$/.test(body.folder))) throw new AppError(400,"Choose a valid folder.");
   if (body.action !== "move" && !body.folder) throw new AppError(400,"Choose a folder.");
   change.folder = body.folder;
  }
  if (body.action === "move") {
   if (typeof body.book !== "string" || !/^[A-Za-z0-9_-]{10,32}$/.test(body.book)) throw new AppError(400,"Choose a valid flipbook.");
   change.book = body.book;
  }
  await changeWorkspace(actor,change);
  return NextResponse.json({ok:true,folder:change.folder});
 });
}
