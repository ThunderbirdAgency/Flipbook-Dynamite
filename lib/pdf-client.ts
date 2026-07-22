// Client-side PDF rendering helpers built on pdf.js. Everything in this file
// must only run in the browser (it touches canvas, workers and object URLs).

export interface PageLink {
  /** Position as percentages of the page box, so overlays survive scaling. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** External destination, e.g. https://... */
  url?: string;
  /** Internal destination: 0-based page index inside the same document. */
  pageIndex?: number;
}

export interface RenderedPage {
  objectUrl: string;
  /** Page size in CSS pixels at scale 1 — used for the flipbook aspect ratio. */
  baseWidth: number;
  baseHeight: number;
  links: PageLink[];
}

export interface OutlineItem {
  title: string;
  pageIndex: number;
  depth: number;
}

export interface RenderedPdf {
  pages: RenderedPage[];
  outline: OutlineItem[];
}

// The "legacy" build ships transpiled + polyfilled code; the modern build
// needs bleeding-edge JS features (e.g. Map.getOrInsertComputed) that many
// browsers don't have yet.
type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<Pdfjs> | null = null;

export function loadPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** Longest edge of the rendered bitmap; balances sharpness against memory. */
const TARGET_RENDER_SIZE = 1600;

export async function renderPdfToPages(
  pdfUrl: string,
  onProgress?: (done: number, total: number) => void,
  signal?: { cancelled: boolean }
): Promise<RenderedPdf> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ url: pdfUrl });
  const doc = await task.promise;
  const pages: RenderedPage[] = [];
  let outline: OutlineItem[] = [];

  try {
    outline = await extractOutline(doc);
    for (let i = 1; i <= doc.numPages; i++) {
      if (signal?.cancelled) break;
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(
        2.5,
        Math.max(1, TARGET_RENDER_SIZE / Math.max(base.width, base.height))
      );
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      // PDF pages have no implicit background; paint white so JPEG export
      // doesn't turn transparent regions black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, viewport }).promise;

      const links = await extractLinks(doc, page, viewport);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.88)
      );
      if (!blob) throw new Error(`Could not encode page ${i}`);
      canvas.width = 0;
      canvas.height = 0;

      pages.push({
        objectUrl: URL.createObjectURL(blob),
        baseWidth: base.width,
        baseHeight: base.height,
        links,
      });
      page.cleanup();
      onProgress?.(i, doc.numPages);
    }
  } finally {
    task.destroy().catch(() => {});
  }

  if (signal?.cancelled) {
    pages.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    return { pages: [], outline: [] };
  }
  return { pages, outline };
}

/** Flatten the PDF's bookmark tree into a list with depth markers. */
async function extractOutline(
  doc: Awaited<ReturnType<Pdfjs["getDocument"]>["promise"]>
): Promise<OutlineItem[]> {
  const items: OutlineItem[] = [];
  let nodes: Awaited<ReturnType<(typeof doc)["getOutline"]>>;
  try {
    nodes = await doc.getOutline();
  } catch {
    return items;
  }
  if (!nodes) return items;

  type OutlineNode = (typeof nodes)[number];
  const walk = async (list: OutlineNode[], depth: number) => {
    for (const node of list) {
      if (depth > 3 || items.length > 200) return; // sanity bounds
      try {
        const dest =
          typeof node.dest === "string" ? await doc.getDestination(node.dest) : node.dest;
        if (Array.isArray(dest) && dest[0]) {
          const pageIndex = await doc.getPageIndex(
            dest[0] as Parameters<(typeof doc)["getPageIndex"]>[0]
          );
          items.push({ title: node.title || `Page ${pageIndex + 1}`, pageIndex, depth });
        }
      } catch {
        // Skip entries whose destination can't be resolved.
      }
      if (node.items?.length) await walk(node.items, depth + 1);
    }
  };
  await walk(nodes, 0);
  return items;
}

/**
 * Pull link annotations off a page and convert them to viewport-relative
 * percentage boxes. Handles both external URLs and internal jumps.
 */
async function extractLinks(
  doc: Awaited<ReturnType<Pdfjs["getDocument"]>["promise"]>,
  page: Awaited<ReturnType<(typeof doc)["getPage"]>>,
  viewport: ReturnType<(typeof page)["getViewport"]>
): Promise<PageLink[]> {
  const links: PageLink[] = [];
  let annotations: Array<Record<string, unknown>> = [];
  try {
    annotations = (await page.getAnnotations()) as Array<Record<string, unknown>>;
  } catch {
    return links;
  }

  for (const annot of annotations) {
    if (annot.subtype !== "Link" || !Array.isArray(annot.rect)) continue;

    const rect = annot.rect as number[];
    const [x1, y1] = viewport.convertToViewportPoint(rect[0], rect[1]) as number[];
    const [x2, y2] = viewport.convertToViewportPoint(rect[2], rect[3]) as number[];
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    if (width < 1 || height < 1) continue;

    const box = {
      left: (left / viewport.width) * 100,
      top: (top / viewport.height) * 100,
      width: (width / viewport.width) * 100,
      height: (height / viewport.height) * 100,
    };

    if (typeof annot.url === "string" && annot.url) {
      links.push({ ...box, url: annot.url });
      continue;
    }

    if (annot.dest) {
      try {
        const dest =
          typeof annot.dest === "string"
            ? await doc.getDestination(annot.dest)
            : (annot.dest as unknown[]);
        if (Array.isArray(dest) && dest[0]) {
          const pageIndex = await doc.getPageIndex(
            dest[0] as Parameters<(typeof doc)["getPageIndex"]>[0]
          );
          links.push({ ...box, pageIndex });
        }
      } catch {
        // Unresolvable destination — skip this link rather than break the page.
      }
    }
  }
  return links;
}

/** Read a PDF's page count without rendering anything. */
export async function getPageCount(pdfUrl: string): Promise<number> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ url: pdfUrl });
  const doc = await task.promise;
  try {
    return doc.numPages;
  } finally {
    task.destroy().catch(() => {});
  }
}

/** Render just the first page of a PDF into an existing canvas (thumbnails). */
export async function renderFirstPage(
  pdfUrl: string,
  canvas: HTMLCanvasElement,
  maxWidth: number
): Promise<void> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ url: pdfUrl });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = (maxWidth * (window.devicePixelRatio || 1)) / base.width;
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport }).promise;
    page.cleanup();
  } finally {
    task.destroy().catch(() => {});
  }
}
