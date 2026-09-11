"use client";

import { useState } from "react";

/** Password prompt shown before a protected book renders. */
export default function UnlockGate({ id, title }: { id: string; title: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/books/${id}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Incorrect password");
      }
      // The unlock cookie is set — reload so the server re-gates and renders.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect password");
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-950 px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center"
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-400">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-white">This flipbook is protected</h1>
        <p className="mt-1 truncate text-sm text-slate-400" title={title}>
          {title}
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter password"
          className="mt-5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-center text-sm text-white outline-none focus:border-amber-400/60"
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
