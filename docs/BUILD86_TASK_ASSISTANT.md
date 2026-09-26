# Build 86 - Task-focused Tasks Assistant

## Approved layout
- Keep the existing MS Purchasing design system; reorder hierarchy rather than redesign the product.
- Move Review Outputs out of Tasks Assistant and expose them as the top navigation tab **Output Lists**.
- Remove the internal Current Tasks / Review Outputs page tabs.
- Put the open task count beside the Tasks Assistant heading.
- Keep Inventory Snapshot as the operational freshness bar above the work queue.
- Main work queue: Supplier Priorities on the left, Product Recovery & Reviews on the right, with Master Data Review directly below Recovery & Reviews.
- Show the top five supplier priorities by default; preserve the existing top-ten ranking and provide View All / Show Top 5.
- Right rail: BO Score & Level, Professional Rank, then Task Achievements. Existing values and badge rules are unchanged.
- Resume/View Review state remains distinct from Open.
- Output Lists badge shows prepared worklists when present; prepared lists are not treated as sent orders or completed tasks.

## Boundaries
Presentation and navigation only. No Supabase migration, RPC, score/risk formula, purchasing quantities, supplier priority ordering, task completion, badge award, history, or inventory-age logic changes.

## Responsive behavior
Desktop uses a sticky right performance rail and a two-column task board. Tablet brings the performance cards above the queue. Mobile stacks all content in task priority order.

## Build 90 override
The earlier Top-5 default / View All toggle is superseded. Supplier Priorities now shows the full ranked Top 10 by default and the View All / Show Top 5 toggle is hidden. The `10 open` count remains visible. This is presentation-only; supplier ranking and task logic are unchanged.
