# Build 94 - DATA-01 numeric validation

Approved scope: align numeric entry and server validation with the existing PurchasingCore.number supported range. No change to purchasing formulas, rankings, task selection/completion, badges or history. SEC-03 legacy deletion is still OPEN; this release does not attempt restore or deletion.

## Change

- An immutable task-assistant-v94.js succeeds v93. The only behavior changes are numeric parsing through the existing C.number, rejecting native badInput, the existing 1e12 maximum on the two inputs, and numeric error text. The existing popup partial-save, close and refresh behavior is otherwise unchanged (its separate audit items remain open).
- Supabase migration 20260928113235_data01_numeric_validation was applied once to mpxpbbpqnvoinyjmuuvf. Do not replay it or earlier migrations.
- Validated CHECK constraints protect Master factor/order multiple/Reorder Point/purchase price and Inventory raw quantity/raw Total Buy Price against unsupported/nonfinite values. Existing nonnegative/positive rules, optional blanks and general-Master zero-price review semantics remain. Negative inventory is still accepted and flagged, not clamped.
- A private, non-SECURITY-DEFINER numeric-output validator is invoked inside the existing Master and Inventory save transactions. Even individually bounded inputs are rejected atomically when their resulting workspace numeric fields exceed the current core range. This avoids saving a price or quantity that subsequently prevents workspaceDataset from loading.
- The RPC names, signatures, execution grants, prior Admin and required-revision guards, request-id ordering and all calculation expressions are unchanged. The restricted buyer popup continues through the shared Master implementation.
- Existing numeric(18,6) storage limits still apply. The 1e12 core limit is not a promise that every quantity field can store its exact endpoint; storage precision was not widened or silently rounded differently.

## Verification actually performed

69 isolated PostgreSQL checks passed with full live function bodies cloned into pg_temp, synthetic tables and transaction rollback. Covered valid Master/Inventory/popup saves, unit and price conversions, BO-model equivalence for identical source, negative stock, zero values, all Master numeric fields, NaN/Infinity/oversized/malformed values, derived total/imported-price overflow, all 11 workspace numeric outputs, unauthorized callers and stale/NULL/future revisions. One initial fixture used tied transaction timestamps for two uploads; its negative-stock assertion selected the earlier upload. The fixture used a distinct synthetic snapshot date and then all 69 passed. No production change was made to solve that test issue.

7 post-deployment checks passed: the real general-Master and restricted-popup RPCs rejected NaN, Infinity and 1e13 prices, and the current real workspace passed the output validator. Rejection tests rolled back; no valid production save was used as a test.

Before/after database fingerprints matched exactly:
- Master: 1ddf9d81426f073603f90a02ad57869b
- Metadata: 8cd17c5a27c027d5c5bace6d8817f9d2
- Tasks: e6876fadcaf66bc913760b421b29c2e4
- Cycles: af87900f55b5c73f13a2fac647f9d22f
- Uploads: 04b02cadf302c478b2308fd075e04594
- Inventory lines: 3b7cdf847104a978c16ce8fe6f01efbb
- Request log: 32e771fb9493466df81fe45d55a1f5e3
- Non-target function definitions and ACLs: 89427678779f4e50944c130d94349fb3

Master revision stayed 57; stored current-cycle BO Score 63 / Level 5; 15 current open tasks; no synthetic production product. Removing the single added validator call in memory reproduces each original function-definition hash. All three constraints are validated. The helper is not executable by anon/authenticated.

Frontend tests include behavioral tests using the actual embedded PurchasingCore and real-browser popup cases at desktop/mobile dimensions with mocked RPC and all network traffic blocked. Existing workspace, Supplier Quest, risk, Admin-guard and revision-guard suites remain in CI. PR/deployment confirmation records the actual final results, main SHA and Pages run; this document alone is not proof of a live deployment.

## Release preparation and recovery

The local container could not download the repository/CLI. A temporary, exact-branch-only GitHub Actions job ran pinned Supabase CLI 2.81.3 migration new, applied source-hash-checked file edits and committed only the generated asset/manifest/test files to the review branch. Its write-enabled workflow and staging scripts were removed before merge. No database credentials or business data were sent to Actions. The CLI-created migration filename was aligned with the actual already-applied Supabase version; its SQL body matches the applied migration.

Prefer a forward fix. Frontend-only rollback may restore the v93 asset reference while keeping server validation. Never replay historical migrations or undo SEC-01/SEC-02. Any database rollback must target only DATA-01 constraints/helper call sites after reviewing current definitions and data; it must preserve existing role, revision, calculation and task rules.

Remaining separately approved work: SEC-03 restore verification/deletion; popup unsaved-input protection and save-versus-refresh status; units; 48-hour popup save gate; UI status; Data Attention completion and Profit Recovery 120-150 business decisions; broader security settings.
