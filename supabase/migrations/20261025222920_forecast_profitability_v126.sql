-- Build126: add recorded annual/monthly profit to the existing sales-native read path.
-- Only replace the function definition; no sales, Master, approvals or settings rows are written.
DO $migration$
DECLARE ddl text; before_ddl text;
BEGIN
 SELECT pg_get_functiondef('public.purchasing_forecast_history_preview_v121(text[])'::regprocedure) INTO ddl;
 before_ddl:=ddl;
 IF position('annual_profit_sar' in ddl)>0 THEN RAISE EXCEPTION 'Profitability fields already exist; inspect before applying'; END IF;
 IF position('auth.uid() IS NULL' in ddl)=0 OR position('purchasing_current_role_v5() IS NULL' in ddl)=0 THEN RAISE EXCEPTION 'Expected authorization guard missing'; END IF;
 IF position('l.source_row_number,b.original_filename,b.batch_status,' in ddl)=0 THEN RAISE EXCEPTION 'Source field anchor missing'; END IF;
 ddl:=replace(ddl,'l.source_row_number,b.original_filename,b.batch_status,',$patch$l.source_row_number,b.original_filename,b.batch_status,l.historical_profit_sar,
       (l.historical_profit_sar IS NOT NULL AND l.historical_profit_sar::text NOT IN ('NaN','Infinity','-Infinity') AND abs(l.historical_profit_sar)<=1000000000000) AS profit_ok,$patch$);
 IF position('count(*) FILTER (WHERE NOT quantity_ok) AS invalid_rows,' in ddl)=0 THEN RAISE EXCEPTION 'Monthly validation anchor missing'; END IF;
 ddl:=replace(ddl,'count(*) FILTER (WHERE NOT quantity_ok) AS invalid_rows,',$patch$count(*) FILTER (WHERE NOT quantity_ok) AS invalid_rows,
       count(*) FILTER (WHERE NOT profit_ok) AS profit_invalid_rows,
       CASE WHEN bool_and(profit_ok) THEN sum(historical_profit_sar) ELSE NULL END AS profit_sar,$patch$);
 IF position('count(*) FILTER(WHERE NOT quantity_ok) AS invalid_rows,' in ddl)=0 THEN RAISE EXCEPTION 'Product validation anchor missing'; END IF;
 ddl:=replace(ddl,'count(*) FILTER(WHERE NOT quantity_ok) AS invalid_rows,',$patch$count(*) FILTER(WHERE NOT quantity_ok) AS invalid_rows,
       count(*) FILTER(WHERE NOT profit_ok) AS profit_invalid_rows,
       CASE WHEN bool_and(profit_ok) THEN sum(historical_profit_sar) ELSE NULL END AS annual_profit_sar,$patch$);
 IF position($old$'invalid_rows',invalid_rows,'source',source)$old$ in ddl)=0 THEN RAISE EXCEPTION 'Monthly payload anchor missing'; END IF;
 ddl:=replace(ddl,$old$'invalid_rows',invalid_rows,'source',source)$old$,$patch$'invalid_rows',invalid_rows,'source',source,'profit_sar',profit_sar,'profit_invalid_rows',profit_invalid_rows)$patch$);
 IF position($old$'source_mode','sales_reports','ui_build',125,$old$ in ddl)=0 THEN RAISE EXCEPTION 'Source version anchor missing'; END IF;
 ddl:=replace(ddl,$old$'source_mode','sales_reports','ui_build',125,$old$,$patch$'source_mode','sales_reports','ui_build',126,
     'profit_basis','recorded_12m_profit_sar',
     'mean_positive_profit_sar',(SELECT avg(annual_profit_sar) FROM products WHERE annual_profit_sar>0 AND profit_invalid_rows=0),$patch$);
 IF position($old$'selling_unit',p.selling_unit,'invalid_rows',p.invalid_rows,'historical_12m',p.historical_12m,$old$ in ddl)=0 THEN RAISE EXCEPTION 'Product payload anchor missing'; END IF;
 ddl:=replace(ddl,$old$'selling_unit',p.selling_unit,'invalid_rows',p.invalid_rows,'historical_12m',p.historical_12m,$old$,$patch$'selling_unit',p.selling_unit,'invalid_rows',p.invalid_rows,'historical_12m',p.historical_12m,
       'annual_profit_sar',p.annual_profit_sar,'profit_invalid_rows',p.profit_invalid_rows,$patch$);
 IF split_part(ddl,' WITH asked AS (',2) IS DISTINCT FROM split_part(before_ddl,' WITH asked AS (',2) THEN RAISE EXCEPTION 'Legacy branch was changed'; END IF;
 EXECUTE ddl;
END $migration$;
REVOKE ALL ON FUNCTION public.purchasing_forecast_history_preview_v121(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purchasing_forecast_history_preview_v121(text[]) TO authenticated,service_role;
