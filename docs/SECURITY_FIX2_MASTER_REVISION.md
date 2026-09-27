# Security fix 2 - required Master revision

Approved scope: reject missing/NULL expected_revision on Master saves and Inventory uploads, preserve stale-write rejection, successful saves, calculations and authorization. Restricted Master Review uses the shared Master implementation and receives the same protection.

Frontend remains Live Build 93. This patch changes no frontend file. Baseline main: 5aad3429aa81a4d2d1a3c353aae251b6af7889c5.

## Applied migration

20260927001941_security_fix2_require_master_revision was applied once on 2026-09-27 to mpxpbbpqnvoinyjmuuvf. Do not replay this or earlier migrations.

Only two existing predicates changed:
- purchasing_save_master_v5_impl: `if v_revision<>expected_revision then` -> `if expected_revision is null or v_revision is distinct from expected_revision then`.
- purchasing_save_inventory_v5_fixed: same change for p_expected_revision.

The FOR UPDATE serialization, error text, request-id handling/order, upserts, revision increments, roles, ACLs, task logic, badges, history, unit conversion and formulas remain exactly as before. The prior null-safe Admin guards remain intact. Empty string/type errors and omitted required arguments are rejected by the typed RPC interface; NULL is now rejected inside the shared save routines.

## Verification actually performed

31 PostgreSQL checks passed before applying the patch. Full current routine bodies were cloned into pg_temp with only schema/auth-subject isolation plus the proposed predicates. Synthetic tables used no production identity sequences, and the transaction rolled back. Tests cover authorization from fix 1, NULL/stale/future revisions, missing source metadata, valid Admin save/upload, restricted buyer popup save, target authorization, unchanged duplicate-request behavior and stale editor B rejection after editor A saves. This is a sequential stale-writer simulation, not a multi-session load test; the existing FOR UPDATE path was preserved byte-for-byte.

The synthetic conversion case passed: RP 100 Piece -> 10 Box 10; stock 50 Piece -> 5 Box 10; ratio 50%; Min 7; Max 15; purchase price 60. Restoring the same source through buyer popup produced an identical BO model.

12 post-deployment checks passed against the actual public RPCs under the authenticated database role: Master, Inventory and Popup each rejected NULL, stale and future revisions, and omitted revision arguments failed SQL dispatch. These were rejection-only checks in a rolled-back transaction, not live business saves.

Before/after evidence, also rechecked after endpoint tests:
- Master revision 57 -> 57; request count 57 -> 57; open tasks 15 -> 15.
- Current cycle BO Score 63 / Level 5, source revision 57.
- Synthetic products leaked: 0.
- Master fingerprint: 1ddf9d81426f073603f90a02ad57869b (unchanged).
- Meta fingerprint: 8cd17c5a27c027d5c5bace6d8817f9d2 (unchanged).
- Tasks fingerprint: e6876fadcaf66bc913760b421b29c2e4 (unchanged).
- Cycles fingerprint: af87900f55b5c73f13a2fac647f9d22f (unchanged).
- Uploads fingerprint: 04b02cadf302c478b2308fd075e04594 (unchanged).
- Inventory lines fingerprint: 3b7cdf847104a978c16ce8fe6f01efbb (unchanged).
- Every other purchasing routine definition plus ACL fingerprint: e63c46b9665dfa0791442212d2371118 (unchanged).

Target definition fingerprints:
- Master impl: 0c3d952c48dcf5c6e7c35dfd26b529a0 -> 06897369c893983bc22c012c6ea600d6.
- Inventory fixed: 7e4489772ff19ff7a86dbca7d2978c22 -> ee1c47552fbb2d007df09ba6d49abd89.
- Reversing only the new predicate in memory reproduces each original fingerprint exactly. Both ACLs remain `{postgres=X/postgres,service_role=X/postgres}`.

The SQL regression is reproducible via tests/sql/revision-guard-fix2-sandbox.sql. The new CI job checks static migration scope/safety/caller contracts, separately from the executed SQL checks. Existing workspace/browser regression and fix-1 CI remain required before merge. Merge/deployment results are recorded on the PR after completion.

## Safe recovery

Source hashes and single-occurrence checks abort the complete migration atomically on drift. A function/ACL mismatch also aborts it. Do not restore the vulnerable NULL comparison. A safe contingency keeps the current full routine and uses `if not coalesce(v_revision = expected_revision,false) then` (p_expected_revision in Inventory), with current source verification and the same tests. No data restore or old migration replay is required.

## Remaining items require separate approval

SEC-01 and SEC-02 are complete. Next: SEC-03 restrict legacy table access without deleting history. Then numeric limits, unsaved popup drafts, explicit new-product conversion and unit labels, 48-hour save gate, save-versus-refresh states/Cancel reset, UI status/negative-stock/compactness, broader integration tests, branch/password protection. Data Attention versus task completion and Profit Recovery 120-150 eligibility remain business decisions, not authorized fixes.

References reviewed: PostgreSQL 17 comparison predicates, Supabase Database Functions and RLS documentation, and official HTML changelog. The markdown changelog fetch was unsupported. The local container could not resolve external hosts and had no Supabase CLI, so database work used the authorized MCP connector; the migration filename uses its actual server-recorded version, not an invented timestamp. No credentials were copied into files or CI.
