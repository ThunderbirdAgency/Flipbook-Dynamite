import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {NextRequest} from 'next/server';
import {sanitizeOverlays,resolveVideo} from '../lib/overlays';
test('trackable links persist counts, expire and disable; shelves preserve order and reject foreign books',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'flipbook-publishing-'));const env={...process.env};for(const k of ['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CLERK_SECRET_KEY','NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY','VERCEL'])delete process.env[k];Object.assign(process.env,{NODE_ENV:'test',FLIPBOOK_LOCAL_DEMO:'true',FLIPBOOK_DATA_DIR:dir});
 try{
 const {createBook}=await import('../lib/store');const api=await import('../app/api/publishing/route');const links=await import('../lib/publishing');const track=await import('../app/t/[id]/route');
 for(const id of ['bookone001','booktwo002','foreign003'])await createBook({id,title:id,fileName:'test.pdf',size:10,createdAt:new Date().toISOString(),ownerId:id==='foreign003'?'other':'local-demo',visibility:'private',hasPassword:false,passwordHash:null,branding:{},overlays:[],status:'ready'});
 const req=(body?:object)=>new NextRequest('https://flip.test/api/publishing',{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:'https://flip.test'},body:body?JSON.stringify(body):undefined});
 const made=await api.POST(req({kind:'track',book:'bookone001',title:'Campaign'}));assert.equal(made.status,200);const {item}=await made.json();const context={params:Promise.resolve({id:item.id})};const r=await track.GET(req(),context);assert.equal(r.status,307);assert.ok(r.headers.get('location')?.endsWith(`/book/bookone001?track=${item.id}`));
 await links.trackEvent(item.id,'bookone001');await links.trackEvent(item.id,'bookone001',2);await links.trackEvent(item.id,'booktwo002',5);assert.deepEqual(await links.publishingStats('other'),{});const stats=(await links.publishingStats('local-demo'))[item.id];assert.equal(stats.opens,1);assert.equal(stats.pages,1);
 await api.POST(req({id:item.id,kind:'track',book:'bookone001',enabled:false}));assert.equal((await track.GET(req(),context)).status,404);await links.trackEvent(item.id,'bookone001');assert.equal((await links.publishingStats('local-demo'))[item.id].opens,1);
 await api.POST(req({id:item.id,kind:'track',book:'bookone001',enabled:true,expires:'2000-01-01'}));assert.equal((await track.GET(req(),context)).status,404);
 const shelf=await api.POST(req({kind:'shelf',title:'Collection',books:['booktwo002','bookone001'],description:'Test collection',color:'#123456'}));assert.equal(shelf.status,200);const saved=(await shelf.json()).item;assert.deepEqual((await links.publishingGet(saved.id))?.data.books,['booktwo002','bookone001']);assert.equal((await api.POST(req({id:saved.id,kind:'shelf',books:['foreign003']}))).status,403);assert.deepEqual((await links.publishingGet(saved.id))?.data.books,['booktwo002','bookone001']);assert.equal((await api.POST(req({kind:'custom',slug:'javascript:evil',book:'bookone001'}))).status,400);
 }finally{for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);await rm(dir,{recursive:true,force:true});}
});
test('multimedia overlays retain popup and inline behavior while rejecting executable URLs',()=>{
 const data=sanitizeOverlays([{id:'jump',type:'link',page:1,url:'#page-2'},{id:'pic',type:'image',page:1,url:'/safe.png',display:'popup'},{id:'clip',type:'video',url:'https://example.com/demo.mp4',display:'inline'},{id:'form',type:'iframe',url:'https://example.com/form',display:'popup'},{type:'iframe',url:'/app'},{type:'image',url:'javascript:alert(1)'},{type:'link',url:'data:text/html,bad'}]);assert.equal(data.length,4);assert.equal(data[1].display,'popup');assert.equal(data[2].display,'inline');assert.deepEqual(resolveVideo('https://youtu.be/abc123'),{kind:'youtube',id:'abc123'});assert.deepEqual(resolveVideo('https://vimeo.com/1234'),{kind:'vimeo',id:'1234'});
});
