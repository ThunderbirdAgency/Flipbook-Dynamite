import {notFound} from 'next/navigation';
import Link from 'next/link';
import {publishingGet} from '@/lib/publishing';
import {getBook} from '@/lib/store';
export const dynamic='force-dynamic';
export const metadata={title:'Bookshelf — Flipbook Dynamite',robots:{index:false,follow:false}};
export default async function Shelf({params}:{params:Promise<{id:string}>}){const s=await publishingGet((await params).id);if(!s||s.kind!=='shelf'||s.data.enabled===false)notFound();const books=await Promise.all((s.data.books||[]).map(id=>getBook(id)));return <main className="min-h-screen px-6 py-16 text-white" style={{background:s.data.color||'#101521'}}><div className="mx-auto max-w-6xl"><p className="text-sm uppercase tracking-widest text-brand-400">Flipbook Dynamite</p><h1 className="mt-4 text-4xl font-semibold">{s.data.title||'Bookshelf'}</h1><p className="mt-4 text-slate-300">{s.data.description}</p><div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{books.filter(b=>b&&b.ownerId===s.owner_id).map(b=>b&&<Link key={b.id} href={`/book/${b.id}`} className="rounded-2xl border border-white/15 bg-white/5 p-8 hover:bg-white/10"><span className="text-5xl">▤</span><h2 className="mt-6 text-xl">{b.visibility==='private'||b.hasPassword?'Protected flipbook':b.title}</h2><p className="mt-4 text-sm text-brand-300">Open flipbook →</p></Link>)}</div></div></main>;}
