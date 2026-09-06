"use client";

import { useEffect, useRef, useState } from "react";
import { PrivacyPanel } from "./ShareDialog";
import type { Book } from "@/lib/types";
import type { Branding } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  bookId: string;
  branding: Branding;
  onChange: (b: Branding) => void;
}

export default function BrandingDialog({ open, onClose, bookId, branding, onChange }: Props) {
  const [extra,setExtra]=useState<Branding>(branding);
  const extraField=(key:"ctaLabel"|"ctaUrl"|"faviconUrl",label:string)=><label className="mb-4 block text-sm text-slate-300">{label}<input value={extra[key]||""} onChange={e=>setExtra({...extra,[key]:e.target.value})} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"/></label>;
  const [tab, setTab] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [pageSound, setPageSound] = useState(branding.pageSound !== false);
  const [showThumbnails, setShowThumbnails] = useState(branding.showThumbnails === true);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open) dialog?.showModal();
    return () => dialog?.close();
  }, [open]);
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
      setPreviewVersion(v => v + 1);
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
      if (!res.ok) throw new Error(data.error || "Could not remove this image.");
      if (data.book?.branding) onChange(data.book.branding as Branding);
      setPreviewVersion(v => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove this image.");
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
            ...extra,
            bgColor,
            accent,
            logoLink: logoLink.trim() || null,
            seoTitle: seoTitle.trim() || null,
            seoDescription: seoDescription.trim() || null,
            allowDownload,
            pageSound,
            showThumbnails,
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
      setPreviewVersion(v => v + 1);
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} onCancel={(e) => { e.preventDefault(); onClose(); }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-slate-950 p-0 text-white backdrop:bg-black/75"
      aria-label="Customize flipbook">
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[360px_minmax(0,1fr)] md:grid-rows-1">
        <section aria-label="Flipbook options" className="flex min-h-0 flex-col border-b border-slate-700 bg-slate-900 md:border-b-0 md:border-r">
          <header className="shrink-0 border-b border-slate-700 p-5">
            <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Customize flipbook</h2><button onClick={onClose} aria-label="Close customization" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-800">✕</button></div>
            <div className="mt-4 flex gap-3"><button onClick={save} disabled={saving || Boolean(busyAsset)} className="flex-1 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button><button onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300">Close</button></div>
            <div aria-live="polite" className="mt-2 text-xs">{status === "saved" && <span className="text-emerald-400">Saved ✓</span>}{error && <span role="alert" className="text-red-300">{error}</span>}</div>
          </header>
          <div className="max-h-[42dvh] overflow-y-auto md:max-h-none md:flex-1" aria-label="Customization settings">
            <OptionGroup label="Branding & Style" id="branding" active={tab} onSelect={setTab}>

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

        
        
        <div className="mb-5 flex flex-wrap gap-2" aria-label="Color presets">
        {[["Midnight", "#101521", "#fbbf24"], ["Studio", "#e8edf2", "#2563eb"], ["Forest", "#10251f", "#6ee7b7"], ["Warm paper", "#eee5d6", "#92400e"]].map(([name, bg, color]) => <button key={name} onClick={() => { setBgColor(bg); setAccent(color); }} className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-amber-400"><span className="mr-2 inline-block h-3 w-3 rounded-full border border-slate-500" style={{backgroundColor:bg}} />{name}</button>)}
        </div>
        <Section label="Accent color"><ColorField label="Accent" value={accent} onChange={setAccent} /></Section>
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

        
        {extraField("ctaLabel","Call-to-action button label")}
        {extraField("ctaUrl","Call-to-action destination (https://…)")}
        {extraField("faviconUrl","Favicon image URL (https://…)")}
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

        
            </OptionGroup>
            <OptionGroup label="Controls" id="reader" active={tab} onSelect={setTab}>

        <p className="mb-5 text-sm leading-6 text-slate-400">Choose the starting experience. Readers can still mute sound or open thumbnails themselves.</p>
        <label className="mb-5 flex items-center gap-3 text-sm"><input type="checkbox" checked={pageSound} onChange={e => setPageSound(e.target.checked)} className="accent-amber-400" />Start with paper sound enabled</label>
        <label className="mb-5 flex items-center gap-3 text-sm"><input type="checkbox" checked={showThumbnails} onChange={e => setShowThumbnails(e.target.checked)} className="accent-amber-400" />Open with page thumbnails visible</label>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={allowDownload}
            onChange={(e) => setAllowDownload(e.target.checked)}
            className="accent-amber-400"
          />
          Allow viewers to download the PDF
        </label>

        {([["allowShare","Share"],["allowSearch","Search"],["allowZoom","Zoom"],["allowFullscreen","Fullscreen"],["allowThumbnails","Thumbnails control"],["allowToc","Table of contents control"],["allowAutoplay","Auto page turn control"]] as const).map(([key,label])=><label key={key} className="mt-4 flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" checked={extra[key]!==false} onChange={e=>setExtra({...extra,[key]:e.target.checked})}/>{label}</label>)}
        
            </OptionGroup>
            <OptionGroup label="Privacy" id="privacy" active={tab} onSelect={setTab}>
<BookPrivacy bookId={bookId} />
            </OptionGroup>
            <OptionGroup label="Table of Contents" id="toc" active={tab} onSelect={setTab}>
<p className="mb-4 text-xs text-slate-400">Use custom headings below, or leave empty to use the PDF’s own contents. Page numbers start at 1.</p>{(extra.toc||[]).map((entry,i)=><div key={i} className="mb-3 flex gap-2"><input aria-label={`Heading ${i+1}`} value={entry.title} onChange={e=>setExtra({...extra,toc:extra.toc!.map((v,n)=>n===i?{...v,title:e.target.value}:v)})} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 p-2 text-sm"/><input aria-label={`Page for heading ${i+1}`} type="number" min="1" value={entry.pageIndex+1} onChange={e=>setExtra({...extra,toc:extra.toc!.map((v,n)=>n===i?{...v,pageIndex:Math.max(0,Number(e.target.value)-1)}:v)})} className="w-16 rounded border border-slate-700 bg-slate-950 p-2 text-sm"/><button aria-label={`Remove heading ${i+1}`} onClick={()=>setExtra({...extra,toc:extra.toc!.filter((_,n)=>i!==n)})}>✕</button></div>)}<button className="text-sm text-amber-400" onClick={()=>setExtra({...extra,toc:[...(extra.toc||[]),{title:"New heading",pageIndex:0,depth:0}]})}>＋ Add heading</button>
            </OptionGroup>
            <OptionGroup label="Layout & Interaction" id="layout" active={tab} onSelect={setTab}>
<label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={extra.showCover!==false} onChange={e=>setExtra({...extra,showCover:e.target.checked})}/>Separate front cover</label><label className="mt-5 block text-sm">Shadow depth<input type="range" min="0" max="1" step="0.1" value={extra.shadow??0.4} onChange={e=>setExtra({...extra,shadow:Number(e.target.value)})} className="mt-3 w-full"/></label><p className="mt-5 text-sm text-slate-400">Responsive page layout adapts to the reader’s screen.</p>
            </OptionGroup>

            <a href={`/book/${bookId}?edit=1`} className="block border-b border-slate-700 px-5 py-5 text-sm font-medium text-amber-300">Add video, links, etc. ↗</a>
          </div>
        </section>
        <aside className="flex min-h-0 min-w-0 flex-col bg-slate-950 p-3 sm:p-5">
          <div className="mb-3 flex shrink-0 items-center justify-between"><h3 className="text-sm text-slate-400">Book preview</h3><a href={`/book/${bookId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-400">Open full size ↗</a></div>
          <iframe key={previewVersion} src={`/embed/${bookId}?preview=1`} title="Saved flipbook preview" className="min-h-0 w-full flex-1 rounded-xl border border-slate-800" allowFullScreen />
          <p className="mt-3 shrink-0 text-xs text-slate-500">Preview shows saved settings. Save changes to update the book.</p>
        </aside>
      </div>
    </dialog>
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

function OptionGroup({label,id,active,onSelect,children}:{label:string;id:string;active:string;onSelect:(id:string)=>void;children:React.ReactNode}) {
  const expanded=active===id;
  return <section className="border-b border-slate-700"><h3><button aria-expanded={expanded} aria-controls={`options-${id}`} onClick={()=>onSelect(expanded?"":id)} className={`flex w-full items-center justify-between px-5 py-5 text-left text-sm font-semibold ${expanded?"bg-slate-800 text-amber-300":"text-slate-200 hover:bg-slate-800/60"}`}>{label}<span aria-hidden="true">{expanded?"−":"+"}</span></button></h3><div id={`options-${id}`} hidden={!expanded} className="px-5 py-5">{expanded && children}</div></section>;
}
function BookPrivacy({bookId}:{bookId:string}) {
 const [book,setBook]=useState<Book|null>(null),[error,setError]=useState("");
 useEffect(()=>{let alive=true;fetch(`/api/books/${bookId}`).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"Could not load privacy settings.");if(alive)setBook(d.book);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[bookId]);
 if(error)return <p role="alert" className="text-sm text-red-300">{error}</p>;
 if(!book)return <p className="text-sm text-slate-400">Loading privacy settings…</p>;
 return <PrivacyPanel bookId={bookId} visibility={book.visibility} hasPassword={book.hasPassword} onChange={(visibility,hasPassword)=>setBook({...book,visibility,hasPassword})}/>;
}
