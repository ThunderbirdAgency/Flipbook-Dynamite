"use client";

import { useEffect, useRef } from "react";
import { RenderedPage } from "@/lib/pdf-client";

interface ThumbnailStripProps {
  pages: RenderedPage[];
  current: number;
  onSelect: (index: number) => void;
}

export default function ThumbnailStrip({ pages, current, onSelect }: ThumbnailStripProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);

  return (
    <div className="absolute inset-y-0 left-0 z-30 w-32 overflow-y-auto border-r border-slate-800 bg-slate-950/95 p-3 backdrop-blur sm:w-36">
      <div className="flex flex-col gap-3">
        {pages.map((page, i) => {
          const active = i === current || (current % 2 === 1 && i === current + 1 && i !== 0);
          return (
            <button
              key={i}
              ref={i === current ? activeRef : undefined}
              onClick={() => onSelect(i)}
              className={`overflow-hidden rounded-lg border-2 transition ${
                active ? "border-amber-400" : "border-transparent hover:border-slate-600"
              }`}
              title={`Page ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.objectUrl} alt={`Page ${i + 1} thumbnail`} loading="lazy" className="w-full" />
              <span className={`block py-1 text-center text-[11px] ${active ? "bg-amber-400 font-semibold text-slate-950" : "bg-slate-900 text-slate-400"}`}>
                {i + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
