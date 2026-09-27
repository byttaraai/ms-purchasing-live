-- Authorized SQL connector test. TEMP ONLY. Run the complete file, including ROLLBACK.
-- All full live function bodies are cloned; only schema refs and the auth subject are isolated.
BEGIN;
CREATE TEMP TABLE fix1_results (name text, ok boolean, detail text);
CREATE TEMP TABLE purchasing_users_v5 (LIKE public.purchasing_users_v5 INCLUDING ALL);
CREATE TEMP TABLE products_master_v5 (LIKE public.products_master_v5 INCLUDING ALL);
CREATE TEMP TABLE product_unit_aliases_v5 AS SELECT * FROM public.product_unit_aliases_v5 WITH NO DATA;
CREATE TEMP TABLE purchasing_meta_v5 (singleton boolean PRIMARY KEY, master_revision integer, seed_applied boolean, seed_file text, updated_at timestamptz, updated_by uuid);
CREATE TEMP TABLE purchasing_request_log_v5 (request_id uuid PRIMARY KEY, request_type text, created_at timestamptz, created_by uuid);
CREATE TEMP TABLE inventory_uploads_v5 AS SELECT * FROM public.inventory_uploads_v5 WITH NO DATA;
-- Deliberately omit production identity/default sequences from temporary inventory lines.
CREATE TEMP TABLE inventory_lines_v5 AS SELECT * FROM public.inventory_lines_v5 WITH NO DATA;
CREATE TEMP TABLE purchasing_tasks_v5 AS SELECT * FROM public.purchasing_tasks_v5 WITH NO DATA;
CREATE FUNCTION pg_temp.fix1_uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('fix1.test_uid',true),'')::uuid $$;
DO $test$
DECLARE
 sig text; body text; old_guard text := 'public.purchasing_current_role_v5() <> ''admin''';
 new_guard text := 'public.purchasing_current_role_v5() IS DISTINCT FROM ''admin''';
 admin_id uuid := gen_random_uuid(); buyer_id uuid := gen_random_uuid(); disabled_id uuid := gen_random_uuid();
 absent_id uuid := gen_random_uuid(); subject uuid; expected text; msg text; action text;
 result jsonb; d jsonb; old_score jsonb; new_score jsonb; rev integer; req uuid;
BEGIN
 FOR sig IN SELECT unnest(ARRAY[
  'public.purchasing_unit_key_v5(text)',
  'public.purchasing_current_role_v5()',
  'public.purchasing_unit_role_v5(text,text,text,text,numeric)',
  'public.purchasing_unit_role_v5(text,text)',
  'public.purchasing_save_master_v5_impl(jsonb,text,integer,uuid)',
  'public.purchasing_save_master_v5(jsonb,text,integer,uuid)',
  'public.purchasing_save_inventory_v5_fixed(jsonb,text,date,text,boolean,boolean,integer,uuid,text)',
  'public.purchasing_save_inventory_v5(jsonb,text,date,text,boolean,boolean,integer,uuid,text)',
  'public.purchasing_dashboard_v5_impl()',
  'public.purchasing_dashboard_v5()',
  'public.purchasing_master_review_save_v93(jsonb,integer,uuid)'
 ]) LOOP
   body := pg_get_functiondef(to_regprocedure(sig));
   IF body IS NULL THEN RAISE EXCEPTION 'Missing dependency %',sig; END IF;
   body := replace(replace(body,'public.','pg_temp.'),'auth.uid()','pg_temp.fix1_uid()');
   IF position('public.' in body)>0 OR position('auth.uid()' in body)>0 THEN RAISE EXCEPTION 'Unsafe sandbox dependency'; END IF;
   EXECUTE body;
 END LOOP;
 INSERT INTO pg_temp.purchasing_users_v5(user_id,role,active) VALUES (admin_id,'admin',true),(buyer_id,'purchasing',true),(disabled_id,'admin',false);
 INSERT INTO pg_temp.purchasing_meta_v5 VALUES(true,1,true,'synthetic',now(),admin_id);
 PERFORM set_config('fix1.test_uid',absent_id::text,true);
 FOREACH action IN ARRAY ARRAY['master','inventory'] LOOP
  msg:=null;
  BEGIN
   IF action='master' THEN PERFORM pg_temp.purchasing_save_master_v5('{}','synthetic',1,gen_random_uuid());
   ELSE PERFORM pg_temp.purchasing_save_inventory_v5('{}','synthetic',current_date,'all_products',true,true,1,gen_random_uuid(),null); END IF;
  EXCEPTION WHEN OTHERS THEN msg:=sqlerrm; END;
  IF msg NOT IN ('payload must be a JSON array','Admin access required') OR msg IS NULL THEN RAISE EXCEPTION 'Unexpected baseline result: %',msg; END IF;
  INSERT INTO pg_temp.fix1_results VALUES('baseline_'||action,true,msg);
 END LOOP;
 FOR sig IN SELECT unnest(ARRAY['public.purchasing_save_master_v5(jsonb,text,integer,uuid)','public.purchasing_save_inventory_v5_fixed(jsonb,text,date,text,boolean,boolean,integer,uuid,text)']) LOOP
  body:=pg_get_functiondef(to_regprocedure(sig)); body:=replace(body,old_guard,new_guard);
  EXECUTE replace(replace(body,'public.','pg_temp.'),'auth.uid()','pg_temp.fix1_uid()');
 END LOOP;
 FOREACH subject IN ARRAY ARRAY[absent_id,disabled_id,buyer_id,NULL::uuid] LOOP
  PERFORM set_config('fix1.test_uid',coalesce(subject::text,''),true);
  expected:=CASE WHEN subject IS NULL THEN 'Authentication required' ELSE 'Admin access required' END;
  FOREACH action IN ARRAY ARRAY['master','inventory'] LOOP
   msg:=null;
   BEGIN
    IF action='master' THEN PERFORM pg_temp.purchasing_save_master_v5('[]','synthetic',1,gen_random_uuid());
    ELSE PERFORM pg_temp.purchasing_save_inventory_v5('[]','synthetic',current_date,'all_products',true,true,1,gen_random_uuid(),null); END IF;
   EXCEPTION WHEN OTHERS THEN msg:=sqlerrm; END;
   IF msg IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Authorization regression %: %',action,msg; END IF;
   INSERT INTO pg_temp.fix1_results VALUES(action||'_deny_'||CASE WHEN subject IS NULL THEN 'no_login' WHEN subject=absent_id THEN 'absent_role' WHEN subject=disabled_id THEN 'inactive_admin' ELSE 'purchasing' END,true,msg);
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_temp.purchasing_request_log_v5) OR EXISTS(SELECT 1 FROM pg_temp.products_master_v5) OR EXISTS(SELECT 1 FROM pg_temp.inventory_uploads_v5) THEN RAISE EXCEPTION 'Denied calls wrote data'; END IF;
 INSERT INTO pg_temp.fix1_results VALUES('denial_has_no_writes',true,'No master, request or inventory rows');
 PERFORM set_config('fix1.test_uid',admin_id::text,true);
 result:=pg_temp.purchasing_save_master_v5('[{"product_code":"FIX1-QA","product_name":"Synthetic admin guard product","purchase_unit":"Piece","option_unit":null,"factor":1,"reorder_point":100,"reorder_point_unit":"Piece","profitability_class":"Super","supplier":"QA Supplier","order_multiple":1,"purchase_price":5}]','synthetic',1,gen_random_uuid());
 IF result->>'ok'<>'true' OR (SELECT master_revision FROM pg_temp.purchasing_meta_v5)<>2 OR (SELECT count(*) FROM pg_temp.products_master_v5)<>1 THEN RAISE EXCEPTION 'Admin Master save failed'; END IF;
 INSERT INTO pg_temp.fix1_results VALUES('admin_master_save',true,'Saved 1 synthetic product; revision 1 -> 2');
 req:=gen_random_uuid();
 result:=pg_temp.purchasing_save_inventory_v5('[{"product_code":"FIX1-QA","raw_product_name":"Synthetic admin guard product","raw_quantity":20,"raw_unit":"Piece","source_row":1,"raw_record":{"Total Buy Price":"120"}}]','synthetic',current_date,'all_products',true,true,2,req,null);
 IF result->>'ok'<>'true' OR (result->>'matched')::int<>1 OR (result->>'price_updates')::int<>1 OR (SELECT purchase_price FROM pg_temp.products_master_v5 WHERE product_code='FIX1-QA')<>6 THEN RAISE EXCEPTION 'Admin inventory save failed'; END IF;
 INSERT INTO pg_temp.fix1_results VALUES('admin_inventory_save',true,'1 row matched; purchase price 120 / 20 = 6');
 d:=pg_temp.purchasing_dashboard_v5();
 IF (d->'rows'->0->>'min_order_qty')::numeric<>100 OR (d->'rows'->0->>'max_order_qty')::numeric<>180 OR (d->'rows'->0->>'stock_ratio')::numeric<>20 THEN RAISE EXCEPTION 'Stock calculations changed'; END IF;
 old_score:=purchasing_private.workspace_model_v58(d->'rows','{}','[]','[]',null,true,current_date);
 INSERT INTO pg_temp.fix1_results VALUES('stock_min_max_price',true,'Stock 20, Reorder 100, Min 100, Max 180, Price 6');
 msg:=null;
 BEGIN PERFORM pg_temp.purchasing_save_master_v5('[]','synthetic',1,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN msg:=sqlerrm; END;
 IF msg IS DISTINCT FROM 'Master has changed. Refresh and validate again.' THEN RAISE EXCEPTION 'Revision guard regression %',msg; END IF;
 INSERT INTO pg_temp.fix1_results VALUES('normal_revision_conflict',true,msg);
 UPDATE pg_temp.products_master_v5 SET purchase_price=null WHERE product_code='FIX1-QA';
 INSERT INTO pg_temp.purchasing_tasks_v5(user_id,focus,status,is_current,codes,updated_at) VALUES(buyer_id,'data','open',true,'["FIX1-QA"]',now());
 PERFORM set_config('fix1.test_uid',buyer_id::text,true);
 SELECT master_revision INTO rev FROM pg_temp.purchasing_meta_v5;
 result:=pg_temp.purchasing_master_review_save_v93('[{"product_code":"FIX1-QA","purchase_price":6}]',rev,gen_random_uuid());
 IF result->>'ok'<>'true' OR (SELECT purchase_price FROM pg_temp.products_master_v5 WHERE product_code='FIX1-QA')<>6 THEN RAISE EXCEPTION 'Restricted purchasing popup regressed'; END IF;
 d:=pg_temp.purchasing_dashboard_v5();
 new_score:=purchasing_private.workspace_model_v58(d->'rows','{}','[]','[]',null,true,current_date);
 IF old_score IS DISTINCT FROM new_score THEN RAISE EXCEPTION 'Score changed for identical restored source'; END IF;
 INSERT INTO pg_temp.fix1_results VALUES('restricted_buyer_popup_save',true,'Price-only repair remains allowed; identical source gives identical BO score');
 msg:=null;
 BEGIN PERFORM pg_temp.purchasing_master_review_save_v93('[{"product_code":"OUTSIDE-TASK","purchase_price":6}]',rev+1,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN msg:=sqlerrm; END;
 IF msg IS DISTINCT FROM 'Product is not in the current Master Data task: OUTSIDE-TASK' THEN RAISE EXCEPTION 'Popup scope changed %',msg; END IF;
 INSERT INTO pg_temp.fix1_results VALUES('popup_target_limit_preserved',true,msg);
 IF NOT has_function_privilege('authenticated','public.purchasing_save_master_v5(jsonb,text,integer,uuid)','EXECUTE') OR has_function_privilege('anon','public.purchasing_save_master_v5(jsonb,text,integer,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.purchasing_save_master_v5_impl(jsonb,text,integer,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Unexpected production grants'; END IF;
 INSERT INTO pg_temp.fix1_results VALUES('public_rpc_and_private_impl_grants',true,'Signed-in RPC allowed; anonymous and direct implementation denied');
END;
$test$;
SELECT jsonb_build_object('temporary_only',true,'tests',count(*),'passed',bool_and(ok),'results',jsonb_agg(to_jsonb(r))) AS security_fix1_tests FROM pg_temp.fix1_results r;
ROLLBACK;
