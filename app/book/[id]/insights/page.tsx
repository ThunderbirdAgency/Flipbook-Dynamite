import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook } from "@/lib/store";
import { authEnabled, currentUserId } from "@/lib/auth";
import InsightsClient from "./client";

type Props = { params: Promise<{ id: string }> };

export const metadata = { title: "Insights — Flipbook Dynamite" };

export default async function InsightsPage({ params }: Props) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) notFound();

  if (authEnabled) {
    const userId = await currentUserId();
    if (!userId || book.ownerId !== userId) notFound();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="flex items-center gap-3 border-b border-slate-800/80 px-4 py-3 sm:px-6">
        <Link
          href={`/book/${id}`}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-300 transition hover:text-amber-400"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to book
        </Link>
        <span className="text-slate-700">/</span>
        <h1 className="truncate text-sm text-slate-300" title={book.title}>
          Insights · {book.title}
        </h1>
      </header>
      <InsightsClient id={id} pdfUrl={`/api/books/${id}/pdf`} />
    </div>
  );
}
