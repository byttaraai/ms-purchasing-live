# SEC03 - verified restoration and strictly scoped retirement

## Latest result
Applied once as 20261005115852_security_fix3_retire_legacy_tables. The actual protected snapshot restored successfully into temporary tables before the three legacy tables were deleted with RESTRICT. All 1576/1/1309 records, constraints and identity state were verified. Twenty-one nonlegacy table data/structure/access fingerprints and all application routines were preserved. The independent post-deletion dashboard read/hash matched the precheck at revision72. See SECURITY_FIX3_LEGACY_RETIREMENT_STATUS.md and PR #38 for detailed proof and final release checks.

## Scope
Only public.products_master, public.inventory_uploads and public.inventory_lines and their own dependencies were retired. No Supabase project, repository, V5 source, task/history table, Auth account, shared routine or old migration was deleted. No purchasing formula or UI edit; frontend remains Build100.

## Preparation
GitHub Actions preparation 37305635590 passed eight restoration and six migration/recovery cases on synthetic PostgreSQL17.6, including full row/hash equality, constraints/FKs, identity continuity, indexes, trigger behavior, rejected corrupted snapshots/source drift, external RESTRICT dependency rejection, and complete owner-only recovery. Nonlegacy isolation used synthetic canary tables, not a full production Supabase clone. No customer records or production credentials were exported. A previous test expected singular rather than plural wording for the correct dependency rejection; only that assertion changed.

## Gates
The migration locks only the three old tables and checks full snapshot/source equality and dependencies. It restores the protected snapshot into session-local temporary copies with temporary FK parents, verifies all contents, then performs the explicit three-table DROP ... RESTRICT. Nonlegacy drift causes an atomic rollback. Proof is retained on the existing private snapshot; its payload remains unchanged and owner-only. It is a logical recovery record in the same database, not independent disaster recovery.

## Recovery
maintenance/sec03_restore_retired.sql requires all three public legacy tables to be absent, restores their definitions/data/constraints/indexes/triggers/identity state, and refuses source overwrite. Broad client grants/policies are never replayed. Run only as an explicitly authorized transaction; never replay the old backup migration.

## Verification limits
Existing workspace/browser, security and TASK01/TASK02 regressions passed before database application. Production verification used actual restoration and read-only dashboard checks, not customer save/upload transactions or manual task completion. Final PR/main CI and Pages results must be verified against the merged SHA; these are recorded separately on PR #38. The app_assets_v5-based publishing endpoints, Auth configuration and branch protection are outside the deletion scope and unchanged.
