import test from "node:test";
import assert from "node:assert/strict";

/**
 * The site must tell search engines, unambiguously, that this origin is the home
 * of "Flipbook Dynamite". These are the signals that let it outrank a same-named
 * public repository for its own brand query; losing one silently is exactly the
 * kind of regression nobody notices for weeks.
 */
test("site metadata is indexable, absolute-URL safe, and carries a social card", async () => {
  const { siteMetadata, SITE_URL, SITE_NAME } = await import("../lib/seo");

  // Absolute <head> URLs must never derive from a localhost fallback.
  const base = String(siteMetadata.metadataBase).replace(/\/$/, "");
  assert.equal(base, (process.env.NEXT_PUBLIC_APP_URL || SITE_URL).replace(/\/$/, ""));
  assert.notEqual(base.includes("localhost"), true);

  const robots = siteMetadata.robots;
  assert.ok(robots && typeof robots === "object");
  assert.equal(robots.index, true);
  assert.equal(robots.follow, true);

  assert.equal(siteMetadata.applicationName, SITE_NAME);
  assert.ok(siteMetadata.openGraph && "images" in siteMetadata.openGraph && siteMetadata.openGraph.images, "site needs a social card image");
  assert.equal(siteMetadata.twitter && "card" in siteMetadata.twitter && siteMetadata.twitter.card, "summary_large_image");
});

test("structured data binds the brand name to this origin", async () => {
  const { structuredData, structuredDataJson, SITE_URL, SITE_NAME } = await import("../lib/seo");
  const types: readonly string[] = structuredData["@graph"].map((n) => n["@type"]);
  for (const t of ["Organization", "WebSite", "SoftwareApplication"]) assert.ok(types.includes(t), `${t} node required`);
  for (const node of structuredData["@graph"]) {
    assert.equal(node.name, SITE_NAME);
    assert.equal(node.url, SITE_URL);
  }
  // Embedded verbatim in a <script>, so it must not be able to close the tag.
  assert.equal(structuredDataJson.includes("</"), false);
  assert.doesNotThrow(() => JSON.parse(structuredDataJson));
});

test("robots and sitemap agree, and expose only the public pages", async () => {
  const { default: robots } = await import("../app/robots");
  const { default: sitemap } = await import("../app/sitemap");
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  const urls = sitemap().map((e) => e.url);

  assert.equal(r.sitemap, "https://flipbookdynamite.com/sitemap.xml");
  assert.ok(urls.includes("https://flipbookdynamite.com"));
  assert.ok(urls.includes("https://flipbookdynamite.com/pricing"));
  // The creator workspace and auth pages are for signed-in users; they must be
  // neither crawled nor listed, and reader pages are discoverable only through
  // their owners' sharing choices.
  for (const blocked of ["/app", "/api/", "/sign-in", "/sign-up"]) {
    assert.ok((rules?.disallow as string[]).includes(blocked), `${blocked} must stay disallowed`);
  }
  assert.equal(urls.some((u) => /\/(app|api|sign-in|sign-up|book|embed)\b/.test(u)), false);
});
