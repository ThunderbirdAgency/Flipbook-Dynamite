# Flipbook Dynamite — current release handoff

Updated 2026-09-05. This document replaces the outdated July setup instructions.

## Source of truth

- Repository: `ThunderbirdAgency/Flipbook-Dynamite`
- Latest existing work: `claude/flipping-book-business-jeru1f`, commit `d592ffb`
- Release candidate: `release/flipbook-current`
- The default `claude/pdf-flipping-book-app-sukfbi` branch is older. Do not deploy
  it accidentally or overwrite the newer marketing, branding, overlay, and zoom work.
- Intended host: Vercel. This repository has not been converted to another host.
- Supabase project: `flipbook-dynamite`, ref `tujhvzaxwjgzupqzmakx`, us-east-2.

## Verified infrastructure state

Read-only inspection on September 5 found no books and no stored objects.
`flipbook-pdfs` is private; `flipbook-assets` is still public and must become private
with this release. Books/events have RLS and no client policies, intentionally:
all privileged operations run on the server with a service-role key.
No live schema or deployment changes were made during this preparation.

Existing migration history: initialization, July access hardening, branding, overlays.
The new SQL has been tested locally but has NOT been applied to the live project.

## Changes in the candidate

- Missing auth/storage/stable signing configuration returns 503 from data APIs;
  the creator page shows a setup message. No ephemeral Vercel filesystem fallback.
- All management actions require ownership, including the explicit local demo user.
- New books remain pending until actual uploaded bytes match the expected size and
  contain a PDF signature. Failed uploads remain deletable and visible to their owner.
- Signed upload URLs no longer request replacement. PDFs cannot be overwritten by
  replaying the local upload route. Downloads use short-lived storage links.
- All images go through the app gate. The deployment SQL makes their bucket private.
- Locked metadata excludes titles, filenames, overlays, and branding. Public DTOs
  exclude owner IDs and password hashes. Changing a password invalidates old cookies.
- Bounded request streams, same-origin mutation checks, safe link schemes, and
  no-store response headers. Image uploads are capped at 4 MB for Vercel compatibility.
- Database reservations cap PDF/image storage and shared counters limit upload,
  image, unlock, and event requests across serverless instances.
- Failed storage deletion preserves metadata for a retry. Local index writes are
  serialized and corrupt metadata is reported instead of silently discarded.
- Next 16.3.4, PDF.js 6.3.289 legacy build, matching ESLint configuration. Actual PDF
  parsing/rendering was tested without native Map/WeakMap getOrInsertComputed.
- Pricing is explicitly a preview. Checkout is closed until paid subscriptions can
  be provisioned, persisted, and enforced; the previous scaffold could charge without
  connecting the subscription to an account.

## Deployment sequence

1. Inspect the connected Vercel project, its production branch, domain, and env names.
   Vercel connection was confirmed, but tools were not exposed in the active session.
2. Configure a Clerk application and all seven required values in `.env.example` in
   Vercel's intended environments. Store service-role, Clerk, and signing secrets only
   as protected server settings. The browser does not need a Supabase anon key.
3. Generate a migration using `supabase migration new release_readiness`. Put the
   reviewed SQL from `tests/fixtures/readiness-schema.sql` into that generated file.
   The CLI could not be installed in this environment: its network approval was
   cancelled. The SQL remains a tested draft fixture, not a generated migration.
4. Recheck live data and apply the migration to the dedicated project. Preserve all
   existing columns and features. Verify both buckets are private, client roles cannot
   access metadata/objects, reservations work, and security advisors show no new risks.
5. Deploy this candidate to a Vercel preview with the complete environment. Existing
   deployments need the new code alongside the image bucket change. Do not route
   customers to a partially configured version.
6. Confirm the authenticated nightly `/api/maintenance` job runs and expired upload
   reservations are cleared. Exercise real Clerk sign-up/sign-in/sign-out, two distinct creator accounts,
   direct storage uploads, private/password books, revoked passwords, image overlays,
   analytics, QR sharing, and public embeds. Test desktop and mobile browsers.
7. Confirm the production domain and canonical URL, then approve the preview for launch.

## Remaining launch/product decisions

- Real Clerk/Supabase/Vercel end-to-end validation is outstanding. Local tests use a
  demo identity; cloud transport tests use mocks. This is not a penetration test.
- Signed download links remain usable until their expiry after a privacy/password
  change. Previously downloaded material cannot be recalled.
- Signed upload links last up to two hours. Every recently created cloud book
  reserves 100 MB for 130 minutes, even after verification. Deletion hides the record
  but retains its reservation until the authenticated nightly cleanup purges expired
  objects and metadata. Confirm the Vercel cron runs with `CRON_SECRET`; inspect failed
  or backlogged jobs. Capacity may take until cleanup to be released. The endpoint
  processes at most 200 records or 45 seconds of work per run.
- Final prices, Stripe account/Prices, verified idempotent webhook processing,
  subscription persistence, entitlements, cancellation, and account billing portal.
- Analytics now aggregate the full event history in PostgreSQL; tests include 1,501
  views to check that the REST result cap does not truncate totals.
- Real brand logo, owner-approved customer terms/privacy text, account deletion,
  retention/backups, and support contact remain owner/product inputs.
- Large PDF memory behavior needs device testing. The app renders in the browser;
  it does not scan for malware or have a server-side thumbnail pipeline.
- Protected embeds may need opening in a separate tab when a browser blocks
  third-party cookies. Public embeds remain the simplest sharing option.

## APU Command Center direction

Keep Flipbook usable independently. Use its creator identity as the future APU
identity; agree on the shared Clerk application or a verified identity mapping before
adding another login system. The later integration can expose library counts, book
links, and analytics through owner-authorized APIs. Do not expose the Supabase service
key to APU clients or merge unrelated product databases just to share a dashboard.
