-- Build 125: repair the existing Forecast read path; raw monthly history is unchanged.
CREATE OR REPLACE FUNCTION public.purchasing_forecast_history_preview_v121(p_codes text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_end date; v_data jsonb;
BEGIN
 IF auth.uid() IS NULL OR public.purchasing_current_role_v5() IS NULL THEN
   RAISE EXCEPTION 'Access not authorized';
 END IF;
 IF p_codes IS NULL OR cardinality(p_codes)>80 THEN RAISE EXCEPTION 'Maximum 80 product codes per page'; END IF;
 SELECT max(report_month) INTO v_end FROM purchasing_private.forecast_report_batches_v1 WHERE batch_status IN ('staged','approved');
 -- Build 125: an empty legacy code list selects the sales-native catalog.
 -- Read the EXISTING report tables in place. No table copy, reimport or Master join.
 IF cardinality(p_codes)=0 THEN
   -- Multiple active versions must never silently double-count a month.
   IF EXISTS (
     SELECT 1 FROM purchasing_private.forecast_report_batches_v1 b
     WHERE b.batch_status IN ('staged','approved')
       AND b.report_month BETWEEN (v_end-interval '11 months')::date AND v_end
     GROUP BY b.report_month HAVING count(*)>1
   ) THEN
     RAISE EXCEPTION 'More than one active sales report for a month; select the intended version before reading totals';
   END IF;
   WITH reports AS MATERIALIZED (
     SELECT b.id,b.report_month,b.batch_status,b.original_filename
     FROM purchasing_private.forecast_report_batches_v1 b
     WHERE b.batch_status IN ('staged','approved')
       AND b.report_month BETWEEN (v_end-interval '11 months')::date AND v_end
   ), source_lines AS MATERIALIZED (
     SELECT l.source_product_name, b.report_month, l.net_qty,l.net_unit,
       l.source_row_number,b.original_filename,b.batch_status,
       (l.net_qty IS NOT NULL AND l.net_qty::text NOT IN ('NaN','Infinity','-Infinity')
        AND nullif(btrim(l.net_unit),'') IS NOT NULL) AS quantity_ok
     FROM purchasing_private.forecast_report_lines_v1 l
     JOIN reports b ON b.id=l.batch_id
   ), monthly AS (
     SELECT source_product_name,report_month,
       count(DISTINCT lower(btrim(net_unit))) AS units,
       min(net_unit) AS selling_unit,
       count(*) AS source_rows,
       count(*) FILTER (WHERE NOT quantity_ok) AS invalid_rows,
       CASE WHEN bool_and(quantity_ok) AND count(DISTINCT lower(btrim(net_unit)))=1
         THEN sum(net_qty) ELSE NULL END AS net_qty,
       jsonb_agg(jsonb_build_object('row',source_row_number,'file',original_filename,
         'qty',net_qty,'unit',net_unit) ORDER BY source_row_number) AS source
     FROM source_lines GROUP BY source_product_name,report_month
   ), products AS (
     SELECT source_product_name,
       count(*) AS source_rows,
       count(DISTINCT report_month) AS months_covered,
       count(DISTINCT lower(btrim(net_unit))) AS unit_count,
       min(net_unit) AS selling_unit,
       count(*) FILTER(WHERE NOT quantity_ok) AS invalid_rows,
       CASE WHEN bool_and(quantity_ok) AND count(DISTINCT lower(btrim(net_unit)))=1
         THEN sum(net_qty) ELSE NULL END AS historical_12m,
       sum(net_qty) FILTER (WHERE report_month <= (v_end-interval '9 months')::date AND quantity_ok) AS first_3m,
       sum(net_qty) FILTER (WHERE report_month > (v_end-interval '3 months')::date AND quantity_ok) AS last_3m,
       count(DISTINCT report_month) FILTER (WHERE report_month <= (v_end-interval '9 months')::date AND quantity_ok) AS first_3m_months,
       count(DISTINCT report_month) FILTER (WHERE report_month > (v_end-interval '3 months')::date AND quantity_ok) AS last_3m_months,
       count(*) FILTER (WHERE report_month <= (v_end-interval '9 months')::date AND NOT quantity_ok) AS first_3m_errors,
       count(*) FILTER (WHERE report_month > (v_end-interval '3 months')::date AND NOT quantity_ok) AS last_3m_errors
     FROM source_lines GROUP BY source_product_name
   ), month_arrays AS (
     SELECT source_product_name,
       jsonb_agg(jsonb_build_object('month',to_char(report_month,'YYYY-MM'),
         'qty',net_qty,'unit',selling_unit,'unit_count',units,
         'source_rows',source_rows,'invalid_rows',invalid_rows,'source',source)
         ORDER BY report_month) AS monthly
     FROM monthly GROUP BY source_product_name
   )
   SELECT jsonb_build_object(
     'source_mode','sales_reports','ui_build',125,
     'first_month',to_char((v_end-interval '11 months')::date,'YYYY-MM'),
     'last_month',to_char(v_end,'YYYY-MM'),
     'data_state','source_reports_under_review',
     'source_rows',(SELECT count(*) FROM source_lines),
     'periods',coalesce((SELECT jsonb_agg(to_char(d,'YYYY-MM') ORDER BY d)
       FROM generate_series(v_end-interval '11 months',v_end,interval '1 month') d),'[]'::jsonb),
     'reports',coalesce((SELECT jsonb_agg(jsonb_build_object('month',to_char(report_month,'YYYY-MM'),
       'status',batch_status,'file',original_filename) ORDER BY report_month) FROM reports),'[]'::jsonb),
     'rows',coalesce(jsonb_agg(jsonb_build_object(
       'source_id','sales:'||md5(p.source_product_name),'source_name',p.source_product_name,
       'source_rows',p.source_rows,'months_covered',p.months_covered,'unit_count',p.unit_count,
       'selling_unit',p.selling_unit,'invalid_rows',p.invalid_rows,'historical_12m',p.historical_12m,
       'first_3m',p.first_3m,'last_3m',p.last_3m,'first_3m_months',p.first_3m_months,
       'last_3m_months',p.last_3m_months,'first_3m_errors',p.first_3m_errors,'last_3m_errors',p.last_3m_errors,
       'monthly',m.monthly) ORDER BY p.source_product_name COLLATE "C"),'[]'::jsonb))
   INTO v_data FROM products p JOIN month_arrays m USING(source_product_name);
   RETURN v_data;
 END IF;
 WITH asked AS (
   SELECT DISTINCT unnest(p_codes) code
 ), hist AS (
 SELECT l.resolved_product_code code, b.report_month, l.net_qty, l.net_unit,
        l.validation_status
 FROM purchasing_private.forecast_report_lines_v1 l
 JOIN purchasing_private.forecast_report_batches_v1 b ON b.id=l.batch_id
 JOIN asked a ON a.code=l.resolved_product_code
 WHERE b.batch_status IN ('staged','approved')
   AND b.report_month BETWEEN (v_end - interval '11 months')::date AND v_end
 ), totals AS (
 SELECT code,
   count(*) FILTER(WHERE validation_status='matched') matched_rows,
   count(*) FILTER(WHERE validation_status<>'matched') review_rows,
   count(DISTINCT report_month) FILTER(WHERE validation_status='matched') months_covered,
   count(DISTINCT lower(btrim(net_unit))) FILTER(WHERE validation_status='matched') unit_count,
   min(net_unit) FILTER(WHERE validation_status='matched') selling_unit,
   sum(net_qty) FILTER(WHERE validation_status='matched') historical_12m,
   sum(net_qty) FILTER(WHERE validation_status='matched' AND report_month>(v_end-interval '12 months')::date AND report_month<=(v_end-interval '9 months')::date) first_3m,
   count(DISTINCT report_month) FILTER(WHERE validation_status='matched' AND report_month>(v_end-interval '12 months')::date AND report_month<=(v_end-interval '9 months')::date) first_3m_months,
   count(DISTINCT report_month) FILTER(WHERE validation_status='matched' AND report_month>(v_end-interval '3 months')::date) last_3m_months,
   count(*) FILTER(WHERE validation_status<>'matched' AND report_month>(v_end-interval '12 months')::date AND report_month<=(v_end-interval '9 months')::date) first_3m_review,
   count(*) FILTER(WHERE validation_status<>'matched' AND report_month>(v_end-interval '3 months')::date) last_3m_review,
   sum(net_qty) FILTER(WHERE validation_status='matched' AND report_month>(v_end-interval '3 months')::date) last_3m,
   sum(net_qty) FILTER(WHERE validation_status='matched' AND report_month<=(v_end-interval '3 months')::date AND report_month>(v_end-interval '6 months')::date) previous_3m
 FROM hist GROUP BY code
 )
 SELECT jsonb_build_object('last_month',to_char(v_end,'YYYY-MM'),
 'data_state','staged_review_only',
 'rows',coalesce(jsonb_agg(jsonb_build_object(
  'code',a.code,'historical_12m',t.historical_12m,'selling_unit',t.selling_unit,
  'last_3m',t.last_3m,'previous_3m',t.previous_3m,
  'first_3m',t.first_3m,'first_3m_months',coalesce(t.first_3m_months,0),'last_3m_months',coalesce(t.last_3m_months,0),
  'first_3m_review',coalesce(t.first_3m_review,0),'last_3m_review',coalesce(t.last_3m_review,0),
  'matched_rows',coalesce(t.matched_rows,0),'review_rows',coalesce(t.review_rows,0),
  'months_covered',coalesce(t.months_covered,0),'unit_count',coalesce(t.unit_count,0)
 ) ORDER BY a.code),'[]'::jsonb))
 INTO v_data FROM asked a LEFT JOIN totals t ON t.code=a.code;
 RETURN v_data;
END $$;
REVOKE ALL ON FUNCTION public.purchasing_forecast_history_preview_v121(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purchasing_forecast_history_preview_v121(text[]) TO authenticated,service_role;
