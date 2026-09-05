# Flipbook Dynamite

A Next.js web app that turns PDFs into interactive flipbooks. The latest feature
branch is `claude/flipping-book-business-jeru1f`; the older default branch is
behind it. This release candidate preserves the latest viewer and marketing work.

## What works in the candidate

- Marketing website, creator library, Clerk sign-in/sign-up, per-user ownership.
- PDF upload, verified publication, viewing, sharing, QR codes, and website embeds.
- Search, bookmarks, clickable links, 3D page turning, and crisp zoom.
- Private/password books, branding, drag-and-drop media overlays, and analytics.
- Server-only Supabase credentials, private storage, bounded request bodies,
  ownership checks, shared request limits, and storage reservations.

The candidate is **not deployed or approved for launch**. Paid plans are previews;
checkout does not charge customers. See [HANDOFF.md](HANDOFF.md) for deployment
requirements and the remaining release checks.

## Local development

Requires Node 24 and npm. For an isolated demo, create `.env.local` containing only:

```dotenv
FLIPBOOK_LOCAL_DEMO=true
```

Then run:

```sh
npm ci
npm run dev
```

The demo stores data under `data/`. It does not run in production or on Vercel.
For a cloud environment, use the required values in `.env.example`. Missing
credentials close the creator app and data APIs instead of opening a shared library.

## Verification

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
```

Tests cover actual route handlers, ownership and password revocation, PDF lifecycle,
cloud storage response handling with mocked transport, a real PostgreSQL engine,
and real PDF rendering using the patched legacy PDF.js build. These checks do not
substitute for Clerk/Supabase/Vercel integration tests or browser acceptance tests.

## Storage

Creators upload directly to a scoped Supabase upload URL to avoid Vercel's request
body limit. The app verifies the uploaded file's size and PDF signature before
publishing. PDF and image access goes through the app's ownership/password gate.
Upload verification is not malware scanning or full PDF structural validation.

Preview limits: 100 books, 1 GB of PDFs, 100 MB per PDF, and 128 image slots of up to
4 MB each per account. Cloud uploads reserve 100 MB for 130 minutes while their upload links can remain valid. Cancelled uploads keep that reservation until nightly cleanup. Image slots
are reused on replacement and freed when the deleted book is purged. The local demo enforces the
PDF limit; production also enforces image reservations in PostgreSQL.
