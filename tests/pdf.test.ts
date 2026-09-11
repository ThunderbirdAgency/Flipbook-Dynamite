import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";

// Small real PDF with text and a link, including a valid cross-reference table.
function fixture() {
  const stream = "BT /F1 24 Tf 20 80 Td (Flipbook Dynamite) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R] >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Annot /Subtype /Link /Rect [20 60 200 100] /A << /S /URI /URI (https://example.com) >> >>",
  ];
  let pdf = "%PDF-1.7\n";
  const offsets: number[] = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf));
}

test("patched legacy PDF renderer polyfills older engines and renders text/links at zoom resolution", async () => {
  Reflect.deleteProperty(Map.prototype, "getOrInsertComputed");
  Reflect.deleteProperty(WeakMap.prototype, "getOrInsertComputed");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: fixture(), useSystemFonts: true });
  const doc = await task.promise;
  try {
    assert.equal(doc.numPages, 1);
    const page = await doc.getPage(1);
    const text = await page.getTextContent();
    assert.ok(text.items.some(item => "str" in item && item.str.includes("Flipbook Dynamite")));
    assert.equal((await page.getAnnotations())[0].url, "https://example.com/");
    const viewport = page.getViewport({ scale: 6 });
    const canvas = createCanvas(viewport.width, viewport.height);
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D, viewport }).promise;
    assert.ok(canvas.toBuffer("image/png").length > 1000);
  } finally { await task.destroy(); }
});
