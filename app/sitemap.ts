import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  // Publications remain discoverable only through their owner's sharing choices.
  return [
    { url: "https://flipbookdynamite.com", changeFrequency: "weekly", priority: 1 },
    { url: "https://flipbookdynamite.com/pricing", changeFrequency: "monthly", priority: 0.7 },
  ];
}
