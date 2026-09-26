# Build 83 - Supplier Quest split layout

## Approved presentation
- White product workspace on the left, approximately 70% of the modal.
- Dark navy/indigo control panel on the right, approximately 30%, capped at 430px on wide screens to give the table more room.
- Only a compact stage title and count remain above the table. Supplier identity, the vertical nine-stage stepper, search, view controls, help and details are in the sidebar.
- Previous, contextual Print, save status and the existing primary action remain anchored at the bottom of the control panel. Table scrolling does not move them.
- On viewports below 980px, the table takes the available width. Stages & tools opens an accessible drawer. The same action bar moves between the bottom of the workspace and the drawer; no duplicate buttons or handlers.
- Escape closes the compact drawer before closing the quest, including when search is focused. Hidden controls are inert. Desktop resize restores the two-column layout.

## Implementation boundary
The new layout layer moves the existing Build 82 DOM nodes after rendering. Existing event handlers, drafts, source-change guards, selections, five BO batches, print functions, server RPCs, task/badge verification and all purchasing/risk calculations are retained. The Build 82 JavaScript is byte-for-byte unchanged and verified by a hash test. No Supabase changes or migrations.

The mockup's illustrative product pictures were not inserted as fabricated inventory data. Existing product names, codes and units remain the source of the table.

## Verification
- Existing 62 Node tests retained, plus 6 layout-only contract tests.
- Existing complete synthetic Supplier Quest journey: data editor, five purchase bands, selection/filtering, draft recovery, failure/retry, warehouse review, risk decisions, summary, saved outputs and matching BO print.
- Real-browser geometry and pointer/keyboard checks at 1920x1080, 1366x768, 1024x768, 768x1024 and 390x844.
- Desktop tables receive over 84% of modal height; sidebar ratio, non-overlap, fixed actions and absence of desktop horizontal table overflow are checked.
- Compact drawer, focus return, retained filtering and the single action bar are checked with real input events.
- All browser tests use synthetic local data with external network blocked; no production product/inventory/action/badge records are created by testing.
