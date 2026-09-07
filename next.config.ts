import type { NextConfig } from "next";

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
        { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'" },
      ] },
      ...["/team/:path*", "/app/:path*", "/book/:path*", "/sign-in/:path*", "/sign-up/:path*", "/api/:path*"].map(source => ({
        source, headers: [
          { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      })),
      // Public /embed pages deliberately remain embeddable on agents' websites.
      { source: "/", headers: [{ key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'" }] },
    ];
  },
};

export default nextConfig;
