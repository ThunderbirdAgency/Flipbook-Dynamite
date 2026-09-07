import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {NextRequest} from 'next/server';
import {permits,canAssign,type TeamRole} from '../lib/team-permissions';
test('team permissions protect owner/admin authority and deny viewer writes',()=>{
 for(const role of ['owner','admin','editor','viewer',null] as const){assert.equal(permits(role,'read'),role!==null);assert.equal(permits(role,'edit'),role!==null&&role!=='viewer');assert.equal(permits(role,'delete'),role==='owner'||role==='admin');assert.equal(permits(role,'team'),role==='owner'||role==='admin');assert.equal(canAssign(role,'owner','viewer'),false);assert.equal(canAssign(role,'editor','owner'),false);}
 assert.equal(canAssign('admin','admin','viewer'),false);assert.equal(canAssign('admin',null,'admin'),false);assert.equal(canAssign('owner',null,'admin'),true);
});
test('team SQL denies direct access, binds invitations to verified emails, consumes once, and prevents escalation',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;');await db.exec(await readFile(new URL('./fixtures/team-schema.sql',import.meta.url),'utf8'));
 const call=(actor:string,workspace:string,action:string,payload:object)=>db.query<{value:{ownerId:string}}>('select flipbook_team_change($1,$2,$3,$4) value',[actor,workspace,action,JSON.stringify(payload)]);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from flipbook_team_members'));await assert.rejects(db.query('select * from flipbook_team_invites'));await assert.rejects(call('owner','owner','invite',{}));await db.exec('reset role');}
 await db.exec('set role service_role');
 await assert.rejects(call('outsider','owner','invite',{role:'admin'}),/team_denied/);
 await call('owner','owner','invite',{id:'a',email:'admin@example.com',role:'admin',hash:'a'});
 await assert.rejects(call('admin','', 'accept',{hash:'a',emails:['other@example.com']}),/invite_invalid/);
 assert.equal((await call('admin','', 'accept',{hash:'a',emails:['admin@example.com']})).rows[0].value.ownerId,'owner');
 await assert.rejects(call('admin','', 'accept',{hash:'a',emails:['admin@example.com']}),/invite_invalid/);
 await assert.rejects(call('admin','owner','invite',{id:'b',email:'x@example.com',role:'admin',hash:'b'}),/team_denied/);
 await call('admin','owner','invite',{id:'e',email:'editor@example.com',role:'editor',hash:'e'});
 await call('editor','', 'accept',{hash:'e',emails:['editor@example.com']});
 await assert.rejects(call('editor','owner','role',{userId:'editor',role:'admin'}),/team_denied/);
 await assert.rejects(call('admin','owner','role',{userId:'editor',role:'admin'}),/team_denied/);
 await assert.rejects(call('owner','owner','remove',{userId:'owner'}),/team_denied/);
 await call('owner','owner','role',{userId:'editor',role:'viewer'});
 assert.equal((await db.query<{role:string}>("select role from flipbook_team_members where user_id='editor'")).rows[0].role,'viewer');
 await call('owner','owner','invite',{id:'oldeditor',email:'editor@example.com',role:'editor',hash:'oldeditor'});
 await call('owner','owner','remove',{userId:'editor'});await assert.rejects(call('editor','','accept',{hash:'oldeditor',emails:['editor@example.com']}),/invite_invalid/);assert.equal((await db.query("select * from flipbook_team_members where user_id='editor'")).rows.length,0);
 await call('owner','owner','invite',{id:'expired',email:'x@example.com',role:'viewer',hash:'expired'});await db.exec("update flipbook_team_invites set expires_at=now()-interval '1 minute' where id='expired'");await assert.rejects(call('x','','accept',{hash:'expired',emails:['x@example.com']}),/invite_invalid/);
 await call('owner','owner','invite',{id:'revoked',email:'x@example.com',role:'viewer',hash:'revoked'});await call('owner','owner','revoke',{id:'revoked'});await assert.rejects(call('x','','accept',{hash:'revoked',emails:['x@example.com']}),/invite_invalid/);
 }finally{await db.close();}
});
test('team roles enforce private book API access, writes, deletion and workspace cookie isolation',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'flipbook-team-'));const env={...process.env};
 for(const key of ['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CLERK_SECRET_KEY','NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY','VERCEL'])delete process.env[key];Object.assign(process.env,{NODE_ENV:'test',FLIPBOOK_LOCAL_DEMO:'true',FLIPBOOK_DATA_DIR:dir});
 try{
 const store=await import('../lib/store');const routes=await import('../app/api/books/[id]/route');const library=await import('../app/api/books/route');const publishing=await import('../app/api/publishing/route');
 const book={id:'teamtest001',title:'Private team book',fileName:'test.pdf',size:10,createdAt:new Date().toISOString(),ownerId:'team-owner',visibility:'private' as const,hasPassword:false,passwordHash:null,branding:{},overlays:[],status:'ready' as const};await store.createBook(book);
 const ctx={params:Promise.resolve({id:book.id})};
 const req=(method='GET',body?:object,workspace='team-owner')=>new NextRequest('https://flip.test/api/books',{method,headers:{'Content-Type':'application/json',Origin:'https://flip.test',Cookie:`flipbook-workspace=${workspace}`},body:body?JSON.stringify(body):undefined});
 for(const role of ['viewer','editor','admin'] as TeamRole[]){await writeFile(path.join(dir,'team.json'),JSON.stringify({members:[{owner_id:'team-owner',user_id:'local-demo',email:'test@example.com',role}],invites:[]}));assert.equal((await routes.GET(req(),ctx)).status,200);assert.equal((await library.GET(req())).status,200);assert.equal((await routes.PATCH(req('PATCH',{title:'Edited'}),ctx)).status,role==='viewer'?403:200);assert.equal((await publishing.POST(req('POST',{kind:'track',book:book.id,title:'Campaign'}))).status,role==='viewer'?403:200);if(role!=='admin')assert.equal((await routes.DELETE(req('DELETE'),ctx)).status,403);}
 assert.equal((await library.GET(req('GET',undefined,'forged-owner'))).status,403);
 await writeFile(path.join(dir,'team.json'),JSON.stringify({members:[],invites:[]}));assert.equal((await routes.GET(req(),ctx)).status,403);assert.equal((await routes.PATCH(req('PATCH',{title:'Revoked'}),ctx)).status,403);assert.equal((await library.GET(req())).status,403);
 }finally{for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);await rm(dir,{recursive:true,force:true});}
});
