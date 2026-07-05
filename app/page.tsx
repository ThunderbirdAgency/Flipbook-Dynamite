import Library from "@/components/Library";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-bold tracking-tight text-white">
            Flipbook <span className="text-amber-400">Dynamite</span>
          </span>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 pb-12 pt-10 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Turn any PDF into an{" "}
          <span className="bg-gradient-to-r from-amber-300 to-orange-500 bg-clip-text text-transparent">
            interactive flipbook
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
          Realistic page-flipping, clickable links preserved from your PDF, and a
          shareable URL for every book. Drop a file below to see it in action.
        </p>
      </section>

      <Library />

      <footer className="border-t border-slate-900 py-8 text-center text-xs text-slate-600">
        Flipbook Dynamite — PDFs that go boom 🧨
      </footer>
    </main>
  );
}

function Logo() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-slate-950">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    </div>
  );
}
