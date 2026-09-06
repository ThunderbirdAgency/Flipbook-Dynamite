import {NextRequest,NextResponse} from 'next/server';
import {nanoid} from 'nanoid';
import {api,assertSameOrigin,readJson} from '@/lib/http';
import {requireUserId} from '@/lib/auth';
import {getBook,enforceRateLimit} from '@/lib/store';
import {publishingList,publishingGet,publishingSave,publishingStats, type PublishingItem} from '@/lib/publishing';
import {AppError} from '@/lib/errors';
export async function GET(){return api(async()=>{const actor=await requireUserId();return NextResponse.json({items:await publishingList(actor),stats:await publishingStats(actor)});});}
export async function POST(req:NextRequest){return api(async()=>{
 assertSameOrigin(req);const actor=await requireUserId();await enforceRateLimit(`publishing:${actor}`,60);const b=await readJson(req,65536);
 if(!b||!['custom','track','shelf'].includes(b.kind))throw new AppError(400,'Choose a publishing tool.');
 const existing=b.id?await publishingGet(String(b.id)):null;
 if(b.id&&(!existing||existing.owner_id!==actor||existing.kind!==b.kind))throw new AppError(403,'This item is not in your workspace.');
 const items=await publishingList(actor);if(!existing&&items.length>=500)throw new AppError(409,'Your workspace has reached its publishing item limit.');
 let id=existing?.id||`${b.kind}_${nanoid(16)}`;
 if(b.kind==='custom'&&!existing){if(typeof b.slug!=='string'||! /^[a-z0-9][a-z0-9-]{2,79}$/.test(b.slug))throw new AppError(400,'Use 3–80 lowercase letters, numbers, or hyphens.');id='custom_'+b.slug;}
 const data:PublishingItem['data']={title:typeof b.title==='string'?b.title.trim().slice(0,160):'',enabled:b.enabled!==false};
 if(b.kind==='custom'||b.kind==='track'){const book=await getBook(String(b.book));if(!book||book.ownerId!==actor)throw new AppError(403,'Choose a flipbook in your workspace.');data.book=book.id;}
 if(b.expires){if(typeof b.expires!=='string'||!Number.isFinite(Date.parse(b.expires)))throw new AppError(400,'Choose a valid expiry date.');data.expires=new Date(b.expires).toISOString();}
 if(b.kind==='shelf'){if(!Array.isArray(b.books)||b.books.length>200)throw new AppError(400,'Choose up to 200 flipbooks.');data.books=[...new Set(b.books)] as string[];for(const id of data.books){const book=await getBook(id);if(!book||book.ownerId!==actor)throw new AppError(403,'Choose only your own flipbooks.');}data.description=String(b.description||'').slice(0,500);data.color=/^#[a-f0-9]{6}$/i.test(b.color)?b.color:'#101521';}
 const item:PublishingItem={id,owner_id:actor,kind:b.kind,data,created_at:existing?.created_at||new Date().toISOString()};await publishingSave(item,!existing);return NextResponse.json({item});
});}
