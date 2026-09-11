"use client";

import { useMemo, useState } from "react";

interface Match {
  pageIndex: number;
  snippet: { before: string; hit: string; after: string };
}

interface SearchPanelProps {
  pageTexts: string[];
  onSelect: (pageIndex: number) => void;
  onClose: () => void;
}

const MAX_RESULTS = 100;

export default function SearchPanel({ pageTexts, onSelect, onClose }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const q = query.trim();

  const results = useMemo<Match[]>(() => {
    if (q.length < 2) return [];
    const needle = q.toLowerCase();
    const out: Match[] = [];
    for (let i = 0; i < pageTexts.length && out.length < MAX_RESULTS; i++) {
      const text = pageTexts[i];
      if (!text) continue;
      const lower = text.toLowerCase();
      let from = 0;
      // up to a few matches per page
      for (let k = 0; k < 3; k++) {
        const idx = lower.indexOf(needle, from);
        if (idx === -1) break;
        const start = Math.max(0, idx - 40);
        const end = Math.min(text.length, idx + needle.length + 60);
        out.push({
          pageIndex: i,
          snippet: {
            before: (start > 0 ? "…" : "") + text.slice(start, idx),
            hit: text.slice(idx, idx + needle.length),
            after: text.slice(idx + needle.length, end) + (end < text.length ? "…" : ""),
          },
        });
        from = idx + needle.length;
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [q, pageTexts]);

  const hasText = pageTexts.some((t) => t && t.length > 0);

  return (
    <div className="absolute inset-y-0 right-0 z-30 flex w-80 flex-col border-l border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <span className="text-sm font-semibold text-white">Search</span>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          aria-label="Close search"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="border-b border-slate-800 p-3">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search inside this book…"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/60"
        />
        {q.length >= 2 && (
          <p className="mt-2 text-xs text-slate-500">
            {results.length === 0
              ? "No matches"
              : `${results.length}${results.length >= MAX_RESULTS ? "+" : ""} match${results.length === 1 ? "" : "es"}`}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {!hasText ? (
          <p className="px-4 py-6 text-center text-xs text-slate-500">
            This PDF has no selectable text, so it can&apos;t be searched.
          </p>
        ) : q.length < 2 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-500">
            Type at least 2 characters to search every page.
          </p>
        ) : (
          results.map((m, i) => (
            <button
              key={i}
              onClick={() => onSelect(m.pageIndex)}
              className="block w-full border-b border-slate-900 px-4 py-2.5 text-left transition hover:bg-slate-800/70"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-amber-400">Page {m.pageIndex + 1}</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-400">
                {m.snippet.before}
                <mark className="rounded bg-amber-400/30 px-0.5 text-amber-100">{m.snippet.hit}</mark>
                {m.snippet.after}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
