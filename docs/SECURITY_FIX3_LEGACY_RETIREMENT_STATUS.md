# SEC-03 - legacy retirement: BACKUP ONLY, NOT COMPLETE

## User-approved scope

The user approved deleting only the original `public.products_master`, `public.inventory_uploads`, and `public.inventory_lines` tables plus their own dependent objects, after a recoverable snapshot and verification that live V5 workflows are unaffected. No Supabase project, GitHub repository, V5 table, current history, formula, or other audit item is approved for deletion/change.

## Actual state on 2026-09-28

**No legacy table has been deleted. SEC-03 remains open.**

Applied once: `20260928110947_security_fix3_backup_legacy_tables`.
Do not replay this migration or any historical migration.

A single logical snapshot is stored in `purchasing_private.retired_legacy_snapshot_v1`, key `sec03_legacy_retirement`. It contains all legacy rows and captured table DDL, defaults, constraints, indexes, trigger definitions, policies, owner/grants, comments, and identity state/settings. It is a private recovery record in the SAME database, not an independent disaster-recovery backup, synchronized data source, or new operating path. Raw snapshot data is deliberately NOT committed to this public repository.

The snapshot table has RLS enabled and all access revoked from PUBLIC, anon, authenticated, and service_role. Administrative database-owner access remains. No public RPC was added.

Read-only checks confirmed:
- The stored payload checksum matches: 1,204,951 bytes of logical snapshot JSON.
- Snapshot/source counts: 1,576 master rows; one inventory upload; 1,309 inventory lines.
- All three original tables are still present with those row counts.
- Anonymous and authenticated roles have no SELECT privilege on the snapshot.
- V5 Master, Tasks, and Inventory Upload fingerprints still match the pre-backup baseline.
- Master revision remains 57.

The backup migration also compared all non-legacy public/purchasing_private table data, structure and permissions, and all application routine definitions/ACLs before and after snapshot capture, aborting on any difference. It changed no frontend/runtime assets. Frontend remains Build 93.

## Why deletion stopped

An initial combined transactional deletion rehearsal was blocked by the tool safety check, with no database change. The supported migration action was then used for NON-DESTRUCTIVE snapshot capture only.

Temporary restore tests did not complete successfully. Test-fixture corrections were needed for trigger-name substitution, PostgreSQL's prohibition on temporary foreign keys referencing permanent tables, one SQL join typo, and JSONB operator precedence. Failed test transactions rolled back. The corrected restore-test invocation was blocked by the tool safety check. No further restore/deletion execution was attempted after that block.

Therefore checksum/row-count verification must NOT be described as a successful restore drill, and CI success for this backup/documentation change must NOT be described as successful legacy retirement. No live save/upload or post-deletion workflow test has been claimed for this step.

## Remaining completion gate

Complete an authorized, reviewed restore drill and V5 save/upload/calculation regression check before any table deletion. Recheck current dependencies and confirm the old tables still match the snapshot; otherwise refresh the recovery plan. Any deletion must explicitly name only the three approved tables and use RESTRICT, never broad CASCADE. Keep shared routines and all V5 objects intact. Restore must not automatically re-enable the old overly broad client policies/grants.

Repository changes in this step only record the applied non-destructive backup and the incomplete status. No deletion migration is included.

## Next audit item, still unapproved

DATA-01: align numeric input/server validation with the existing calculation engine's supported range, to prevent saving values that later make workspace calculations fail. Do not implement until separately approved.
