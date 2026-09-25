# Overstock risk policy - Build 69

Approved 2026-09-25. Replaces the old 40/35/25 row risk and the old profitability-weighted overstock/inventory rating. The existing purchasing, shortages, BO Score, supplier tasks, completion, badges and history policies are unchanged.

## Single calculation root

`assets/js/overstock-risk-v69.js` owns the policy and pure calculation. `OverstockRisk.evaluate(currentRows, PurchasingCore.profitLabel)` produces both product contributions and their roll-up. The UI and print use this same result. Reclassification comes from the saved master, not a per-product override.

- Eligible population: stock percentage strictly above 300, using the existing confirmed Purchase Unit and stored Reorder Point.
- Raw excess quantity: max(0, stock - 3 x Reorder Point).
- Raw excess value: raw excess quantity x current Purchase Unit purchase price.
- Profitability factor: Loss 1.5; Low 1.2; Medium/High/Super 0.7; Unclassified 1.0 (neutral fallback with existing data attention).
- Stock factor: above 300 through 500 inclusive, 0.7; above 500 through 1000 inclusive, 1.2; above 1000, 1.5.
- Product impact (SAR): excess value x (profitability factor x stock factor - 1).
- Card risk uplift (%): 100 x sum(all signed product impacts) / sum(known raw excess values).
- Product Risk share (%): 100 x positive product impact / sum(positive product impacts). Negative impacts remain in the card but are NOT in this share denominator.

## Card tags

Stable: risk <= 0. Low Risk: 0 < risk < 15. Medium Risk: 15 <= risk < 25. High Risk: 25 <= risk < 40. Critical: risk >= 40. Compare unrounded calculations, not rounded display text. No known excess valuation means Review (or a dash for an empty population), not a fabricated zero-risk assessment.

The large card amount remains RAW excess value. The smaller Overstock percentage still compares raw excess with inventory, as before. Risk is an index of the approved factors, not a probability, expected accounting loss, or currency forecast.

## Table and print

Risk is a two-line cell directly after Product. Positive rows show share with NO plus sign, in red, followed by `+SAR ...`. Nonpositive rows show `Stable` in muted amber, followed by signed SAR (`-SAR ...` for negative, `SAR 0` for zero). No extra label follows the amount. Tooltips expose the precise amount and denominator meaning. Unknown/invalid price, RP or blocked unit conversion produces `Review` and a dash, never Stable.

Main BO filters define the card's population. Popup supplier/RP/value filters and print selection do not renormalize shares: every row continues referring to that same card population. A filtered/printed subset is not expected to sum to 100%. With no positive impacts, all valid rows are Stable and no division by zero occurs.

The former Risk Priority sort is replaced by signed monetary Risk Contribution descending, with review rows last and existing excess/name tie-breaks. Inventory Value and Excess Value sorts are retained. No Inventory Value column is restored.

## Safety and verification

No database migration, inventory mutation, permission change, server credential, task completion or badge write is introduced. Refreshing master data rerenders the card and any open overstock table while retaining scroll and valid selection. 48-hour stock locking and revision-safe workspace synchronization remain unchanged.

Tests cover tag/band boundaries, Arabic normalization, positive-share conservation, stable/negative-net cases, missing valuations, filtered and printed scopes, live-save UI propagation using synthetic API fixtures, no false badge, and absence of old runtime overstock formulas.
