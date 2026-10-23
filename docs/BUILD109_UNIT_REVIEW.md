Build 109: Generator sales-unit decisions.

The server preview uses public.purchasing_sales_generator_v109. Its purchase-unit normalization accepts equivalent pack labels and product-specific approved aliases. Unknown conversions remain in Review.

Admin review popup can save a product-specific conversion through purchasing_sales_unit_rule_v109. This records an audited decision and invalidates stale previews; it does not save reorder points or profitability changes.

Ambiguous Box 30 versus Bottle 30 ml stays blocked for review. The previous v104 RPC is retained as rollback.

Do not approve Master changes during release verification.
