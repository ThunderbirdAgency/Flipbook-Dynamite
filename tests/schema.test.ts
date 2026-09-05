import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("PostgreSQL migration preserves books, denies direct anonymous access, and enforces upload quotas", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema storage;
      grant usage on schema public, storage to anon, authenticated, service_role;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id text primary key, bucket_id text);
      alter table storage.objects enable row level security;
      grant all on storage.objects to anon, authenticated, service_role;
      create policy legacy_allow_all on storage.objects for all to anon, authenticated using (true) with check (true);
      create table public.flipbook_books (id text primary key, title text, file_name text, size bigint, created_at timestamptz default now(), owner_id text, visibility text default 'public', password_hash text, branding jsonb default '{}', overlays jsonb default '[]');
      create table public.flipbook_events (book_id text, type text, page integer, visitor text, created_at timestamptz default now());
      grant all on public.flipbook_events to service_role;
      insert into public.flipbook_books (id,title,file_name,size,created_at,owner_id) values ('legacybook1', 'Existing book', 'book.pdf', 123, now(), 'original-owner');
      insert into storage.objects values ('ours', 'flipbook-pdfs'), ('asset', 'flipbook-assets'), ('other', 'unrelated-bucket');
    `);
    const migration = await readFile(new URL("./fixtures/readiness-schema.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration); // safe to reapply the prepared migration
    assert.deepEqual((await db.query("select title, status from public.flipbook_books where id='legacybook1'")).rows, [{ title: "Existing book", status: "ready" }]);
    assert.equal((await db.query<{ public: boolean }>("select public from storage.buckets where id='flipbook-pdfs'")).rows[0].public, false);
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      try {
        await assert.rejects(db.query("select * from public.flipbook_books"));
        await assert.rejects(db.query("insert into storage.objects values ('forbidden', 'flipbook-pdfs')"));
        assert.deepEqual((await db.query("select id from storage.objects")).rows, [{ id: "other" }]);
        await assert.rejects(db.query("select public.flipbook_reserve_upload('notallowed1','Book','book.pdf',123,'intruder')"));
      } finally { await db.exec("reset role"); }
    }
    await db.exec("set role service_role");
    for (let i = 0; i < 10; i++) await db.query("select public.flipbook_reserve_upload($1,'Book','book.pdf',1,'quota-user')", ["quotabook00" + i]);
    await assert.rejects(db.query("select public.flipbook_reserve_upload('overlimit00','Book','book.pdf',1,'quota-user')"), /library_limit/);
    for (let i = 0; i < 20; i++) {
      await db.query("select public.flipbook_reserve_upload($1,'Book','book.pdf',100,'rate-user')", ["ratebook000" + i]);
      await db.query("delete from public.flipbook_books where owner_id='rate-user'");
    }
    await assert.rejects(db.query("select public.flipbook_reserve_upload('ratelimit00','Book','book.pdf',100,'rate-user')"), /upload_rate_limit/);
    await db.query("select public.flipbook_reserve_upload('protected01','Secret','secret.pdf',100,'owner','private','salt:hash')");
    const saved = (await db.query("select visibility, password_hash, status from public.flipbook_books where id='protected01'")).rows[0];
    assert.deepEqual(saved, { visibility: "private", password_hash: "salt:hash", status: "pending" });
    for (let i = 0; i < 8; i++) assert.equal((await db.query<{ allowed: boolean }>("select public.flipbook_take_rate_slot('unlock:test',8,60) as allowed")).rows[0].allowed, true);
    assert.equal((await db.query<{ allowed: boolean }>("select public.flipbook_take_rate_slot('unlock:test',8,60) as allowed")).rows[0].allowed, false);
    await db.query("update public.flipbook_books set status='ready' where id='protected01'");
    assert.equal((await db.query<{ allowed: boolean }>("select public.flipbook_reserve_asset('protected01','logo','intruder') as allowed")).rows[0].allowed, false);
    for (let i = 0; i < 128; i++) assert.equal((await db.query<{ allowed: boolean }>("select public.flipbook_reserve_asset('protected01',$1,'owner') as allowed", ['image' + i])).rows[0].allowed, true);
    assert.equal((await db.query<{ allowed: boolean }>("select public.flipbook_reserve_asset('protected01','overflow','owner') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query<{ allowed: boolean }>("select public.flipbook_reserve_asset('protected01','image0','owner') as allowed")).rows[0].allowed, true);
    await db.query("delete from public.flipbook_books where id='protected01'");
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.flipbook_asset_slots")).rows[0].count, 0);
    await db.query("insert into public.flipbook_events (book_id,type,visitor) select 'analytics','view','visitor' || n from generate_series(1,1501) n");
    await db.query("insert into public.flipbook_events (book_id,type,page,visitor) values ('analytics','page',3,'visitor1'), ('analytics','page',2,'visitor2')");
    const stats = (await db.query<{ stats: { totalViews: number; uniqueVisitors: number; pagesReached: number[] } }>("select public.flipbook_get_stats('analytics',4) as stats")).rows[0].stats;
    assert.equal(stats.totalViews, 1501);
    assert.equal(stats.uniqueVisitors, 1501);
    assert.deepEqual(stats.pagesReached, [2,2,1,0]);
    await db.query("update public.flipbook_books set status='ready' where owner_id='quota-user'");
    await assert.rejects(db.query("select public.flipbook_reserve_upload('stillleased','Book','book.pdf',1,'quota-user')"), /library_limit/);
    // Tombstones retain upload capacity while a cancelled URL could still work.
    await db.query("update public.flipbook_books set status='deleted' where owner_id='quota-user'");
    await assert.rejects(db.query("select public.flipbook_reserve_upload('tombstone00','Book','book.pdf',1,'quota-user')"), /library_limit/);
    await db.exec("reset role");
    await db.exec(await readFile(new URL("./fixtures/workspace-schema.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("./fixtures/capacity-schema.sql", import.meta.url), "utf8"));
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await assert.rejects(db.query("select * from public.flipbook_account_limits"));
      await assert.rejects(db.query("insert into public.flipbook_account_limits values ('self',100000000000,1000)"));
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await assert.rejects(db.query("select public.flipbook_reserve_upload('defaultcap1','Book','book.pdf',1,'quota-user')"), /library_limit/);
    await db.query("insert into public.flipbook_account_limits values ('quota-user',107374182400,1000)");
    await db.query("select public.flipbook_reserve_upload('raisedcap01','Book','book.pdf',71586760,'quota-user')");
    const limits = (await db.query<{w:{storageLimitBytes:number;publicationLimit:number}}>("select public.flipbook_workspace('quota-user') as w")).rows[0].w;
    assert.equal(limits.storageLimitBytes,107374182400);
    assert.equal(limits.publicationLimit,1000);
    const defaults = (await db.query<{w:{storageLimitBytes:number}}>("select public.flipbook_workspace('other') as w")).rows[0].w;
    assert.equal(defaults.storageLimitBytes,1073741824);
    await db.exec("reset role");
  } finally { await db.close(); }
});
