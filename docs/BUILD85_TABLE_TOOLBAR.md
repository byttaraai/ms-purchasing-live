# Build 85 - Table-local search and selection tools

## Approved UI
- Move the existing product search, Selected only, and Clear Selection controls from the dark sidebar to the white table's title row. Keep the supplier/stage/action panel and the 70/30 split unchanged.
- Stage title and product count remain on the left; tools fit to their right on wider workspaces. No permanent second toolbar row.
- On narrower workspaces, Search & Filter opens an anchored panel over the table. Escape closes only that panel, focus returns to its toggle, and hidden tools are inert. The separate Stages drawer remains functional.
- The title count follows visible products: total products normally, visible of total while filtering. Remove the redundant visible-count line from the sidebar.
- Search clearing and selection clearing are separate actions. Search reset retains selections; Clear Selection clears the entire stage selection, including hidden rows, and is disabled when empty.
- Preserve existing select-all-visible semantics. Under Selected only, deselecting visible products repaints the filtered table instead of leaving stale rows.

## Boundaries
Presentation and filtering only. Prior Build 82, 83 and 84 engines/styles are unchanged and hash-checked. No Supabase migration, new RPC, source-data edits, ordering/math changes, task/badge/history writes, or new persistence. Existing draft and confirmation behavior is retained. Browser tests use synthetic data with external networking blocked.

## Verification
Eight new Node contracts augment the existing 74 tests. Existing full employee journeys, printing, error/retry, delayed-close, layout and keyboard checks remain enabled. New real-input tests cover all review stages and summary, title geometry, counts, selected-only/select-all-visible, hidden selections, explicit search reset, selection reset, narrow filter focus/resize, and unchanged task/badge state at seven viewport sizes.
