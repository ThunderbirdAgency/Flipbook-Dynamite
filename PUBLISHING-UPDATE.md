# Flipbook Dynamite backend update

Prepared against `release/flipbook-current` on September 5, 2026.

## Implemented and locally verified

- Horizontal navigation for Flipbooks, Bookshelves, Custom links, and Trackable links.
- Custom `/go/name` addresses with collision protection, editing, disable/re-enable, and automatic QR downloads.
- Campaign links with expiry and enable/disable, plus owner-scoped opens and page-event counts. These counts are not unique visitors or reading duration.
- Bookshelves with ordered publications, descriptions, background colors, sharing, QR, and embed code. Protected books retain their gates and do not expose titles on the shelf.
- Expanded customization across the top: appearance, branding, reader controls, metadata, table of contents, layout and interaction.
- CTA button, favicon URL, custom contents, cover treatment, shadow depth, and working visibility switches for share/search/zoom/fullscreen/thumbnails/contents/autoplay controls.
- Existing editor access directly from book rows; existing PDF upload, private/password content, overlays, analytics, QR, and paper sound retained.
- Sharing prefers an active custom URL and supports opening at a particular page. Embed height is adjustable.

## Verification

- 14 automated tests pass, including database role restrictions, owner-scoped analytics, duplicate custom links, branding sanitization, and existing lifecycle/security tests.
- TypeScript, ESLint, and production webpack build pass.
- Local HTTP workflow passes PDF registration/upload/completion, custom redirect, disabling/re-enabling a link, campaign expiration, view/page events, bookshelf rendering, and reader setting persistence.
- Chrome visual checks confirm top navigation, settings tabs, reader preview, hidden search control, CTA, saved custom link, and automatic QR download control.
- Local preview contains a synthetic one-page PDF only. No customer publications were modified.

## Not yet implemented / not claimed as parity

Built-in lead capture; email notifications; restricted-reader lists and protected-domain embeds; PDF replacement and duplication; default-setting templates; richer gallery tools; print/notes/text-selection switches; advanced reading-time/geography/device/search analytics; custom bookshelf logo/favicon/cover thumbnails; full mobile acceptance testing.

## Release target

Approved for publication to `ThunderbirdAgency/Flipbook-Dynamite`, branch `release/flipbook-current`, on September 5, 2026. Production domain traffic remains unchanged.

The tested additive schema in `tests/fixtures/publishing-schema.sql` was applied to the verified Flipbook Dynamite Supabase project as `publishing_links_and_bookshelves`. Existing publication tables and books are unchanged. The hosted migration history is authoritative.
