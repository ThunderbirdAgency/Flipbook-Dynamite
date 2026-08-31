import type { Branding } from "./types";

// Validate + merge a branding patch onto the current branding. Only keys present
// in the patch change; an explicit null clears that key. Everything is bounded
// and sanitized so nothing user-supplied can inject unsafe values downstream.

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{3,20}$|^rgba?\([\d\s.,%]+\)$/;

function cleanColor(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, 40);
  return COLOR_RE.test(s) ? s : undefined;
}

function cleanText(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s || undefined;
}

/** Accept our own same-origin API paths or absolute http(s) URLs only. */
function cleanUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, 2048);
  if (s.startsWith("/api/")) return s;
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:") return s;
  } catch {
    // not a valid absolute URL
  }
  return undefined;
}

type BrandingPatch = Record<string, unknown>;

export function mergeBranding(current: Branding, patch: BrandingPatch): Branding {
  const next: Branding = { ...current };

  const apply = <K extends keyof Branding>(
    key: K,
    present: boolean,
    value: Branding[K] | undefined
  ) => {
    if (!present) return;
    if (value === undefined) delete next[key];
    else next[key] = value;
  };

  if ("bgColor" in patch)
    apply("bgColor", true, patch.bgColor === null ? undefined : cleanColor(patch.bgColor));
  if ("accent" in patch)
    apply("accent", true, patch.accent === null ? undefined : cleanColor(patch.accent));
  if ("bgImageUrl" in patch)
    apply("bgImageUrl", true, patch.bgImageUrl === null ? undefined : cleanUrl(patch.bgImageUrl));
  if ("logoUrl" in patch)
    apply("logoUrl", true, patch.logoUrl === null ? undefined : cleanUrl(patch.logoUrl));
  if ("logoLink" in patch)
    apply("logoLink", true, patch.logoLink === null ? undefined : cleanUrl(patch.logoLink));
  if ("seoTitle" in patch)
    apply("seoTitle", true, patch.seoTitle === null ? undefined : cleanText(patch.seoTitle, 200));
  if ("seoDescription" in patch)
    apply(
      "seoDescription",
      true,
      patch.seoDescription === null ? undefined : cleanText(patch.seoDescription, 320)
    );
  if ("allowDownload" in patch)
    apply("allowDownload", true, typeof patch.allowDownload === "boolean" ? patch.allowDownload : undefined);

  return next;
}
