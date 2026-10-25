-- Build127: supplier snapshots in the EXISTING Forecast sales rows.
-- No sales copies, new product catalog, live Master joins in the display, or Master writes.
ALTER TABLE purchasing_private.forecast_report_lines_v1
 ADD COLUMN forecast_supplier text,
 ADD COLUMN forecast_supplier_status text NOT NULL DEFAULT 'not_synced',
 ADD COLUMN forecast_supplier_source_code text,
 ADD COLUMN forecast_supplier_source_revision integer,
 ADD COLUMN forecast_supplier_synced_at timestamptz,
 ADD COLUMN forecast_supplier_synced_by uuid,
 ADD CONSTRAINT forecast_supplier_snapshot_state_v127 CHECK (
   forecast_supplier_status IN ('not_synced','available','missing_supplier','unmatched_product','ambiguous_product')
   AND ((forecast_supplier_status='available' AND nullif(btrim(forecast_supplier),'') IS NOT NULL)
        OR (forecast_supplier_status<>'available' AND forecast_supplier IS NULL))
 );
COMMENT ON COLUMN purchasing_private.forecast_report_lines_v1.forecast_supplier IS
 'Copied BO Master supplier snapshot. Refreshed explicitly by Generate; never an identity/quantity dependency.';
COMMENT ON COLUMN purchasing_private.forecast_report_lines_v1.forecast_supplier_source_code IS
 'Provenance only: no foreign key to Master. Sales-source identity remains independent.';

CREATE OR REPLACE FUNCTION purchasing_private.forecast_refresh_suppliers_v127()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_role text; v_result jsonb; v_stamp timestamptz:=statement_timestamp(); v_actor uuid:=auth.uid();
BEGIN
 v_role:=public.purchasing_current_role_v5();
 IF v_actor IS NULL OR v_role IS NULL OR v_role NOT IN ('admin','purchasing') THEN
   RAISE EXCEPTION 'Purchasing access required to refresh Forecast suppliers' USING ERRCODE='42501';
 END IF;
 IF NOT pg_try_advisory_xact_lock(127,937041) THEN
   RAISE EXCEPTION 'A supplier refresh is already running. Try again.' USING ERRCODE='55P03';
 END IF;

 WITH source_names AS MATERIALIZED (
   SELECT DISTINCT source_product_name FROM purchasing_private.forecast_report_lines_v1
 ), master_names AS MATERIALIZED (
   SELECT lower(btrim(product_name)) AS name_key,count(*) AS candidates,
     min(product_code) AS product_code,min(nullif(btrim(supplier),'')) AS supplier
   FROM public.products_master_v5 GROUP BY lower(btrim(product_name))
 ), previous AS MATERIALIZED (
   SELECT DISTINCT ON (source_product_name) source_product_name,
     forecast_supplier,forecast_supplier_status,forecast_supplier_source_code
   FROM purchasing_private.forecast_report_lines_v1
   ORDER BY source_product_name,forecast_supplier_synced_at DESC NULLS LAST,batch_id,source_row_number
 ), resolved AS MATERIALIZED (
   SELECT s.source_product_name,
     CASE WHEN m.candidates=1 THEN m.supplier END AS supplier,
     CASE WHEN m.candidates=1 THEN m.product_code END AS product_code,
     CASE WHEN m.candidates IS NULL THEN 'unmatched_product'
       WHEN m.candidates<>1 THEN 'ambiguous_product'
       WHEN m.supplier IS NULL THEN 'missing_supplier' ELSE 'available' END AS supplier_status
   FROM source_names s LEFT JOIN master_names m ON m.name_key=lower(btrim(s.source_product_name))
 ), planned AS MATERIALIZED (
   SELECT r.*, (r.supplier IS DISTINCT FROM p.forecast_supplier
     OR r.product_code IS DISTINCT FROM p.forecast_supplier_source_code
     OR r.supplier_status IS DISTINCT FROM p.forecast_supplier_status) AS changed
   FROM resolved r LEFT JOIN previous p USING(source_product_name)
 ), metadata AS MATERIALIZED (
   SELECT master_revision FROM public.purchasing_meta_v5 WHERE singleton=true
 ), saved AS (
   UPDATE purchasing_private.forecast_report_lines_v1 l SET
     forecast_supplier=p.supplier,forecast_supplier_status=p.supplier_status,
     forecast_supplier_source_code=p.product_code,
     forecast_supplier_source_revision=(SELECT master_revision FROM metadata),
     forecast_supplier_synced_at=v_stamp,forecast_supplier_synced_by=v_actor
   FROM planned p WHERE l.source_product_name=p.source_product_name
   RETURNING l.source_product_name,l.forecast_supplier,l.forecast_supplier_status,
     l.forecast_supplier_source_code,l.forecast_supplier_source_revision,
     l.forecast_supplier_synced_at,p.changed
 ), snapshots AS (
   SELECT source_product_name,min(forecast_supplier) AS supplier,
     min(forecast_supplier_status) AS supplier_status,
     min(forecast_supplier_source_code) AS source_code,
     min(forecast_supplier_source_revision) AS source_revision,
     min(forecast_supplier_synced_at) AS synced_at,bool_or(changed) AS changed
   FROM saved GROUP BY source_product_name
 )
 SELECT jsonb_build_object('ok',true,'forecast_computed',false,
   'synced_at',v_stamp,'source_revision',(SELECT master_revision FROM metadata),
   'products',count(*),'changed',count(*) FILTER(WHERE changed),
   'available',count(*) FILTER(WHERE supplier_status='available'),
   'required',count(*) FILTER(WHERE supplier_status<>'available'),
   'missing_supplier',count(*) FILTER(WHERE supplier_status='missing_supplier'),
   'unmatched_product',count(*) FILTER(WHERE supplier_status='unmatched_product'),
   'ambiguous_product',count(*) FILTER(WHERE supplier_status='ambiguous_product'),
   'rows',coalesce(jsonb_agg(jsonb_build_object(
      'source_id','sales:'||md5(source_product_name),'supplier',supplier,
      'supplier_status',supplier_status,'supplier_source_code',source_code,
      'supplier_source_revision',source_revision,'supplier_synced_at',synced_at
    ) ORDER BY source_product_name COLLATE "C"),'[]'::jsonb))
 INTO v_result FROM snapshots;

 RETURN v_result;
END $function$;
REVOKE ALL ON FUNCTION purchasing_private.forecast_refresh_suppliers_v127() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION purchasing_private.forecast_refresh_suppliers_v127() TO authenticated;
CREATE OR REPLACE FUNCTION public.purchasing_forecast_refresh_suppliers_v127()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path TO ''
AS $function$
 SELECT purchasing_private.forecast_refresh_suppliers_v127();
$function$;
REVOKE ALL ON FUNCTION public.purchasing_forecast_refresh_suppliers_v127() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purchasing_forecast_refresh_suppliers_v127() TO authenticated;

-- Initial snapshot is migration-owned, not attributed to a user or a Forecast approval.
DO $initial$
DECLARE v_result jsonb; v_stamp timestamptz:=statement_timestamp(); v_actor uuid:=NULL;
BEGIN

 WITH source_names AS MATERIALIZED (
   SELECT DISTINCT source_product_name FROM purchasing_private.forecast_report_lines_v1
 ), master_names AS MATERIALIZED (
   SELECT lower(btrim(product_name)) AS name_key,count(*) AS candidates,
     min(product_code) AS product_code,min(nullif(btrim(supplier),'')) AS supplier
   FROM public.products_master_v5 GROUP BY lower(btrim(product_name))
 ), previous AS MATERIALIZED (
   SELECT DISTINCT ON (source_product_name) source_product_name,
     forecast_supplier,forecast_supplier_status,forecast_supplier_source_code
   FROM purchasing_private.forecast_report_lines_v1
   ORDER BY source_product_name,forecast_supplier_synced_at DESC NULLS LAST,batch_id,source_row_number
 ), resolved AS MATERIALIZED (
   SELECT s.source_product_name,
     CASE WHEN m.candidates=1 THEN m.supplier END AS supplier,
     CASE WHEN m.candidates=1 THEN m.product_code END AS product_code,
     CASE WHEN m.candidates IS NULL THEN 'unmatched_product'
       WHEN m.candidates<>1 THEN 'ambiguous_product'
       WHEN m.supplier IS NULL THEN 'missing_supplier' ELSE 'available' END AS supplier_status
   FROM source_names s LEFT JOIN master_names m ON m.name_key=lower(btrim(s.source_product_name))
 ), planned AS MATERIALIZED (
   SELECT r.*, (r.supplier IS DISTINCT FROM p.forecast_supplier
     OR r.product_code IS DISTINCT FROM p.forecast_supplier_source_code
     OR r.supplier_status IS DISTINCT FROM p.forecast_supplier_status) AS changed
   FROM resolved r LEFT JOIN previous p USING(source_product_name)
 ), metadata AS MATERIALIZED (
   SELECT master_revision FROM public.purchasing_meta_v5 WHERE singleton=true
 ), saved AS (
   UPDATE purchasing_private.forecast_report_lines_v1 l SET
     forecast_supplier=p.supplier,forecast_supplier_status=p.supplier_status,
     forecast_supplier_source_code=p.product_code,
     forecast_supplier_source_revision=(SELECT master_revision FROM metadata),
     forecast_supplier_synced_at=v_stamp,forecast_supplier_synced_by=v_actor
   FROM planned p WHERE l.source_product_name=p.source_product_name
   RETURNING l.source_product_name,l.forecast_supplier,l.forecast_supplier_status,
     l.forecast_supplier_source_code,l.forecast_supplier_source_revision,
     l.forecast_supplier_synced_at,p.changed
 ), snapshots AS (
   SELECT source_product_name,min(forecast_supplier) AS supplier,
     min(forecast_supplier_status) AS supplier_status,
     min(forecast_supplier_source_code) AS source_code,
     min(forecast_supplier_source_revision) AS source_revision,
     min(forecast_supplier_synced_at) AS synced_at,bool_or(changed) AS changed
   FROM saved GROUP BY source_product_name
 )
 SELECT jsonb_build_object('ok',true,'forecast_computed',false,
   'synced_at',v_stamp,'source_revision',(SELECT master_revision FROM metadata),
   'products',count(*),'changed',count(*) FILTER(WHERE changed),
   'available',count(*) FILTER(WHERE supplier_status='available'),
   'required',count(*) FILTER(WHERE supplier_status<>'available'),
   'missing_supplier',count(*) FILTER(WHERE supplier_status='missing_supplier'),
   'unmatched_product',count(*) FILTER(WHERE supplier_status='unmatched_product'),
   'ambiguous_product',count(*) FILTER(WHERE supplier_status='ambiguous_product'),
   'rows',coalesce(jsonb_agg(jsonb_build_object(
      'source_id','sales:'||md5(source_product_name),'supplier',supplier,
      'supplier_status',supplier_status,'supplier_source_code',source_code,
      'supplier_source_revision',source_revision,'supplier_synced_at',synced_at
    ) ORDER BY source_product_name COLLATE "C"),'[]'::jsonb))
 INTO v_result FROM snapshots;

END $initial$;

-- Add snapshot fields to source-mode read only. Legacy requests and all sales math stay intact.
DO $read_patch$
DECLARE ddl text; original text;
BEGIN
 SELECT pg_get_functiondef('public.purchasing_forecast_history_preview_v121(text[])'::regprocedure) INTO ddl;
 original:=ddl;
 IF md5(ddl)<>'3fb616d2b1502706178d73114417ceac' THEN
   RAISE EXCEPTION 'Forecast RPC changed since reviewed baseline; inspect before migration';
 END IF;
 ddl:=replace(ddl,'l.source_row_number,b.original_filename,b.batch_status,l.historical_profit_sar,',
 $patch$l.source_row_number,b.original_filename,b.batch_status,l.historical_profit_sar,
       l.forecast_supplier,l.forecast_supplier_status,l.forecast_supplier_source_code,
       l.forecast_supplier_source_revision,l.forecast_supplier_synced_at,$patch$);
 ddl:=replace(ddl,'), month_arrays AS (',
 $patch$), supplier_snapshots AS (
     SELECT DISTINCT ON(source_product_name) source_product_name,forecast_supplier,
       forecast_supplier_status,forecast_supplier_source_code,
       forecast_supplier_source_revision,forecast_supplier_synced_at
     FROM source_lines
     ORDER BY source_product_name,forecast_supplier_synced_at DESC NULLS LAST,report_month DESC
   ), month_arrays AS ($patch$);
 ddl:=replace(ddl,$old$'source_mode','sales_reports','ui_build',126,$old$,
   $patch$'source_mode','sales_reports','ui_build',127,$patch$);
 ddl:=replace(ddl,$old$'monthly',m.monthly)$old$,
 $patch$'supplier',s.forecast_supplier,'supplier_status',coalesce(s.forecast_supplier_status,'not_synced'),
       'supplier_source_code',s.forecast_supplier_source_code,
       'supplier_source_revision',s.forecast_supplier_source_revision,
       'supplier_synced_at',s.forecast_supplier_synced_at,'monthly',m.monthly)$patch$);
 ddl:=replace(ddl,'INTO v_data FROM products p JOIN month_arrays m USING(source_product_name);',
   'INTO v_data FROM products p JOIN month_arrays m USING(source_product_name) LEFT JOIN supplier_snapshots s USING(source_product_name);');
 IF ddl=original OR position('supplier_snapshots AS (' in ddl)=0
   OR position('l.forecast_supplier' in ddl)=0 OR position('LEFT JOIN supplier_snapshots s' in ddl)=0 THEN
   RAISE EXCEPTION 'Expected supplier source anchors were not updated';
 END IF;
 IF split_part(ddl,' WITH asked AS (',2) IS DISTINCT FROM split_part(original,' WITH asked AS (',2) THEN
   RAISE EXCEPTION 'Legacy forecast branch changed';
 END IF;
 EXECUTE ddl;
END $read_patch$;
REVOKE ALL ON FUNCTION public.purchasing_forecast_history_preview_v121(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purchasing_forecast_history_preview_v121(text[]) TO authenticated,service_role;
