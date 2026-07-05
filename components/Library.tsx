"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Book } from "@/lib/types";
import { renderFirstPage } from "@/lib/pdf-client";

export default function Library() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(() => {
    return fetch("/api/books")
      .then((res) => res.json())
      .then((data) => setBooks(data.books ?? []))
      .catch(() => setBooks([]));
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/books")
      .then((res) => res.json())
      .then((data) => {
        if (alive) setBooks(data.books ?? []);
      })
      .catch(() => {
        if (alive) setBooks([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      setUploadError("");
      const pdfs = Array.from(files).filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );
      if (pdfs.length === 0) {
        setUploadError("Please choose a PDF file.");
        return;
      }
      setUploading(true);
      try {
        let lastId: string | null = null;
        for (const file of pdfs) {
          // Step 1: register the book; the server says where the bytes go.
          const res = await fetch("/api/books", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: file.name, size: file.size }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Upload failed (${res.status})`);
          }
          const data = await res.json();

          // Step 2: send the PDF bytes (to our server, or straight to storage).
          const up = await fetch(data.upload.url, {
            method: data.upload.method,
            headers: { ...data.upload.headers, "Content-Type": "application/pdf" },
            body: file,
          });
          if (!up.ok) {
            await fetch(`/api/books/${data.book.id}`, { method: "DELETE" }).catch(() => {});
            const detail = await up.json().catch(() => ({}));
            throw new Error(detail.error || detail.message || `Upload failed (${up.status})`);
          }
          lastId = data.book.id;
        }
        await refresh();
        // Jump straight into the flipbook when a single file was uploaded.
        if (pdfs.length === 1 && lastId) {
          window.location.href = `/book/${lastId}`;
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!confirm("Delete this flipbook? This cannot be undone.")) return;
      await fetch(`/api/books/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh]
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-20">
      <UploadZone onFiles={upload} uploading={uploading} />
      {uploadError && (
        <p className="mt-3 text-center text-sm text-red-400">{uploadError}</p>
      )}

      <h2 className="mt-14 mb-6 text-lg font-semibold text-white">
        Your flipbooks
        {books && books.length > 0 && (
          <span className="ml-2 text-sm font-normal text-slate-500">({books.length})</span>
        )}
      </h2>

      {books === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : books.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-slate-500">
          <p className="text-sm">No flipbooks yet — upload a PDF above to create your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {books.map((book) => (
            <BookCard key={book.id} book={book} onDelete={() => remove(book.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function UploadZone({
  onFiles,
  uploading,
}: {
  onFiles: (files: FileList) => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`group cursor-pointer rounded-3xl border-2 border-dashed px-8 py-14 text-center transition ${
        dragging
          ? "border-amber-400 bg-amber-400/5"
          : "border-slate-700 bg-slate-900/40 hover:border-slate-500"
      }`}
      role="button"
      aria-label="Upload a PDF"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {uploading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400" />
          <p className="text-sm text-slate-300">Uploading…</p>
        </div>
      ) : (
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-400 transition group-hover:scale-105">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="text-base font-medium text-white">
            Drop a PDF here, or <span className="text-amber-400">browse</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">
            It becomes an interactive flipbook with a shareable link — up to 100 MB
          </p>
        </>
      )}
    </div>
  );
}

function BookCard({ book, onDelete }: { book: Book; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);

  const copyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/book/${book.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt("Copy this link:", url);
    }
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 transition hover:border-slate-600">
      <Link href={`/book/${book.id}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden bg-slate-800">
          <Thumbnail id={book.id} />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
          <div className="absolute inset-x-0 bottom-3 flex justify-center opacity-0 transition group-hover:opacity-100">
            <span className="rounded-full bg-amber-400 px-4 py-1.5 text-xs font-semibold text-slate-950">
              Open flipbook
            </span>
          </div>
        </div>
        <div className="p-3">
          <p className="truncate text-sm font-medium text-white" title={book.title}>
            {book.title}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {new Date(book.createdAt).toLocaleDateString()} · {formatSize(book.size)}
          </p>
        </div>
      </Link>
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          onClick={copyLink}
          className="rounded-full bg-slate-950/80 p-2 text-slate-300 backdrop-blur transition hover:text-amber-400"
          title={copied ? "Copied!" : "Copy share link"}
          aria-label="Copy share link"
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          )}
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className="rounded-full bg-slate-950/80 p-2 text-slate-300 backdrop-blur transition hover:text-red-400"
          title="Delete"
          aria-label="Delete flipbook"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Thumbnail({ id }: { id: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    renderFirstPage(`/api/books/${id}/pdf`, canvasRef.current, 320).catch(() =>
      setFailed(true)
    );
  }, [id]);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-slate-600">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </div>
    );
  }
  return <canvas ref={canvasRef} className="h-full w-full object-cover object-top" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
