import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBook } from "@/lib/store";
import { gateBookRSC } from "@/lib/gate";
import FlipbookViewer from "@/components/FlipbookViewer";
import UnlockGate from "@/components/UnlockGate";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ preview?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(id);
  return { title: book ? (book.visibility === "private" || book.hasPassword ? "Protected flipbook" : book.title) : "Not found", robots: { index: false, follow: false } };
}

// Chrome-free viewer intended for <iframe> embedding on other sites.
export default async function EmbedPage({ params, searchParams }: Props) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) notFound();

  const { decision, canManage } = await gateBookRSC(book);
  const isPreview = canManage && (await searchParams).preview === "1";

  return (
    <div className="h-screen bg-slate-950">
      {decision === "ok" ? (
        <FlipbookViewer
          pdfUrl={`/api/books/${id}/pdf`}
          title={book.title}
          downloadUrl={`/api/books/${id}/pdf?download=1`}
          bookId={isPreview ? undefined : id}
          visibility={book.visibility}
          hasPassword={book.hasPassword}
          branding={book.branding ?? {}}
          overlays={book.overlays ?? []}
        />
      ) : decision === "needs-password" ? (
        <UnlockGate id={book.id} title="Protected flipbook" embed />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-slate-400">
          This flipbook is private.
        </div>
      )}
    </div>
  );
}
