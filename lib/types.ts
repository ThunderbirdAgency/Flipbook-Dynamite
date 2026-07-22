export type Visibility = "public" | "private";

export interface Book {
  id: string;
  title: string;
  fileName: string;
  size: number;
  createdAt: string;
  /** Clerk user id of the creator; absent for books made in open mode. */
  ownerId?: string;
  /**
   * "public"  — anyone with the link can open it (default).
   * "private" — only the owner, or someone with the password, can open it.
   */
  visibility: Visibility;
  /** Whether a viewing password is set. The hash itself never leaves the server. */
  hasPassword: boolean;
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
    ownerId: book.ownerId,
    visibility: book.visibility,
    hasPassword: book.hasPassword,
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
