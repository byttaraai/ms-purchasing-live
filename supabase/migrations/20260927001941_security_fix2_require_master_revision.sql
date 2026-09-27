-- SEC-02: reject NULL expected_revision without changing valid save behavior.
-- Only two revision predicates change. No old migration is replayed.
DO $fix$
DECLARE
 t record;
 original text;
 patched text;
 acl_before text;
BEGIN
 FOR t IN SELECT * FROM (VALUES
  ('public.purchasing_save_master_v5_impl(jsonb,text,integer,uuid)',
   '0c3d952c48dcf5c6e7c35dfd26b529a0',
   'if v_revision<>expected_revision then',
   'if expected_revision is null or v_revision is distinct from expected_revision then'),
  ('public.purchasing_save_inventory_v5_fixed(jsonb,text,date,text,boolean,boolean,integer,uuid,text)',
   '7e4489772ff19ff7a86dbca7d2978c22',
   'if v_revision<>p_expected_revision then',
   'if p_expected_revision is null or v_revision is distinct from p_expected_revision then')
 ) AS targets(signature,expected_md5,old_guard,new_guard)
 LOOP
  SELECT pg_get_functiondef(p.oid),p.proacl::text INTO original,acl_before
  FROM pg_proc p WHERE p.oid=to_regprocedure(t.signature);
  IF original IS NULL OR md5(original) IS DISTINCT FROM t.expected_md5 THEN
   RAISE EXCEPTION 'SEC-02 source drift: %',t.signature;
  END IF;
  IF (length(original)-length(replace(original,t.old_guard,'')))/length(t.old_guard)<>1 THEN
   RAISE EXCEPTION 'SEC-02 expected exactly one revision guard: %',t.signature;
  END IF;
  patched:=replace(original,t.old_guard,t.new_guard);
  EXECUTE patched;
  IF pg_get_functiondef(to_regprocedure(t.signature)) IS DISTINCT FROM patched
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid=to_regprocedure(t.signature)) IS DISTINCT FROM acl_before THEN
   RAISE EXCEPTION 'SEC-02 unexpected definition or privilege change: %',t.signature;
  END IF;
 END LOOP;
END;
$fix$;