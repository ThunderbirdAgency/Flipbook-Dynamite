"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Visibility } from "@/lib/types";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  shareUrl: string;
  embedUrl?: string;
  bookId?: string;
  isOwner?: boolean;
  visibility?: Visibility;
  hasPassword?: boolean;
  onPrivacyChange?: (visibility: Visibility, hasPassword: boolean) => void;
}

export default function ShareDialog({
  open,
  onClose,
  title,
  shareUrl,
  embedUrl,
  bookId,
  isOwner,
  visibility = "public",
  hasPassword = false,
  onPrivacyChange,
}: ShareDialogProps) {
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
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

        <SharePanel shareUrl={shareUrl} title={title} />

        {isOwner && bookId && (
          <PrivacyPanel
            bookId={bookId}
            visibility={visibility}
            hasPassword={hasPassword}
            onChange={onPrivacyChange}
          />
        )}
      </div>
    </div>
  );
}

function SharePanel({ shareUrl, title }: { shareUrl: string; title: string }) {
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(shareUrl, { width: 320, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((url) => alive && setQr(url))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [shareUrl]);

  const enc = encodeURIComponent(shareUrl);
  const encTitle = encodeURIComponent(title);
  const links: { label: string; href: string }[] = [
    { label: "X", href: `https://twitter.com/intent/tweet?url=${enc}&text=${encTitle}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${encTitle}%20${enc}` },
    { label: "Email", href: `mailto:?subject=${encTitle}&body=${enc}` },
  ];

  return (
    <div className="mt-2 border-t border-slate-800 pt-5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Share</span>
      <div className="mt-3 flex items-start gap-4">
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-amber-400/60 hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </div>
        {qr && (
          <div className="ml-auto shrink-0 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code" className="h-24 w-24 rounded-lg bg-white p-1" />
            <a
              href={qr}
              download="flipbook-qr.png"
              className="mt-1 block text-[11px] text-amber-400 hover:underline"
            >
              Download QR
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function PrivacyPanel({
  bookId,
  visibility,
  hasPassword,
  onChange,
}: {
  bookId: string;
  visibility: Visibility;
  hasPassword: boolean;
  onChange?: (visibility: Visibility, hasPassword: boolean) => void;
}) {
  const [vis, setVis] = useState<Visibility>(visibility);
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setStatus("idle");
    setError("");
    const body: Record<string, unknown> = { visibility: vis };
    if (clearPassword) body.password = null;
    else if (password) body.password = password;

    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Save failed (${res.status})`);
      }
      const nextHasPassword = clearPassword ? false : password ? true : hasPassword;
      setStatus("saved");
      setPassword("");
      setClearPassword(false);
      onChange?.(vis, nextHasPassword);
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 border-t border-slate-800 pt-5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Privacy
      </span>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <VisibilityOption
          label="Public"
          hint="Anyone with the link"
          active={vis === "public"}
          onClick={() => setVis("public")}
        />
        <VisibilityOption
          label="Private"
          hint="Only you or with a password"
          active={vis === "private"}
          onClick={() => setVis("private")}
        />
      </div>

      <div className="mt-4">
        <label className="text-xs font-medium text-slate-400">
          {hasPassword ? "Change password" : "Set a viewing password"}{" "}
          <span className="text-slate-600">(optional)</span>
        </label>
        <input
          type="password"
          value={password}
          disabled={clearPassword}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={hasPassword ? "•••••••• (unchanged)" : "Leave blank for none"}
          className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/60 disabled:opacity-40"
        />
        {hasPassword && (
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={clearPassword}
              onChange={(e) => setClearPassword(e.target.checked)}
              className="accent-amber-400"
            />
            Remove the password
          </label>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs">
          {status === "saved" && <span className="text-emerald-400">Saved ✓</span>}
          {status === "error" && <span className="text-red-400">{error}</span>}
        </span>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save privacy"}
        </button>
      </div>
    </div>
  );
}

function VisibilityOption({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left transition ${
        active
          ? "border-amber-400 bg-amber-400/10"
          : "border-slate-700 bg-slate-950 hover:border-slate-600"
      }`}
    >
      <span className={`block text-sm font-medium ${active ? "text-amber-300" : "text-white"}`}>
        {label}
      </span>
      <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
    </button>
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
