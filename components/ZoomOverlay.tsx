"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RenderedPage, renderPageHiRes } from "@/lib/pdf-client";

interface ZoomOverlayProps {
  pages: RenderedPage[];
  startIndex: number;
  title: string;
  onClose: () => void;
  /** Source PDF, used to re-render the current page crisply for deep zoom. */
  pdfUrl?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

export default function ZoomOverlay({ pages, startIndex, title, onClose, pdfUrl }: ZoomOverlayProps) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1.6);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Crisp on-demand re-render of the current page from the PDF (cached per page).
  const [hiRes, setHiRes] = useState<Record<number, string>>({});
  const urlsRef = useRef<string[]>([]);
  const rendering = Boolean(pdfUrl) && !hiRes[index];

  useEffect(() => {
    if (!pdfUrl || hiRes[index]) return;
    let alive = true;
    renderPageHiRes(pdfUrl, index)
      .then((r) => {
        if (!alive) {
          URL.revokeObjectURL(r.objectUrl);
          return;
        }
        urlsRef.current.push(r.objectUrl);
        setHiRes((prev) => (prev[index] ? prev : { ...prev, [index]: r.objectUrl }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pdfUrl]);

  // Revoke every hi-res object URL when the overlay closes.
  useEffect(() => {
    const urls = urlsRef.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const page = pages[index];

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const step = useCallback(
    (dir: number) => {
      setIndex((i) => Math.min(pages.length - 1, Math.max(0, i + dir)));
      setOffset({ x: 0, y: 0 });
    },
    [pages.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "+" || e.key === "=") setScale((s) => clampScale(s * 1.2));
      if (e.key === "-") setScale((s) => clampScale(s / 1.2));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  if (!page) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/97">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-slate-400">
          {title} — page {index + 1} of {pages.length}
          {hiRes[index] ? (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">HD</span>
          ) : rendering ? (
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">sharpening…</span>
          ) : null}
        </span>
        <div className="flex items-center gap-1">
          <ZoomButton label="Zoom out" onClick={() => setScale((s) => clampScale(s / 1.3))}>−</ZoomButton>
          <span className="w-14 text-center text-xs tabular-nums text-slate-400">
            {Math.round(scale * 100)}%
          </span>
          <ZoomButton label="Zoom in" onClick={() => setScale((s) => clampScale(s * 1.3))}>+</ZoomButton>
          <ZoomButton
            label="Reset zoom"
            onClick={() => {
              setScale(1.6);
              setOffset({ x: 0, y: 0 });
            }}
          >
            ⟲
          </ZoomButton>
          <button
            onClick={onClose}
            className="ml-2 rounded-full bg-slate-800 px-4 py-1.5 text-sm text-white transition hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        onWheel={(e) => setScale((s) => clampScale(s * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setOffset({
            x: drag.current.ox + (e.clientX - drag.current.x),
            y: drag.current.oy + (e.clientY - drag.current.y),
          });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => setScale((s) => (s > 2 ? 1.6 : clampScale(s * 1.8)))}
      >
        <div className="flex h-full items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hiRes[index] || page.objectUrl}
            alt={`Page ${index + 1}`}
            draggable={false}
            className="max-h-full select-none shadow-2xl"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "center center",
              imageRendering: "auto",
            }}
          />
        </div>

        {index > 0 && (
          <PageArrow side="left" onClick={() => step(-1)} />
        )}
        {index < pages.length - 1 && (
          <PageArrow side="right" onClick={() => step(1)} />
        )}
      </div>
    </div>
  );
}

function ZoomButton({
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
      className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-base text-slate-200 transition hover:bg-slate-700"
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function PageArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`absolute top-1/2 ${side === "left" ? "left-4" : "right-4"} -translate-y-1/2 rounded-full bg-slate-800/90 p-3 text-white shadow-lg transition hover:bg-slate-700`}
      aria-label={side === "left" ? "Previous page" : "Next page"}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={side === "left" ? { transform: "scaleX(-1)" } : undefined}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}
