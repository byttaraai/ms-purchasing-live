# Build 111 — Reorder Point zero-demand policy

This build adds a second sales report for the last four calendar months ending on the same end date as the 12-month report.

## Business rules
- The annual 12-month profitability classification is unchanged.
- Annual sales converted to Purchase Unit **below 20** force ROP = 0.
- Recent four-month sales converted to Purchase Unit **below 20** also force ROP = 0.
- Rules are OR, and exactly 20 does not trigger the zero policy.
- The established coverage-days formula applies only when neither rule triggers.
- Name, code, units and net quantities must be verified. Negative 4-month sales and multiple rows resolving to one code remain Review.
- Absent products in the 4-month report are treated as zero only after explicit confirmation that the export is complete, unfiltered and all-products.
- Period start and end are validated on server against the end of the 12-month report.
- Admin approval of actual Master changes remains separate and explicit.
- The server responds with ROP-zero reason, and former v110 and v109 functions remain available for rollback.

## Workflow
Upload the 12-month Daftera profit-by-product CSV, then a matching 4-month all-products CSV whose filename contains From DD_MM_YYYY To DD_MM_YYYY. Explicitly confirm its completeness. Inspect the server-verified preview and its zero reasons. Only then optionally approve the Master update.

Deployment never writes reorder points or profitability itself.
