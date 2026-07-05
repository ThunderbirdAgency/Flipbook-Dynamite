// Copies the pdf.js web worker into public/ so the browser can load it from
// a same-origin URL (/pdf.worker.min.mjs). Runs automatically before dev/build.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// Legacy build: polyfilled for browsers that lack the newest JS features.
const workerSrc = join(
  dirname(require.resolve("pdfjs-dist/package.json")),
  "legacy",
  "build",
  "pdf.worker.min.mjs"
);
const dest = join(root, "public", "pdf.worker.min.mjs");

mkdirSync(join(root, "public"), { recursive: true });
copyFileSync(workerSrc, dest);
console.log(`Copied pdf.js worker → ${dest}`);
