"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageFlip } from "page-flip";
import { renderPdfToPages, OutlineItem, RenderedPage } from "@/lib/pdf-client";
import { playFlipSound } from "@/lib/flip-sound";
import ShareDialog from "@/components/ShareDialog";
import BrandingDialog from "@/components/BrandingDialog";
import ZoomOverlay from "@/components/ZoomOverlay";
import ThumbnailStrip from "@/components/ThumbnailStrip";
import TocPanel from "@/components/TocPanel";
import SearchPanel from "@/components/SearchPanel";

import type { Branding, Overlay, Visibility } from "@/lib/types";
import { OverlayItem, OverlayLightbox } from "@/components/OverlayLayer";
import OverlayEditor from "@/components/OverlayEditor";

interface FlipbookViewerProps {
  pdfUrl: string;
  title: string;
  downloadUrl?: string;
  shareUrl?: string;
  embedUrl?: string;
  /** Book id — enables view/engagement analytics beacons when present. */
  bookId?: string;
  /** True when the current viewer owns the book (unlocks privacy + insights). */
  isOwner?: boolean;
  visibility?: Visibility;
  hasPassword?: boolean;
  /** Per-book branding: background, logo, accent, download toggle. */
  branding?: Branding;
  /** Interactive overlays placed on pages. */
  overlays?: Overlay[];
}

type Status = "loading" | "ready" | "error";

const AUTOPLAY_INTERVAL_MS = 3500;

export default function FlipbookViewer({
  pdfUrl,
  title,
  downloadUrl,
  shareUrl,
  embedUrl,
  bookId,
  isOwner,
  visibility = "public",
  hasPassword = false,
  branding = {},
  overlays = [],
}: FlipbookViewerProps) {
  // Held in state so the owner's branding edits reflect live in the viewer.
  const [brand, setBrand] = useState<Branding>(branding);
  const [brandOpen, setBrandOpen] = useState(false);
  const [overlayList, setOverlayList] = useState<Overlay[]>(overlays);
  const [editOpen, setEditOpen] = useState(false);
  const [lightbox, setLightbox] = useState<Overlay | null>(null);
  const accent = brand.accent || "#fbbf24";
  const showDownload = brand.allowDownload !== false && Boolean(downloadUrl);
  const customBg = brand.bgImageUrl
    ? `center / cover no-repeat url("${brand.bgImageUrl}")`
    : brand.bgColor || null;
  const [pages, setPages] = useState<RenderedPage[] | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [current, setCurrent] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [showThumbs, setShowThumbs] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [muted, setMuted] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("fbd-muted") === "1"
  );
  // Two-page spread on desktop, single page on phones — the spread is what
  // reads as a real bound book. Re-init the engine when we cross the breakpoint.
  const [portrait, setPortrait] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 900
  );
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => setPortrait(window.innerWidth < 900), 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  // Mirror for event handlers registered once at PageFlip init.
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Owner can flip privacy from the share dialog; keep a live copy for the UI.
  const [bookVisibility, setBookVisibility] = useState<Visibility>(visibility);
  const [bookHasPassword, setBookHasPassword] = useState(hasPassword);

  // Analytics: fire-and-forget beacons for "book opened" and "page reached".
  const reportedPages = useRef<Set<number>>(new Set());
  const reportEvent = useCallback(
    (type: "view" | "page", page?: number) => {
      if (!bookId) return;
      if (type === "page" && page != null) {
        if (reportedPages.current.has(page)) return;
        reportedPages.current.add(page);
      }
      const url = `/api/books/${bookId}/events`;
      const payload = JSON.stringify({ type, page });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
          return;
        }
      } catch {
        // fall through to fetch
      }
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    },
    [bookId]
  );
  const reportEventRef = useRef(reportEvent);
  useEffect(() => {
    reportEventRef.current = reportEvent;
  }, [reportEvent]);

  // Phase 1: rasterize the PDF into page images + link maps + outline.
  useEffect(() => {
    const signal = { cancelled: false };
    let rendered: RenderedPage[] = [];

    renderPdfToPages(pdfUrl, (done, total) => setProgress({ done, total }), signal)
      .then((result) => {
        if (signal.cancelled) return;
        rendered = result.pages;
        if (result.pages.length === 0) throw new Error("The PDF has no pages.");
        setPages(result.pages);
        setOutline(result.outline);
        setPageTexts(result.pageTexts);
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
        usePortrait: portrait,
        autoSize: true,
        // Deeper fold shadows + a weightier turn read as a heavier, realer book.
        drawShadow: true,
        maxShadowOpacity: 0.65,
        mobileScrollSupport: false,
        clickEventForward: true,
        showPageCorners: true,
        flippingTime: 800,
      });
      flip.loadFromHTML(bookRef.current.querySelectorAll(".fb-page"));
      flip.on("flip", (e) => {
        const index = e.data as number;
        setCurrent(index);
        reportEventRef.current("page", index + 1);
      });
      flip.on("changeState", (e) => {
        // "flipping" fires when a page-turn animation starts.
        if (e.data === "flipping" && !mutedRef.current) playFlipSound();
      });
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
  }, [pages, portrait]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (zoomOpen) return; // the zoom overlay has its own key handling
      if (e.key === "ArrowRight") flipRef.current?.flipNext();
      if (e.key === "ArrowLeft") flipRef.current?.flipPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomOpen]);

  // Count one view when the book finishes loading, and the opening page.
  useEffect(() => {
    if (status !== "ready") return;
    reportEventRef.current("view");
    reportEventRef.current("page", 1);
  }, [status]);

  // Track fullscreen state.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Autoplay: keep flipping until the back cover, then stop.
  const total = pages?.length ?? 0;
  useEffect(() => {
    if (!autoplay) return;
    const timer = setInterval(() => {
      const flip = flipRef.current;
      if (!flip) return;
      if (flip.getCurrentPageIndex() >= flip.getPageCount() - 1) {
        setAutoplay(false);
      } else {
        flip.flipNext();
      }
    }, AUTOPLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoplay]);

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

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      localStorage.setItem("fbd-muted", m ? "0" : "1");
      return !m;
    });
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col overflow-hidden bg-slate-950"
      style={{ ["--fb-accent" as string]: accent } as React.CSSProperties}
    >
      {/* Stage */}
      <div
        className={`flipbook-env relative flex-1 overflow-hidden px-4 pt-4 pb-20 sm:px-10 ${showThumbs ? "pl-36 sm:pl-44" : ""} ${showToc || showSearch ? "pr-80" : ""}`}
        data-bg={customBg ? "custom" : undefined}
        style={customBg ? ({ ["--fb-bg" as string]: customBg } as React.CSSProperties) : undefined}
      >
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
          <div className="flipbook-book relative mx-auto flex h-full max-w-6xl items-center justify-center">
            <div className="flipbook-shadow" aria-hidden="true" />
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
                  {overlayList
                    .filter((o) => o.page === i + 1)
                    .map((o) => (
                      <OverlayItem
                        key={o.id}
                        overlay={o}
                        onJump={goToPage}
                        onOpen={setLightbox}
                      />
                    ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Side panels */}
      {status === "ready" && pages && showThumbs && (
        <ThumbnailStrip pages={pages} current={current} onSelect={goToPage} />
      )}
      {status === "ready" && showToc && outline.length > 0 && (
        <TocPanel
          outline={outline}
          onSelect={(p) => {
            goToPage(p);
            setShowToc(false);
          }}
          onClose={() => setShowToc(false)}
        />
      )}
      {status === "ready" && showSearch && (
        <SearchPanel
          pageTexts={pageTexts}
          onSelect={(p) => goToPage(p)}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Toolbar */}
      {status === "ready" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center pb-4">
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1 rounded-full border border-slate-700/60 bg-slate-900/90 px-3 py-2 shadow-xl backdrop-blur">
            <ToolbarButton
              label="Thumbnails"
              active={showThumbs}
              onClick={() => setShowThumbs((v) => !v)}
            >
              <ThumbsIcon />
            </ToolbarButton>
            {outline.length > 0 && (
              <ToolbarButton
                label="Table of contents"
                active={showToc}
                onClick={() => {
                  setShowSearch(false);
                  setShowToc((v) => !v);
                }}
              >
                <TocIcon />
              </ToolbarButton>
            )}
            <ToolbarButton
              label="Search inside"
              active={showSearch}
              onClick={() => {
                setShowToc(false);
                setShowSearch((v) => !v);
              }}
            >
              <SearchIcon />
            </ToolbarButton>

            <div className="mx-1 h-5 w-px bg-slate-700" />

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

            <ToolbarButton
              label={autoplay ? "Stop autoplay" : "Autoplay"}
              active={autoplay}
              onClick={() => setAutoplay((v) => !v)}
            >
              {autoplay ? <PauseIcon /> : <PlayIcon />}
            </ToolbarButton>
            <ToolbarButton label="Zoom" onClick={() => setZoomOpen(true)}>
              <ZoomIcon />
            </ToolbarButton>
            <ToolbarButton
              label={muted ? "Unmute page-flip sound" : "Mute page-flip sound"}
              onClick={toggleMuted}
            >
              <SoundIcon muted={muted} />
            </ToolbarButton>

            <div className="mx-1 h-5 w-px bg-slate-700" />

            {shareUrl && (
              <ToolbarButton label="Share" onClick={() => setShareOpen(true)}>
                <ShareIcon />
              </ToolbarButton>
            )}
            {isOwner && bookId && (
              <ToolbarButton label="Add video / links / layers" onClick={() => setEditOpen(true)}>
                <LayersIcon />
              </ToolbarButton>
            )}
            {isOwner && bookId && (
              <ToolbarButton label="Customize / branding" onClick={() => setBrandOpen(true)}>
                <BrushIcon />
              </ToolbarButton>
            )}
            {isOwner && bookId && (
              <a
                href={`/book/${bookId}/insights`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-700/70 hover:text-white"
                title="Insights"
                aria-label="View insights"
              >
                <InsightsIcon />
              </a>
            )}
            {showDownload && (
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

      {/* Custom logo, bottom-left (branding) */}
      {brand.logoUrl && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-20">
          {brand.logoLink ? (
            <a
              href={brand.logoLink}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brand.logoUrl}
                alt="Logo"
                className="h-9 w-auto max-w-[170px] object-contain drop-shadow-lg sm:h-11"
              />
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt="Logo"
              className="h-9 w-auto max-w-[170px] object-contain drop-shadow-lg sm:h-11"
            />
          )}
        </div>
      )}

      {shareUrl && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title={title}
          shareUrl={shareUrl}
          embedUrl={embedUrl}
          bookId={bookId}
          isOwner={isOwner}
          visibility={bookVisibility}
          hasPassword={bookHasPassword}
          onPrivacyChange={(v, hp) => {
            setBookVisibility(v);
            setBookHasPassword(hp);
          }}
        />
      )}

      {isOwner && bookId && (
        <BrandingDialog
          open={brandOpen}
          onClose={() => setBrandOpen(false)}
          bookId={bookId}
          branding={brand}
          onChange={setBrand}
        />
      )}

      {isOwner && bookId && editOpen && pages && (
        <OverlayEditor
          bookId={bookId}
          pages={pages}
          overlays={overlayList}
          onChange={setOverlayList}
          onClose={() => setEditOpen(false)}
        />
      )}

      {lightbox && <OverlayLightbox overlay={lightbox} onClose={() => setLightbox(null)} />}

      {zoomOpen && pages && (
        <ZoomOverlay
          pages={pages}
          startIndex={Math.min(current, pages.length - 1)}
          title={title}
          onClose={() => setZoomOpen(false)}
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
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
        active
          ? "text-slate-950"
          : "text-slate-300 hover:bg-slate-700/70 hover:text-white"
      }`}
      style={active ? { background: "var(--fb-accent, #fbbf24)" } : undefined}
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

function ThumbsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
      <rect x="14" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

function TocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <polygon points="6 4 20 12 6 20" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function ZoomIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19" fill="currentColor" stroke="none" />
      {muted ? (
        <>
          <line x1="16" y1="9" x2="22" y2="15" />
          <line x1="22" y1="9" x2="16" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      )}
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function BrushIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
    </svg>
  );
}

function InsightsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
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
