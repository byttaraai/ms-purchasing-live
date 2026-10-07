# Build 102 - stable navigation and footer printing

## Approved scope
Move the existing BO Print Selected button and selection count from the application header to the end of the BO table, immediately before Export. Both actions use compact 32px controls. Anchor desktop tabs to the left immediately after the brand, with one subtle separator; keep account actions on the right. Compact viewports use one consistent navigation row below the brand. Preserve the Build101 sticky header and measured BO table offsets.

## Implementation boundaries
Only index.html markup (moving the original print wrapper intact, adding the new CSS reference and build marker) and assets/css/navigation-v102.css affect runtime. No JavaScript, purchasing calculation, selection/printing/export handler, task completion, badge counting, supplier priority, risk, history, database schema, or business data is changed. The original boHeaderActions/printSelectedBtn/selectedCount IDs remain unique; the existing navigation visibility and inventory-lock guards still control them. The footer is not fixed or sticky. The task badge has a reserved slot without changing its zero-count hiding behavior.

## Verification
The navigation-v102.cjs inverse patch reconstructs the exact Build101 index blob 7d68537f289ed8e47be191265c4d5658cd2a48e4. Historical release guards normalize only this reversible, separately hash-checked UI patch; all original tests and required CI contexts remain. The new actual-page browser suite uses synthetic data and blocks external network requests. It checks navigation geometry across four destinations and badge counts, compact layouts, footer alignment, original checkbox and print handlers, and unchanged sticky navigation. Existing header/popup/supplier and calculation regression suites remain release gates.

Temporary source-preparation workflow and script are excluded from the final release tree. The live release must be confirmed by protected PR merge, same-main-SHA CI and successful GitHub Pages deployment; evidence is recorded in the PR discussion. Rollback is a reviewed revert of this UI PR, with no database action.
