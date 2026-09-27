# Security fix 1 - null-safe admin guards

User-approved scope: deny missing/inactive roles on general Master save and Inventory upload, preserving restricted purchasing access to Master Review.

Frontend baseline remains Live Build 93 (16feea1137de136e3faffc9f7013ddb9c492658a). This is a backend-only security repair, not a UI release.

## Applied once

Migration 20260927000607_security_fix1_null_safe_admin_guards.sql was applied on 2026-09-27 to mpxpbbpqnvoinyjmuuvf. Do not replay it.

Only two existing predicates change from `public.purchasing_current_role_v5() <> 'admin'` to `public.purchasing_current_role_v5() IS DISTINCT FROM 'admin'`:
- purchasing_save_master_v5(jsonb,text,integer,uuid)
- purchasing_save_inventory_v5_fixed(jsonb,text,date,text,boolean,boolean,integer,uuid,text)

The role resolver already ignores inactive users. Signatures, grants, the restricted v93 popup RPC, general save implementation, conversion rules, formulas, task completion, badges and history are untouched.

## Verification

18 PostgreSQL sandbox checks passed using full live routine bodies cloned into pg_temp and synthetic tables. Only schema references and the auth subject were isolated. The transaction rolled back; no production identity sequences were used. Covered missing/inactive roles, purchasing denial on general writes, no login, Admin Master save, Inventory save and price conversion, Min/Max/stock ratio, ordinary revision conflict, restricted buyer popup save, out-of-task denial and execution grants.

Six further checks ran against deployed public RPCs under the authenticated database role with invalid payloads: missing role denied; no login denied; active Admin reaches ordinary payload validation. No production business write was attempted. An initial no-login test fixture used an invalid empty UUID; its transaction rolled back, then the corrected absent-subject fixture passed.

Before/after results:
- Master revision: 57 -> 57. Request count: 57 -> 57.
- Synthetic products leaked: 0.
- Master hash: 46356b1d94b1bbe00c37563f6cda32ed (unchanged).
- Tasks hash: fa2aaf906c63c48c5eda1e1ebf6dd650 (unchanged).
- Task cycles hash: 9de55df5c9b8286ef03e49e6113fefe8 (unchanged).
- All other public/private routine definitions plus ACLs: a7f7c3c75e932fc5b7d0475d560ed4f8 (unchanged).
- Target ACLs unchanged. Replacing the new predicate back in-memory reproduces each exact old definition hash, proving that no other target code changed.

Static CI contracts are separate from the SQL sandbox. Existing workspace and browser CI also remain required before merging. SQL tests are reproducible in tests/sql/admin-guard-fix1-sandbox.sql through an authorized SQL connection. They do not require production user data.

## Safe recovery

The migration aborts atomically on any source drift or unexpected definition change. Never restore the vulnerable predicate. A post-deployment fallback can retain the current full routine body and replace the new predicate with `coalesce(public.purchasing_current_role_v5(),'') <> 'admin'`, then repeat the same tests. Compare current hashes before doing so. No old migration replay and no production data restoration are needed for this predicate-only patch.

## Remaining audit items - separate approvals

- SEC-02: reject missing expected_revision; preserve optimistic concurrency.
- SEC-03: restrict legacy-table access without deleting history.
- DATA-01: align numeric limits between inputs, server and core.
- Popup: protect unsaved/partial inputs; distinguish saved from refresh failure; reset Cancel.
- Units: explicit new-product factor/option unit and purchase-unit labels.
- Freshness: enforce the 48-hour gate on popup saves.
- UI: status colors, negative-stock visibility, compact layout.
- Business decision: Data Attention versus official purchase-task completion.
- Business decision: Profit Recovery eligibility in 120-150 percent.
- Testing: broader popup integration tests beyond the current static checks.
- Deployment/security: branch protection and leaked-password protection.

References consulted: official PostgreSQL 17 comparison predicates and Supabase Database Functions documentation. The markdown changelog fetch was unavailable; the official HTML changelog was reviewed. No relevant platform change required a wider patch.
