# Flipbook Dynamite — Developer Handoff

*Last updated: 2026-07-06*

## What this is

**Flipbook Dynamite** (www.flipbookdynamite.com) is an independent SaaS product that turns
uploaded PDFs into interactive page-flipping books — the business model of
[flippingbook.com](https://flippingbook.com), built from scratch. Creators sign in and upload
PDFs; every book gets a public shareable URL and an iframe embed code. Viewers never need an
account.

- **Repo:** `ThunderbirdAgency/Flipbook-Dynamite` (GitHub)
- **Working branch:** `claude/pdf-flipping-book-app-sukfbi` (currently also the default branch)
- **Status:** feature-complete v1, fully tested locally; deploy to Vercel pending (see *Pending*)

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) | ⚠️ Next 16 renamed `middleware.ts` → `proxy.ts` |
| UI | React 19, Tailwind CSS 4 | dark theme, amber/orange brand accents |
| PDF rendering | `pdfjs-dist` v5 **legacy build** | v6 and the modern v5 build need `Map.getOrInsertComputed`, which many browsers lack — do not "upgrade" without checking |
| Flip engine | `page-flip` (StPageFlip) v2 | no bundled types; shim in `types/page-flip.d.ts` |
| Auth | Clerk (`@clerk/nextjs` v7) | v7 has **no** `SignedIn`/`SignedOut` components — branch on `auth()` in server components |
| Database + file storage | Supabase (Postgres + Storage) | dedicated project, see *Infrastructure* |
| Hosting | Vercel (planned) | config in `vercel.json` |

## Architecture

### Rendering pipeline (all client-side)
1. Viewer fetches the PDF from `/api/books/:id/pdf` (filesystem mode streams it; Supabase mode
   307-redirects to the public storage CDN URL — CORS is `*`).
2. `lib/pdf-client.ts` rasterizes each page to a JPEG object URL via pdf.js (max edge 1600px,
   scale ≤2.5), extracts **link annotations** (external URLs + internal jump targets) as
   percentage-positioned hotspots, and flattens the PDF's bookmark **outline** into a TOC.
3. `components/FlipbookViewer.tsx` hands the rendered pages to StPageFlip and overlays the link
   hotspots (`<a class="fb-link">`) on each page. External links open new tabs; internal links
   call `flip(pageIndex)`.
4. Page-flip **sound** is synthesized in `lib/flip-sound.ts` with Web Audio (two layered
   band-passed noise swishes) — no audio asset. Triggered by StPageFlip's
   `changeState === "flipping"` event; mute preference persists in `localStorage("fbd-muted")`.

### Storage: one API, two backends (`lib/store.ts`)
- **Supabase mode** — active when `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  are set. Metadata in `flipbook_books` table (via PostgREST, plain `fetch`, no SDK), PDFs in
  public `flipbook-pdfs` bucket.
- **Filesystem mode** — default fallback. `data/books.json` + `data/pdfs/*.pdf`
  (override dir with `FLIPBOOK_DATA_DIR`). Zero-config local dev.

**Uploads are two-step** (sidesteps Vercel's ~4.5 MB request-body limit):
1. `POST /api/books` (JSON: `fileName`, `size`, optional `title`) → creates the record, returns
   `{ book, upload: { url, method, headers } }`.
2. Client sends the raw PDF to `upload.url` — directly to Supabase Storage (cloud) or
   `PUT /api/books/:id/pdf` (filesystem). On failure the client deletes the record.

### Auth (Clerk) — `lib/auth.ts`, `proxy.ts`
- Auth activates **only when** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` are set;
  otherwise the app runs in **open mode** (no sign-in, shared library) — intentional, so local
  dev needs zero setup.
- With auth on: library (`GET /api/books`) and uploads are per-user (`owner_id` = Clerk user id);
  rename/delete require ownership. **Book pages, PDFs, share links, embeds stay public.**
- `proxy.ts` (Next 16's middleware) conditionally runs `clerkMiddleware()`.

### Routes
| Route | Purpose |
| --- | --- |
| `/` | Landing + library (sign-in gated when auth is on) |
| `/book/[id]` | Full viewer (toolbar, share dialog) |
| `/embed/[id]` | Chrome-less viewer for iframes |
| `GET/POST /api/books` | List (owner-scoped) / create book record |
| `GET/PATCH/DELETE /api/books/[id]` | Metadata / rename / delete (owner-only) |
| `GET/PUT /api/books/[id]/pdf` | Fetch PDF (public) / receive bytes (fs mode) |

### Viewer features
Flip animation (drag corners / click / swipe / arrow keys), flip sound + mute, thumbnail strip,
TOC panel (from PDF outline), zoom overlay (wheel/drag/500%), autoplay, jump-to-page, fullscreen,
download, share dialog (direct link + embed code), single-page portrait mode on mobile.

## Infrastructure (already provisioned)

- **Supabase project:** `flipbook-dynamite`, ref `tujhvzaxwjgzupqzmakx`, region us-east-2,
  in "ThunderbirdAgency's Org" ($10/mo, created 2026-07-06).
  - Table `public.flipbook_books` (id, title, file_name, size, created_at, owner_id) with RLS on
    and permissive anon policies (writes are gated by the app API; see *Hardening*).
  - Storage bucket `flipbook-pdfs`: public read, 100 MB/file cap, `application/pdf` only.
  - Migrations were applied via the Supabase MCP as `flipbook_dynamite_init`.
- **`vercel.json`** carries the Supabase URL + anon key (public-safe by design) and
  `NEXT_PUBLIC_APP_URL=https://www.flipbookdynamite.com` for both runtime and build env.
- **Leftover to ignore:** the shared project `mrmaozyegbdbhffyxmtv` briefly hosted a prototype
  table/bucket; data was removed. An empty `flipbook_books` table + empty `flipbook-pdfs` bucket
  may remain there — safe to drop.

## Running & testing

```bash
npm install
npm run dev        # http://localhost:3000 — open mode, filesystem storage
npm run build && npm start
npm run lint
```

- `predev`/`prebuild` copy the pdf.js **legacy** worker to `public/pdf.worker.min.mjs`
  (gitignored) — see `scripts/copy-pdf-worker.mjs`.
- To exercise cloud storage locally, set the two Supabase env vars (see `.env.example`).
- No test framework yet; e2e was done with Playwright scripts driving upload → flip → links →
  thumbnails → zoom → autoplay → share (all passing as of the last commit). Porting those to
  Playwright Test in-repo is a good first task.

## Pending / next steps

1. **Vercel deploy** — not done. Either import the GitHub repo in the Vercel dashboard
   (Team: Thunderbird Agency, `team_fSmicSKlbQbj2RntMmWpJZTg`) or `vercel deploy` from an
   authenticated CLI. `vercel.json` makes it zero-config.
2. **Clerk keys** — create the Clerk application, then set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` +
   `CLERK_SECRET_KEY` in Vercel env. Auth turns on automatically.
3. **Domain** — add `www.flipbookdynamite.com` in Vercel → Domains; CNAME at GoDaddy.
4. **Logo** — owner has a brand logo to replace the placeholder SVG in `app/page.tsx` /
   `app/book/[id]/page.tsx` + favicon.

## Access control, security & analytics (added 2026-07-22)

- **Privacy per book** — `visibility` (`public`/`private`) + optional scrypt-hashed **password**.
  Gate logic lives in `lib/access.ts` (`decideAccess`) and `lib/gate.ts`; it guards the book
  page, embed, `GET /pdf`, and the analytics beacon. Unlock flow: `POST /api/books/:id/unlock`
  verifies the password and sets a short-lived, httpOnly, HMAC-signed cookie (`fb_acc_<id>`).
  `canManage` (owner in auth mode; everyone in open mode) drives the owner UI; **viewing** is
  always strictly gated (open mode does *not* bypass passwords).
- **Signed storage** — `SUPABASE_SERVICE_ROLE_KEY` (server-only) now issues one-time **signed
  upload URLs** and short-lived **signed download URLs** against a **private** bucket. The anon
  key can no longer touch storage or the tables. Applied via Supabase migration
  `flipbook_access_control_and_hardening` (adds `visibility` + `password_hash`, creates
  `flipbook_events`, drops all permissive anon/authenticated policies, sets the bucket private).
- **Analytics** — viewer beacons (`POST /api/books/:id/events`) feed owner insights at
  `/book/:id/insights` (`GET /api/books/:id/analytics`): views, unique visitors, page-reach
  funnel. Visitors are an HMAC of IP+UA — no PII stored.
- **Required env now:** `SUPABASE_SERVICE_ROLE_KEY` (Supabase mode) and `FLIPBOOK_SECRET`
  (stable cookie/visitor signing) — see `.env.example`. Set both in Vercel before deploying.

## Premium viewer + branding (added 2026-08-31)

- **3D look** — `FlipbookViewer` now renders a two-page spread on desktop (single page
  on phones, re-inits StPageFlip across the 900px breakpoint). `app/globals.css` carries the
  depth system: spine/gutter shading via StPageFlip's `--left`/`--right` classes, fore-edge
  page-thickness shadows, a lit studio environment, a contact shadow, paper sheen, and richer
  hard covers. Verified with headless-Chromium screenshots.
- **Branding** — `Branding` on the `Book` model (`branding` jsonb column; migration
  `flipbook_branding`): bg color/image, accent, logo + link, SEO title/description, download
  toggle. Edited via the owner-only "Customize" dialog (`components/BrandingDialog.tsx`),
  merged/validated in `lib/branding.ts`, applied in the viewer + embed, and SEO fields feed
  `generateMetadata`. Logos/backgrounds live in a **public** `flipbook-assets` bucket (writes
  via service role); served through `/api/books/[id]/asset/[kind]` (fs streams; Supabase
  redirects to the public CDN URL).
## Search, enrichment & sharing (added 2026-09-01)

- **Full-text search** — page text is extracted during render (`lib/pdf-client.ts`
  `getTextContent`) and searched in `components/SearchPanel.tsx` (highlighted snippets,
  jump-to-page).
- **Interactive overlays** — `overlays` on the `Book` model (jsonb column, migration
  `flipbook_overlays`), validated in `lib/overlays.ts`. Types: video (YouTube/Vimeo/MP4,
  pop-up or inline), image/GIF (movable layer), link (URL or `#page`), iframe embed.
  Editor: `components/OverlayEditor.tsx` (drag/resize on a flat page surface, image upload,
  Save). Viewer: `components/OverlayLayer.tsx` renders layers over each StPageFlip page +
  a shared lightbox. Overlay images upload via the generalized asset endpoint (any safe kind).
- **Sharing** — `ShareDialog` adds social buttons + a QR code (`qrcode` dep). Per-book
  OpenGraph/Twitter card via `app/book/[id]/opengraph-image.tsx` (next/og), branded with the
  book's title + accent.

- **Still open (optional):** lead-capture gate + CSV export; a branded "bookshelf" landing
  page; crawlable server-rendered body text; higher-DPI on-demand zoom render. Core
  FlippingBook parity (3D viewer, branding, search, enrichment, share, security) is done.

## Hardening / known gaps (roughly in priority order)

- `books.json` fs-mode writes aren't concurrency-safe under heavy parallel use (fine for dev).
- No pagination on the library, no rate limiting, no upload virus scanning.
- Rendering is fully client-side; very large PDFs (100+ pages) are memory-hungry on weak
  devices. A server-side pre-render/thumbnail pipeline is the scalable path.
- Roadmap candidates: analytics (views per book), custom branding per book, PDF text search,
  password-protected books, Clerk↔Supabase third-party-auth RLS integration.
