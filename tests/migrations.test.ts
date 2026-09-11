import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

/**
 * Rebuilding the database from `supabase/migrations` must reproduce the whole
 * authorization surface. The other schema tests each apply one migration in
 * isolation to exercise its rules; this one applies the full set in filename
 * order, the way `supabase db push` would, so ordering mistakes and missing
 * pieces surface here rather than during a restore.
 */
test("a database rebuilt from migrations reproduces every authorization rule", async () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  // Migrations are applied in lexicographic order, so the names must encode it.
  assert.ok(files.length >= 5, "expected the full migration set");
  assert.deepEqual([...files].sort(), files);

  const db = new PGlite();
  try {
    // Minimal stand-in for the parts of a Supabase project the migrations touch.
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema storage;
      grant usage on schema public, storage to anon, authenticated, service_role;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id text primary key, bucket_id text);
      alter table storage.objects enable row level security;
      grant all on storage.objects to anon, authenticated, service_role;
    `);

    for (const file of files) {
      await db.exec(await readFile(new URL(file, dir), "utf8"));
    }

    // Re-applying the set must be a no-op, so a partially-applied deploy can be
    // finished by re-running rather than by hand-repairing the database.
    for (const file of files) {
      await db.exec(await readFile(new URL(file, dir), "utf8"));
    }

    const functions = (
      await db.query<{ proname: string }>(
        "select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname like 'flipbook%'"
      )
    ).rows.map((r) => r.proname);
    for (const rpc of [
      "flipbook_team_change",
      "flipbook_reserve_upload",
      "flipbook_reserve_asset",
      "flipbook_take_rate_slot",
      "flipbook_workspace_change",
      "flipbook_get_stats",
    ]) {
      assert.ok(functions.includes(rpc), `${rpc} must exist after a rebuild`);
    }

    // Every flipbook table must come back with row level security ON. A table
    // restored without it is readable by anon and is the exact failure this
    // migration set exists to prevent.
    const tables = (
      await db.query<{ relname: string; relrowsecurity: boolean }>(
        "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and c.relkind='r' and relname like 'flipbook%'"
      )
    ).rows;
    assert.ok(tables.length >= 10, "expected the full table set");
    for (const t of tables) {
      assert.equal(t.relrowsecurity, true, `${t.relname} must have RLS enabled`);
    }

    // The rebuilt database must deny untrusted roles directly, not merely rely
    // on the application layer to ask nicely.
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      try {
        // Denial takes two equally valid shapes here: a revoked grant raises
        // "permission denied", while a granted-but-RLS-guarded table returns
        // nothing. Either is fine; leaking a row is not.
        for (const t of tables) {
          let rows: unknown[] | "denied";
          try {
            rows = (await db.query(`select * from public.${t.relname}`)).rows;
          } catch {
            rows = "denied";
          }
          assert.deepEqual(rows === "denied" ? [] : rows, [], `${t.relname} must expose no rows to ${role}`);
        }
        await assert.rejects(
          db.query("select public.flipbook_reserve_upload('x','Book','book.pdf',123,'intruder')"),
          `${role} must not reserve uploads directly`
        );
      } finally {
        await db.exec("reset role");
      }
    }
  } finally {
    await db.close();
  }
});
