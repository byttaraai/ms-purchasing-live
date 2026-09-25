/* Build 69: one pure overstock risk policy and roll-up, with no persistence or RPCs. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OverstockRisk = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const POLICY = Object.freeze({
    version: 'overstock_uplift_v1',
    thresholdPct: 300,
    profitWeights: Object.freeze({Loss: 150, Low: 120, Medium: 70, High: 70, Super: 70, Unclassified: 100}),
    stockBands: Object.freeze([
      Object.freeze({max: 500, weight: 70}),
      Object.freeze({max: 1000, weight: 120}),
      Object.freeze({max: Infinity, weight: 150})
    ]),
    tagThresholds: Object.freeze({medium: 15, high: 25, critical: 40})
  });
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  function sum(values) {
    let total = 0, correction = 0;
    for (const value of values) {
      const y = value - correction, next = total + y;
      correction = (next - total) - y;
      total = next;
    }
    return total;
  }
  function classify(percent) {
    if (!finite(percent)) return {label: 'Review', cls: 'review'};
    // Remove binary arithmetic dust, not display-rounding, at the approved boundaries.
    const value = Math.round(percent * 1e10) / 1e10;
    if (value <= 0) return {label: 'Stable', cls: 'stable'};
    if (value < POLICY.tagThresholds.medium) return {label: 'Low Risk', cls: 'low'};
    if (value < POLICY.tagThresholds.high) return {label: 'Medium Risk', cls: 'medium'};
    if (value < POLICY.tagThresholds.critical) return {label: 'High Risk', cls: 'high'};
    return {label: 'Critical', cls: 'critical'};
  }
  function inventoryValue(row) {
    const value = finite(row.stock_qty) && row.stock_qty >= 0 && finite(row.purchase_price) && row.purchase_price > 0
      ? row.stock_qty * row.purchase_price : null;
    return finite(value) ? value : null;
  }
  function reviewRow(row, reason, excessQty = null) {
    return {...row, inventory_value: inventoryValue(row), excess_qty: excessQty, excess_value: null,
      risk_factor: null, risk_internal_pct: null, risk_impact: null, risk_share_pct: null,
      risk_status: 'review', risk_reason: reason};
  }
  function product(row, profitLabel) {
    // A missing/zero Reorder Point cannot define overstock, so it is outside this model entirely.
    if (!finite(row.reorder_point) || row.reorder_point <= 0) return null;
    if (!finite(row.stock_ratio) || row.stock_ratio <= POLICY.thresholdPct) return null;
    if (row.blocking_review || !finite(row.stock_qty) || row.stock_qty <= 0)
      return reviewRow(row, 'Stock or unit conversion needs review.');
    const excessQty = Math.max(0, row.stock_qty - row.reorder_point * (POLICY.thresholdPct / 100));
    if (!(excessQty > 0) || !finite(excessQty)) return reviewRow(row, 'Stock percentage and excess quantity are inconsistent.');
    if (!finite(row.purchase_price) || row.purchase_price <= 0)
      return reviewRow(row, 'Purchase price is missing or invalid.', excessQty);
    const excessValue = excessQty * row.purchase_price;
    const label = profitLabel(row.profitability_class);
    const p = Object.hasOwn(POLICY.profitWeights, label) ? POLICY.profitWeights[label] : POLICY.profitWeights.Unclassified;
    const s = POLICY.stockBands.find(b => row.stock_ratio <= b.max).weight;
    // Factors stored as integer percentages give exact product-level percentage steps.
    const riskPct = (p * s - 10000) / 100;
    const impact = excessValue * riskPct / 100;
    if (!finite(excessValue) || !finite(impact)) return reviewRow(row, 'Financial value is outside the supported numeric range.', excessQty);
    return {...row, inventory_value: inventoryValue(row), excess_qty: excessQty, excess_value: excessValue,
      risk_factor: p * s / 10000, risk_internal_pct: riskPct, risk_impact: impact, risk_share_pct: null,
      risk_status: impact > 0 ? 'positive' : 'stable',
      risk_reason: Object.hasOwn(POLICY.profitWeights, label) && label !== 'Unclassified' ? '' : 'Unclassified profitability uses the neutral factor 1.0.'};
  }
  function evaluate(sourceRows, profitLabel) {
    if (!Array.isArray(sourceRows) || typeof profitLabel !== 'function') throw new TypeError('Current rows and the canonical profit-label resolver are required.');
    const rows = sourceRows.map(r => product(r, profitLabel)).filter(Boolean);
    const valued = rows.filter(r => r.risk_status !== 'review');
    const rawExcess = sum(valued.map(r => r.excess_value));
    const positiveImpact = sum(valued.map(r => Math.max(0, r.risk_impact)));
    const negativeImpact = sum(valued.map(r => Math.min(0, r.risk_impact)));
    const netImpact = sum([positiveImpact, negativeImpact]);
    const cardRiskPct = rawExcess > 0 ? netImpact / rawExcess * 100 : null;
    // Only the positive pool is the denominator for product shares. Net remains the card numerator.
    for (const row of rows) if (row.risk_status === 'positive' && positiveImpact > 0)
      row.risk_share_pct = row.risk_impact / positiveImpact * 100;
    return {version: POLICY.version, rows, rawExcess, positiveImpact, negativeImpact, netImpact,
      weightedValue: rawExcess + netImpact, cardRiskPct, rating: rows.length ? classify(cardRiskPct) : {label: '\u2014', cls: 'empty'},
      productCount: rows.length, valuedCount: valued.length, reviewCount: rows.length - valued.length,
      supplierCount: new Set(rows.map(r => r.supplier).filter(Boolean)).size};
  }
  return Object.freeze({POLICY, evaluate, product, reviewRow, classify, inventoryValue});
});
