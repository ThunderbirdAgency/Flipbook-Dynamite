import {NextRequest,NextResponse} from 'next/server';
import {publishingGet} from '@/lib/publishing';
import {getBook} from '@/lib/store';
export async function GET(req:NextRequest,{params}:{params:Promise<{slug:string}>}){const {slug}=await params;const item=await publishingGet('custom_'+slug);if(!item||item.kind!=='custom'||item.data.enabled===false||!item.data.book||!await getBook(item.data.book))return new NextResponse('Link unavailable',{status:404});return NextResponse.redirect(new URL(`/book/${item.data.book}`,req.url),{status:307,headers:{'Cache-Control':'no-store'}});}
