# Build 84 - Supplier Quest presentation polish

## Approved changes
- Preserve the white-left/dark-right 70/30 layout and capped sidebar from Build 83.
- Align every on-screen table heading and value to the left with matching cell padding. Checkbox cells remain centered. Quantities and printed BO content are unchanged.
- Two-line supplier header: Supplier Quest and review state share the top line with small Details/Close controls; the supplier name occupies its own line.
- Current stage stays indigo. Changed source data uses a small amber Changed label rather than an amber row. Unsaved choices have a distinct blue Draft marker. Saved stage reviews have a small green check, not task-completion credit.
- Show Previous, a short readable primary action, and contextual Print in one fixed row. Accessible names and pointer/keyboard hints retain the complete action meaning.
- Compact the feedback and counts into one line. Draft is not styled as a completed/saved action. Saving and failed-save feedback remain explicit.
- Reduce table row padding without shrinking the existing table font; lighten selected rows. Missing purchase price stays an em dash with an explanatory hint, not zero and not a new blocker.
- Remove inherited extra header margin and reduce sidebar spacing so stages and search are accessible without extra scrolling at the tested 1366x768 and 1024x768 sizes. Shorter windows retain safe internal scrolling.

## Boundaries
Presentation only. The Build 82 draft/save/print/lifecycle engine and the Build 83 layout/compact drawer engine remain byte-for-byte unchanged and hash-guarded. The existing v81 server remains authoritative for reconfirmation and later inventory verification. No Supabase migrations, no writes to production data for testing, and no changes to quantities, business/accounting logic, risk, score, task/badge/history or inventory age rules.

## Verification
Existing 68 Node tests are retained; six new presentation tests bring the total to 74. Existing full synthetic employee journey and split-layout tests are retained. New real-browser checks verify all five table types, alignment, header geometry, simultaneous current/changed states, draft/saved distinction, a single action row, contextual print, and keyboard-accessible missing-price hints at 1920x1080, 1366x768, 1024x768, 1366x600, 768x1024 and 390x844. External network is blocked in browser tests.
