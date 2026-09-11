import test from "node:test";
import assert from "node:assert/strict";
import { configuration } from "../lib/config";
import { parseBookInput, parseTitle, assertValidId, validatePdf, safeLink, parseViewingPassword } from "../lib/validation";
import { assertSameOrigin, clientAddress, readBoundedBody, readJson } from "../lib/http";

test("production and Vercel cannot fall back to an anonymous demo", () => {
  for (const env of [{ NODE_ENV: "production", FLIPBOOK_LOCAL_DEMO: "true" }, { NODE_ENV: "development", VERCEL: "1", FLIPBOOK_LOCAL_DEMO: "true" }, {}]) {
    assert.equal(configuration(env as NodeJS.ProcessEnv).ready, false);
    assert.equal(configuration(env as NodeJS.ProcessEnv).localDemo, false);
  }
  assert.equal(configuration({ NODE_ENV: "test", FLIPBOOK_LOCAL_DEMO: "true" }).localDemo, true);
  assert.equal(configuration({ NODE_ENV: "test", FLIPBOOK_LOCAL_DEMO: "true", SUPABASE_URL: "https://example.supabase.co" }).localDemo, false);
});

test("cloud storage requires a server secret, not the old anonymous key", () => {
  assert.equal(configuration({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key" }).storageEnabled, false);
});

test("filenames, IDs, sizes, and titles reject malicious or malformed input", () => {
  for (const fileName of ["../file.pdf", "a\\b.pdf", "a\n.pdf", "x.html", "x".repeat(256) + ".pdf"]) {
    assert.throws(() => parseBookInput({ fileName, size: 100 }));
  }
  for (const size of [0, -1, 0.5, "100", Infinity, 104857601]) assert.throws(() => parseBookInput({ fileName: "book.pdf", size }));
  for (const id of ["../etc/passwd", "a*", "", "a".repeat(33)]) assert.throws(() => assertValidId(id));
  assert.throws(() => parseTitle(" "));
  assert.throws(() => parseTitle("x".repeat(201)));
  assert.equal(parseBookInput({ fileName: "Listing.pdf", size: 100 }).title, "Listing");
});

test("completion checks actual bytes and rejects size spoofing", () => {
  const pdf = new TextEncoder().encode("%PDF-1.7\nhello");
  assert.doesNotThrow(() => validatePdf(pdf, pdf.length, pdf.length));
  assert.throws(() => validatePdf(pdf, pdf.length, 1));
  assert.throws(() => validatePdf(new TextEncoder().encode("<script>alert(1)</script>"), 25, 25));
  assert.throws(() => validatePdf(pdf, 104857601, 104857601));
});

test("PDF links allow web/contact protocols and reject executable URLs", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "vbscript:x", "//example.com"]) assert.equal(safeLink(url), false);
  for (const url of ["https://example.com", "http://example.com", "mailto:agent@example.com", "tel:5551234567"]) assert.equal(safeLink(url), true);
});

test("cross-site mutation requests are refused", () => {
  assert.throws(() => assertSameOrigin(new Request("https://flip.example/api/books", { headers: { origin: "https://evil.example" } })));
  assert.throws(() => assertSameOrigin(new Request("https://flip.example/api/books", { headers: { "sec-fetch-site": "cross-site" } })));
  assert.doesNotThrow(() => assertSameOrigin(new Request("https://flip.example/api/books", { headers: { origin: "https://flip.example" } })));
});

test("stream limits apply even when Content-Length is absent or false", async () => {
  await assert.rejects(readBoundedBody(new Request("https://flip.example", { method: "POST", body: "123456789", headers: { "Content-Length": "1" } }), 5));
  await assert.rejects(readJson(new Request("https://flip.example", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })));
  await assert.rejects(readJson(new Request("https://flip.example", { method: "POST", body: "{}" })));
});

test("rate-limit address ignores caller-supplied forwarded hops", () => {
  const at = (headers: Record<string, string>) =>
    clientAddress(new Request("https://flip.example/api/books/x/unlock", { headers }));

  // A spoofed leftmost entry must never become the bucket key.
  assert.equal(at({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }), "203.0.113.9");
  assert.equal(at({ "x-forwarded-for": "203.0.113.9" }), "203.0.113.9");
  // Platform-attested headers win over the client-supplied chain.
  assert.equal(at({ "x-forwarded-for": "1.1.1.1", "x-vercel-forwarded-for": "203.0.113.9" }), "203.0.113.9");
  assert.equal(at({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "203.0.113.9" }), "203.0.113.9");
  assert.equal(at({}), "0.0.0.0");
});

test("viewing passwords must be long enough to survive an online guessing attack", () => {
  for (const weak of ["", "1234", "spring2026", "password", "aaaaaaaaaaaaaaa", "123456789012", 42, null]) {
    assert.throws(() => parseViewingPassword(weak));
  }
  assert.equal(parseViewingPassword("correct horse battery"), "correct horse battery");
});

test("creator and book pages reject cross-site framing without blocking embed pages", async () => {
  const { default: config } = await import("../next.config");
  const rules = await config.headers!();
  for (const route of ["/app/:path*", "/book/:path*", "/sign-in/:path*", "/sign-up/:path*"]) {
    const rule = rules.find(r => r.source === route && r.headers.some(h => h.key === "X-Frame-Options"));
    assert.ok(rule, `${route} must have anti-framing headers`);
    assert.ok(rule.headers.some(h => h.key === "Content-Security-Policy" && h.value.includes("frame-ancestors 'self'")));
  }
  assert.equal(rules.some(r => r.source.startsWith("/embed") && r.headers.some(h => h.key === "X-Frame-Options")), false);
});
