import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {mergeBranding} from '../lib/branding';
test('publishing records stay server-only and link analytics are isolated by owner',async()=>{
 const db=new PGlite();try{await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;');await db.exec(await readFile(new URL('../supabase/migrations/20260908000500_publishing.sql',import.meta.url),'utf8'));
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from flipbook_publishing'));await assert.rejects(db.query("select flipbook_link_stats('owner')"));await db.exec('reset role');}
 await db.exec('set role service_role');await db.exec("insert into flipbook_publishing(id,owner_id,kind) values('track_1','owner','track'),('track_2','other','track'),('custom_guide','owner','custom'); insert into flipbook_link_events(link_id,page) values('track_1',null),('track_1',3),('track_2',null);");
 const data=(await db.query<{s:Record<string,{opens:number;pages:number}>}>("select flipbook_link_stats('owner') s")).rows[0].s;assert.deepEqual(Object.keys(data),['track_1']);assert.equal(data.track_1.opens,1);assert.equal(data.track_1.pages,1);await assert.rejects(db.exec("insert into flipbook_publishing(id,owner_id,kind) values('custom_guide','other','custom')"));
 }finally{await db.close();}
});
test('reader settings reject unsafe destinations and bound contents and shadows',()=>{
 const b=mergeBranding({}, {ctaUrl:'javascript:alert(1)',faviconUrl:'data:text/html,hi',ctaLabel:'Contact us',allowSearch:false,shadow:5,toc:[{title:'Chapter',pageIndex:2,depth:9},{title:'Bad',pageIndex:-1}]});assert.equal(b.ctaUrl,undefined);assert.equal(b.faviconUrl,undefined);assert.equal(b.allowSearch,false);assert.equal(b.shadow,1);assert.deepEqual(b.toc,[{title:'Chapter',pageIndex:2,depth:3}]);
});
