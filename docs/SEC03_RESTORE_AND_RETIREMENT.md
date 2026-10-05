# SEC03 - verified restoration plan and strictly scoped retirement

## Scope
The user approved retirement of only public.products_master, public.inventory_uploads and public.inventory_lines after recoverability and V5 independence checks. Never delete a Supabase project, repository, V5 source, task/history table, Auth account, shared routine or old migration. No purchasing formulas or UI edits are part of this step; frontend remains Build 100.

## Current preparation evidence (2026-10-05)
Production is still unchanged at preparation time. Its protected Sep 28 snapshot checksum is valid and all 1,576 / 1 / 1,309 legacy rows decode losslessly to their composite types and equal the current legacy sources. Those read-only checks are not a physical restore drill. No inbound V5 foreign key, view, application routine reference or publication on the old tables was found. The two inspected Edge Functions read app_assets_v5, not the old business tables; they are not retired by this change.

Preparation workflow 37305635590 succeeded on synthetic PostgreSQL 17.6. It runs eight restoration cases and six migration/recovery cases, including full row/hash equality, constraints/FKs, identity continuity, indexes, trigger behavior, rejected corrupted snapshots, source drift, external dependency rejection with RESTRICT, and complete owner-only recovery. Nonlegacy isolation uses synthetic canary tables, not a full production Supabase clone. No customer records or production credentials were exported. A previous run correctly refused an external FK but its test expected singular wording; the assertion was corrected without changing deletion logic.

## Production gates
The CLI-generated migration first locks only the three legacy tables, checks the entire snapshot against current data/DDL/ACL/identity state, and checks dependencies. It then physically restores the actual protected snapshot into session-local temporary tables, with temporary FK parents and exact checksums. The original tables are not touched during restoration. Only after success does it execute an explicit three-table DROP ... RESTRICT. Full nonlegacy data, schema, policy, privilege and application routine fingerprints must remain equal, otherwise the whole transaction aborts. Restore proof is stored on the existing private backup record. The same database snapshot is logical recovery, not an independent disaster-recovery backup.

## Recovery
maintenance/sec03_restore_retired.sql is a reviewed owner-only recovery script. It requires all three old tables to be absent, recreates their definitions/data/constraints/indexes/triggers/identity state, and refuses snapshot drift. It does not restore broad client grants or policies. Run only as an explicitly authorized transaction. Do not replay the old backup migration.

## Release gate and limitations
Before application, require all PR regression jobs, including current UI and TASK01/TASK02 suites, to pass. After application, verify actual snapshot proof and old-object absence; confirm V5 source and routine fingerprints, revision and read paths. Record API migration version and final main/CI/Pages results in MIGRATION_HISTORY and the PR. No production save/upload or manual task completion is performed just to test deployment.

Until an explicit application result and postcheck are recorded, SEC03 remains open. The old September status document is historical and must not be treated as evidence of completed deletion.
