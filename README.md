# 🧨 Flipbook Dynamite

Turn any PDF into an interactive page-flipping book — with realistic flip animation, clickable links preserved from the PDF, and a shareable URL for every book. Inspired by [FlippingBook](https://flippingbook.com/).

## Features

- **Drag & drop PDF upload** (up to 100 MB, multiple files at once)
- **Realistic page-flip animation** — drag page corners, click, swipe, or use arrow keys ([StPageFlip](https://github.com/Nodlik/StPageFlip))
- **Clickable links preserved** — external URLs in the PDF open in a new tab; internal links (table of contents, cross-references) flip to the right page
- **Shareable URL** for every book: `/book/<id>`
- **Embed code** — drop an `<iframe>` of `/embed/<id>` into any website
- **Library** with first-page thumbnails, copy-link and delete actions
- **Viewer toolbar** — first/prev/next/last, jump-to-page, download PDF, fullscreen
- Mobile-friendly: single-page portrait mode on narrow screens

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## How it works

1. **Upload** — `POST /api/books` stores the PDF on disk (`data/pdfs/<id>.pdf`) and records metadata in `data/books.json`.
2. **Render** — the viewer fetches the PDF and rasterizes each page in the browser with [pdf.js](https://mozilla.github.io/pdf.js/) (legacy build for broad browser support). Link annotations are extracted and overlaid as clickable hotspots.
3. **Flip** — rendered pages are handed to StPageFlip, which provides the hard-cover / soft-page flip physics.

### API

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/books` | List all books |
| `POST` | `/api/books` | Upload a PDF (`multipart/form-data`, field `file`, optional `title`) |
| `GET` | `/api/books/:id` | Book metadata |
| `PATCH` | `/api/books/:id` | Rename (`{ "title": "..." }`) |
| `DELETE` | `/api/books/:id` | Delete book + PDF |
| `GET` | `/api/books/:id/pdf` | The PDF (`?download=1` forces download) |

### Storage

Books live on the local filesystem under `data/` (configurable via the `FLIPBOOK_DATA_DIR` environment variable). This is perfect for a single server / Docker volume. For serverless hosts with ephemeral disks (e.g. Vercel), swap `lib/store.ts` for object storage (S3, Supabase Storage, Vercel Blob) — it's the only file that touches disk.

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · pdf.js · StPageFlip
