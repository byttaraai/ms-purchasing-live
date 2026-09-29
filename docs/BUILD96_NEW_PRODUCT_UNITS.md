# Build 96 - Master Review new-product unit definitions

## Approved scope

The user approved explicit Option Unit + Factor entry for NEW products when conversion is needed, and clarified that Purchase Unit labels may appear inside the popup only. The main table retains its existing single Purchase Unit column; no alternative-unit display or existing-product unit editing is added to that table.

- The new-product popup offers Purchase Unit and Option Unit; Factor is shown when an option is selected or typed factor text remains. No conversion factor is guessed or prefilled.
- Option choices come from existing purchase/option units plus the current product's raw inventory unit. The server validates that same allowed set.
- Factor means the number of Option Units in one Purchase Unit. Both sides reuse the established unit rules. If the current raw unit is known, creation requires it to resolve to the selected purchase/option definition; choosing an unrelated unit cannot silently create a factor-1 rule.
- With no conversion needed, the existing null Option Unit / Factor 1 identity rule is retained. Other incomplete master fields may still be saved and remain Needs Review as before.
- Purchase Price and Reorder Point labels identify the Purchase Unit in this popup. Changing a new product's selection updates labels only, never rescales or overwrites typed prices, quantities or factor drafts.
- Existing-product unit fields remain read-only/unavailable here. The RPC explicitly rejects purchase_unit, option_unit or factor keys for existing products.
- The same restricted purchasing_master_review_save_v93 endpoint and shared save implementation are used. No changes to unit-conversion expressions, BO Score, Risk, Supplier Priority, Top 20 ranking, task completion, badges or history.

## Verification

Before deployment, 31 isolated PostgreSQL cases passed with exact live save/dashboard bodies cloned into temporary tables/functions. No production sequence defaults were copied; the transaction rolled back. Coverage includes explicit conversion, missing/invalid/nonfinite factors, same-unit conflicts, source-unit mismatch, existing-unit protection, NULL/stale/future revision rejection, authorization and current-task scope, atomic batch rejection, partial new-product saves, negative stock, and existing-product price edits.

A 120-Piece synthetic inventory became 10 Box 12 with Factor 12. Purchase Price 100 and Reorder Point 20 remained in purchase units; stock ratio 50, Min 14 and Max 30 matched the unchanged engine. Purchase-unit inventory was not divided again. Source names were retained and task rows were unchanged.

Seven real deployed RPC rejection checks passed in a READ ONLY transaction: three existing-product unit edits and four invalid new-product definitions. The current workspace also passed the prior DATA-01 numeric output validator. In-memory removal of only the approved units edits exactly reconstructed the original function definition hash; no rollback or production product save was executed.

Frontend verification includes 8 Node contracts and 16 real Chromium unit-entry/save scenarios. Local browser runs use copied canonical unit-helper excerpts; CI uses the complete canonical core from index.html and actual styles. The previous 40 draft-protection scenarios run against the active v96 module in addition to the frozen v95 suite. All previous workspace/risk/Supplier Quest/security/numeric suites remain enabled. Final PR/main/Pages results are recorded in the PR discussion, not assumed from this document.

## Database and release record

Migration 20260929113114_master_review_units_v96 applied exactly once. The SQL file was first created by pinned Supabase CLI 2.81.3 migration new (20260929112954), then its filename was aligned with the actual applied version without changing its contents. Temporary branch-only release preparation files and write-enabled workflow were removed before merge; no production credentials/data were sent to Actions.

Pre/post deployment: Master revision 59; 15 open current tasks. Master hash e8ab5069696be01032cd41e41becd098, Tasks 130c1e1d006a1cca0329fc5e3576ab29, Uploads 7889aee2d24941ba5f553114bc00b44d are unchanged. All other public/private function definitions+ACLs retain hash 230b6e593475c47d645948f6af16ac1e. Target RPC ACL is unchanged; its definition hash changed only from d6365b6ca01e7a82194c60b1598fc8da to b7d86b254435bef3f2f3d6bd6bd4bc6a.

## Recovery and remaining work

Prefer a forward fix. A frontend rollback can restore the v95 script reference and marker; backend still accepts valid prior no-conversion and existing-product requests. Do not replay any migration. A server rollback must restore only the target RPC to its verified original definition after checking the current hash; it must not remove prior authorization/revision/numeric guards or modify newly entered business data.

SEC-03 legacy deletion remains OPEN (backup only). The 48-hour popup save guard, status/color polish and business-rule decisions remain separate pending approvals. No legacy restore/deletion was attempted in this change.
