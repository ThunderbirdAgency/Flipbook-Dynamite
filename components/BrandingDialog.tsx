"use client";

import { useRef, useState } from "react";
import type { Branding } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  bookId: string;
  branding: Branding;
  onChange: (b: Branding) => void;
}

export default function BrandingDialog({ open, onClose, bookId, branding, onChange }: Props) {
  const [bgColor, setBgColor] = useState(branding.bgColor || "#101521");
  const [accent, setAccent] = useState(branding.accent || "#fbbf24");
  const [logoLink, setLogoLink] = useState(branding.logoLink || "");
  const [seoTitle, setSeoTitle] = useState(branding.seoTitle || "");
  const [seoDescription, setSeoDescription] = useState(branding.seoDescription || "");
  const [allowDownload, setAllowDownload] = useState(branding.allowDownload !== false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [busyAsset, setBusyAsset] = useState<"" | "logo" | "background">("");

  const logoInput = useRef<HTMLInputElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const uploadAsset = async (kind: "logo" | "background", file: File) => {
    setBusyAsset(kind);
    setError("");
    try {
      const res = await fetch(`/api/books/${bookId}/asset/${kind}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      if (data.book?.branding) onChange(data.book.branding as Branding);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusyAsset("");
    }
  };

  const clearAsset = async (kind: "logo" | "background") => {
    setBusyAsset(kind);
    try {
      const res = await fetch(`/api/books/${bookId}/asset/${kind}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (data.book?.branding) onChange(data.book.branding as Branding);
    } finally {
      setBusyAsset("");
    }
  };

  const save = async () => {
    setSaving(true);
    setStatus("idle");
    setError("");
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branding: {
            bgColor,
            accent,
            logoLink: logoLink.trim() || null,
            seoTitle: seoTitle.trim() || null,
            seoDescription: seoDescription.trim() || null,
            allowDownload,
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Save failed (${res.status})`);
      }
      const data = await res.json();
      if (data.book?.branding) onChange(data.book.branding as Branding);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Customize branding"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Customize &amp; brand</h2>
            <p className="mt-0.5 text-sm text-slate-400">
              Make this flipbook your client&apos;s — background, logo, colors, SEO.
            </p>
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

        {/* Background */}
        <Section label="Background">
          <div className="flex flex-wrap items-center gap-3">
            <ColorField label="Color" value={bgColor} onChange={setBgColor} />
            <div className="flex items-center gap-2">
              <button
                onClick={() => bgInput.current?.click()}
                disabled={busyAsset === "background"}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
              >
                {busyAsset === "background"
                  ? "Uploading…"
                  : branding.bgImageUrl
                    ? "Replace image"
                    : "Upload image"}
              </button>
              {branding.bgImageUrl && (
                <button
                  onClick={() => clearAsset("background")}
                  className="text-xs text-slate-400 underline hover:text-red-400"
                >
                  remove
                </button>
              )}
            </div>
          </div>
          {branding.bgImageUrl && (
            <p className="mt-2 text-xs text-slate-500">
              A background image is set — it takes precedence over the color.
            </p>
          )}
          <input
            ref={bgInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadAsset("background", f);
              e.target.value = "";
            }}
          />
        </Section>

        {/* Logo */}
        <Section label="Logo (bottom-left)">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => logoInput.current?.click()}
              disabled={busyAsset === "logo"}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
            >
              {busyAsset === "logo"
                ? "Uploading…"
                : branding.logoUrl
                  ? "Replace logo"
                  : "Upload logo"}
            </button>
            {branding.logoUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logoUrl} alt="Logo preview" className="h-8 w-auto max-w-[120px] rounded bg-white/5 object-contain p-1" />
                <button
                  onClick={() => clearAsset("logo")}
                  className="text-xs text-slate-400 underline hover:text-red-400"
                >
                  remove
                </button>
              </>
            )}
          </div>
          <input
            ref={logoInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadAsset("logo", f);
              e.target.value = "";
            }}
          />
          <label className="mt-3 block text-xs font-medium text-slate-400">Logo links to (optional)</label>
          <input
            value={logoLink}
            onChange={(e) => setLogoLink(e.target.value)}
            placeholder="https://your-client.com"
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/60"
          />
        </Section>

        {/* Accent + SEO */}
        <Section label="Accent color">
          <ColorField label="Accent" value={accent} onChange={setAccent} />
        </Section>

        <Section label="SEO">
          <label className="block text-xs font-medium text-slate-400">Title (search + browser tab)</label>
          <input
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            placeholder="e.g. 2026 Spring Catalog — Acme Co."
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/60"
          />
          <label className="mt-3 block text-xs font-medium text-slate-400">Description</label>
          <textarea
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            rows={2}
            placeholder="A short summary search engines and social previews will show."
            className="mt-1.5 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/60"
          />
        </Section>

        <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={allowDownload}
            onChange={(e) => setAllowDownload(e.target.checked)}
            className="accent-amber-400"
          />
          Allow viewers to download the PDF
        </label>

        <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
          <span className="text-xs">
            {status === "saved" && <span className="text-emerald-400">Saved ✓</span>}
            {status === "error" && <span className="text-red-400">{error}</span>}
            {status === "idle" && error && <span className="text-red-400">{error}</span>}
          </span>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save branding"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 border-t border-slate-800 pt-4 first:border-0 first:pt-0">
      <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-300">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#101521"}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-9 cursor-pointer rounded border border-slate-700 bg-transparent"
        aria-label={label}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-amber-400/60"
      />
    </label>
  );
}
