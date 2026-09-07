# Team access

Each Clerk account owns a personal workspace. The existing book owner remains the workspace owner; membership does not migrate books or change their URLs. Select a shared workspace above the library after accepting an invitation.

| Role | Read private books and analytics | Upload/edit/share/folders/links/shelves | Delete books | Manage people |
| --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Yes | All except ownership transfer |
| Admin | Yes | Yes | Yes | Editors and viewers |
| Editor | Yes | Yes | No | No |
| Viewer | Yes | No | No | No |

Team access is workspace-wide, including private publications. Download UI preferences are not copy protection. Existing public reader access remains unchanged.

Invitations are manually shared, expire after seven days, and require a matching verified Clerk email. Random 256-bit tokens are sent in URL fragments and stored only as SHA-256 hashes. Acceptance is serialized and consumes the invitation. Existing membership cannot be escalated through a stale invitation. Owners cannot be removed or demoted. Revoking an invitation prevents acceptance; removing membership denies new authenticated requests. Previously downloaded bytes and already issued short-lived storage URLs cannot be recalled.

The server validates the selected workspace cookie and checks persisted membership on every operation. The cookie is an untrusted selector, never an authorization claim. SQL tables have RLS and no grants to anon/authenticated; service-role access remains server-only. The mutation RPC repeats role checks and serializes team changes. The live migration is `team_workspace_roles_and_email_bound_invitations`; its tested SQL is in `tests/fixtures/team-schema.sql`.

Verification includes SQL access denials, invite email mismatch/reuse/expiry/revocation, privilege escalation, owner protection, private-book APIs, forged workspace selection, removed-member denial, publishing counting/expiry/disabled links, shelf order and foreign-book rejection. Real second-person Clerk acceptance still requires a separate verified account in browser QA.
