import type { NextConfig } from "next";

/**
 * Script origins the app legitimately loads from.
 *
 * Clerk serves its SDK from the "frontend API" host, which differs by
 * environment: a custom domain in production, *.clerk.accounts.dev for
 * development and preview builds. Clerk also hands bot challenges to Cloudflare
 * Turnstile. All three are listed so previews and production share one policy.
 */
const CLERK_ORIGINS = [
  "https://clerk.flipbookdynamite.com",
  "https://*.clerk.accounts.dev",
  "https://challenges.cloudflare.com",
].join(" ");

/**
 * Baseline Content-Security-Policy.
 *
 * Honest scope: `script-src` still carries 'unsafe-inline'. Next's App Router
 * ships ~19 inline bootstrap/streaming scripts per page, and the alternative —
 * per-request nonces — forces every route to render dynamically, giving up the
 * static generation the marketing pages rely on. So this policy restricts WHERE
 * scripts may load from (an injected `<script src=evil>` is blocked) but does
 * not by itself stop inline injection. Nonces remain the upgrade path if the
 * static pages ever stop needing to be static.
 *
 * Deliberately permissive directives:
 * - `img-src`/`media-src` allow https: and blob: — creators place arbitrary
 *   image, GIF and video overlays, and pdf.js renders pages into blob: URLs.
 * - `frame-src` allows https: — overlays embed third-party video players.
 * - `worker-src` allows blob: — pdf.js instantiates its worker that way.
 * Fonts are self-hosted by next/font, so no external font origin is needed.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${CLERK_ORIGINS}`,
  `connect-src 'self' ${CLERK_ORIGINS}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * Next REPLACES a header when two rules set the same key — it does not emit both
 * and let the browser intersect them. So every route needs one complete policy:
 * appending `frame-ancestors` to a route-specific rule without repeating the
 * baseline silently drops the whole baseline for that route.
 */
const cspWith = (...extra: string[]) => [CSP, ...extra].join("; ");

/** Routes that must never be framed by another site. */
const NO_FRAME_ROUTES = [
  "/team/:path*",
  "/app/:path*",
  "/book/:path*",
  "/sign-in/:path*",
  "/sign-up/:path*",
  "/api/:path*",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/book/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        // Two years, covering subdomains. The apex, www and Clerk's CNAME are all
        // HTTPS-only, so nothing is stranded by this. `preload` is intentionally
        // omitted: submitting to the preload list is hard to reverse and should
        // be a deliberate, separate decision.
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "Content-Security-Policy", value: CSP },
      ] },
      // These repeat the baseline because the rule below REPLACES the one above.
      // /embed is deliberately absent, so it keeps the baseline without
      // frame-ancestors and stays embeddable on customers' sites.
      ...NO_FRAME_ROUTES.map(source => ({
        source, headers: [
          { key: "Content-Security-Policy", value: cspWith("frame-ancestors 'self'") },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      })),
      { source: "/", headers: [{ key: "Content-Security-Policy", value: cspWith("frame-ancestors 'self'") }] },
    ];
  },
};

export default nextConfig;
