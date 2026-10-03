# TASK01 - Price/rating attention and verified stock outcomes

User-approved business-rule repair, server only. The frontend remains Live Build 99.

An otherwise verified supplier or recovery outcome is not vetoed solely by missing/zero purchase price or missing profitability classification. The current row must explicitly have blocking_review=false. The exception accepts only the exact canonical price/rating review reasons (individually or together); supplier-missing, unknown or mixed other reasons remain rejected. Missing review flags fail closed.

The only production edit is one review guard in purchasing_private.recovered_v47(jsonb,jsonb,jsonb). All other code in that function, its caller, public RPCs, permissions, ranking, score and purchase calculations remain unchanged. The function remains private, immutable and SECURITY INVOKER with the same owner, ACL and empty search_path. A definition hash prevents applying over unexpected source changes.

Still required: original task evidence, reported stock strictly increased, unchanged purchase unit/raw-unit conversion role/factor/Reorder Point, all targets satisfied, matching supplier and zero Min Order for supplier tasks, and the existing 80/150/50 percent recovery targets. Existing cycle time checks, new-upload requirement and outcome/badge deduplication are preserved by the unchanged caller. Saving Master Data alone still cannot complete a stock task. Master Data Review continues to contain the unresolved price/rating issues.

No backfill, direct task completion, badge insertion, score/history rewrite or production test inventory upload is included. Old closed/expired tasks are not reopened. SEC-03 legacy deletion remains OPEN (backup only).

## Tests and rollout

The dedicated CI runs 270 assertions, including 17 integration scenarios, on an ephemeral PostgreSQL 17.6 service. The exact recovery baseline and caller are extracted from the recorded Build 89 migration and checked against the observed production definition hashes. Supporting auth/dashboard/table dependencies are synthetic, not a full Supabase clone. Tests cover allowed and unapproved attention, blocking/missing flags, unit/evidence/threshold regressions, all-target checks, new vs same upload, deadline, ownership, closed/expired cycles, missing evidence, overlapping tasks, replay, Master Review retention, unchanged ACL/caller, repeat-application rejection, rollback and reapplication. No production credentials or external database connections are accepted by the runner.

The migration was created with Supabase CLI 2.81.3. Apply once through the production migration API after reviewing the current function definition; reconcile the repository filename to the API-recorded migration version if needed. PR comments record actual application and CI/Pages verification; this document does not claim those checks completed before they run.

## Rollback

The original function is the first CREATE OR REPLACE FUNCTION statement in supabase/migrations/20260926163215_build89_profit_recovery_two_bands.sql, definition MD5 8ecdc2f27ccdfbb7d94540785b7d6272. An approved rollback restores only that function after confirming no later edits, not the entire historical migration. The isolated test verifies exact restoration and reapplication. No table data rollback is needed because deployment itself performs no business-data writes. Do not undo legitimate outcomes subsequently verified under the approved rule without a separate decision.
