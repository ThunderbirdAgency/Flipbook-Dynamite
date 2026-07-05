"use client";

import { useState } from "react";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  shareUrl: string;
  embedUrl?: string;
}

export default function ShareDialog({ open, onClose, title, shareUrl, embedUrl }: ShareDialogProps) {
  if (!open) return null;

  const embedCode = embedUrl
    ? `<iframe src="${embedUrl}" width="100%" height="600" style="border:0;border-radius:8px;" allowfullscreen loading="lazy" title="${title.replace(/"/g, "&quot;")}"></iframe>`
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${title}`}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Share this flipbook</h2>
            <p className="mt-0.5 text-sm text-slate-400">{title}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <CopyField label="Direct link" value={shareUrl} />
        {embedCode && (
          <CopyField label="Embed on your website" value={embedCode} multiline />
        )}
      </div>
    </div>
  );
}

function CopyField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API can be unavailable (http, permissions); fall back below.
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <button
          onClick={copy}
          className="rounded-md px-2 py-0.5 text-xs font-medium text-amber-400 transition hover:bg-slate-800"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      {multiline ? (
        <textarea
          readOnly
          value={value}
          rows={3}
          onFocus={(e) => e.target.select()}
          className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-300 outline-none focus:border-amber-400/60"
        />
      ) : (
        <input
          readOnly
          value={value}
          onFocus={(e) => e.target.select()}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-300 outline-none focus:border-amber-400/60"
        />
      )}
    </div>
  );
}
