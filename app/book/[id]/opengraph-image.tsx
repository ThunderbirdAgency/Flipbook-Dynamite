import { ImageResponse } from "next/og";
import { getBook } from "@/lib/store";

export const runtime = "nodejs";
export const alt = "Flipbook";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded social-share card for each book (used for og:image / twitter:image).
export default async function OpengraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await getBook(id);
  const title = book?.branding?.seoTitle || book?.title || "Flipbook Dynamite";
  const accent = book?.branding?.accent || "#fbbf24";
  const priv = book ? book.visibility === "private" || book.hasPassword : false;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0d1016 0%, #1b1f27 60%, #2a2f3a 100%)",
          padding: "72px",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              fontWeight: 900,
              color: "#0d1016",
            }}
          >
            F
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, opacity: 0.85 }}>
            Flipbook Dynamite
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ fontSize: "72px", fontWeight: 800, lineHeight: 1.05, maxWidth: "1000px" }}>
            {title.slice(0, 90)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ height: "6px", width: "90px", background: accent, borderRadius: "4px" }} />
            <div style={{ fontSize: "28px", opacity: 0.7 }}>
              {priv ? "A private interactive flipbook" : "An interactive flipbook — flip, watch, explore"}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
