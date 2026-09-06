import {NextRequest,NextResponse} from 'next/server';
import {publishingGet} from '@/lib/publishing';
import {getBook} from '@/lib/store';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){const {id}=await params;const item=await publishingGet(id);if(!item||item.kind!=='track'||item.data.enabled===false||!item.data.book||(item.data.expires&&Date.parse(item.data.expires)<=Date.now())||!await getBook(item.data.book))return new NextResponse('This link is unavailable or has expired.',{status:404});return NextResponse.redirect(new URL(`/book/${item.data.book}?track=${encodeURIComponent(id)}`,req.url),{status:307,headers:{'Cache-Control':'no-store'}});}
