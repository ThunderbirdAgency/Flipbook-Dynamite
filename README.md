# 🧨 Flipbook Dynamite

Turn any PDF into an interactive page-flipping book — with realistic flip animation, clickable links preserved from the PDF, and a shareable URL for every book. Inspired by [FlippingBook](https://flippingbook.com/).

## Features

- **Drag & drop PDF upload** (up to 100 MB, multiple files at once)
- **Realistic page-flip animation** — drag page corners, click, swipe, or use arrow keys ([StPageFlip](https://github.com/Nodlik/StPageFlip))
- **Page-flip sound** 🔊 — synthesized paper swish on every turn (mutable, remembered per browser)
- **Clickable links preserved** — external URLs in the PDF open in a new tab; internal links (table of contents, cross-references) flip to the right page
- **Thumbnail strip** — jump to any page from a sidebar of page previews
- **Table of contents** — built automatically from the PDF's bookmarks/outline
- **Zoom** — pan, scroll-wheel zoom, and page-through at up to 500%
- **Autoplay** — hands-free page turning until the back cover
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

Two backends, selected automatically:

- **Supabase** (cloud deploys): set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Metadata lives in a `flipbook_books` table, PDFs in a public `flipbook-pdfs` storage bucket. Browsers upload directly to storage (sidestepping serverless body-size limits) and read PDFs from the storage CDN.
- **Local filesystem** (default): books under `data/` (override with `FLIPBOOK_DATA_DIR`). Zero config for local dev or a Docker volume.

Uploads are two-step: `POST /api/books` registers the book and returns the upload target; the client then sends the PDF bytes there.

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · pdf.js · StPageFlip
