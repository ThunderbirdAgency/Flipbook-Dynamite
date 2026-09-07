"use client";

import { useEffect, useRef, useState } from "react";

const lessons = [
  { title: "Welcome to your flipbook workspace", label: "Start here", body: "Turn a finished PDF into a publication your readers can open on any device. This quick guide walks you through your first book.", tips: ["Your account has its own library. Sharing a reader link does not grant editing access.", "You can reopen this guide at any time with Quick start."] },
  { title: "Upload your PDF", label: "Upload", body: "Choose Upload PDF, then browse for your file or drop it into the upload area. Wait for the book to say it is ready before opening it.", tips: ["PDFs can be up to 100 MB. Give large files time to upload and verify.", "If an upload is unfinished, use Check upload before trying again.", "Use folders to organize books by client or project."] },
  { title: "Make it your own", label: "Customize", body: "Choose Customize on a book’s row. Expand a settings group on the left and keep the page preview beside it.", tips: ["Set your background, accent color, logo, and reader controls.", "Use Table of Contents to add helpful chapter links.", "Save changes to update the publication and its preview."] },
  { title: "Add links, images, and titles", label: "Edit", body: "Choose Editor. Pick a page thumbnail, choose a tool, then use the settings on the right. Drag a layer to move it and its corner to resize it.", tips: ["Add website links, video, inline or pop-up images, GIFs, or a hosted form embed.", "For a link to another page, enter #3 to jump to page 3.", "Open Title & SEO for the publication title, search title, and description. Select Save changes before closing."] },
  { title: "Choose who can read it", label: "Privacy", body: "Before sharing, open Share → Privacy and confirm the access setting. New uploads start private.", tips: ["Shared by link: anyone with the address can read the book.", "Private without a password: only the owner and their team can read it. With a password: readers need that password.", "Hiding the download button is a reader preference, not copy protection. Share sensitive documents only with the intended readers."] },
  { title: "Share and manage your publication", label: "Share", body: "Use Share for a reader link and automatic QR code, or Embed for your website. Open the shared result to check it before sending it to a client.", tips: ["Custom links give a book a memorable address. Trackable links help separate campaign results. Bookshelves group several books.", "More → Make a copy creates an independent book. Copy link, Rename, Download PDF, and Delete are there too.", "Stats shows reading activity. Deleting a book cannot be undone and stops its links from working."] },
  { title: "Bring your team into the workspace", label: "Team", body: "Open Team access above the library. Choose an email and access level, then create and share the invitation link.", tips: ["Owners manage administrators. Admins manage editors and viewers. Editors can publish and customize; viewers can read and see statistics.", "Invitations expire after 7 days and require the invited verified email. Revoke unused invitations or remove membership to end access.", "Team access covers every book in that workspace, including private publications. Use the workspace selector to switch between personal and shared libraries."] },
];

export default function QuickStart({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  const key = `fbd-quick-start-v1:${userId}`;
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(key) === "seen"; } catch {}
    if (seen) return;
    const frame = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [key]);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    return () => dialog?.close();
  }, [open]);
  const close = () => {
    try { localStorage.setItem(key, "seen"); } catch {}
    setOpen(false);
  };
  const lesson = lessons[step];
  return <>
    <button onClick={() => { setStep(0); setOpen(true); }} className="ml-auto rounded-lg border border-slate-700 px-4 py-3 text-sm font-medium text-slate-200 hover:border-amber-400 hover:text-amber-300">Quick start</button>
    {open && <dialog ref={ref} onCancel={e => { e.preventDefault(); close(); }} aria-labelledby="quick-start-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-0 text-white shadow-2xl backdrop:bg-black/75">
      <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4"><p className="text-xs font-semibold uppercase tracking-widest text-amber-400">Flipbook Dynamite · Quick start</p><button onClick={close} aria-label="Close tutorial" className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Close</button></div>
      <div className="grid sm:grid-cols-[150px_1fr]">
        <nav aria-label="Tutorial steps" className="flex flex-wrap gap-1 border-b border-slate-800 p-3 sm:block sm:border-b-0 sm:border-r">{lessons.map((item, index) => <button key={item.label} onClick={() => setStep(index)} aria-current={step === index ? "step" : undefined} className={`rounded-lg px-3 py-2 text-left text-sm sm:mb-1 sm:w-full ${step === index ? "bg-amber-400/10 text-amber-300" : "text-slate-400 hover:bg-slate-800"}`}>{index + 1}. {item.label}</button>)}</nav>
        <div className="p-6 sm:p-8" aria-live="polite"><p className="mb-3 text-xs text-slate-500">Step {step + 1} of {lessons.length} · About 3 minutes</p><h2 id="quick-start-title" className="text-2xl font-semibold tracking-tight">{lesson.title}</h2><p className="mt-4 leading-7 text-slate-300">{lesson.body}</p><ul className="mt-5 space-y-3">{lesson.tips.map(tip => <li key={tip} className="flex gap-3 text-sm leading-6 text-slate-400"><span aria-hidden="true" className="text-amber-400">✓</span><span>{tip}</span></li>)}</ul></div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-700 px-6 py-4"><button onClick={close} className="text-sm text-slate-400 hover:text-white">{step === lessons.length - 1 ? "Close guide" : "I’ll explore first"}</button><div className="flex gap-3"><button disabled={step === 0} onClick={() => setStep(step - 1)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-30">Back</button><button onClick={() => step === lessons.length - 1 ? close() : setStep(step + 1)} className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300">{step === lessons.length - 1 ? "Start creating" : "Next"}</button></div></div>
    </dialog>}
  </>;
}
