"use client";

import { useEffect, useState } from "react";
import { getPageCount } from "@/lib/pdf-client";
import type { BookStats } from "@/lib/types";

export default function InsightsClient({ id, pdfUrl }: { id: string; pdfUrl: string }) {
  const [stats, setStats] = useState<BookStats | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // The page count sizes the reach funnel; read it straight from the PDF.
        let pages = 0;
        try {
          pages = await getPageCount(pdfUrl);
        } catch {
          pages = 0;
        }
        const res = await fetch(`/api/books/${id}/analytics?pages=${pages}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Failed to load analytics (${res.status})`);
        }
        const data = await res.json();
        if (alive) {
          setStats(data.stats as BookStats);
          setStatus("ready");
        }
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Failed to load analytics");
          setStatus("error");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, pdfUrl]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-slate-400">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-amber-400" />
        <span className="text-sm">Crunching the numbers…</span>
      </div>
    );
  }

  if (status === "error" || !stats) {
    return <p className="px-6 py-24 text-center text-sm text-red-400">{error}</p>;
  }

  const completion =
    stats.pageCount > 0 && stats.uniqueVisitors > 0
      ? Math.round(((stats.pagesReached[stats.pageCount - 1] ?? 0) / stats.uniqueVisitors) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total views" value={stats.totalViews.toLocaleString()} />
        <Stat label="Unique visitors" value={stats.uniqueVisitors.toLocaleString()} />
        <Stat
          label="Reached the end"
          value={`${completion}%`}
          hint={`${stats.pagesReached[stats.pageCount - 1] ?? 0} of ${stats.uniqueVisitors}`}
        />
        <Stat
          label="Last viewed"
          value={stats.lastViewedAt ? relativeTime(stats.lastViewedAt) : "—"}
        />
      </div>

      <section className="mt-10">
        <h2 className="mb-1 text-sm font-semibold text-white">Page reach</h2>
        <p className="mb-4 text-xs text-slate-500">
          How many unique visitors made it to each page — where readers drop off.
        </p>

        {stats.pageCount === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-800 py-10 text-center text-sm text-slate-500">
            No page data yet. Reach comes in once people start reading.
          </p>
        ) : (
          <div className="space-y-1.5">
            {stats.pagesReached.map((reached, i) => {
              const pct =
                stats.uniqueVisitors > 0
                  ? Math.round((reached / stats.uniqueVisitors) * 100)
                  : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-500">
                    p.{i + 1}
                  </span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-slate-900">
                    <div
                      className="h-full rounded bg-gradient-to-r from-amber-500 to-amber-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-xs tabular-nums text-slate-400">
                    {reached} · {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="mt-8 text-xs text-slate-600">
        Visitors are counted anonymously (a one-way hash of network + browser) — no
        personal data is stored.
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
