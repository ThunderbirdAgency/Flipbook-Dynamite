import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBook } from "@/lib/store";
import BookViewer from "./viewer";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return { title: "Not found — Flipbook Dynamite" };
  return {
    title: `${book.title} — Flipbook Dynamite`,
    description: `Read “${book.title}” as an interactive flipbook.`,
  };
}

export default async function BookPage({ params }: Props) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) notFound();

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
        <BookViewer id={book.id} title={book.title} />
      </div>
    </div>
  );
}
