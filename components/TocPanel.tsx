"use client";

import { OutlineItem } from "@/lib/pdf-client";

interface TocPanelProps {
  outline: OutlineItem[];
  onSelect: (pageIndex: number) => void;
  onClose: () => void;
}

export default function TocPanel({ outline, onSelect, onClose }: TocPanelProps) {
  return (
    <div className="absolute inset-y-0 right-0 z-30 flex w-72 flex-col border-l border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <span className="text-sm font-semibold text-white">Contents</span>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          aria-label="Close contents"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {outline.map((item, i) => (
          <button
            key={i}
            onClick={() => onSelect(item.pageIndex)}
            className="flex w-full items-baseline justify-between gap-2 px-4 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-800/70 hover:text-white"
            style={{ paddingLeft: `${16 + item.depth * 14}px` }}
          >
            <span className="truncate">{item.title}</span>
            <span className="shrink-0 text-xs tabular-nums text-slate-500">{item.pageIndex + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
