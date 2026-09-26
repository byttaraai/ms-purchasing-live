# Build 86 - Task-focused Tasks Assistant

## Approved UI changes
- Add **Output Lists** as a top navigation tab after Tasks Assistant.
- Remove the in-page Current Tasks / Review Outputs tabs from Tasks Assistant.
- Move prepared supplier-review outputs into the dedicated Output Lists page.
- Keep Tasks Assistant action-first: inventory freshness, current work queue, supplier priorities, recovery/review work, and compact master-data work.
- Show only the first 5 supplier priorities by default with View All.
- Move the open-task count to the page heading.
- Use the right rail for BO Score & Level, Budget Performance, Professional Rank, and Task Achievements.
- Budget Performance reuses the existing approved Total Shortage Value and inventory value; no new financial formula is introduced.
- Keep Master Data Review below Product Recovery & Reviews.
- Keep Resume Review / In progress visually distinct when the existing Supplier Quest state exposes it.
- Add a small Output Lists badge only when prepared lists exist.

## Boundaries
Presentation and navigation only. No Supabase migration, RPC, inventory-age rule, BO Score, Supplier Priority, Overstock Risk, task completion, badge, history, purchasing quantity, or accounting logic is changed.

## Verification
Existing Build 82-85 Supplier Quest and toolbar journeys remain enabled. Build 86 adds static contracts plus real-browser checks for the right rail, top-5 supplier display, Master Data placement, Output Lists navigation and responsive layout using synthetic data only.
