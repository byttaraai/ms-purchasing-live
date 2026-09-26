# Build 82 - Supplier Quest UI/UX

## Scope
Frontend only, on top of Build 81. No database migrations, no changes to purchasing quantities, accounting, Supplier Priority, BO Score, the canonical Overstock Risk model, task completion, badge/history rules or the 48-hour inventory lock.

## Employee workflow
- Compact supplier header; technical source details collapsed by default.
- Stage stepper with product counts, preserved sequence and server-specific reconfirmation.
- Data Review shows one actionable issue/status per product. Add Price / Review Unit / Review Reorder Point opens the existing editor and focuses the corresponding field. Existing master validation and save endpoint are unchanged.
- Single confirmation button for selected products or explicit No Purchase / No Reallocation. No extra checkbox.
- In-memory, per-user/task/upload/stage drafts survive back/forward navigation and closing/reopening within the current tab. Drafts are NOT server-confirmed actions; reload/sign-out clears them. Dirty-close and before-unload warnings protect work.
- Search by code/name, selected-only view, clear selection, select-all-visible without altering hidden selections, separate stage/BO counts.
- Saved/error/busy feedback; all controls are restored after successful save or failure. Source refresh does not silently confirm a different quantity.
- Full-width five-batch BO review and five output tabs. Unconfirmed drafts block final review submission until the affected stages are confirmed.
- Read-only output viewer and supplier/product/date filtering. Lists are labelled Prepared for a department, never Sent automatically.
- Identical BO print path from final review and saved output: Product / Unit / Min Order / Max Order, five batches, no price/value/stock-band percentages.
- Unknown quantities stay unknown. Empty saved snapshots never fall back to changed live quantities.
- Scoped responsive styles, larger hit targets, fixed action area, native modal keyboard containment and background scroll lock.

## Verification
- Hash-based guard for unchanged index business code, workspace engine, risk engine/UI and stage policy.
- Existing workspace, Overstock and Supplier Quest regression suites retained.
- New unit tests cover snapshots, null quantities, print equivalence, explicit no-action, existing data gates, server staleness, text escaping and responsive nav isolation.
- Synthetic browser journey covers real existing master-editor flow, failures/retry, draft reopening, filtering/selection, all five purchasing stages, Warehouse review, all decision destinations, final submission and output/print equivalence.
- Browser mocks never call the Live Database. They assert the client does not mark the Supplier Task completed or change badge totals.
- Local visual/keyboard review performed at 1366x768, 1024x768, 768x1024 and 390x844. CI reruns synthetic journeys on desktop and smaller viewport requests.

## Boundaries
Department dispatch, cross-user department access, BO editing after submission and BO-to-inventory reconciliation are not introduced by this UI release. The existing server remains responsible for actual task verification and badges. Non-blocking data attention remains non-blocking.
