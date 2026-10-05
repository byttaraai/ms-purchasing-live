# SEC-03 - legacy retirement completed on 2026-10-05

## Latest verified database state

The three approved legacy tables public.products_master, public.inventory_uploads and public.inventory_lines have been deleted with explicit RESTRICT after successful restoration of their protected snapshot into session-local temporary tables. Their own identity sequence is also absent. No Supabase project, repository, Auth account, V5 table, current history, shared routine or business formula was deleted or changed.

Applied once: 20261005115852_security_fix3_retire_legacy_tables. CLI-generated as 20261005115201; the same SQL bytes were renamed to the API-recorded version. Stored SQL Git blob hash equals repository blob 90adbd2ee16fb3df96dd554fb25f695cdddb5fa0. Do not replay this or any old migration.

The actual restore proof is stored in purchasing_private.retired_legacy_snapshot_v1, key sec03_legacy_retirement, verification.retirement. Retirement timestamp: 2026-10-05T11:58:56.581252+00:00.

| Restored snapshot table | Rows | Data MD5 |
| --- | --- | --- |
| products_master | 1576 | 9fd6e4e08f86f01ad254b9c6fe8ea60c |
| inventory_uploads | 1 | cb6f258fa7b4990994aedc9ae8671c29 |
| inventory_lines | 1309 | 462209004645b1544f8605902e760aaf |

All restored constraints were validated, complete contents matched, and the identity sequence state matched. No old broad policies were replayed. Temporary copies were session-local and removed at transaction end. The deletion ran only after the snapshot matched the current old tables in full and the restoration succeeded; any dependency or nonlegacy drift would abort the transaction.

Twenty-one nonlegacy public/private table fingerprints (data, structure, policies and privileges) and every application routine/ACL were compared before and after deletion within the transaction. Shared public.set_updated_at remained. The independently rechecked routine hash remained 06f914c65e37187d509cf36424259153.

A read-only authenticated-context purchasing_dashboard_v5 query succeeded after deletion and exactly matched its pre-deletion JSON hash b2a192111019fc0d8169397b6503da90. Master hash 38023b099d853713e330fc328a474ab1 and rows hash e2d2b5646d3957a6d52557a7ca772387 matched; revision72, 1576 master records and 1598 dashboard rows at both checks. No production save/upload, task synchronization, manual completion or badge grant was performed for deployment testing. Frontend remains byte-identical Build100.

## Retained recovery record

The Sep28 owner-only logical snapshot remains in the SAME database. Its payload checksum is unchanged: 86cd0cb7a6c0785ca2c3e3e7ed2e1d23, 1,204,951 bytes. Anonymous, authenticated and service_role SELECT access remains denied. This is not another operating source, a synchronized master or an independent disaster-recovery backup. No customer records were exported to the public repository.

maintenance/sec03_restore_retired.sql is the reviewed recovery path. Run only as an explicitly authorized transaction. It refuses existing source tables and recreates only the retired legacy definitions/data/constraints/indexes/triggers/identity state. It never restores broad client grants or policies and does not overwrite V5. Full retirement followed by this owner-only recovery passed in isolated PostgreSQL17.6.

## Tests and release verification

Eight synthetic restore scenarios and six migration/recovery scenarios passed, covering constraints, parent references, indexes, identity, trigger behavior, source/snapshot drift, external RESTRICT dependencies and recovery overwrite refusal. Four additional Node contracts verify exact Build100, no legacy identifiers in active runtime scripts, explicit deletion scope and recovery restrictions. These use synthetic canary V5 tables, not a full production clone; existing workspace/browser and TASK01/TASK02 suites also passed before application. Final main/CI/Pages evidence is recorded in PR #38 after merge; do not infer it solely from this database result.

## Historical Sep28 stop (superseded, not rewritten as a success)

20260928110947_security_fix3_backup_legacy_tables created only the private snapshot. The earlier deletion rehearsal was blocked, temporary restore tests had trigger/FK/join/JSON-precedence errors, and a corrected invocation was blocked. No old table was deleted then. That status remained open through Build100.

On Oct5 the redesigned restore and exact deletion/owner-only recovery passed in an isolated database. Production read-only prechecks confirmed lossless snapshot decoding and unchanged old sources. The newly reviewed, explicit migration then succeeded, including the actual protected-snapshot restore before deletion. Neither historical migrations nor previously failed rehearsal SQL were replayed.

## Out of scope

The two old app_assets_v5-based Edge publishing/download functions, authentication configuration and branch protection were inspected only as relevant and were not changed. SEC03 is the three-table retirement, not a purge of every historical project artifact.
