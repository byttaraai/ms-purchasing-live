# Build 125: sales-native products and monthly quantities

Scope: repair the current Forecast database read path and first two dashboard columns. No new database or product table; no raw sales rows are copied, reimported, mutated or approved.

The existing `purchasing_forecast_history_preview_v121(text[])` now supports an empty array for source mode. It aggregates exact source product names and monthly net quantities from the same `forecast_report_lines_v1` and report batches. Nonempty legacy-code requests remain compatible for already-open clients. Source mode does not read Master data, resolved codes or mapping validation. It preserves original selling units, zero and negative quantities, absent months, and row/file provenance. Ambiguous active report versions fail rather than double count. Mixed selling units do not produce a numeric annual sum.

The first column uses original sales names and sales-derived internal identities, not Master codes. The quantity column shows historical recorded net sales, not a computed prediction. Period selection shows actual report months; the info dialog exposes every month with missing months explicitly labelled Not reported. Supplier and profitability enrichment are intentionally deferred; those filters are disabled in this phase. Growth remains a draft, Generate remains gated, and existing historical trend arithmetic and thresholds are unchanged. No purchase quantities, unit conversions or prices are introduced.

Auth is still required; the existing RPC retains active-user authorization, no anonymous EXECUTE and an empty search_path. Source payload is cleared on reload failure and logout. Main application changes only its Forecast asset cache version. No Master, inventory freshness, ROP logic, approval status or shared CSS is changed.

Verification: exact inverse tests preserve earlier UI baselines. Synthetic browser tests include source-only products, differing selling units, missing/zero/negative months, escaped names, failure/retry, an empty Master, pagination and eight viewports. A read-only production check compares every product-month quantity/unit against existing records, and the original CSV files are checked independently. Private source data is not committed.

Rollback: revert the UI PR; nonempty requests still use the legacy branch. The backend source-mode addition can remain harmlessly, or be restored using the previous v121 definition.
