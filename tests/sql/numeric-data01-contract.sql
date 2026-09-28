-- Run AFTER DATA-01 migration, through an authorized SQL connection.
-- Read-only verification: no test products, inventory uploads, users or sequences.
BEGIN READ ONLY;
DO $test$
DECLARE k text; v jsonb; msg text; body text;
BEGIN
 IF (SELECT count(*) FROM pg_constraint WHERE conname IN ('master_numeric_bounds_data01','inventory_quantity_bounds_data01','inventory_total_bounds_data01') AND convalidated)<>3 THEN RAISE EXCEPTION 'DATA-01 constraints missing or unvalidated'; END IF;
 IF has_function_privilege('anon','purchasing_private.assert_workspace_numbers_data01(jsonb)','execute') OR has_function_privilege('authenticated','purchasing_private.assert_workspace_numbers_data01(jsonb)','execute') THEN RAISE EXCEPTION 'Private numeric helper exposed'; END IF;
 FOREACH k IN ARRAY ARRAY['stock_qty','reorder_point','stock_ratio','min_order_qty','max_order_qty','factor','raw_quantity','purchase_price','total_value','raw_total_buy','raw_unit_price'] LOOP
  FOREACH v IN ARRAY ARRAY['1000000000001'::jsonb,'-1000000000001'::jsonb,'"NaN"'::jsonb,'"Infinity"'::jsonb,'true'::jsonb] LOOP
   msg:=null;
   BEGIN PERFORM purchasing_private.assert_workspace_numbers_data01(jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('product_code','READ-ONLY-QA',k,v)))); EXCEPTION WHEN numeric_value_out_of_range THEN msg:=sqlerrm; END;
   IF msg IS NULL THEN RAISE EXCEPTION 'Unsupported numeric value accepted: % %',k,v; END IF;
  END LOOP;
  PERFORM purchasing_private.assert_workspace_numbers_data01(jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('product_code','READ-ONLY-QA',k,0))));
  PERFORM purchasing_private.assert_workspace_numbers_data01(jsonb_build_object('rows',jsonb_build_array(jsonb_build_object('product_code','READ-ONLY-QA',k,NULL))));
 END LOOP;
 PERFORM purchasing_private.assert_workspace_numbers_data01('{"rows":[{"product_code":"READ-ONLY-QA","purchase_price":1000000000000,"raw_quantity":-1000000000000}]}');
 FOREACH k IN ARRAY ARRAY['public.purchasing_save_master_v5_impl(jsonb,text,integer,uuid)','public.purchasing_save_inventory_v5_fixed(jsonb,text,date,text,boolean,boolean,integer,uuid,text)'] LOOP
  body:=pg_get_functiondef(to_regprocedure(k));
  IF position('perform purchasing_private.assert_workspace_numbers_data01(public.purchasing_dashboard_v5_impl());' IN body)=0 THEN RAISE EXCEPTION 'Save output guard missing: %',k; END IF;
  IF position('expected_revision is null or v_revision is distinct from' IN body)=0 THEN RAISE EXCEPTION 'Prior revision protection missing: %',k; END IF;
 END LOOP;
 body:=pg_get_functiondef('public.purchasing_save_master_v5(jsonb,text,integer,uuid)'::regprocedure);
 IF position('IS DISTINCT FROM ''admin''' IN body)=0 THEN RAISE EXCEPTION 'Prior Admin protection missing'; END IF;
END;
$test$;
SELECT 'PASS: DATA-01 read-only contracts; 55 invalid outputs rejected, valid zeros/nulls/boundaries accepted, private access and prior guards preserved' AS result;
ROLLBACK;
