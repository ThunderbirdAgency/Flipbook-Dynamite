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
- **Privacy controls** 🔒 — mark a book **public** or **private**, and/or set a **viewing password**. Enforced on the server: private/protected PDFs are never served (or cached) without access
- **View analytics** 📊 — per-book views, unique visitors, and a **page-reach funnel** showing exactly where readers drop off (owner-only, privacy-preserving)
- **Library** with first-page thumbnails, privacy badges, copy-link and delete actions
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

## Accounts & auth (Clerk)

Auth switches on automatically when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set (see `.env.example`):

- Creators sign in (Clerk modal — email, Google, etc.) to upload and manage **their own** library
- Books are owned: only the owner can rename or delete them
- **Share links and embeds stay public** — viewers never need an account

Without Clerk keys the app runs in open mode (no sign-in, shared library) — handy for local dev.

## How it works

1. **Upload** — `POST /api/books` stores the PDF on disk (`data/pdfs/<id>.pdf`) and records metadata in `data/books.json`.
2. **Render** — the viewer fetches the PDF and rasterizes each page in the browser with [pdf.js](https://mozilla.github.io/pdf.js/) (legacy build for broad browser support). Link annotations are extracted and overlaid as clickable hotspots.
3. **Flip** — rendered pages are handed to StPageFlip, which provides the hard-cover / soft-page flip physics.

### API

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/books` | List the caller's books |
| `POST` | `/api/books` | Register a book (`{ fileName, size, title?, visibility?, password? }`) → returns the upload target |
| `GET` | `/api/books/:id` | Book metadata + `{ locked, canManage }` (access-gated) |
| `PATCH` | `/api/books/:id` | Owner: rename / set `visibility` / set·clear `password` |
| `DELETE` | `/api/books/:id` | Delete book + PDF + events |
| `GET` | `/api/books/:id/pdf` | The PDF, access-gated (`?download=1` forces download) |
| `POST` | `/api/books/:id/unlock` | Exchange a password for an access cookie |
| `POST` | `/api/books/:id/events` | Record a `view`/`page` analytics event |
| `GET` | `/api/books/:id/analytics` | Owner: aggregated stats (`?pages=N`) |

### Storage

Two backends, selected automatically:

- **Supabase** (cloud deploys): set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, **and `SUPABASE_SERVICE_ROLE_KEY`**. Metadata lives in a `flipbook_books` table (events in `flipbook_events`), PDFs in a **private** `flipbook-pdfs` bucket. The server (holding the service-role key) mints one-time **signed upload URLs** and short-lived **signed download URLs** — the browser never uploads with the anon key, and PDFs are never world-readable. RLS locks anon/authenticated clients out of the tables and storage entirely.
- **Local filesystem** (default): books under `data/` (override with `FLIPBOOK_DATA_DIR`). Zero config for local dev or a Docker volume.

Uploads are two-step: `POST /api/books` registers the book and returns the upload target; the client then sends the PDF bytes there.

### Security & privacy

- **Access control** — every book is `public` or `private`, optionally with a viewing **password**. The book page, embed, PDF bytes, and analytics beacon are all gated by the same server-side check; passwords are hashed with scrypt and exchanged for a short-lived, httpOnly, HMAC-signed cookie (`/api/books/:id/unlock`). Private/protected responses are sent `no-store`.
- **No direct storage access** — in Supabase mode the anon key cannot read or write the bucket or tables; all privileged work runs server-side with the service-role key.
- Set **`FLIPBOOK_SECRET`** in production (`openssl rand -hex 32`) so unlock cookies and unique-visitor counts stay stable across restarts/instances.

### Analytics

The viewer sends anonymous `view` / `page` beacons (`POST /api/books/:id/events`). Owners see aggregated stats at `/book/:id/insights`: total views, unique visitors, a per-page reach funnel, and last-viewed time. Visitors are counted via a one-way hash of network + browser — no personal data is stored.

## Stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · pdf.js · StPageFlip
