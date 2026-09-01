import Link from "next/link";
import Image from "next/image";
import { SiteHeader, SiteFooter } from "@/components/SiteChrome";
import { authEnabled } from "@/lib/auth";

export const metadata = {
  title: "Flipbook Dynamite — PDFs that flip, play, and go off",
  description:
    "Turn any PDF into a 3D interactive flipbook — realistic page-flip, video & GIF layers, your branding, full-text search, analytics, and a shareable link or embed for every book.",
};

const startHref = authEnabled ? "/sign-up" : "/app";

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 70% 0%, rgba(251,146,60,0.16), transparent 60%), radial-gradient(50% 40% at 0% 20%, rgba(245,158,11,0.10), transparent 60%)",
          }}
        />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
              🧨 PDF → interactive flipbook
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              Flipbooks that
              <br />
              <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-orange-600 bg-clip-text text-transparent">
                go off.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-400">
              Drop in a PDF. Get a real, 3D page-flipping book you can drop video and GIFs onto,
              paint with your brand, search end to end, and share or embed anywhere. We do
              flipbooks better — yours land with a bang.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={startHref}
                className="rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_30px_-6px_rgba(251,146,60,0.8)] transition hover:bg-amber-300"
              >
                Start free — light the fuse
              </Link>
              <Link
                href="/pricing"
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/5"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Viewers never need an account. Works on every device and inside any website.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-amber-500/20 to-orange-600/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
              <div className="flex items-center gap-1.5 border-b border-white/5 bg-slate-950/60 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              </div>
              <Image
                src="/hero.png"
                alt="A branded flipbook with a video layer and logo, mid-spread"
                width={1440}
                height={900}
                priority
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything FlippingBook charges for.
            <br />
            <span className="text-slate-400">Plus the parts they skimp on.</span>
          </h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 transition hover:border-amber-400/30"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400">
                {f.icon}
              </div>
              <h3 className="text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-white/5 bg-slate-900/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Three steps to boom
          </h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-sm font-bold text-slate-950">
                  {i + 1}
                </div>
                <h3 className="text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple, honest pricing</h2>
          <p className="mt-3 text-slate-400">
            Everything you need in the middle tier. No per-view fees, no surprises.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-6 ${
                p.featured
                  ? "border-amber-400/50 bg-amber-400/[0.06]"
                  : "border-white/10 bg-slate-900/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{p.name}</h3>
                {p.featured && (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">
                    POPULAR
                  </span>
                )}
              </div>
              <p className="mt-3 text-3xl font-extrabold text-white">
                ${p.price}
                <span className="text-sm font-normal text-slate-500">/mo</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">{p.tagline}</p>
              <Link
                href="/pricing"
                className={`mt-5 block rounded-full px-4 py-2 text-center text-sm font-semibold transition ${
                  p.featured
                    ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                    : "border border-white/15 text-white hover:bg-white/5"
                }`}
              >
                Choose {p.name}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/pricing" className="text-amber-400 hover:underline">
            Compare all plans →
          </Link>
        </p>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-amber-400/20 bg-gradient-to-br from-slate-900 to-slate-950 px-8 py-14 text-center">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(60% 80% at 50% 0%, rgba(251,146,60,0.18), transparent 60%)" }}
          />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your next PDF deserves a better exit than a download folder.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-400">
              Make it a flipbook people actually open, read, and click through.
            </p>
            <Link
              href={startHref}
              className="mt-7 inline-block rounded-full bg-amber-400 px-8 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_30px_-6px_rgba(251,146,60,0.8)] transition hover:bg-amber-300"
            >
              Start free
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

const FEATURES = [
  {
    title: "A book, not a slideshow",
    body: "A genuine 3D two-page spread with a real spine, page thickness, and a weighty flip — drag the corners, hear the paper.",
    icon: <IconBook />,
  },
  {
    title: "Video, GIFs & live embeds",
    body: "Drop YouTube/Vimeo/MP4 pop-ups, movable GIF layers, links, and iframes anywhere on a page with a drag-to-place editor.",
    icon: <IconPlay />,
  },
  {
    title: "Your brand, not ours",
    body: "Custom background, a clickable logo, accent color, SEO title, and a download toggle. White-label it for every client.",
    icon: <IconBrush />,
  },
  {
    title: "Know who read it",
    body: "Per-book views, unique visitors, and a page-reach funnel that shows exactly where readers drop off.",
    icon: <IconChart />,
  },
  {
    title: "Search every page",
    body: "Full-text search jumps readers to the exact page — and your titles are set up to be found on Google.",
    icon: <IconSearch />,
  },
  {
    title: "Private or wide open",
    body: "Public link, unlisted, or password-protected. Share a link, grab an iframe, or print a QR code.",
    icon: <IconLock />,
  },
];

const STEPS = [
  { title: "Upload your PDF", body: "One drag-and-drop. Big files welcome — links and bookmarks come along for the ride." },
  { title: "Enrich & brand it", body: "Add video, GIFs, and hotspots; set your background, logo, and colors in a couple of clicks." },
  { title: "Share or embed", body: "Every book gets a link, an iframe embed, a QR code, and a social preview card. Done." },
];

const PLANS = [
  { name: "Starter", price: 29, tagline: "For the occasional flipbook", featured: false },
  { name: "Professional", price: 79, tagline: "Video, branding & analytics", featured: true },
  { name: "Business", price: 179, tagline: "White-label & unlimited", featured: false },
];

function IconBook() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
function IconPlay() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <polygon points="10 9 15 12 10 15" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconBrush() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
