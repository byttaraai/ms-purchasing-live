# Build 87 - Tasks tab open-count badge

## Approved change
- Remove the Tasks Assistant page title/open-task row entirely.
- Make Inventory Snapshot the first visible row inside Tasks Assistant.
- Show the live number of open tasks as a compact purple badge beside the top navigation label **Tasks Assistant**.
- Hide the badge when the open-task count is zero.
- Keep the underlying existing `tasksOpenCount` node in the DOM, hidden, so the existing renderer and task logic remain untouched.

## Boundaries
UI/navigation only. No changes to task generation, task priority, completion, badges, score, risk, purchasing calculations, inventory freshness, Supabase, or Supplier Quest behavior.
