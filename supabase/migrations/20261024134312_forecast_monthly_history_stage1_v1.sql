CREATE TABLE IF NOT EXISTS purchasing_private.forecast_month_registry_v1 (
  report_month date PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forecast_month_first_day CHECK (report_month = date_trunc('month', report_month)::date)
);
CREATE TABLE IF NOT EXISTS purchasing_private.forecast_report_batches_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_month date NOT NULL REFERENCES purchasing_private.forecast_month_registry_v1(report_month),
  original_filename text NOT NULL,
  file_sha256 text NOT NULL,
  range_confirmed boolean NOT NULL DEFAULT false,
  batch_status text NOT NULL DEFAULT 'staged' CHECK (batch_status IN ('staged','approved','superseded','rejected')),
  source_rows integer CHECK (source_rows IS NULL OR source_rows >= 0),
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  CONSTRAINT forecast_report_sha256_format CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT forecast_report_batch_unique UNIQUE(report_month,file_sha256),
  CONSTRAINT forecast_approval_requires_range CHECK (batch_status <> 'approved' OR range_confirmed)
);
CREATE UNIQUE INDEX IF NOT EXISTS forecast_one_approved_month_v1
  ON purchasing_private.forecast_report_batches_v1(report_month)
  WHERE batch_status='approved';
CREATE TABLE IF NOT EXISTS purchasing_private.forecast_report_lines_v1 (
  batch_id uuid NOT NULL REFERENCES purchasing_private.forecast_report_batches_v1(id) ON DELETE RESTRICT,
  source_row_number integer NOT NULL CHECK (source_row_number >= 3),
  source_product_name text NOT NULL CHECK (btrim(source_product_name)<>''),
  source_supplier text,
  sales_qty numeric,
  sales_unit text,
  refunds_qty numeric,
  refunds_unit text,
  net_qty numeric,
  net_unit text,
  sales_value_sar numeric,
  refunds_value_sar numeric,
  net_sales_value_sar numeric,
  historical_cost_sar numeric,
  historical_profit_sar numeric,
  resolved_product_code text,
  resolved_purchase_unit text,
  normalized_net_purchase_qty numeric,
  validation_status text NOT NULL DEFAULT 'staged'
    CHECK(validation_status IN('staged','matched','needs_review','excluded')),
  review_reason text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(batch_id,source_row_number)
);
CREATE INDEX IF NOT EXISTS forecast_lines_master_lookup_v1
 ON purchasing_private.forecast_report_lines_v1(resolved_product_code)
 WHERE resolved_product_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS forecast_batch_month_v1
 ON purchasing_private.forecast_report_batches_v1(report_month);
ALTER TABLE purchasing_private.forecast_month_registry_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchasing_private.forecast_report_batches_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchasing_private.forecast_report_lines_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON purchasing_private.forecast_month_registry_v1 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON purchasing_private.forecast_report_batches_v1 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON purchasing_private.forecast_report_lines_v1 FROM PUBLIC, anon, authenticated;
INSERT INTO purchasing_private.forecast_month_registry_v1(report_month)
SELECT gs::date FROM generate_series(date '2025-10-01',date '2026-09-01',interval '1 month') gs
ON CONFLICT (report_month) DO NOTHING;
COMMENT ON TABLE purchasing_private.forecast_month_registry_v1 IS 'Stage 1: historical calendar month registry. Do not infer missing months as zero sales.';
COMMENT ON TABLE purchasing_private.forecast_report_batches_v1 IS 'Versioned source reports, one approved batch per month; no user-facing RPC until stage 2.';
COMMENT ON TABLE purchasing_private.forecast_report_lines_v1 IS 'Raw Daftera monthly profit rows and validated unit conversion snapshots. Product Master is read-only.';
