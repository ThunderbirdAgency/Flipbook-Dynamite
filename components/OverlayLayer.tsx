"use client";

import type { Overlay } from "@/lib/types";
import { resolveVideo } from "@/lib/overlays";

const boxStyle = (o: Overlay): React.CSSProperties => ({
  position: "absolute",
  left: `${o.x}%`,
  top: `${o.y}%`,
  width: `${o.w}%`,
  height: `${o.h}%`,
});

// StPageFlip listens for pointer drags to turn pages; stop overlay interactions
// from bubbling so clicking a hotspot/video never starts a page flip.
const stop = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
};

export function OverlayItem({
  overlay,
  onJump,
  onOpen,
}: {
  overlay: Overlay;
  onJump: (pageIndex: number) => void;
  onOpen: (o: Overlay) => void;
}) {
  const o = overlay;
  const url = o.url || "";

  // Custom link: `#12` / `#page-12` jumps within the book; otherwise external.
  if (o.type === "link") {
    const internal = /^#(?:page-)?(\d+)$/.exec(url.trim());
    if (internal) {
      const pageIndex = Math.max(0, parseInt(internal[1], 10) - 1);
      return (
        <a
          href={`#page-${pageIndex + 1}`}
          className="fb-link fb-overlay-link"
          style={boxStyle(o)}
          title={o.label || `Go to page ${pageIndex + 1}`}
          {...stop}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onJump(pageIndex);
          }}
        />
      );
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="fb-link fb-overlay-link"
        style={boxStyle(o)}
        title={o.label || url}
        {...stop}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  if (o.type === "image") {
    // Inline image / GIF layer placed on the page.
    return (
      <div style={boxStyle(o)} className="fb-overlay" {...stop}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={o.label || ""}
          className="h-full w-full object-contain"
          draggable={false}
        />
      </div>
    );
  }

  if (o.type === "video") {
    if (o.display === "inline") {
      return (
        <div style={boxStyle(o)} className="fb-overlay overflow-hidden rounded" {...stop}>
          <VideoEmbed url={url} autoplay={false} />
        </div>
      );
    }
    // popup (default): a play affordance that opens the lightbox
    return (
      <button
        style={boxStyle(o)}
        className="fb-overlay group flex items-center justify-center rounded bg-black/20 ring-1 ring-white/40 backdrop-blur-[1px] transition hover:bg-black/35"
        title={o.label || "Play video"}
        {...stop}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(o);
        }}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg transition group-hover:scale-110">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 4 20 12 6 20" />
          </svg>
        </span>
      </button>
    );
  }

  // iframe
  if (o.display === "inline") {
    return (
      <div style={boxStyle(o)} className="fb-overlay overflow-hidden rounded" {...stop}>
        <iframe
          src={url}
          className="h-full w-full border-0"
          allow="fullscreen; clipboard-write"
          title={o.label || "Embedded content"}
        />
      </div>
    );
  }
  return (
    <button
      style={boxStyle(o)}
      className="fb-overlay flex items-center justify-center rounded bg-black/20 ring-1 ring-white/40 transition hover:bg-black/35"
      title={o.label || "Open"}
      {...stop}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(o);
      }}
    >
      <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-900 shadow">
        Open
      </span>
    </button>
  );
}

function VideoEmbed({ url, autoplay }: { url: string; autoplay: boolean }) {
  const v = resolveVideo(url);
  if (v.kind === "youtube") {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${v.id}?rel=0${autoplay ? "&autoplay=1" : ""}`}
        className="h-full w-full border-0"
        allow="accelerometer; autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        title="YouTube video"
      />
    );
  }
  if (v.kind === "vimeo") {
    return (
      <iframe
        src={`https://player.vimeo.com/video/${v.id}${autoplay ? "?autoplay=1" : ""}`}
        className="h-full w-full border-0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        title="Vimeo video"
      />
    );
  }
  return (
    <video src={v.url} controls autoPlay={autoplay} className="h-full w-full bg-black" />
  );
}

/** Full-screen lightbox for popup video / iframe / image overlays. */
export function OverlayLightbox({ overlay, onClose }: { overlay: Overlay; onClose: () => void }) {
  const url = overlay.url || "";
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        aria-label="Close"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div
        className="aspect-video w-full max-w-5xl overflow-hidden rounded-xl bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {overlay.type === "video" ? (
          <VideoEmbed url={url} autoplay />
        ) : overlay.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={overlay.label || ""} className="h-full w-full object-contain" />
        ) : (
          <iframe src={url} className="h-full w-full border-0" allow="fullscreen; clipboard-write" title={overlay.label || "Embedded content"} />
        )}
      </div>
    </div>
  );
}
