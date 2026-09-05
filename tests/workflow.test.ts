import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const request = (method = "GET", body?: unknown, cookie?: string) => new NextRequest("https://flip.example/api/books", {
  method, headers: { "Content-Type": "application/json", Origin: "https://flip.example", ...(cookie ? { Cookie: cookie } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test("complete PDF lifecycle, ownership, private content, and failure recovery", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "flipbook-test-"));
  const before = { ...process.env };
  for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "VERCEL"]) delete process.env[key];
  Object.assign(process.env, { NODE_ENV: "test", FLIPBOOK_LOCAL_DEMO: "true", FLIPBOOK_DATA_DIR: dir });
  const { POST: create, GET: library } = await import("../app/api/books/route");
  const { GET: metadata, PATCH: update, DELETE: remove } = await import("../app/api/books/[id]/route");
  const { PUT: upload, GET: pdf } = await import("../app/api/books/[id]/pdf/route");
  const { POST: complete } = await import("../app/api/books/[id]/complete/route");
  const { POST: unlock } = await import("../app/api/books/[id]/unlock/route");
  const { POST: imageUpload, GET: imageRead } = await import("../app/api/books/[id]/asset/[kind]/route");
  const { getBook, createBook, updateBook, listBooks } = await import("../lib/store");
  const { GET: maintenance } = await import("../app/api/maintenance/route");
  const { hashPassword } = await import("../lib/access");
  try {
    assert.equal((await maintenance(request())).status, 401);
    const bytes = new TextEncoder().encode("%PDF-1.7\nTest fixture\n%%EOF");
    const made = await create(request("POST", { fileName: "Listing.pdf", size: bytes.length }));
    assert.equal(made.status, 201);
    const { book, upload: target } = await made.json();
    const context = { params: Promise.resolve({ id: book.id }) };
    assert.equal(book.status, "pending");
    assert.deepEqual(target.headers, {});
    assert.equal((await metadata(request(), context)).status, 404);
    assert.equal((await pdf(request(), context)).status, 404);
    assert.equal((await complete(request("POST"), context)).status, 409);
    assert.equal((await upload(new NextRequest("https://flip.example" + target.url, { method: "PUT", body: bytes }), context)).status, 200);
    assert.equal((await complete(request("POST"), context)).status, 200);
    assert.equal((await complete(request("POST"), context)).status, 200);
    const published = (await (await metadata(request(), context)).json()).book;
    assert.equal(published.status, "ready");
    assert.equal("ownerId" in published, false);
    assert.equal("passwordHash" in published, false);
    const delivery = await pdf(request(), context);
    assert.equal(delivery.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(new Uint8Array(await delivery.arrayBuffer()), bytes);
    assert.equal((await upload(new NextRequest("https://flip.example" + target.url, { method: "PUT", body: bytes }), context)).status, 409);
    assert.equal((await update(request("PATCH", { title: "Open House Guide", branding: { accent: "#abcdef" }, overlays: [{ id: "tour", type: "link", url: "https://example.com", page: 1 }] }), context)).status, 200);
    assert.equal((await getBook(book.id))?.branding.accent, "#abcdef");
    assert.equal((await getBook(book.id))?.overlays[0].id, "tour");
    const assetContext = { params: Promise.resolve({ id: book.id, kind: "logo" }) };
    assert.equal((await imageUpload(new NextRequest("https://flip.example", { method: "POST", body: "<svg><script>alert(1)</script></svg>" }), assetContext)).status, 415);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=", "base64");
    assert.equal((await imageUpload(new NextRequest("https://flip.example", { method: "POST", body: png }), assetContext)).status, 200);
    assert.equal((await imageRead(request(), assetContext)).status, 200);

    // A different creator cannot rename/delete/read private content or assets.
    const protectedBook = { ...(await getBook(book.id))!, id: "privatebook1", ownerId: "another-user", visibility: "private" as const, passwordHash: hashPassword("first-password"), hasPassword: true };
    await createBook(protectedBook);
    const protectedContext = { params: Promise.resolve({ id: protectedBook.id }) };
    const protectedAsset = { params: Promise.resolve({ id: protectedBook.id, kind: "logo" }) };
    assert.equal((await update(request("PATCH", { title: "Hacked" }), protectedContext)).status, 403);
    assert.equal((await remove(request("DELETE"), protectedContext)).status, 403);
    assert.equal((await metadata(request(), protectedContext)).status, 401);
    assert.equal((await pdf(request(), protectedContext)).status, 401);
    assert.equal((await imageRead(request(), protectedAsset)).status, 401);
    assert.equal((await unlock(request("POST", { password: "wrong" }), protectedContext)).status, 401);
    const granted = await unlock(request("POST", { password: "first-password" }), protectedContext);
    assert.equal(granted.status, 200);
    const cookie = granted.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await metadata(request("GET", undefined, cookie), protectedContext)).status, 200);
    await updateBook(protectedBook.id, { passwordHash: hashPassword("second-password") });
    assert.equal((await metadata(request("GET", undefined, cookie), protectedContext)).status, 401);
    assert.equal((await (await library()).json()).books.length, 1);
    assert.equal((await remove(request("DELETE"), context)).status, 200);
    assert.equal((await metadata(request(), context)).status, 404);
    assert.equal((await pdf(request(), context)).status, 404);
    assert.equal((await imageRead(request(), assetContext)).status, 404);
    await Promise.all(Array.from({ length: 5 }, (_, i) => createBook({ ...protectedBook, id: "concurrent" + i, ownerId: "local-demo" })));
    assert.equal((await listBooks("local-demo")).length, 5);
    await writeFile(path.join(dir, "books.json"), "corrupted index");
    await assert.rejects(listBooks("local-demo"));
    Object.assign(process.env, { NODE_ENV: "production", FLIPBOOK_LOCAL_DEMO: "true" });
    assert.equal((await library()).status, 503);
    assert.equal((await create(request("POST", { fileName: "Listing.pdf", size: bytes.length }))).status, 503);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
    await rm(dir, { recursive: true, force: true });
  }
});
