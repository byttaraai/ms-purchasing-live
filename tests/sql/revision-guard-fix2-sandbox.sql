-- SEC-02. TEMP ONLY: full live save/upload/popup bodies, isolated schema and subject.
-- Run this whole file including ROLLBACK. Production sequences are not copied.
BEGIN;
CREATE TEMP TABLE fix2_results (name text, ok boolean, detail text);
CREATE TEMP TABLE purchasing_users_v5 (LIKE public.purchasing_users_v5 INCLUDING ALL);
CREATE TEMP TABLE products_master_v5 (LIKE public.products_master_v5 INCLUDING ALL);
CREATE TEMP TABLE product_unit_aliases_v5 AS SELECT * FROM public.product_unit_aliases_v5 WITH NO DATA;
CREATE TEMP TABLE purchasing_meta_v5 (singleton boolean PRIMARY KEY, master_revision integer, seed_applied boolean, seed_file text, updated_at timestamptz, updated_by uuid);
CREATE TEMP TABLE purchasing_request_log_v5 (request_id uuid PRIMARY KEY, request_type text, created_at timestamptz, created_by uuid);
CREATE TEMP TABLE inventory_uploads_v5 AS SELECT * FROM public.inventory_uploads_v5 WITH NO DATA;
CREATE TEMP TABLE inventory_lines_v5 AS SELECT * FROM public.inventory_lines_v5 WITH NO DATA;
CREATE TEMP TABLE purchasing_tasks_v5 AS SELECT * FROM public.purchasing_tasks_v5 WITH NO DATA;
CREATE FUNCTION pg_temp.fix2_uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('fix2.test_uid',true),'')::uuid $$;
CREATE FUNCTION pg_temp.fix2_fingerprint() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT md5(jsonb_build_object(
  'master',(SELECT jsonb_agg(to_jsonb(x) ORDER BY product_code) FROM pg_temp.products_master_v5 x),
  'meta',(SELECT jsonb_agg(to_jsonb(x) ORDER BY singleton) FROM pg_temp.purchasing_meta_v5 x),
  'requests',(SELECT jsonb_agg(to_jsonb(x) ORDER BY request_id) FROM pg_temp.purchasing_request_log_v5 x),
  'uploads',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM pg_temp.inventory_uploads_v5 x),
  'lines',(SELECT jsonb_agg(to_jsonb(x) ORDER BY product_code) FROM pg_temp.inventory_lines_v5 x),
  'tasks',(SELECT jsonb_agg(to_jsonb(x) ORDER BY user_id) FROM pg_temp.purchasing_tasks_v5 x)
 )::text)
$$;
DO $test$
DECLARE
 sig text; body text; old_guard text; new_guard text; subject uuid; action text;
 admin_id uuid := gen_random_uuid(); buyer_id uuid := gen_random_uuid();
 disabled_id uuid := gen_random_uuid(); absent_id uuid := gen_random_uuid();
 expected text; msg text; stamp text; scenario text; proposed integer;
 result jsonb; d jsonb; before_model jsonb; after_model jsonb; rev integer; saved_req uuid;
 master_payload jsonb := '[{"product_code":"FIX2-QA","product_name":"Synthetic revision guard product","purchase_unit":"Box 10","option_unit":"Piece","factor":10,"reorder_point":100,"reorder_point_unit":"Piece","profitability_class":"Super","supplier":"QA Supplier","order_multiple":1,"purchase_price":50}]';
 inventory_payload jsonb := '[{"product_code":"FIX2-QA","raw_product_name":"Synthetic revision guard product","raw_quantity":50,"raw_unit":"Piece","source_row":1,"raw_record":{"Total Buy Price":"300"}}]';
BEGIN
 FOR sig IN SELECT unnest(ARRAY[
  'public.purchasing_unit_key_v5(text)', 'public.purchasing_current_role_v5()',
  'public.purchasing_unit_role_v5(text,text,text,text,numeric)', 'public.purchasing_unit_role_v5(text,text)',
  'public.purchasing_save_master_v5_impl(jsonb,text,integer,uuid)', 'public.purchasing_save_master_v5(jsonb,text,integer,uuid)',
  'public.purchasing_save_inventory_v5_fixed(jsonb,text,date,text,boolean,boolean,integer,uuid,text)',
  'public.purchasing_save_inventory_v5(jsonb,text,date,text,boolean,boolean,integer,uuid,text)',
  'public.purchasing_dashboard_v5_impl()', 'public.purchasing_dashboard_v5()',
  'public.purchasing_master_review_save_v93(jsonb,integer,uuid)'
 ]) LOOP
  body := pg_get_functiondef(to_regprocedure(sig));
  IF body IS NULL THEN RAISE EXCEPTION 'Missing dependency %',sig; END IF;
  IF sig LIKE 'public.purchasing_save_master_v5_impl(%' THEN
   old_guard := 'if v_revision<>expected_revision then';
   new_guard := 'if expected_revision is null or v_revision is distinct from expected_revision then';
   IF position(old_guard in body)=0 AND position(new_guard in body)=0 THEN RAISE EXCEPTION 'Unexpected Master revision guard'; END IF;
   body := replace(body,old_guard,new_guard);
  ELSIF sig LIKE 'public.purchasing_save_inventory_v5_fixed(%' THEN
   old_guard := 'if v_revision<>p_expected_revision then';
   new_guard := 'if p_expected_revision is null or v_revision is distinct from p_expected_revision then';
   IF position(old_guard in body)=0 AND position(new_guard in body)=0 THEN RAISE EXCEPTION 'Unexpected Inventory revision guard'; END IF;
   body := replace(body,old_guard,new_guard);
  END IF;
  body := replace(replace(body,'public.','pg_temp.'),'auth.uid()','pg_temp.fix2_uid()');
  IF position('public.' in body)>0 OR position('auth.uid()' in body)>0 THEN RAISE EXCEPTION 'Unsafe sandbox dependency'; END IF;
  EXECUTE body;
 END LOOP;
 INSERT INTO pg_temp.purchasing_users_v5(user_id,role,active) VALUES(admin_id,'admin',true),(buyer_id,'purchasing',true),(disabled_id,'admin',false);
 INSERT INTO pg_temp.purchasing_meta_v5 VALUES(true,1,true,'synthetic',now(),admin_id);
 -- Re-run fix 1 authorization matrix; null revision never bypasses authorization.
 FOREACH subject IN ARRAY ARRAY[absent_id,disabled_id,buyer_id,NULL::uuid] LOOP
  PERFORM set_config('fix2.test_uid',coalesce(subject::text,''),true);
  expected := CASE WHEN subject IS NULL THEN 'Authentication required' ELSE 'Admin access required' END;
  FOREACH action IN ARRAY ARRAY['master','inventory'] LOOP
   stamp:=pg_temp.fix2_fingerprint(); msg:=null;
   BEGIN
    IF action='master' THEN PERFORM pg_temp.purchasing_save_master_v5(master_payload,'synthetic',null,gen_random_uuid());
    ELSE PERFORM pg_temp.purchasing_save_inventory_v5(inventory_payload,'synthetic',current_date,'all_products',true,true,null,gen_random_uuid(),null); END IF;
   EXCEPTION WHEN OTHERS THEN msg:=sqlerrm; END;
   IF msg IS DISTINCT FROM expected OR stamp IS DISTINCT FROM pg_temp.fix2_fingerprint() THEN RAISE EXCEPTION 'Authorization regression %: %',action,msg; END IF;
   INSERT INTO pg_temp.fix2_results VALUES(action||'_deny_'||CASE WHEN subject IS NULL THEN 'no_login' WHEN subject=absent_id THEN 'absent_role' WHEN subject=disabled_id THEN 'inactive_admin' ELSE 'purchasing' END,true,msg);
  END LOOP;
 END LOOP;
 PERFORM set_config('fix2.test_uid',admin_id::text,true);
 FOREACH proposed IN ARRAY ARRAY[NULL::integer,0,2] LOOP
  FOREACH action IN ARRAY ARRAY['master','inventory'] LOOP
   stamp:=pg_temp.fix2_fingerprint(); msg:=null;
   BEGIN
    IF action='master' THEN PERFORM pg_temp.purchasing_save_master_v5(master_payload,'synthetic',proposed,gen_random_uuid());
    ELSE PERFORM pg_temp.purchasing_save_inventory_v5(inventory_payload,'synthetic',current_date,'all_products',true,true,proposed,gen_random_uuid(),null); END IF;
   EXCEPTION WHEN OTHERS THEN msg:=sqlerrm; END;
   IF msg IS DISTINCT FROM 'Master has changed. Refresh and validate again.' OR stamp IS DISTINCT FROM pg_temp.fix2_fingerprint() THEN RAISE EXCEPTION 'Revision denial failed %, %: %',action,proposed,msg; END IF;
   INSERT INTO pg_temp.fix2_results VALUES(action||'_deny_'||CASE WHEN proposed IS NULL THEN 'null_revision' WHEN proposed=0 THEN 'stale_revision' ELSE 'future_revision' END,true,'Rejected with zero writes');
  END LOOP;
 END LOOP;
 -- Fail closed when the singleton is absent or unexpectedly has a NULL revision.
 FOREACH scenario IN ARRAY ARRAY['null_meta','missing_meta'] LOOP
  IF scenario='null_meta' THEN UPDATE pg_temp.purchasing_meta_v5 SET master_revision=null;
  ELSE DELETE FROM pg_temp.purchasing_meta_v5; END IF;
  FOREACH action IN ARRAY ARRAY['master','inventory'] LOOP
   stamp:=pg_temp.fix2_fingerprint(); msg:=null;
   BEGIN
    IF action='master' THEN PERFORM pg_temp.purchasing_save_master_v5(master_payload,'synthetic',null,gen_random_uuid());
    ELSE PERFORM pg_temp.purchasing_save_inventory_v5(inventory_payload,'synthetic',current_date,'all_products',true,true,1,gen_random_uuid(),null); END IF;
   EXCEPTION WHEN OTHERS THEN msg:=sqlerrm; END;
   IF msg IS DISTINCT FROM 'Master has changed. Refresh and validate again.' OR stamp IS DISTINCT FROM pg_temp.fix2_fingerprint() THEN RAISE EXCEPTION 'Missing source guard failed'; END IF;
   INSERT INTO pg_temp.fix2_results VALUES(action||'_'||scenario,true,'Rejected with zero writes');
  END LOOP;
 END LOOP;
 INSERT INTO pg_temp.purchasing_meta_v5 VALUES(true,1,true,'synthetic',now(),admin_id);
 saved_req:=gen_random_uuid();
 result:=pg_temp.purchasing_save_master_v5(master_payload,'synthetic',1,saved_req);
 IF result->>'ok' IS DISTINCT FROM 'true' OR (SELECT master_revision FROM pg_temp.purchasing_meta_v5)<>2 OR (SELECT reorder_point FROM pg_temp.products_master_v5 WHERE product_code='FIX2-QA')<>10 THEN RAISE EXCEPTION 'Valid Master save or unit conversion failed'; END IF;
 INSERT INTO pg_temp.fix2_results VALUES('valid_master_save',true,'Revision 1 -> 2; RP 100 Piece -> 10 Box 10 exactly once');
 stamp:=pg_temp.fix2_fingerprint();
 result:=pg_temp.purchasing_save_master_v5(master_payload,'synthetic',2,saved_req);
 IF result->>'duplicate_request' IS DISTINCT FROM 'true' OR stamp IS DISTINCT FROM pg_temp.fix2_fingerprint() THEN RAISE EXCEPTION 'Current-revision idempotent retry changed'; END IF;
 INSERT INTO pg_temp.fix2_results VALUES('idempotent_retry_preserved',true,'Existing duplicate-request behavior unchanged');
 result:=pg_temp.purchasing_save_inventory_v5(inventory_payload,'synthetic',current_date,'all_products',true,true,2,gen_random_uuid(),null);
 IF result->>'ok' IS DISTINCT FROM 'true' OR (result->>'matched')::int<>1 OR (result->>'price_updates')::int<>1 OR (SELECT master_revision FROM pg_temp.purchasing_meta_v5)<>3 THEN RAISE EXCEPTION 'Valid Inventory save failed'; END IF;
 INSERT INTO pg_temp.fix2_results VALUES('valid_inventory_save',true,'Revision 2 -> 3; option-unit price imported normally');
 d:=pg_temp.purchasing_dashboard_v5();
 IF (d->'rows'->0->>'stock_qty')::numeric<>5 OR (d->'rows'->0->>'stock_ratio')::numeric<>50 OR (d->'rows'->0->>'min_order_qty')::numeric<>7 OR (d->'rows'->0->>'max_order_qty')::numeric<>15 OR (d->'rows'->0->>'purchase_price')::numeric<>60 THEN RAISE EXCEPTION 'Purchasing calculation regression'; END IF;
 before_model:=purchasing_private.workspace_model_v58(d->'rows','{}','[]','[]',null,true,current_date);
 INSERT INTO pg_temp.fix2_results VALUES('calculations_unchanged',true,'Stock 5, RP 10, ratio 50, Min 7, Max 15, Price 60');
 UPDATE pg_temp.products_master_v5 SET purchase_price=null WHERE product_code='FIX2-QA';
 INSERT INTO pg_temp.purchasing_tasks_v5(user_id,focus,status,is_current,codes,updated_at) VALUES(buyer_id,'data','open',true,'["FIX2-QA"]',now());
 PERFORM set_config('fix2.test_uid',buyer_id::text,true);
 FOREACH proposed IN ARRAY ARRAY[NULL::integer,2,4] LOOP
  stamp:=pg_temp.fix2_fingerprint(); msg:=null;
  BEGIN PERFORM pg_temp.purchasing_master_review_save_v93('[{"product_code":"FIX2-QA","purchase_price":60}]',proposed,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN msg:=sqlerrm; END;
  IF msg IS DISTINCT FROM 'Master has changed. Refresh and validate again.' OR stamp IS DISTINCT FROM pg_temp.fix2_fingerprint() THEN RAISE EXCEPTION 'Popup revision denial failed %: %',proposed,msg; END IF;
  INSERT INTO pg_temp.fix2_results VALUES('popup_deny_'||coalesce(proposed::text,'null'),true,'Rejected with zero writes');
 END LOOP;
 result:=pg_temp.purchasing_master_review_save_v93('[{"product_code":"FIX2-QA","purchase_price":60}]',3,gen_random_uuid());
 IF result->>'ok' IS DISTINCT FROM 'true' OR (SELECT master_revision FROM pg_temp.purchasing_meta_v5)<>4 THEN RAISE EXCEPTION 'Restricted buyer save failed'; END IF;
 d:=pg_temp.purchasing_dashboard_v5();
 after_model:=purchasing_private.workspace_model_v58(d->'rows','{}','[]','[]',null,true,current_date);
 IF before_model IS DISTINCT FROM after_model THEN RAISE EXCEPTION 'Same-source BO score changed'; END IF;
 INSERT INTO pg_temp.fix2_results VALUES('buyer_popup_and_score_preserved',true,'Valid restricted save succeeds; same-source BO model identical');
 stamp:=pg_temp.fix2_fingerprint(); msg:=null;
 BEGIN PERFORM pg_temp.purchasing_master_review_save_v93('[{"product_code":"OUTSIDE-TASK","purchase_price":60}]',4,gen_random_uuid()); EXCEPTION WHEN OTHERS THEN msg:=sqlerrm; END;
 IF msg IS DISTINCT FROM 'Product is not in the current Master Data task: OUTSIDE-TASK' OR stamp IS DISTINCT FROM pg_temp.fix2_fingerprint() THEN RAISE EXCEPTION 'Popup target authorization changed'; END IF;
 INSERT INTO pg_temp.fix2_results VALUES('popup_scope_preserved',true,msg);
 -- Two editors read revision 4. A saves; B's old revision cannot overwrite A.
 PERFORM set_config('fix2.test_uid',admin_id::text,true);
 SELECT jsonb_build_array(to_jsonb(m)) INTO master_payload FROM pg_temp.products_master_v5 m WHERE product_code='FIX2-QA';
 result:=pg_temp.purchasing_save_master_v5(jsonb_set(master_payload,'{0,supplier}','"Editor A Supplier"'),'synthetic A',4,gen_random_uuid());
 IF result->>'ok' IS DISTINCT FROM 'true' OR (SELECT master_revision FROM pg_temp.purchasing_meta_v5)<>5 THEN RAISE EXCEPTION 'Editor A save failed'; END IF;
 INSERT INTO pg_temp.fix2_results VALUES('editor_A_save',true,'Revision 4 -> 5');
 FOREACH action IN ARRAY ARRAY['master','inventory'] LOOP
  stamp:=pg_temp.fix2_fingerprint(); msg:=null;
  BEGIN
   IF action='master' THEN PERFORM pg_temp.purchasing_save_master_v5(jsonb_set(master_payload,'{0,purchase_price}','99'),'synthetic B',4,gen_random_uuid());
   ELSE PERFORM pg_temp.purchasing_save_inventory_v5(inventory_payload,'synthetic B',current_date,'all_products',true,true,4,gen_random_uuid(),null); END IF;
  EXCEPTION WHEN OTHERS THEN msg:=sqlerrm; END;
  IF msg IS DISTINCT FROM 'Master has changed. Refresh and validate again.' OR stamp IS DISTINCT FROM pg_temp.fix2_fingerprint() THEN RAISE EXCEPTION 'Stale editor overwrote source'; END IF;
  INSERT INTO pg_temp.fix2_results VALUES('editor_B_'||action||'_blocked',true,'Editor A changes intact; zero writes');
 END LOOP;
 IF NOT has_function_privilege('authenticated','public.purchasing_save_master_v5(jsonb,text,integer,uuid)','EXECUTE') OR has_function_privilege('anon','public.purchasing_save_master_v5(jsonb,text,integer,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.purchasing_save_master_v5_impl(jsonb,text,integer,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.purchasing_save_inventory_v5_fixed(jsonb,text,date,text,boolean,boolean,integer,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Execution grants regressed'; END IF;
 INSERT INTO pg_temp.fix2_results VALUES('execution_grants_preserved',true,'Public RPC access and private implementation isolation unchanged');
END;
$test$;
SELECT jsonb_build_object('temporary_only',true,'tests',count(*),'passed',bool_and(ok),'results',jsonb_agg(to_jsonb(r))) AS security_fix2_tests FROM pg_temp.fix2_results r;
ROLLBACK;
