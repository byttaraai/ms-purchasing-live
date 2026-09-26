# Build 93 - Master Data Review workflow

Approved scope:
- Move Master Data Review above Profit Recovery in the Tasks Assistant work column.
- Keep the existing Master Review severity/ranking logic unchanged; expand the current task target cap from 5 to 20.
- Open the current Master Data task in a dedicated popup.
- Inline editable fields: Supplier, Purchase Price, Reorder Point, Profitability Rating; new Not-in-Master products also require explicit Purchase Unit selection.
- Product code/name remain source-driven; Purchase Unit is not editable here for existing products.
- Saving writes master data and triggers the existing recalculation chain. It does not directly complete the task, award a badge, or alter history.
- Negative-stock or other non-inline source issues remain review-only in this popup.

Security:
- purchasing_master_review_save_v93 is restricted to authenticated purchasing/admin users.
- It accepts at most 20 rows, only from the user's current open Master Data task.
- Existing products can only update fields that are currently flagged as review issues.
- New products can only use an existing canonical Purchase Unit and existing supplier selection.
- No direct table grants were added.
