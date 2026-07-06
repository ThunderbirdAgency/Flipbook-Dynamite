import { SignInButton, UserButton } from "@clerk/nextjs";
import Library from "@/components/Library";
import { authEnabled, currentUserId } from "@/lib/auth";

export default async function HomePage() {
  const userId = await currentUserId();
  const showLibrary = !authEnabled || Boolean(userId);

  return (
    <main className="min-h-screen bg-slate-950">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-bold tracking-tight text-white">
            Flipbook <span className="text-amber-400">Dynamite</span>
          </span>
        </div>
        {authEnabled && (
          <div className="flex items-center gap-3">
            {userId ? (
              <UserButton />
            ) : (
              <SignInButton mode="modal">
                <button className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300">
                  Sign in
                </button>
              </SignInButton>
            )}
          </div>
        )}
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 pb-12 pt-10 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Turn any PDF into an{" "}
          <span className="bg-gradient-to-r from-amber-300 to-orange-500 bg-clip-text text-transparent">
            interactive flipbook
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
          Realistic page-flipping with sound, clickable links preserved from your
          PDF, and a shareable URL for every book.
        </p>
      </section>

      {showLibrary ? (
        <Library />
      ) : (
        <section className="mx-auto w-full max-w-6xl px-6 pb-20">
          <div className="rounded-3xl border-2 border-dashed border-slate-700 bg-slate-900/40 px-8 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-400">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <p className="text-lg font-medium text-white">Sign in to build your library</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              Your flipbooks get their own shareable links and embed codes —
              viewers never need an account.
            </p>
            <div className="mt-6">
              <SignInButton mode="modal">
                <button className="rounded-full bg-amber-400 px-7 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300">
                  Get started — it&apos;s free
                </button>
              </SignInButton>
            </div>
          </div>
        </section>
      )}

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
