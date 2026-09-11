import type { Metadata } from "next";

// Search-engine identity for the site, in one place. The root layout spreads
// `siteMetadata` into its metadata and the landing page embeds
// `structuredData`; the SEO tests import this module directly, which they
// cannot do with the layout (it imports CSS and fonts that only bundlers load).

export const SITE_URL = "https://flipbookdynamite.com";
export const SITE_NAME = "Flipbook Dynamite";

/**
 * Origin every absolute <head> URL derives from (canonical, og:url, og:image).
 * Falls back to the production origin rather than localhost: a build that
 * happens to lack the variable must never tell search engines the site lives
 * at localhost:3000.
 */
export const appUrl = process.env.NEXT_PUBLIC_APP_URL || SITE_URL;

export const siteMetadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: SITE_NAME,
  keywords: ["flipbook", "PDF to flipbook", "interactive flipbook", "digital publishing", "page flip", "embed PDF"],
  category: "technology",
  // Explicit index/follow. Nothing was blocking crawlers before, but an explicit
  // directive is what a crawler trusts, and it rules the question out.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    title: SITE_NAME,
    description: "Turn any PDF into an interactive page-flipping book.",
    url: appUrl,
    siteName: SITE_NAME,
    images: [{ url: "/hero.png", width: 1440, height: 900, alt: "A branded Flipbook Dynamite book, mid-spread, with a video layer" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: "Turn any PDF into an interactive page-flipping book.",
    images: ["/hero.png"],
  },
  // Google Search Console ownership proof. Set GOOGLE_SITE_VERIFICATION in the
  // Vercel project to the token Search Console hands out and redeploy; no code
  // change needed. Omitted entirely when unset so we never emit an empty tag.
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

/**
 * Structured data that names the brand and binds it to this origin. Without it
 * Google has only page text to go on, and a public GitHub repository with the
 * same name in its title is a perfectly good match for the query "flipbook
 * dynamite". This says which result is the organisation, which is the website,
 * and what the product is.
 */
export const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/flipbook-dynamite-logo.png`, width: 940, height: 363 },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      alternateName: "flipbookdynamite.com",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-US",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Turn any PDF into a 3D interactive flipbook with video and GIF layers, custom branding, full-text search, analytics, and a shareable link or embed.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free preview tier" },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
} as const;

/** Serialised for a JSON-LD <script>; `<` is escaped per Next's JSON-LD guide. */
export const structuredDataJson = JSON.stringify(structuredData).replace(/</g, "\\u003c");
