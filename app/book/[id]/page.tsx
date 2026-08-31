import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBook } from "@/lib/store";
import { gateBookRSC } from "@/lib/gate";
import BookViewer from "./viewer";
import UnlockGate from "@/components/UnlockGate";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return { title: "Not found — Flipbook Dynamite" };
  const priv = book.visibility === "private" || book.hasPassword;
  const b = book.branding ?? {};
  const title = b.seoTitle || `${book.title} — Flipbook Dynamite`;
  const description = b.seoDescription || `Read “${book.title}” as an interactive flipbook.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
    // Keep private/protected books out of search engines.
    robots: priv ? { index: false, follow: false } : undefined,
  };
}

export default async function BookPage({ params }: Props) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) notFound();

  const { decision, canManage } = await gateBookRSC(book);

  return (
    <div className="flex h-screen flex-col bg-slate-950">
      <header className="z-30 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/95 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-sm font-semibold text-white transition hover:text-amber-400"
            title="Back to library"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="hidden sm:inline">
              Flipbook <span className="text-amber-400">Dynamite</span>
            </span>
          </Link>
          <span className="hidden text-slate-700 sm:inline">/</span>
          <h1 className="truncate text-sm text-slate-300" title={book.title}>
            {book.title}
          </h1>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {decision === "ok" ? (
          <BookViewer
            id={book.id}
            title={book.title}
            isOwner={canManage}
            visibility={book.visibility}
            hasPassword={book.hasPassword}
            branding={book.branding ?? {}}
          />
        ) : decision === "needs-password" ? (
          <UnlockGate id={book.id} title={book.title} />
        ) : (
          <PrivateNotice />
        )}
      </div>
    </div>
  );
}

function PrivateNotice() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-950 px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-white">This flipbook is private</h1>
        <p className="mt-1 text-sm text-slate-400">
          The owner hasn&apos;t made this flipbook available to you.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
