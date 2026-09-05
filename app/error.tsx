"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white">
    <div><h1 className="text-2xl font-bold">We couldn’t open that page</h1>
      <p className="mt-3 text-base text-slate-400">Please try again in a moment.</p>
      <button onClick={reset} className="mt-6 rounded-full bg-amber-400 px-6 py-3 font-semibold text-slate-950">Try again</button>
    </div>
  </main>;
}
