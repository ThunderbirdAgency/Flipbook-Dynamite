import Link from "next/link";
import { authEnabled } from "@/lib/auth";

// Marketing-site header/footer. Auth-aware: with Clerk on, CTAs go to the
// hosted sign-in/up pages; in open mode they drop straight into the app.
const loginHref = authEnabled ? "/sign-in" : "/app";
const startHref = authEnabled ? "/sign-up" : "/app";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-slate-950 shadow-[0_0_20px_-4px_rgba(251,146,60,0.7)]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      </span>
      <span className="text-lg font-bold tracking-tight text-white">
        Flipbook <span className="text-amber-400">Dynamite</span>
      </span>
    </Link>
  );
}

export function SiteHeader({ active }: { active?: "features" | "pricing" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3.5">
        <Wordmark />
        <nav className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
          <Link
            href="/#features"
            className={`transition hover:text-white ${active === "features" ? "text-white" : ""}`}
          >
            Features
          </Link>
          <Link
            href="/pricing"
            className={`transition hover:text-white ${active === "pricing" ? "text-white" : ""}`}
          >
            Pricing
          </Link>
          <Link href="/#how" className="transition hover:text-white">
            How it works
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href={loginHref}
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-200 transition hover:text-white"
          >
            Log in
          </Link>
          <Link
            href={startHref}
            className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-slate-950">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-12 sm:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm text-slate-500">
            Turn any PDF into a 3D, interactive, brandable flipbook — then share it or embed it
            anywhere.
          </p>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Product</p>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><Link href="/#features" className="hover:text-white">Features</Link></li>
            <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
            <li><Link href="/app" className="hover:text-white">Your library</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Get started</p>
          <ul className="space-y-2 text-sm text-slate-400">
            <li><Link href={startHref} className="hover:text-white">Create an account</Link></li>
            <li><Link href={loginHref} className="hover:text-white">Log in</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5 py-6 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} Flipbook Dynamite — PDFs that go boom 🧨
      </div>
    </footer>
  );
}
