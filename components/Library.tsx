"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Book } from "@/lib/types";
import type { Workspace } from "@/lib/workspace";
import { renderFirstPage } from "@/lib/pdf-client";
import ShareDialog from "./ShareDialog";
import BrandingDialog from "./BrandingDialog";

const field = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400";
const button = "rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-40";
async function request(url: string, method = "GET", body?: object) {
 const res = await fetch(url, { method, cache: "no-store", ...(body ? {headers:{"Content-Type":"application/json"},body:JSON.stringify(body)} : {}) });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(data.error || "We couldn't save that change. Please try again.");
 return data;
}
type Form = { kind: "folder" | "renameFolder" | "renameBook" | "deleteFolder" | "deleteBook"; id?:string; name:string };
export default function Library() {
 const [books,setBooks] = useState<Book[] | null>(null);
 const [workspace,setWorkspace] = useState<Workspace | null>(null);
 const [loadError,setLoadError] = useState("");
 const [notice,setNotice] = useState("");
 const [error,setError] = useState("");
 const [uploading,setUploading] = useState(false);
 const [stage,setStage] = useState("");
 const [busy,setBusy] = useState(false);
 const [query,setQuery] = useState("");
 const [scope,setScope] = useState("all");
 const [sort,setSort] = useState("newest");
 const [view,setView] = useState<"list" | "grid">("list");
 const [share,setShare] = useState<Book | null>(null);
 const [branding,setBranding] = useState<Book | null>(null);
 const [form,setForm] = useState<Form | null>(null);
 const [formValue,setFormValue] = useState("");
 const [formError,setFormError] = useState("");
 const uploadRef = useRef<HTMLDivElement>(null);
 const refresh = useCallback(async () => {
  try {
   const [library,ws] = await Promise.all([request("/api/books"),request("/api/workspace")]);
   setBooks(library.books); setWorkspace(ws); setLoadError("");
  } catch(e) { setLoadError(e instanceof Error ? e.message : "Could not open your workspace."); }
 },[]);
 useEffect(() => {
  let alive=true;
  Promise.all([request("/api/books"),request("/api/workspace")]).then(([library,ws])=>{
   if(alive) { setBooks(library.books); setWorkspace(ws); setLoadError(""); }
  }).catch(e=>{if(alive) setLoadError(e.message || "Could not open your workspace.");});
  return ()=>{alive=false;};
 },[]);
 const openForm = (f:Form) => { setForm(f); setFormValue(f.name); setFormError(""); };
 const move = async (book:string,folder:string) => {
  setBusy(true); setError("");
  try { await request("/api/workspace","POST",{action:"move",book,folder:folder || null}); await refresh(); setNotice("Folder updated."); }
  catch(e) { setError((e as Error).message); } finally { setBusy(false); }
 };
 const saveForm = async (e:React.FormEvent) => {
  e.preventDefault(); if (!form) return;
  setBusy(true); setFormError("");
  try {
   if (form.kind === "renameBook") await request(`/api/books/${form.id}`,"PATCH",{title:formValue});
   else if (form.kind === "deleteBook") await request(`/api/books/${form.id}`,"DELETE");
   else await request("/api/workspace","POST",{action:form.kind === "folder" ? "create" : form.kind === "renameFolder" ? "rename" : "delete",folder:form.id,label:formValue});
   if (form.kind === "deleteFolder" && scope === form.id) setScope("all");
   setNotice(form.kind === "deleteBook" ? "Flipbook removed." : form.kind === "deleteFolder" ? "Folder removed. Your flipbooks are still in your library." : "Changes saved.");
   setForm(null); await refresh();
  } catch(e) { setFormError((e as Error).message); } finally { setBusy(false); }
 };
 const upload = async (files:FileList) => {
  if(uploading) return;
  const pdfs = Array.from(files).filter(f=>f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  if(!pdfs.length) { setError("Choose a PDF file."); return; }
  setUploading(true); setError(""); setNotice("");
  try {
   for (const [index,file] of pdfs.entries()) {
    const label = `${index+1} of ${pdfs.length}: ${file.name}`;
    setStage(`Preparing ${label}`);
    const data = await request("/api/books","POST",{fileName:file.name,size:file.size});
    setStage(`Uploading ${label}`);
    const up = await fetch(data.upload.url,{method:data.upload.method,headers:{...data.upload.headers,"Content-Type":"application/pdf"},body:file});
    if(!up.ok) throw new Error(`Storage could not accept ${file.name}. Remove the unfinished upload and try again.`);
    setStage(`Verifying ${label}`);
    await request(`/api/books/${data.book.id}/complete`,"POST");
    if(workspace?.folders.some(f=>f.id === scope)) await request("/api/workspace","POST",{action:"move",book:data.book.id,folder:scope});
   }
   setNotice(`${pdfs.length === 1 ? "Your flipbook is" : "Your flipbooks are"} ready. Open, customize, or share below.`);
   if(["pending","private","password","unfiled"].includes(scope)) setScope("all");
   setQuery("");
  } catch(e) { setError((e as Error).message); }
  finally { setUploading(false); setStage(""); await refresh(); }
 };
 const complete = async(book:Book) => {
  setBusy(true); setError("");
  try { await request(`/api/books/${book.id}/complete`,"POST"); setNotice("Upload verified. Your flipbook is ready."); await refresh(); }
  catch(e) { setError((e as Error).message); } finally { setBusy(false); }
 };
 const all = books || [];
 const folders = workspace?.folders || [];
 const placements = workspace?.placements || {};
 const views = workspace?.views || {};
 const activeFolder = folders.find(f=>f.id === scope);
 const scopeNames:Record<string,string> = {all:"All flipbooks",ready:"Published",pending:"Unfinished uploads",private:"Private",password:"Password protected",unfiled:"Unfiled"};
 const visible = all.filter(b => {
  const match = scope === "all" || (scope === "ready" && b.status === "ready") || (scope === "pending" && b.status === "pending") || (scope === "private" && b.visibility === "private") || (scope === "password" && b.hasPassword) || (scope === "unfiled" && !placements[b.id]) || placements[b.id] === scope;
  return match && `${b.title} ${b.fileName}`.toLowerCase().includes(query.toLowerCase());
 }).sort((a,b)=>sort === "name" ? a.title.localeCompare(b.title) : sort === "views" ? (views[b.id] || 0)-(views[a.id] || 0) : sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
 const exportLibrary = () => {
  const cell = (s:unknown) => { let v=String(s ?? ""); if(/^[=+@\-\t\r]/.test(v)) v="'"+v; return '"'+v.replaceAll('"','""')+'"'; };
  const rows = [["Title","Folder","Status","Access","Created","Views","Link"],...visible.map(b=>[b.title,folders.find(f=>f.id === placements[b.id])?.name || "",b.status,b.hasPassword ? "Password protected" : b.visibility,b.createdAt,views[b.id] || 0,b.status === "ready" ? `${location.origin}/book/${b.id}` : ""])];
  const url = URL.createObjectURL(new Blob([rows.map(r=>r.map(cell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a"); a.href=url; a.download="flipbook-library.csv"; a.click(); URL.revokeObjectURL(url);
 };
 return <div className="mx-auto max-w-[1500px] px-4 pb-16 sm:px-8">
  <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-t border-slate-800 pt-8">
   <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-amber-400">Creator workspace</p><h1 className="text-3xl font-semibold tracking-tight text-white">Make every page work harder.</h1><p className="mt-2 text-sm text-slate-400">Your publications, clients, and results. All in one place.</p></div>
   <button onClick={()=>uploadRef.current?.scrollIntoView({behavior:"smooth",block:"center"})} className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-300">＋ Upload PDF</button>
  </div>
  <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
   {[["Published flipbooks",String(all.filter(b=>b.status === "ready").length)],["Total views",String(Object.values(views).reduce((n,v)=>n+v,0))],["Client folders",String(folders.length)],["PDF storage reserved",`${((workspace?.reservedBytes || 0)/1073741824*100).toFixed(0)}%`]].map(([label,value])=><div key={label} className="rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-white">{books === null ? "—" : value}</p></div>)}
  </div>
  <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
   <aside className="self-start rounded-2xl border border-slate-800 bg-slate-900/40 p-3 lg:sticky lg:top-5">
    <nav aria-label="Library filters" className="grid grid-cols-2 gap-1 lg:block">
     {Object.entries(scopeNames).map(([id,label])=><button key={id} onClick={()=>setScope(id)} aria-current={scope === id ? "page" : undefined} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${scope === id ? "bg-amber-400/10 font-medium text-amber-300" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>{label}{id === "all" && <span className="text-xs">{all.length}</span>}{id === "pending" && <span className="text-xs">{all.filter(b=>b.status === "pending").length}</span>}</button>)}
    </nav>
    <div className="mb-2 mt-6 flex items-center justify-between px-3"><h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Private folders</h2><button aria-label="Create folder" onClick={()=>openForm({kind:"folder",name:""})} className="px-2 text-xl text-amber-400">＋</button></div>
    <div className="max-h-72 space-y-1 overflow-y-auto">
     {folders.map(f=><button key={f.id} onClick={()=>setScope(f.id)} aria-current={scope === f.id ? "page" : undefined} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${scope === f.id ? "bg-amber-400/10 text-amber-300" : "text-slate-300 hover:bg-slate-800"}`}><span aria-hidden="true">▱</span><span className="min-w-0 flex-1 truncate">{f.name}</span><span className="text-xs text-slate-500">{all.filter(b=>placements[b.id] === f.id).length}</span></button>)}
     {!folders.length && <p className="px-3 py-2 text-xs leading-5 text-slate-500">Organize publications by client, listing, or project.</p>}
    </div>
    <button onClick={()=>openForm({kind:"folder",name:""})} className="mt-3 w-full rounded-lg border border-dashed border-slate-700 py-2 text-xs text-slate-400 hover:text-white">＋ New folder</button>
    <div className="mt-6 border-t border-slate-800 px-3 pt-4 text-xs leading-5 text-slate-500"><p>{workspace?.bookSlots || 0} / 100 publication slots</p><p className="mt-2">Uploads reserve up to 100 MB each while their upload links are active. Storage limit: 1 GB.</p></div>
   </aside>
   <section className="min-w-0">
    <div ref={uploadRef}><UploadZone onFiles={upload} uploading={uploading} /></div>
    {stage && <p role="status" className="mt-3 break-words text-sm text-amber-300">{stage}</p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">{notice}</p>}
    <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-xl font-semibold text-white">{activeFolder?.name || scopeNames[scope] || "All flipbooks"} <span className="text-sm font-normal text-slate-500">{visible.length}</span></h2>{activeFolder && <div className="mt-2 flex gap-3 text-xs text-slate-400"><button onClick={()=>openForm({kind:"renameFolder",id:activeFolder.id,name:activeFolder.name})}>Rename folder</button><button onClick={()=>openForm({kind:"deleteFolder",id:activeFolder.id,name:activeFolder.name})}>Remove folder</button></div>}</div><button disabled={!visible.length} onClick={exportLibrary} className={button}>Export CSV</button></div>
    <div className="mb-4 flex flex-wrap gap-3"><input aria-label="Search flipbooks" placeholder="Search by title or filename…" value={query} onChange={e=>setQuery(e.target.value)} className={`${field} min-w-48 flex-1`} /><select aria-label="Sort flipbooks" value={sort} onChange={e=>setSort(e.target.value)} className={`${field} w-auto`}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Title A–Z</option><option value="views">Most viewed</option></select><div className="flex rounded-xl border border-slate-700 p-1">{(["list","grid"] as const).map(v=><button key={v} aria-pressed={view === v} onClick={()=>setView(v)} className={`rounded-lg px-3 text-xs capitalize ${view === v ? "bg-slate-700 text-white" : "text-slate-500"}`}>{v}</button>)}</div></div>
    {loadError ? <div role="alert" className="rounded-xl border border-red-500/30 p-5 text-sm text-red-300">{loadError}<button onClick={refresh} className="ml-3 underline">Try again</button></div> : !books ? <p className="py-12 text-center text-slate-400">Opening your workspace…</p> : !visible.length ? <div className="rounded-2xl border border-dashed border-slate-700 px-6 py-14 text-center"><h3 className="font-medium text-white">{query ? "No matching flipbooks" : "Room for your next great publication"}</h3><p className="mt-2 text-sm text-slate-500">{query ? "Try another title or clear the search." : "Upload a PDF above, or move an existing flipbook into this folder."}</p></div> : <div className={view === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
     {visible.map(book=><article key={book.id} className={`rounded-xl border border-slate-800 bg-slate-900/40 p-4 ${view === "list" ? "flex flex-wrap gap-4" : ""}`}>
      <div className={view === "list" ? "h-24 w-16 shrink-0 overflow-hidden rounded-md bg-slate-800" : "mx-auto mb-4 aspect-[3/4] max-h-52 overflow-hidden rounded-md bg-slate-800"}>{book.status === "ready" ? <Thumbnail id={book.id} /> : <div className="flex h-full items-center justify-center text-xs text-amber-400">PDF</div>}</div>
      <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-medium text-white" title={book.title}>{book.title}</h3><p className="mt-1 text-xs text-slate-500">{new Date(book.createdAt).toLocaleDateString()} · {formatSize(book.size)}</p></div><span className={`shrink-0 rounded-md px-2 py-1 text-[10px] ${book.status === "pending" ? "bg-amber-400/10 text-amber-300" : "bg-slate-800 text-slate-300"}`}>{book.status === "pending" ? "Unfinished" : book.hasPassword ? "Password" : book.visibility === "private" ? "Private" : "Shared by link"}</span></div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><select aria-label={`Folder for ${book.title}`} disabled={busy} value={placements[book.id] || ""} onChange={e=>move(book.id,e.target.value)} className="max-w-44 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-400"><option value="">Unfiled</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select><span className="text-xs tabular-nums text-slate-500">{book.status === "ready" ? `${views[book.id] || 0} views` : "PDF not published"}</span></div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
       {book.status === "ready" ? <><Link href={`/book/${book.id}`} className="font-medium text-amber-400">Open / edit</Link><button onClick={()=>setBranding(book)} className="text-slate-300">Branding</button><button onClick={()=>setShare(book)} className="text-slate-300">Share & privacy</button><Link href={`/book/${book.id}/insights`} className="text-slate-300">Analytics</Link><button onClick={()=>openForm({kind:"renameBook",id:book.id,name:book.title})} className="text-slate-400">Rename</button><a href={`/api/books/${book.id}/pdf?download=1`} className="text-slate-400">PDF ↓</a></> : <button disabled={busy} onClick={()=>complete(book)} className="text-amber-400">Check upload</button>}
       <button disabled={busy} onClick={()=>openForm({kind:"deleteBook",id:book.id,name:book.title})} className="text-red-400">{book.status === "pending" ? "Remove upload" : "Delete"}</button>
      </div></div>
     </article>)}
    </div>}
   </section>
  </div>
  {form && <WorkspaceDialog onClose={()=>!busy && setForm(null)} title={form.kind === "folder" ? "Create a folder" : form.kind === "renameFolder" ? "Rename folder" : form.kind === "renameBook" ? "Rename flipbook" : form.kind === "deleteFolder" ? "Remove folder?" : "Delete flipbook?"}><form onSubmit={saveForm}><p className="mb-5 text-sm leading-6 text-slate-400">{form.kind === "deleteFolder" ? `“${form.name}” will be removed. Its flipbooks will stay in your library, unfiled.` : form.kind === "deleteBook" ? `“${form.name}” and its files will be removed. This cannot be undone.` : "Use a name you’ll recognize when your library grows."}</p>{!form.kind.startsWith("delete") && <label className="text-xs text-slate-400">Name<input autoFocus required maxLength={form.kind === "renameBook" ? 200 : 80} value={formValue} onChange={e=>setFormValue(e.target.value)} className={`${field} mt-2`} /></label>}{formError && <p role="alert" className="mt-3 text-sm text-red-300">{formError}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={()=>setForm(null)} className={button}>Cancel</button><button disabled={busy || (!form.kind.startsWith("delete") && !formValue.trim())} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40 ${form.kind.startsWith("delete") ? "bg-red-500 text-white" : "bg-amber-400 text-slate-950"}`}>{busy ? "Saving…" : form.kind.startsWith("delete") ? "Remove" : "Save"}</button></div></form></WorkspaceDialog>}
  {share && <ShareDialog open onClose={()=>setShare(null)} title={share.title} bookId={share.id} isOwner shareUrl={`${window.location.origin}/book/${share.id}`} embedUrl={`${window.location.origin}/embed/${share.id}`} visibility={share.visibility} hasPassword={share.hasPassword} onPrivacyChange={(visibility,hasPassword)=>{setShare({...share,visibility,hasPassword}); void refresh();}} />}
  {branding && <BrandingDialog key={branding.id} open onClose={()=>setBranding(null)} bookId={branding.id} branding={branding.branding} onChange={b=>{setBranding({...branding,branding:b}); void refresh();}} />}
 </div>;
}
function WorkspaceDialog({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current; dialog?.showModal(); return ()=>dialog?.close();},[]);
 return <dialog ref={ref} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target === ref.current) onClose();}} className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-white shadow-xl backdrop:bg-black/70" aria-label={title}><h2 className="mb-3 text-xl font-semibold">{title}</h2>{children}</dialog>;
}
function UploadZone({
  onFiles,
  uploading,
}: {
  onFiles: (files: FileList) => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!uploading && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`group cursor-pointer rounded-3xl border-2 border-dashed px-6 py-7 text-center transition ${
        dragging
          ? "border-amber-400 bg-amber-400/5"
          : "border-slate-700 bg-slate-900/40 hover:border-slate-500"
      }`}
      tabIndex={uploading ? -1 : 0}
      aria-disabled={uploading}
      onKeyDown={(e) => { if (!uploading && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); inputRef.current?.click(); } }}
      role="button"
      aria-label="Upload a PDF"
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {uploading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400" />
          <p className="text-sm text-slate-300">Uploading…</p>
        </div>
      ) : (
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-400 transition group-hover:scale-105">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="text-base font-medium text-white">
            Drop a PDF here, or <span className="text-amber-400">browse</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">
            It becomes an interactive flipbook with a shareable link — up to 100 MB
          </p>
        </>
      )}
    </div>
  );
}

function Thumbnail({ id }: { id: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      renderFirstPage(`/api/books/${id}/pdf`, canvas, 200).catch(() => { if (alive) setFailed(true); });
    }, { rootMargin: "150px" });
    observer.observe(canvas);
    return () => { alive = false; observer.disconnect(); };
  }, [id]);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-slate-600">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </div>
    );
  }
  return <canvas ref={canvasRef} className="h-full w-full object-cover object-top" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
