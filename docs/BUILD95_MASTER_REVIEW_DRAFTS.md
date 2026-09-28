# Build 95 - Master Review draft protection

Approved repair: keep incomplete products and their entered values after a partial Master Review save; confirm dismissal when there are unsaved edits. No purchasing calculation, priority, task-completion, badge, history, field definition, unit rule or backend permission change.

Baseline main: d5efe0de6619def733dc01964dad0a5c61f5923b (Build 94). Supabase is read-only for this repair. No migration is added or replayed; legacy deletion is still OPEN.

## Behavior

- The opening batch keeps the existing Top 20 codes and their original order. A partial save does not repopulate or reorder that batch.
- Only acknowledged submitted rows are refreshed from the canonical workspace. Unsubmitted rows retain their exact DOM nodes and values, including a native incomplete numeric input such as `1e` that cannot safely be reconstructed from `.value`.
- Partially repaired products keep their remaining issue fields. Already saved fields are not resubmitted. The popup stays open while its original batch still needs review.
- Cancel, X and Escape request explicit confirmation before discarding unsaved edits. Declining keeps the form intact; accepting discards only the local unsaved entries, never committed data. Untouched missing fields do not trigger a false unsaved warning.
- Save and dismissal are guarded while a request is in flight. Repeated Open/render does not destroy a draft; controls reset correctly when reopened.
- A confirmed save followed by a failed refresh stays marked as saved. `Retry Refresh` runs the existing loadLive chain only, not another save. This distinction and the Cancel reset are necessary parts of the same safe partial-save lifecycle.
- The visible draft retains its source revision and per-product source signature. Changed source fields or task membership do not silently overwrite the draft or authorize a stale submission. The original RPC remains authoritative.
- Drafts are kept only in this page's memory/DOM, not in localStorage or Supabase. Browser beforeunload requests a warning while edits or an in-flight save exist; crash recovery or persistence after an explicitly accepted page exit is NOT provided. Account changes clear the previous account's draft; old asynchronous replies cannot dismiss a newer account's popup.

## Verification

Local Chromium ran 40 passing scenarios (20 each at desktop 1440x1000 and narrow 390x844), with synthetic state/server, mocked RPC and zero network requests. The baseline Build 94 asset was reconstructed and matched its exact Git blob 45eaad58fb9c061d791d193de77d0aea89ddf706; running the partial-new-product scenario against it reproduced the premature-close defect. The local numeric parser excerpt matched the retrieved canonical core; CI uses the complete core directly from index.html and existing application styles.

Coverage includes partial new products, partially fixed existing fields, all three dismiss controls, incomplete native numbers, failed save, failed refresh and refresh-only retries, double submission, repeated Open, source/task/revision changes, account isolation, original Top 20 order, reopening Cancel, and the prior numeric bounds. One initial asynchronous test fixture accidentally awaited its own intentionally delayed request; correcting that fixture allowed all 40 scenarios to complete. No production data or runtime rule was changed to resolve a test issue.

The Node contracts compare the unchanged render/field, numeric parser/payload and non-Master routing spans byte-for-byte. The entrypoint test reverses ONLY the Build marker and asset reference to recover the exact pre-fix index hash, so the embedded purchasing logic cannot drift. Existing workspace, risk, Supplier Quest, numeric, Admin-guard and revision-guard suites remain required.

Pre-change read-only database check: Master revision 59, 15 open tasks. Master hash e8ab5069696be01032cd41e41becd098; tasks hash 130c1e1d006a1cca0329fc5e3576ab29; uploads hash 7889aee2d24941ba5f553114bc00b44d; all public/private function definitions and ACL hash 3ffbc4c719ee8f9fdc4f569816f4d8fe. The final PR verification comment records after-check results and main/CI/Pages status; this document alone is not proof of deployment.

## Release and recovery

The container could not resolve GitHub. Source was read through the connected GitHub tool, tested locally, and written to a review branch. A temporary branch-specific preparation workflow performs checked entrypoint/test-wiring replacements only; it is removed before merge. It has no database credentials and cannot run on main.

Rollback is an entrypoint switch to the immutable v94 asset, with matching Build/test references; no database restoration or migration replay is required. A forward correction is preferred to avoid reintroducing draft loss.

Separate pending work: legacy restore verification/deletion, explicit new-product unit conversion inputs, the 48-hour save gate, UI colors/compactness, the Data Attention completion decision, Profit Recovery 120-150 eligibility, and deployment/auth settings.
