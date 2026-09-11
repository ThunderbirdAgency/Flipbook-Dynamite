import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("workspace persists folders, isolates creators, and preserves books when folders are removed",async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon,authenticated,service_role;
  create table public.flipbook_books(id text primary key,owner_id text,status text,size bigint,created_at timestamptz default now());
  create table public.flipbook_events(book_id text,type text);
  grant all on public.flipbook_books,public.flipbook_events to service_role;
  insert into public.flipbook_books(id,owner_id,status,size) values('ownersbook01','owner','ready',20),('othersbook01','other','ready',20);
  insert into public.flipbook_events values('ownersbook01','view'),('ownersbook01','view'),('othersbook01','view');`);
  const sql=await readFile(new URL('./fixtures/workspace-schema.sql',import.meta.url),'utf8');
  await db.exec(sql);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query("select * from public.flipbook_folders"));
   await assert.rejects(db.query("select public.flipbook_workspace('owner')"));
   await assert.rejects(db.query("select public.flipbook_workspace_change('owner','create','testfolder01','Hacked')"));
   await db.exec('reset role');
  }
  await db.exec('set role service_role');
  await db.query("select public.flipbook_workspace_change('owner','create','ownersfold01','Clients')");
  await db.query("select public.flipbook_workspace_change('other','create','othersfold01','Private folder')");
  await db.query("select public.flipbook_workspace_change('owner','move','ownersfold01',null,'ownersbook01')");
  await assert.rejects(db.query("select public.flipbook_workspace_change('other','move','othersfold01',null,'ownersbook01')"),/workspace_denied/);
  await assert.rejects(db.query("select public.flipbook_workspace_change('owner','move','othersfold01',null,'ownersbook01')"),/workspace_denied/);
  await assert.rejects(db.query("select public.flipbook_workspace_change('other','rename','ownersfold01','Stolen')"),/workspace_denied/);
  await assert.rejects(db.query("select public.flipbook_workspace_change('other','delete','ownersfold01')"),/workspace_denied/);
  await assert.rejects(db.query("select public.flipbook_workspace_change('owner','create','dupefolder01','Clients')"));
  await db.query("select public.flipbook_workspace_change('owner','rename','ownersfold01','Listing clients')");
  const w=(await db.query<{w:{folders:unknown[];placements:object;views:object}}>("select public.flipbook_workspace('owner') as w")).rows[0].w;
  assert.deepEqual(w.folders,[{id:'ownersfold01',name:'Listing clients'}]);
  assert.deepEqual(w.placements,{ownersbook01:'ownersfold01'});
  assert.deepEqual(w.views,{ownersbook01:2});
  await db.query("select public.flipbook_workspace_change('owner','delete','ownersfold01')");
  assert.equal((await db.query("select id from public.flipbook_books where id='ownersbook01'")).rows.length,1);
  assert.equal((await db.query("select * from public.flipbook_folder_books where book_id='ownersbook01'")).rows.length,0);
 } finally {await db.close();}
});
