# Build 115 — Forecast Monthly History Database (Stage 1)

## Scope
Prepare isolated, versioned monthly sales history storage. **No forecast calculations, no upload UI and no changes to Products Master, current ROP or Inventory.**

## Source and time window
- Source: Daftera `Products Profit - Product` export, separately for each **calendar month**.
- Initial 12 periods: **2025-10 through 2026-09** (last 12 completed months as of 2026-10-24).
- Export file shape from supplied annual sample: two header rows, 13 columns: Product Name, Supplier, Sales Quantity/Value, Refunds Quantity/Value, Net Sales Quantity/Value, Total Cost, Profit Value/Percentage, Profit % To Sales/To Cost.
- **Product Code is not present** in this report; match by exact name and approved Master alias only. No fuzzy auto-link or auto-write to Master.
- The CSV itself does not declare the export start/end dates; require user confirmation before any approval.
- Missing source row **does not mean zero demand**. Do not estimate individual months by dividing an annual total by 12.

## Storage
Migration `20261024134312_forecast_monthly_history_stage1_v1.sql` creates:
- `purchasing_private.forecast_month_registry_v1`: month registry, pre-seeded with 12 periods.
- `purchasing_private.forecast_report_batches_v1`: immutable report versions, SHA-256 dedup per month and **at most one approved batch for any report month**.
- `purchasing_private.forecast_report_lines_v1`: original monthly quantities/units/currency and optional validated mapping + normalized purchase-unit quantity.
- All tables use RLS and revoke direct table privileges from `anon` and `authenticated`. No public ingestion RPC at this stage.

## Next planned work (NOT included)
Stage 2: Auth-checked upload endpoint, month-close availability cue and import validations. Historical corrections must create another version; never append them as extra months.
Stage 3: Forecast trend/seasonality/growth and 30-day purchase advance.
Stage 4: table header filters and search.

## Stage 1 verification
2026-10-24: All 12 monthly reports (Oct 2025 through Sep 2026) have now been imported privately. Registry = 12; source batches = 12 (all `staged`, none approved); source product-month lines = 10,474; 1,648 distinct report product names. Source quantity/net-value reconciliation passed with only minor source-footer rounding. Exact unique Master-name and conservatively normalized equivalent purchase-unit mapping passed for 9,782 lines; 692 lines remain `needs_review` (412 unit-label differences across 56 products, 280 missing exact Master-name mapping across 184 products). There are 15 negative net-quantity source lines, preserved as refunds rather than zeroed. Report rows retain original input in `raw_payload`; `normalized_net_purchase_qty` is set only for matched lines. No forecast is computed, no batch is approved, and no existing Master row was mutated.

## Artifacts
The monthly export preparation kit is distributed separately as `Monthly_Sales_History_Stage1_Package.zip` in conversation artifacts.
