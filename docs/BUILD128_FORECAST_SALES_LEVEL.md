# Build 128 - Descriptive sales level beside Historical Sales

Adds Sales Level immediately after Historical Sales, without replacing the existing historical Trend. Each cell contains Typical / mo., First 6 mo., Last 6 mo. The source is the existing twelve-month Forecast payload; no additional RPC, database migration, Master read, approval or write is introduced.

Typical is the median of the twelve monthly net quantities (average of sorted values 6 and 7). Each half uses its own median of six months (average of sorted values 3 and 4). Percentages are `(half median / annual median - 1) * 100`, not half-to-half growth or a forecast. Above +5% is green, below -5% amber, inclusive +/-5% grey. Search, month, supplier and profitability filters do not change the annual reference window.

Requires exactly twelve consecutive reported months, one monthly aggregate each, finite quantities and consistent original selling units. Missing months are not imputed as zero. Invalid or mixed-unit data are unavailable. Actual zeros and negative return quantities are preserved; zero/negative annual medians show the value but no ratios. Details identify negative-net months. No automatic unit conversion or inferred sales is performed.

Clicking the cell opens the existing accessible product information dialog, with the formula, exact half-year date boundaries, both half medians, reason for unavailable ratios and original monthly quantities. Keyboard focus returns to the cell. Median numbers are shown to two decimals and percentages to one decimal maximum; unrounded values determine status.

The table becomes seven columns, deliberately allocating 28% (including the existing 74px rating) to Product+Rating, 16% to Historical Sales, 25% to Sales Level, 12% to existing Trend, 8% to Confidence and 11% to Final Forecast. The table alone scrolls on narrow screens. Forecast asset URLs are versioned to 128.

Tests preserve the exact deployed Build127 JS and HTML via inverse edits; earlier integrity tests remain active. Pure-model tests cover median, isolated peaks, negative/zero baselines, invalid/missing/duplicate periods, units and +/-5% boundaries. Browser tests cover eight widths, position, three-cell alignment, details/focus, month-filter invariance, incomplete data and all existing supplier/profitability interactions. All test data are synthetic; no private source data is committed.
