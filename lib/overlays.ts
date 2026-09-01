import { randomBytes } from "crypto";
import type { Overlay, OverlayType } from "./types";

// Validate + normalize a client-supplied overlay array before it is stored.
// Everything is bounded and coordinates are clamped so nothing unsafe or
// out-of-range is ever persisted.

const MAX_OVERLAYS = 300;
const TYPES: OverlayType[] = ["link", "video", "image", "iframe"];

function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, 2048);
  if (!s) return undefined;
  if (s.startsWith("/")) return s; // same-origin path (e.g. internal jump target or our asset)
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:") return s;
  } catch {
    // not a valid absolute URL
  }
  return undefined;
}

export function sanitizeOverlays(input: unknown): Overlay[] {
  if (!Array.isArray(input)) return [];
  const out: Overlay[] = [];
  for (const raw of input.slice(0, MAX_OVERLAYS)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const type = TYPES.includes(o.type as OverlayType) ? (o.type as OverlayType) : null;
    if (!type) continue;

    const page = Math.max(1, Math.min(100000, Math.floor(Number(o.page) || 1)));
    const url = cleanUrl(o.url);
    // A link/video/iframe with no valid URL is useless; drop it.
    if (type !== "image" && !url) continue;
    if (type === "image" && !url) continue;

    const overlay: Overlay = {
      id:
        typeof o.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(o.id)
          ? o.id
          : randomBytes(6).toString("hex"),
      page,
      x: num(o.x, 0, 100, 10),
      y: num(o.y, 0, 100, 10),
      w: num(o.w, 1, 100, 20),
      h: num(o.h, 1, 100, 15),
      type,
      url,
      label: typeof o.label === "string" ? o.label.trim().slice(0, 200) || undefined : undefined,
      display: o.display === "inline" ? "inline" : o.display === "popup" ? "popup" : undefined,
    };
    out.push(overlay);
  }
  return out;
}

/** Classify a video URL into a normalized embeddable form. */
export function resolveVideo(url: string):
  | { kind: "youtube"; id: string }
  | { kind: "vimeo"; id: string }
  | { kind: "file"; url: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return { kind: "youtube", id };
      const parts = u.pathname.split("/");
      const embedIdx = parts.indexOf("embed");
      if (embedIdx !== -1 && parts[embedIdx + 1]) return { kind: "youtube", id: parts[embedIdx + 1] };
      const shortsIdx = parts.indexOf("shorts");
      if (shortsIdx !== -1 && parts[shortsIdx + 1]) return { kind: "youtube", id: parts[shortsIdx + 1] };
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return { kind: "youtube", id };
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) return { kind: "vimeo", id };
    }
  } catch {
    // fall through
  }
  return { kind: "file", url };
}
