"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageFlip } from "page-flip";
import { renderPdfToPages, RenderedPage } from "@/lib/pdf-client";
import ShareDialog from "@/components/ShareDialog";

interface FlipbookViewerProps {
  pdfUrl: string;
  title: string;
  downloadUrl?: string;
  shareUrl?: string;
  embedUrl?: string;
}

type Status = "loading" | "ready" | "error";

export default function FlipbookViewer({
  pdfUrl,
  title,
  downloadUrl,
  shareUrl,
  embedUrl,
}: FlipbookViewerProps) {
  const [pages, setPages] = useState<RenderedPage[] | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [current, setCurrent] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);

  // Phase 1: rasterize the PDF into page images + link maps.
  useEffect(() => {
    const signal = { cancelled: false };
    let rendered: RenderedPage[] = [];

    renderPdfToPages(pdfUrl, (done, total) => setProgress({ done, total }), signal)
      .then((result) => {
        if (signal.cancelled) return;
        rendered = result;
        if (result.length === 0) throw new Error("The PDF has no pages.");
        setPages(result);
        setStatus("ready");
      })
      .catch((err) => {
        if (signal.cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : "Failed to load the PDF.");
        setStatus("error");
      });

    return () => {
      signal.cancelled = true;
      rendered.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    };
  }, [pdfUrl]);

  // Phase 2: once the page elements are in the DOM, hand them to PageFlip.
  useEffect(() => {
    if (!pages || !bookRef.current) return;

    let flip: PageFlip | null = null;
    let disposed = false;

    (async () => {
      const { PageFlip } = await import("page-flip");
      if (disposed || !bookRef.current) return;

      const first = pages[0];
      flip = new PageFlip(bookRef.current, {
        width: Math.round(first.baseWidth),
        height: Math.round(first.baseHeight),
        size: "stretch",
        minWidth: 220,
        maxWidth: 3000,
        minHeight: 220,
        maxHeight: 3000,
        showCover: true,
        usePortrait: true,
        autoSize: true,
        maxShadowOpacity: 0.4,
        mobileScrollSupport: false,
        clickEventForward: true,
        showPageCorners: true,
        flippingTime: 650,
      });
      flip.loadFromHTML(bookRef.current.querySelectorAll(".fb-page"));
      flip.on("flip", (e) => setCurrent(e.data as number));
      flipRef.current = flip;
      setCurrent(flip.getCurrentPageIndex());
    })();

    return () => {
      disposed = true;
      flipRef.current = null;
      try {
        flip?.destroy();
      } catch {
        // PageFlip.destroy throws if it never finished mounting; safe to ignore.
      }
    };
  }, [pages]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") flipRef.current?.flipNext();
      if (e.key === "ArrowLeft") flipRef.current?.flipPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Track fullscreen state.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current?.requestFullscreen().catch(() => {});
    }
  }, []);

  const goToPage = useCallback((pageIndex: number) => {
    flipRef.current?.flip(pageIndex);
  }, []);

  const total = pages?.length ?? 0;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col overflow-hidden bg-slate-950"
    >
      {/* Stage */}
      <div className="relative flex-1 overflow-hidden px-4 pt-4 pb-20 sm:px-10">
        {status === "loading" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 text-slate-300">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400" />
            <p className="text-sm">
              {progress.total > 0
                ? `Preparing your flipbook — page ${progress.done} of ${progress.total}`
                : "Opening PDF…"}
            </p>
            {progress.total > 0 && (
              <div className="h-1.5 w-56 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-slate-300">
            <p className="text-lg font-semibold text-red-400">Couldn&apos;t open this book</p>
            <p className="max-w-md text-center text-sm text-slate-400">{errorMsg}</p>
          </div>
        )}

        {pages && (
          <div className="mx-auto flex h-full max-w-6xl items-center justify-center">
            <div ref={bookRef} className="flipbook-stage w-full">
              {pages.map((page, i) => (
                <div
                  key={i}
                  className="fb-page"
                  data-density={i === 0 || i === pages.length - 1 ? "hard" : "soft"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page.objectUrl}
                    alt={`${title} — page ${i + 1}`}
                    draggable={false}
                  />
                  {page.links.map((link, j) =>
                    link.url ? (
                      <a
                        key={j}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="fb-link"
                        title={link.url}
                        style={{
                          left: `${link.left}%`,
                          top: `${link.top}%`,
                          width: `${link.width}%`,
                          height: `${link.height}%`,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <a
                        key={j}
                        href={`#page-${(link.pageIndex ?? 0) + 1}`}
                        className="fb-link"
                        title={`Go to page ${(link.pageIndex ?? 0) + 1}`}
                        style={{
                          left: `${link.left}%`,
                          top: `${link.top}%`,
                          width: `${link.width}%`,
                          height: `${link.height}%`,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          goToPage(link.pageIndex ?? 0);
                        }}
                      />
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      {status === "ready" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-4">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-700/60 bg-slate-900/90 px-3 py-2 shadow-xl backdrop-blur">
            <ToolbarButton label="First page" onClick={() => goToPage(0)}>
              <SkipIcon flipped />
            </ToolbarButton>
            <ToolbarButton label="Previous page" onClick={() => flipRef.current?.flipPrev()}>
              <ChevronIcon flipped />
            </ToolbarButton>

            <PageIndicator current={current} total={total} onJump={goToPage} />

            <ToolbarButton label="Next page" onClick={() => flipRef.current?.flipNext()}>
              <ChevronIcon />
            </ToolbarButton>
            <ToolbarButton label="Last page" onClick={() => goToPage(total - 1)}>
              <SkipIcon />
            </ToolbarButton>

            <div className="mx-1 h-5 w-px bg-slate-700" />

            {shareUrl && (
              <ToolbarButton label="Share" onClick={() => setShareOpen(true)}>
                <ShareIcon />
              </ToolbarButton>
            )}
            {downloadUrl && (
              <a
                href={downloadUrl}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-700/70 hover:text-white"
                title="Download PDF"
                aria-label="Download PDF"
              >
                <DownloadIcon />
              </a>
            )}
            <ToolbarButton
              label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={toggleFullscreen}
            >
              <FullscreenIcon exit={isFullscreen} />
            </ToolbarButton>
          </div>
        </div>
      )}

      {shareUrl && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title={title}
          shareUrl={shareUrl}
          embedUrl={embedUrl}
        />
      )}
    </div>
  );
}

function PageIndicator({
  current,
  total,
  onJump,
}: {
  current: number;
  total: number;
  onJump: (page: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  if (editing) {
    return (
      <form
        className="mx-1"
        onSubmit={(e) => {
          e.preventDefault();
          const n = parseInt(value, 10);
          if (!Number.isNaN(n)) onJump(Math.min(Math.max(n, 1), total) - 1);
          setEditing(false);
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
          onBlur={() => setEditing(false)}
          className="w-14 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-center text-sm text-white outline-none focus:border-amber-400"
          placeholder={String(current + 1)}
          aria-label="Jump to page"
        />
      </form>
    );
  }

  return (
    <button
      onClick={() => {
        setValue("");
        setEditing(true);
      }}
      className="mx-1 rounded-md px-2 py-1 text-sm tabular-nums text-slate-200 transition hover:bg-slate-700/70"
      title="Jump to page"
    >
      {current + 1} <span className="text-slate-500">/ {total}</span>
    </button>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-700/70 hover:text-white"
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function ChevronIcon({ flipped }: { flipped?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={flipped ? { transform: "scaleX(-1)" } : undefined}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function SkipIcon({ flipped }: { flipped?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={flipped ? { transform: "scaleX(-1)" } : undefined}>
      <polyline points="7 18 13 12 7 6" />
      <line x1="17" y1="6" x2="17" y2="18" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function FullscreenIcon({ exit }: { exit?: boolean }) {
  return exit ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
