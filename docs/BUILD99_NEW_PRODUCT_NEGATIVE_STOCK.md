# Build 99 - Negative Stock warning for new Master Review products

Approved scope: show the existing Negative Stock chip in the Master Review popup for a new Not-in-Master product whose source inventory is negative. Display only; do not edit stock or calculations.

The new task-assistant-v99.js differs from the immutable v97 runtime only in its leading comment and an addition inside issueChips. For new products, it honors the existing Negative stock review reason or a negative raw_quantity validated by the canonical numeric parser. Null, absent, malformed, nonnumeric and out-of-bounds values are not inferred as negative. No purchase-unit conversion is attempted for an unmatched product. The chip is added exactly once and uses the existing warning label/style. Existing-product chip behavior is unchanged.

There is no editable inventory field, new save blocker, automatic inventory correction, or new completion/badge rule. Product priority/Top 20, quantities, unit conversions, numeric validation, drafts, revision checks, 48-hour lock, retry behavior, BO Score and Supplier Priority are unchanged. The original styles and original runtime files are retained unchanged. Only the release marker and the active runtime reference change in index.html.

Tests: seven Node contracts cover precise source equivalence, release inversion and edge-case rendering against the canonical core. The browser suite runs 24 new negative-stock scenarios and reuses 112 prior status/draft/freshness/unit scenarios against the active v99 runtime, with the existing v98 stylesheet. All test data/IO is synthetic, and outgoing requests are blocked. CI/deployment results must be verified separately before claiming a live release.

No Supabase query, migration, permission change or production business-data write is part of this repair. SEC-03 legacy retirement remains OPEN (protected backup only). Business-rule findings remain pending separate approval.

Rollback: revert this release's entrypoint marker/module reference and associated test changes (or revert the PR); no database rollback is required.
