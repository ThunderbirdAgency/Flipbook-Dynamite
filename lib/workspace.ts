import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { configuration } from "./config";
import { requireConfiguration } from "./auth";
import { AppError } from "./errors";
import { getBook, getStats, listBooks } from "./store";

export interface Workspace {
  folders: { id: string; name: string }[];
  placements: Record<string, string>;
  views: Record<string, number>;
  reservedBytes: number;
  bookSlots: number;
}
export interface WorkspaceChange { action: "create" | "rename" | "delete" | "move"; folder?: string | null; label?: string; book?: string }
const empty = (): Workspace => ({ folders: [], placements: {}, views: {}, reservedBytes: 0, bookSlots: 0 });
async function rpc(name: string, body: object) {
  requireConfiguration();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(`${configuration().supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text();
    if (detail.includes("workspace_denied")) throw new AppError(403, "That folder or flipbook is not in your workspace.");
    if (detail.includes("23505")) throw new AppError(409, "A folder with that name already exists.");
    if (detail.includes("folder_limit")) throw new AppError(409, "You can create up to 100 folders.");
    throw new Error(`Workspace ${name} failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}
const localPath = () => path.join(process.env.FLIPBOOK_DATA_DIR || path.join(process.cwd(), "data"), "workspace.json");
async function readLocal(): Promise<Record<string, Workspace>> {
  try { return JSON.parse(await fs.readFile(localPath(), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
}
let localLock = Promise.resolve();
export async function getWorkspace(actor: string): Promise<Workspace> {
  requireConfiguration();
  if (!actor) throw new AppError(401, "Sign in to open your workspace.");
  if (!configuration().localDemo) return rpc("flipbook_workspace", { actor });
  const workspace = (await readLocal())[actor] || empty();
  const books = await listBooks(actor);
  workspace.placements = Object.fromEntries(Object.entries(workspace.placements).filter(([id]) => books.some(b => b.id === id)));
  workspace.bookSlots = books.length;
  workspace.reservedBytes = books.reduce((n,b) => n + (b.status === "pending" ? 104857600 : b.size),0);
  workspace.views = Object.fromEntries(await Promise.all(books.filter(b => b.status === "ready").map(async b => [b.id,(await getStats(b.id,0)).totalViews])));
  return workspace;
}
export async function changeWorkspace(actor: string, change: WorkspaceChange) {
  requireConfiguration();
  if (!actor) throw new AppError(401, "Sign in to manage folders.");
  if (!configuration().localDemo) return rpc("flipbook_workspace_change", { actor, action: change.action, folder: change.folder || null, label: change.label || null, book: change.book || null });
  const previous = localLock;
  let release!: () => void;
  localLock = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    const all = await readLocal();
    const w = all[actor] || empty();
    const folder = w.folders.find(f => f.id === change.folder);
    if (change.action === "create") {
      if (w.folders.length >= 100) throw new AppError(409, "You can create up to 100 folders.");
      if (w.folders.some(f => f.name === change.label)) throw new AppError(409, "A folder with that name already exists.");
      w.folders.push({ id: change.folder!, name: change.label! });
    } else if (change.action === "move") {
      const book = await getBook(change.book!, true);
      if (!book || book.ownerId !== actor || (change.folder && !folder)) throw new AppError(403, "That folder or flipbook is not in your workspace.");
      if (change.folder) w.placements[book.id] = change.folder;
      else delete w.placements[book.id];
    } else {
      if (!folder) throw new AppError(403, "That folder is not in your workspace.");
      if (change.action === "rename") {
        if (w.folders.some(f => f.id !== folder.id && f.name === change.label)) throw new AppError(409, "A folder with that name already exists.");
        folder.name = change.label!;
      } else {
        w.folders = w.folders.filter(f => f.id !== folder.id);
        w.placements = Object.fromEntries(Object.entries(w.placements).filter(([,id]) => id !== folder.id));
      }
    }
    all[actor] = w;
    await fs.mkdir(path.dirname(localPath()),{recursive:true});
    await fs.writeFile(localPath()+".tmp",JSON.stringify(all));
    await fs.rename(localPath()+".tmp",localPath());
  } finally { release(); }
}
