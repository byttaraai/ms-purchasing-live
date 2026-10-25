-- Build 118: guarded, read-only historical forecast page, no forecast or Master mutation.
CREATE OR REPLACE FUNCTION public.purchasing_forecast_history_preview_v121(p_codes text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','purchasing_private','auth','pg_temp'
AS $$
DECLARE v_end date; v_data jsonb;
BEGIN
 IF auth.uid() IS NULL OR public.purchasing_current_role_v5() IS NULL THEN
   RAISE EXCEPTION 'Access not authorized';
 END IF;
 IF p_codes IS NULL OR cardinality(p_codes)>80 THEN RAISE EXCEPTION 'Maximum 80 product codes per page'; END IF;
 SELECT max(report_month) INTO v_end FROM purchasing_private.forecast_report_batches_v1 WHERE batch_status IN ('staged','approved');
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
