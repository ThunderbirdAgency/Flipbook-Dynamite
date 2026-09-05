export type Visibility = "public" | "private";

export type OverlayType = "link" | "video" | "image" | "iframe";

/**
 * An interactive element the owner places on a page: a video pop-up, a GIF/image
 * layer, a clickable link, or an embedded iframe. Positioned in percentages of
 * the page box so it survives any scale (same coordinate space as PDF links).
 */
export interface Overlay {
  id: string;
  /** 1-based page number this overlay belongs to. */
  page: number;
  /** Box, as percentages of the page (0–100). */
  x: number;
  y: number;
  w: number;
  h: number;
  type: OverlayType;
  /** link href / video URL / image src / iframe src. */
  url?: string;
  /** Optional caption / accessible label. */
  label?: string;
  /** For video/image/iframe: open in a lightbox ("popup") or render in place ("inline"). */
  display?: "popup" | "inline";
}

/** Per-book branding / white-label settings. All fields optional. */
export interface Branding {
  /** Stage background color (any CSS color). */
  bgColor?: string;
  /** Stage background image URL (served publicly; shown behind the book). */
  bgImageUrl?: string;
  /** Accent color (hex) for toolbar highlights + active states. */
  accent?: string;
  /** Logo image URL, shown bottom-left of the viewer. */
  logoUrl?: string;
  /** Optional click-through URL for the logo. */
  logoLink?: string;
  /** Overrides the page <title> for SEO. */
  seoTitle?: string;
  /** Overrides the meta description for SEO. */
  seoDescription?: string;
  /** Whether the viewer shows the download button (default true). */
  allowDownload?: boolean;
}

export interface Book {
  id: string;
  title: string;
  fileName: string;
  size: number;
  createdAt: string;
  /** Clerk user id of the creator; absent for books made in open mode. */
  ownerId?: string;
  status: "pending" | "ready" | "deleted";
  /**
   * "public"  — anyone with the link can open it (default).
   * "private" — only the owner, or someone with the password, can open it.
   */
  visibility: Visibility;
  /** Whether a viewing password is set. The hash itself never leaves the server. */
  hasPassword: boolean;
  /** Branding / white-label settings (safe to expose). */
  branding: Branding;
  /** Interactive overlays placed on pages (safe to expose — public content). */
  overlays: Overlay[];
}

/**
 * The server-only shape of a book, including the password hash. Never send
 * this to the browser — use `toPublicBook` to strip the secret first.
 */
export interface StoredBook extends Book {
  /** scrypt hash (`salt:hash`) of the viewing password, or null when open. */
  passwordHash: string | null;
}

/** Strip server-only secrets before returning a book to any client. */
export function toPublicBook(book: StoredBook): Book {
  return {
    id: book.id,
    title: book.title,
    fileName: book.fileName,
    size: book.size,
    createdAt: book.createdAt,
    status: book.status,
    visibility: book.visibility,
    hasPassword: book.hasPassword,
    branding: book.branding ?? {},
    overlays: book.overlays ?? [],
  };
}

/** A single analytics event recorded while a book is viewed. */
export interface BookEvent {
  bookId: string;
  /** "view" = book opened; "page" = a page was reached. */
  type: "view" | "page";
  /** 1-based page number for "page" events. */
  page?: number;
  /** Anonymous per-visit id (hashed) so we can count unique visits. */
  visitor: string;
  createdAt: string;
}

/** Aggregated analytics shown to a book's owner. */
export interface BookStats {
  totalViews: number;
  uniqueVisitors: number;
  /** pagesReached[i] = unique visitors who reached page (i + 1). */
  pagesReached: number[];
  pageCount: number;
  lastViewedAt: string | null;
}
