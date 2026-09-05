import test from "node:test";
import assert from "node:assert/strict";
import type { StoredBook } from "../lib/types";

test("cloud upload stays pending until storage bytes verify; no privileged key is returned", async () => {
  Object.assign(process.env, { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://flip.example",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-server-key",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "test-clerk", CLERK_SECRET_KEY: "test-clerk-secret",
    CRON_SECRET: "test-cron-secret-at-least-32-characters", FLIPBOOK_SECRET: "test-stable-secret-at-least-32-characters" });
  delete process.env.SUPABASE_URL;
  const { completeUpload, getUploadTarget, deleteBook, cleanupExpiredUploads } = await import("../lib/store");
  const book: StoredBook = { id: "cloudbook01", title: "Cloud", fileName: "cloud.pdf", size: 25,
    status: "pending", ownerId: "creator", createdAt: new Date().toISOString(), visibility: "private",
    hasPassword: false, passwordHash: null, branding: {}, overlays: [] };
  let content = "%PDF-1.7\nCloud test\n%%EOF";
  book.size = Buffer.byteLength(content);
  let published = false;
  let storageMissing = false;
  let deletionFails = false;
  let metadataDeleted = false;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer test-server-key");
    if (url.includes("status=in.(pending,deleted)")) return Response.json([{ id: book.id }]);
    if (url.includes("/rest/v1/flipbook_books") && !init?.method) return Response.json([{ ...book, file_name: book.fileName, created_at: book.createdAt, owner_id: book.ownerId, password_hash: null }]);
    if (url.includes("/object/upload/sign/")) return Response.json({ url: "/object/upload/sign/flipbook-pdfs/cloudbook01.pdf?token=scoped-token" });
    if (url.includes("/object/authenticated/")) {
      if (storageMissing) return new Response(null, { status: 404 });
      assert.equal(headers.get("range"), "bytes=0-1023");
      return new Response(content, { status: 206, headers: { "content-range": `bytes 0-${Buffer.byteLength(content) - 1}/${Buffer.byteLength(content)}` } });
    }
    if (url.includes("/rest/v1/flipbook_books") && init?.method === "PATCH") {
      if (JSON.parse(String(init.body)).status === "deleted") { metadataDeleted = true; return Response.json([book]); }
      published = true;
      return Response.json([{ ...book, file_name: book.fileName, created_at: book.createdAt, owner_id: book.ownerId, password_hash: null, status: "ready" }]);
    }
    if (url.endsWith("/object/flipbook-pdfs") && init?.method === "DELETE") return new Response(null, { status: deletionFails ? 500 : 200 });
    if (url.includes("/object/list/")) return Response.json([]);
    if (url.includes("/rest/v1/flipbook_events") && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (url.includes("/rest/v1/flipbook_books") && init?.method === "DELETE") { metadataDeleted = true; return Response.json([book]); }
    throw new Error("Unexpected request " + url);
  };
  try {
    const target = await getUploadTarget(book.id);
    assert.equal(JSON.stringify(target).includes("test-server-key"), false);
    assert.deepEqual(target.headers, {});
    storageMissing = true;
    await assert.rejects(completeUpload(book), /finished uploading/);
    assert.equal(published, false);
    storageMissing = false;
    const valid = content;
    content = "<script>alert(1)</script>";
    await assert.rejects(completeUpload({ ...book, size: content.length }), /not a PDF/);
    assert.equal(published, false);
    content = valid;
    await assert.rejects(completeUpload({ ...book, size: 1 }), /size does not match/);
    assert.equal(published, false);
    assert.equal((await completeUpload(book)).status, "ready");
    deletionFails = true;
    await assert.rejects(deleteBook(book.id), /retry deletion/);
    assert.equal(metadataDeleted, false);
    deletionFails = false;
    assert.equal(await deleteBook(book.id), true);
    assert.equal(metadataDeleted, true);
    assert.deepEqual(await cleanupExpiredUploads(), { removed: 1, failed: 0 });
  } finally { globalThis.fetch = original; }
});
