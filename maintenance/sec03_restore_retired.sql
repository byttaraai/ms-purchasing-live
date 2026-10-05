-- SEC03: EXPLICIT OWNER-ONLY RECOVERY after retirement.
-- Run inside BEGIN/COMMIT only after authorization. Never overwrites existing tables.
-- Recreates only the three retired tables; broad client policies/grants stay revoked.
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '60s';
CREATE TEMP TABLE sec03_restore_result(result jsonb) ON COMMIT DROP;
DO $restore$
DECLARE
 b jsonb; expected_hash text; name text; item jsonb; obj jsonb; ddl text;
 destination text; source_name text; n bigint; restored jsonb; result jsonb := '{}';
 seq text; s jsonb; seq_value bigint; seq_called boolean; seen integer := 0;
BEGIN
 IF to_regclass('public.products_master') IS NOT NULL OR to_regclass('public.inventory_uploads') IS NOT NULL OR to_regclass('public.inventory_lines') IS NOT NULL THEN RAISE EXCEPTION 'SEC03: restore refuses existing source tables'; END IF;
 SELECT payload,payload_md5 INTO b,expected_hash
 FROM purchasing_private.retired_legacy_snapshot_v1
 WHERE snapshot_key='sec03_legacy_retirement';
 IF b IS NULL OR md5(b::text) IS DISTINCT FROM expected_hash
    OR b->>'format' IS DISTINCT FROM 'sec03_logical_snapshot_v1'
    OR (SELECT array_agg(key ORDER BY key) FROM jsonb_each(b->'tables'))
       IS DISTINCT FROM ARRAY['inventory_lines','inventory_uploads','products_master']
 THEN RAISE EXCEPTION 'SEC03: missing, damaged or unsupported recovery snapshot'; END IF;
 IF b->>'supporting_function' IS DISTINCT FROM pg_get_functiondef('public.set_updated_at()'::regprocedure)
 THEN RAISE EXCEPTION 'SEC03: shared trigger source changed; review required'; END IF;

 CREATE TEMP TABLE sec03_restore_auth_ids(id uuid PRIMARY KEY) ON COMMIT DROP;
 REVOKE ALL ON TABLE pg_temp.sec03_restore_auth_ids FROM PUBLIC,anon,authenticated,service_role;
 INSERT INTO pg_temp.sec03_restore_auth_ids
 SELECT DISTINCT a.id FROM auth.users a
 JOIN jsonb_array_elements(b->'tables'->'inventory_uploads'->'data') u ON a.id::text=u->>'uploaded_by';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(b->'tables'->'inventory_uploads'->'data') u
   WHERE u->>'uploaded_by' IS NOT NULL AND NOT EXISTS(
     SELECT 1 FROM pg_temp.sec03_restore_auth_ids a WHERE a.id::text=u->>'uploaded_by'))
 THEN RAISE EXCEPTION 'SEC03: snapshot uploader reference cannot be restored'; END IF;

 FOREACH name IN ARRAY ARRAY['products_master','inventory_uploads','inventory_lines'] LOOP
  item:=b->'tables'->name;
  destination:=format('public.%I',name);
  source_name:='public.'||name;
  ddl:=item->>'create_sql';
  IF left(ddl,length('CREATE TABLE '||source_name||' (')) <> 'CREATE TABLE '||source_name||' ('
  THEN RAISE EXCEPTION 'SEC03: unexpected recovery DDL'; END IF;
  EXECUTE ddl;
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',destination);
  EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC,anon,authenticated,service_role',destination);
  FOR obj IN SELECT value FROM jsonb_array_elements(item->'constraints') LOOP
   ddl:=obj->>'definition';
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',destination,obj->>'name',ddl);
  END LOOP;
  EXECUTE format('INSERT INTO %s SELECT * FROM jsonb_populate_recordset(NULL::%s,$1)',destination,destination) USING item->'data';
  EXECUTE format('SELECT count(*),coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),''[]''::jsonb) FROM %s t',destination) INTO n,restored;
  IF n IS DISTINCT FROM (item->>'row_count')::bigint OR restored IS DISTINCT FROM item->'data'
     OR md5(restored::text) IS DISTINCT FROM item->>'data_md5'
  THEN RAISE EXCEPTION 'SEC03: restore contents differ for %',name; END IF;
  FOR ddl IN SELECT jsonb_array_elements_text(item->'indexes') LOOP
   EXECUTE replace(ddl,' ON '||source_name||' ',' ON '||destination||' ');
  END LOOP;
  FOR ddl IN SELECT jsonb_array_elements_text(item->'triggers') LOOP
   EXECUTE replace(ddl,' ON '||source_name||' ',' ON '||destination||' ');
  END LOOP;
  IF item->'table_metadata'->>'comment' IS NOT NULL THEN
   EXECUTE format('COMMENT ON TABLE %s IS %L',destination,item->'table_metadata'->>'comment');
  END IF;
  FOR obj IN SELECT jsonb_build_object('column',key,'comment',value) FROM jsonb_each(item->'column_comments') LOOP
   IF jsonb_typeof(obj->'comment')='string' THEN
    EXECUTE format('COMMENT ON COLUMN %s.%I IS %L',destination,obj->>'column',obj->>'comment');
   END IF;
  END LOOP;
  IF jsonb_typeof(item->'sequence')='object' THEN
   s:=item->'sequence';seq:=pg_get_serial_sequence(destination,s->>'column');
   IF seq IS NULL OR (SELECT relnamespace FROM pg_class WHERE oid=seq::regclass)<>'public'::regnamespace
   THEN RAISE EXCEPTION 'SEC03: restore sequence is outside approved public scope'; END IF;
   EXECUTE format('ALTER SEQUENCE %s INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s %s',
    seq,(s->'settings'->>'increment_by')::bigint,(s->'settings'->>'min_value')::bigint,
    (s->'settings'->>'max_value')::bigint,(s->'settings'->>'start_value')::bigint,
    (s->'settings'->>'cache_size')::bigint,CASE WHEN (s->'settings'->>'cycle')::boolean THEN 'CYCLE' ELSE 'NO CYCLE' END);
   PERFORM setval(seq::regclass,(s->>'last_value')::bigint,(s->>'is_called')::boolean);
   EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC,anon,authenticated,service_role',seq);
   EXECUTE format('SELECT last_value,is_called FROM %s',seq) INTO seq_value,seq_called;
   IF seq_value IS DISTINCT FROM (s->>'last_value')::bigint OR seq_called IS DISTINCT FROM (s->>'is_called')::boolean
   THEN RAISE EXCEPTION 'SEC03: sequence state mismatch'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=destination::regclass AND NOT convalidated)
     OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=destination::regclass)
     OR has_table_privilege('anon',destination,'SELECT') OR has_table_privilege('authenticated',destination,'SELECT')
  THEN RAISE EXCEPTION 'SEC03: restore constraints/access validation failed'; END IF;
  result:=result||jsonb_build_object(name,jsonb_build_object('restored_rows',n,'data_md5',md5(restored::text),
   'constraints_validated',true,'broad_policies_replayed',false,'sequence_checked',jsonb_typeof(item->'sequence')='object'));
  seen:=seen+1;
 END LOOP;
 IF seen<>3 THEN RAISE EXCEPTION 'SEC03: incomplete restore'; END IF;
 INSERT INTO pg_temp.sec03_restore_result VALUES(jsonb_build_object('status','restored_legacy_owner_only',
   'snapshot_md5',expected_hash,'tables',result,'legacy_tables_restored',3));
END;
$restore$;
SELECT result FROM pg_temp.sec03_restore_result;
