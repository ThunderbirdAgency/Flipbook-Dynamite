import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBook } from "@/lib/store";
import FlipbookViewer from "@/components/FlipbookViewer";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(id);
  return { title: book ? book.title : "Not found" };
}

// Chrome-free viewer intended for <iframe> embedding on other sites.
export default async function EmbedPage({ params }: Props) {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) notFound();

  return (
    <div className="h-screen bg-slate-950">
      <FlipbookViewer
        pdfUrl={`/api/books/${id}/pdf`}
        title={book.title}
        downloadUrl={`/api/books/${id}/pdf?download=1`}
      />
    </div>
  );
}
