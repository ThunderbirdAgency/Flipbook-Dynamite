import Link from "next/link";
export default function NotFound() {
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white">
    <div><h1 className="text-2xl font-bold">Flipbook not found</h1>
      <p className="mt-3 text-base text-slate-400">This link may be incorrect, or the book is no longer available.</p>
      <Link href="/" className="mt-6 inline-block text-amber-400 underline">Go to Flipbook Dynamite</Link>
    </div>
  </main>;
}
