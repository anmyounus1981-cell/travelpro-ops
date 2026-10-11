# Returning traveller database checks

The individual migration must be applied first. Execute each group below in
one transaction, with `BEGIN;` before its files and `ROLLBACK;` after them.
Never run these fixture or audit-failure tests without the outer rollback.
Errors must abort the run; a final result is produced only after assertions pass.

| Group | File order |
| --- | --- |
| Individual identity and trip reuse | individual-account-checks.sql, individual-multitrip-checks.sql |
| Individual passport draft reuse | returning-individual-draft-checks.sql, returning-individual-draft-negative-checks.sql, returning-individual-draft-audit-rollback-checks.sql |
| Corporate regression | returning-corporate-draft-checks.sql, returning-corporate-draft-negative-checks.sql, returning-corporate-draft-audit-rollback-checks.sql |
| Linked consultant permissions | linked-nonowner-checks.sql |

The tests create synthetic accounts, profiles, trip assignments and Storage
metadata. The linked consultant check also creates a temporary test identity
in auth.users. All are rolled back. The image metadata fixtures test database
authorization and linking only, not actual upload/download bytes or OCR.

Verified against the linked database on 11 October 2026: all four groups pass.
Individual tests cover same-name account separation, normalized passport
uniqueness, read-only lookup, client/type isolation, unchanged profile reuse
across two trips, six-field mismatches, unverified profiles, identical retry,
anonymous/unlinked identities and atomic rollback on audit failure. A linked
consultant is rejected by both lookup and confirmation account types.

Owner-authenticated browser verification remains required before application
release: select an individual account, find an existing traveller, change the
account/passport to verify stale lookup invalidation, review/upload a synthetic
passport draft, confirm reuse, and check profile identity, documents and audit.
Trip history should retain both assignments and include upcoming trips.

Security/performance advisors were reviewed. Existing advisories include
unindexed foreign keys, the public vector extension and disabled leaked-password
protection. The new confirmation RPC, like existing approved review RPCs, is
intentionally executable by authenticated users as SECURITY DEFINER, with an
explicit linked-owner check and empty search_path. Anonymous execution is revoked
and linked/nonlinked non-owners are tested. No additional table grants were added.

Advisor references:
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
