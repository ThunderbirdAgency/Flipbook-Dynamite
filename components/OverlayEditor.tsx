"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Branding, Overlay, OverlayType } from "@/lib/types";
import type { RenderedPage } from "@/lib/pdf-client";

interface Props {
  bookId: string;
  title: string;
  branding: Branding;
  onMetadataChange: (branding: Branding) => void;
  pages: RenderedPage[];
  overlays: Overlay[];
  onChange: (overlays: Overlay[]) => void;
  onClose: () => void;
}

const newId = () => Math.random().toString(36).slice(2, 10);

const DEFAULTS: Record<OverlayType, Partial<Overlay>> = {
  video: { w: 42, h: 28, display: "popup", label: "" },
  image: { w: 30, h: 22, display: "inline" },
  link: { w: 26, h: 10 },
  iframe: { w: 42, h: 30, display: "inline" },
};

export default function OverlayEditor({ bookId, title, branding, onMetadataChange, pages, overlays, onChange, onClose }: Props) {
  const router=useRouter();
  const [details,setDetails]=useState(false);
  const [publicationTitle,setPublicationTitle]=useState(title);
  const [seoTitle,setSeoTitle]=useState(branding.seoTitle||"");
  const [seoDescription,setSeoDescription]=useState(branding.seoDescription||"");
  const [list, setList] = useState<Overlay[]>(overlays);
  const [pageIdx, setPageIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const page = pages[pageIdx];
  const pageNum = pageIdx + 1;
  const current = list.filter((o) => o.page === pageNum);
  const sel = list.find((o) => o.id === selected) || null;

  const update = useCallback((id: string, patch: Partial<Overlay>) => {
    setList((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  const add = (type: OverlayType, display?: "inline"|"popup") => {
    setDetails(false);
    const o: Overlay = {
      id: newId(),
      page: pageNum,
      x: 30,
      y: 34,
      w: 30,
      h: 20,
      type,
      url: "",
      ...DEFAULTS[type],
      ...(display ? {display} : {}),
    };
    setList((prev) => [...prev, o]);
    setSelected(o.id);
  };

  const remove = (id: string) => {
    setList((prev) => prev.filter((o) => o.id !== id));
    if (selected === id) setSelected(null);
  };

  // Drag / resize in % of the page canvas.
  const startDrag = (
    e: React.PointerEvent,
    id: string,
    mode: "move" | "resize"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    const o = list.find((x) => x.id === id);
    if (!rect || !o) return;
    setSelected(id);
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { x: o.x, y: o.y, w: o.w, h: o.h };

    const onMove = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      if (mode === "move") {
        update(id, {
          x: Math.max(0, Math.min(100 - orig.w, orig.x + dx)),
          y: Math.max(0, Math.min(100 - orig.h, orig.y + dy)),
        });
      } else {
        update(id, {
          w: Math.max(4, Math.min(100 - orig.x, orig.w + dx)),
          h: Math.max(3, Math.min(100 - orig.y, orig.h + dy)),
        });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const uploadImage = async (file: File) => {
    if (!sel) return;
    setUploading(true);
    setError("");
    try {
      const res = await fetch(`/api/books/${bookId}/asset/ovl-${sel.id}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      update(sel.id, { url: data.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
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
        body: JSON.stringify({ overlays: list, title:publicationTitle, branding:{seoTitle:seoTitle.trim()||null,seoDescription:seoDescription.trim()||null} }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Save failed (${res.status})`);
      }
      const data = await res.json();
      const saved = (data.book?.overlays as Overlay[]) ?? list;
      if(data.book?.branding) onMetadataChange(data.book.branding);
      router.refresh();
      setList(saved);
      onChange(saved);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const aspect = page ? `${page.baseWidth} / ${page.baseHeight}` : "3 / 4";

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit flipbook" className="fixed inset-0 z-[70] flex flex-col bg-slate-950 text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white">Add interactive elements</span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
            {list.length} on {new Set(list.map((o) => o.page)).size} page
            {new Set(list.map((o) => o.page)).size === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs">
            {status === "saved" && <span className="text-emerald-400">Saved ✓</span>}
            {(status === "error" || error) && <span className="text-red-400">{error}</span>}
          </span>
          <button
            onClick={save}
            disabled={saving || uploading || !publicationTitle.trim()}
            className="rounded-lg bg-brand-400 px-4 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-brand-300 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-x-auto">
        <aside aria-label="Add elements" className="w-44 shrink-0 overflow-y-auto border-r border-slate-700 bg-slate-900 p-3">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Add to page {pageNum}</h2>
          <div className="space-y-2"><AddBtn label="Video" hint="YouTube · Vimeo · MP4" onClick={()=>add("video")}/><AddBtn label="Link" hint="Website or page" onClick={()=>add("link")}/><AddBtn label="Inline image" hint="Place on the page" onClick={()=>add("image","inline")}/><AddBtn label="Pop-up image" hint="Open on click" onClick={()=>add("image","popup")}/><AddBtn label="Animated GIF" hint="Add motion" onClick={()=>add("image","inline")}/><AddBtn label="Forms & embeds" hint="Embed a hosted form" onClick={()=>add("iframe")}/></div>
          <button onClick={()=>setDetails(true)} className="mt-5 w-full rounded-lg border border-brand-400/40 px-3 py-3 text-left text-sm text-brand-300">Title & SEO</button>
        </aside>
        <nav aria-label="Page thumbnails" className="w-24 shrink-0 space-y-3 overflow-y-auto border-r border-slate-800 bg-slate-900/40 p-3">{pages.map((p,i)=><button key={i} aria-label={`Edit page ${i+1}`} aria-current={pageIdx===i?"page":undefined} onClick={()=>{setPageIdx(i);setSelected(null);}} className={`block w-full rounded-lg border-2 p-1 ${pageIdx===i?"border-brand-400":"border-transparent hover:border-slate-600"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.objectUrl} alt="" className="w-full bg-white"/><span className="mt-1 block text-xs text-slate-400">{i+1}</span></button>)}</nav>
        {/* Canvas */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto p-4">
          <div
            ref={canvasRef}
            className="relative max-h-full w-auto select-none bg-white shadow-2xl"
            style={{ aspectRatio: aspect, height: "min(74vh, 900px)", maxWidth:"100%" }}
            onPointerDown={() => setSelected(null)}
          >
            {page && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.objectUrl} alt={`Page ${pageNum}`} className="pointer-events-none h-full w-full object-fill" draggable={false} />
            )}
            {current.map((o) => (
              <EditBox
                key={o.id}
                o={o}
                selected={o.id === selected}
                onSelect={() => {setDetails(false);setSelected(o.id);}}
                onStartMove={(e) => startDrag(e, o.id, "move")}
                onStartResize={(e) => startDrag(e, o.id, "resize")}
              />
            ))}
          </div>

          {/* Page nav */}
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <button
              onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
              disabled={pageIdx === 0}
              className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <span className="tabular-nums">
              Page {pageNum} / {pages.length}
            </span>
            <button
              onClick={() => setPageIdx((p) => Math.min(pages.length - 1, p + 1))}
              disabled={pageIdx >= pages.length - 1}
              className="rounded-md border border-slate-700 px-3 py-1 disabled:opacity-40"
            >
              Next ›
            </button>
          </div>
        </div>

        <aside aria-label="Element and publication settings" className="w-80 shrink-0 overflow-y-auto border-l border-slate-700 bg-slate-900 p-4"><div className="flex gap-2 border-b border-slate-700 pb-3"><button onClick={()=>setDetails(false)} className={`rounded px-3 py-2 text-sm ${!details?"bg-slate-700 text-white":"text-slate-400"}`}>Element settings</button><button onClick={()=>setDetails(true)} className={`rounded px-3 py-2 text-sm ${details?"bg-slate-700 text-white":"text-slate-400"}`}>Title & SEO</button></div>{details ? <div className="mt-5 space-y-5"><h2 className="text-lg font-semibold">Title & SEO</h2><label className="block text-sm text-slate-300">Publication title<input required maxLength={200} value={publicationTitle} onChange={e=>setPublicationTitle(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"/></label><label className="block text-sm text-slate-300">SEO title<input maxLength={200} value={seoTitle} onChange={e=>setSeoTitle(e.target.value)} placeholder={publicationTitle} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"/></label><p className="text-xs text-slate-500">Used in the browser tab and search/social previews. Leave blank to use the publication title.</p><label className="block text-sm text-slate-300">SEO description<textarea maxLength={320} rows={5} value={seoDescription} onChange={e=>setSeoDescription(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"/></label><p className="text-xs text-slate-500">{seoDescription.length}/320 characters. Private and password-protected books keep their titles and descriptions hidden from search previews.</p><div className="rounded-lg border border-slate-700 p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Search preview</p><p className="mt-3 break-words text-lg text-blue-300">{seoTitle||publicationTitle}</p><p className="mt-2 break-words text-sm text-slate-400">{seoDescription||'Add a short description of this publication.'}</p></div></div> : <>          <div className="mt-5">
            {!sel ? (
              <p className="text-sm text-slate-500">
                Select a layer on the page to edit it, or add one above. Drag to move; drag the
                corner to resize.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold capitalize text-white">{sel.type} layer</span>
                  <button
                    onClick={() => remove(sel.id)}
                    className="text-xs text-red-400 underline hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>

                {sel.type === "image" ? (
                  <div>
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-50"
                    >
                      {uploading ? "Uploading…" : sel.url ? "Replace image / GIF" : "Upload image / GIF"}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadImage(f);
                        e.target.value = "";
                      }}
                    />
                    <p className="mt-1 text-xs text-slate-500">…or paste an image URL below.</p>
                  </div>
                ) : null}

                <label className="block text-xs font-medium text-slate-400">
                  {sel.type === "link"
                    ? "Link URL (or #12 to jump to a page)"
                    : sel.type === "video"
                      ? "Video URL"
                      : sel.type === "iframe"
                        ? "Embed URL"
                        : "Image URL"}
                </label>
                <input
                  value={sel.url || ""}
                  onChange={(e) => update(sel.id, { url: e.target.value })}
                  placeholder={
                    sel.type === "video" ? "https://youtube.com/watch?v=…" : "https://…"
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-400/60"
                />

                <label className="block text-xs font-medium text-slate-400">Label (optional)</label>
                <input
                  value={sel.label || ""}
                  onChange={(e) => update(sel.id, { label: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-400/60"
                />

                {(sel.type === "video" || sel.type === "iframe" || sel.type === "image") && (
                  <div>
                    <span className="block text-xs font-medium text-slate-400">Display</span>
                    <div className="mt-1.5 flex gap-2">
                      {(["popup", "inline"] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => update(sel.id, { display: d })}
                          className={`flex-1 rounded-lg border px-3 py-1.5 text-sm capitalize transition ${
                            (sel.display || (sel.type === "image" ? "inline" : "popup")) === d
                              ? "border-brand-400 bg-brand-400/10 text-brand-300"
                              : "border-slate-700 text-slate-300 hover:border-slate-500"
                          }`}
                        >
                          {d === "popup" ? "Pop-up" : "Inline"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2 pt-1 text-center text-[11px] text-slate-500">
                  {(["x", "y", "w", "h"] as const).map((k) => (
                    <div key={k}>
                      <div className="uppercase">{k}</div>
                      <input aria-label={`${k.toUpperCase()} percent`} type="number" min={k==='w'||k==='h'?1:0} max="100" step="0.1" value={Math.round(sel[k]*10)/10} onChange={e=>update(sel.id,{[k]:Math.max(k==='w'||k==='h'?1:0,Math.min(100,Number(e.target.value)))})} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-slate-200"/>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
</>}</aside>
      </div>
    </div>
  );
}

function EditBox({
  o,
  selected,
  onSelect,
  onStartMove,
  onStartResize,
}: {
  o: Overlay;
  selected: boolean;
  onSelect: () => void;
  onStartMove: (e: React.PointerEvent) => void;
  onStartResize: (e: React.PointerEvent) => void;
}) {
  const color =
    o.type === "video" ? "#ef4444" : o.type === "image" ? "#22c55e" : o.type === "link" ? "#f59e0b" : "#6366f1";
  return (
    <div
      onPointerDown={(e) => {
        onSelect();
        onStartMove(e);
      }}
      className="absolute cursor-move"
      style={{
        left: `${o.x}%`,
        top: `${o.y}%`,
        width: `${o.w}%`,
        height: `${o.h}%`,
        outline: `2px solid ${color}`,
        background: `${color}22`,
        boxShadow: selected ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : "none",
      }}
    >
      <span
        className="absolute left-0 top-0 -translate-y-full rounded-t px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white"
        style={{ background: color }}
      >
        {o.type}
      </span>
      <span
        onPointerDown={onStartResize}
        className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-full border-2 border-white"
        style={{ background: color }}
      />
    </div>
  );
}

function AddBtn({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-left transition hover:border-brand-400/60 hover:bg-slate-900"
    >
      <span className="block text-sm font-medium text-white">{label}</span>
      <span className="mt-0.5 block text-[11px] text-slate-500">{hint}</span>
    </button>
  );
}
