# Build 97 - Master Review inventory freshness

## Approved scope
Enforce the existing full-inventory, less-than-48-hours rule in the Master Data Review popup and its restricted save RPC. Keep unsaved entries and all purchasing/task formulas unchanged.

## Implementation
- The popup calls the existing `inventoryFreshnessFor`; no new client age formula.
- Save is guarded both in the UI and immediately before the RPC. A local timer plus focus/visibility events catches an expiry while the dialog stays open. These checks make no network requests.
- A server freshness rejection cannot be bypassed by moving the client clock while retaining the same upload source.
- `Pause & Refresh Inventory` suspends the dialog and invokes the existing inventory-upload control without discarding or silently reassigning the original task's drafts. X/Cancel/Escape keep their discard confirmations.
- Pending `Retry Refresh` remains available because it reloads an already confirmed save; it does not resubmit the write.
- The RPC acquires the existing Master/Inventory metadata row lock before source reads, checks the dashboard-selected full snapshot's deadline using the actual server clock, and checks again after the shared save. Expiry during the write raises an exception and rolls back the complete transaction.
- General Admin Master maintenance and the Inventory upload path are not freshness-gated by this repair, so the existing refresh/recovery route remains available.

## Verification
17 PostgreSQL cases ran against an isolated temporary clone of the candidate RPC, with synthetic tables and rollback. Cases cover missing/partial/failed/undated/expired snapshots, exact 48h, fresh Admin and Purchasing saves, revision guards, elapsed waiting, expiry during save with atomic rollback, the existing legacy date fallback, and no task completion.

28 local Chromium scenarios passed with synthetic IO, the exact v96 baseline and copied canonical freshness/numeric helpers. The baseline v96 reproducer fails with `Expired popup still allows saving`. CI reruns the 28 cases with the complete canonical core/styles and 40 previous draft scenarios against the active v97 module, plus all existing suites. Deployment is not confirmed until main CI and Pages pass.

Published RPC verification reconstructed the exact prior definition after removing only the approved gate. Execution grants, shared numeric/revision/Admin save definitions, revision 59 and 15 open tasks were unchanged. No valid production save was used as a test. A broad fingerprint query was blocked and was not used as evidence of full-table equality.

Migration: `20260929120055_master_review_freshness_v97`, applied once. CLI generated the SQL file before application; the filename was aligned to the applied version without changing its contents. Target definition MD5: `8f5111581a392e51dac60fe6e20d6eb8`; previous: `b7d86b254435bef3f2f3d6bd6bd4bc6a`.

## Rollback and limits
A frontend rollback can restore the previous immutable asset/reference while retaining the compatible server-side protection. Do not rerun older migrations; any server rollback must be separately approved and restore only the verified prior RPC definition, retaining the numeric/revision/Admin safeguards.

Drafts remain in the current page only, not after a crash, reload or confirmed discard. Changed product/task/revision checks remain in force after a new upload; this repair does not automatically rebase drafts into another task cycle. Browser tests are synthetic, not an authenticated production editing session. SEC-03 legacy deletion remains OPEN (backup only) and was not attempted here.
