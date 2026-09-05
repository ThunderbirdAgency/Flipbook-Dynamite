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

The initial inspection found no books or stored objects. The owner has since signed
in successfully and created two pending uploads. Both failed before bytes were sent:
Storage returned 400 when the app declared JSON but sent an empty signing-request
body. The request now sends `{}`, with a regression test for the parsing failure.

The `release_readiness` migration was applied through Supabase MCP on September 5.
Both PDF and image buckets are private. Client roles have no metadata grants;
privileged operations run on the server. The `creator_workspace` migration was
also applied: private account folders, placements, and owner-scoped view summaries.
Its tested SQL is in `tests/fixtures/workspace-schema.sql`. The original readiness
SQL is in `tests/fixtures/readiness-schema.sql`; the remote migration history is the
authoritative application record. Local migration-file generation remains blocked
by the previously cancelled CLI network approval; do not invent timestamp filenames.

Authenticated Vercel inspection confirmed the existing project:

- Team: `thunderbird-agency`; account: `emiller-4447`.
- Project ID: `prj_gIE6JB755AmBTm5XgJFuH8b3MAJ1`; Node.js 24.x; root directory `.`.
- Production still uses `claude/pdf-flipping-book-app-sukfbi`. Do not change traffic
  until the candidate is configured and verified.
- Candidate preview alias:
  `https://flipbook-dynamite-git-release-flipboo-06762b-thunderbird-agency.vercel.app`.
- Initially no application environment variables or integration resources existed.
  Production app URL/Supabase URL and fresh signing/cron secrets have now been added.
  The release preview has its own signing/cron secrets, restricted to that branch.
- The owner approved Clerk Marketplace terms and supplied the existing application
  `app_3ItlzmYtbb0FNLZm8rvOJGCC8rD`. Use this app rather than provisioning another.
  Clerk CLI was installed, but its browser login could not be completed. The owner
  chose direct Vercel configuration instead. The development publishable key is now
  stored as Config, and the owner entered `CLERK_SECRET_KEY` as Secret. Both target
  Preview and Development; the secret was initially scoped to Production and was
  moved without reading its value. Production Clerk keys remain outstanding.
  An unused `NEXT_CLERK_PUBLISHABLE_KEY` entry was also entered by the owner; the app
  uses the correctly named `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` entry.
  No new Clerk application or paid plan was created.
- The owner saved `SUPABASE_SERVICE_ROLE_KEY` securely. It is scoped to Preview.
  A deployed request confirmed server access to Supabase after the readiness migration.
  Never paste credentials into a chat, document, or commit.
- `flipbookdynamite.com` is attached to this Vercel project. GoDaddy still controls
  DNS and serves its existing parking records. No DNS or nameserver changes made.
  Vercel currently recommends two apex A records: `216.150.1.1` and `216.150.16.1`.
  Reverify these recommendations at launch; defer the DNS cutover until validation.

Migration history now includes release readiness and the creator workspace.
The database permission checks and 12 regression/lifecycle/schema tests passed.

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

1. Use the existing linked Vercel project identified above. The connected app's empty
   project list was misleading; authenticated CLI inspection works. Do not create a
   duplicate project.
2. Preview keys are configured; production Clerk and Supabase credentials remain to
   be configured before launch. Keep development Clerk keys out of production.
3. Both prepared database changes are applied and tested. Preserve live user data.
4. Deploy the creator portal candidate with private folders, list/grid views, search,
   sorting, CSV export, per-book views, rename, branding, sharing/privacy, and analytics.
5. Run `node --conditions=react-server --import tsx scripts/verify-cloud-storage.ts`
   only inside the configured Vercel preview environment. It uses stored credentials
   internally and prints only stage results. It verifies real signed upload,
   finalization, byte-identical private download, analytics, image storage, folder
   persistence/ownership and cleanup using its own synthetic owner. It never prints
   keys or signed URLs. This does not replace browser sign-in and large-PDF testing.
6. Confirm the authenticated nightly `/api/maintenance` job runs and expired upload
   reservations are cleared. Exercise real Clerk sign-up/sign-in/sign-out, two distinct creator accounts,
   direct storage uploads, private/password books, revoked passwords, image overlays,
   analytics, QR sharing, and public embeds. Test desktop and mobile browsers.
7. Confirm the production domain and canonical URL, then approve the preview for launch.

## Remaining launch/product decisions

- The owner has confirmed real Clerk sign-in through the creator page. Browser upload,
  viewer, privacy, and mobile acceptance still need testing after the upload fix.
  The opt-in live server verification is separate from browser acceptance.
- Clerk provider placement and the explicit `/__clerk/:path*` matcher were updated
  to match the supplied setup instructions. The marketing header now shows a
  profile control and library link for signed-in users. TypeScript and ESLint pass.
  `clerk doctor` could not finish because its network approval was cancelled; do
  not report that diagnostic or a real sign-in workflow as passed.
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
