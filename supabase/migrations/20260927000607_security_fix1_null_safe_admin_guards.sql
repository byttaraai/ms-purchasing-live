-- Security fix 1. Approved scope: fail closed for missing/inactive admin roles.
-- Only the authorization predicate changes in these two existing routines.
-- No data writes, grants, RPC signatures, purchase calculations or task logic.
DO $fix$
DECLARE
  target record;
  fn oid;
  original text;
  updated text;
  old_guard constant text := 'public.purchasing_current_role_v5() <> ''admin''';
  new_guard constant text := 'public.purchasing_current_role_v5() IS DISTINCT FROM ''admin''';
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('public.purchasing_save_master_v5(jsonb,text,integer,uuid)', '2adca91fbbdf8d97981606097fb38e42'),
    ('public.purchasing_save_inventory_v5_fixed(jsonb,text,date,text,boolean,boolean,integer,uuid,text)', '92bc11d0fb1ca35de7a380c1e35a8834')
  ) AS targets(signature, expected_md5)
  LOOP
    fn := to_regprocedure(target.signature);
    IF fn IS NULL THEN RAISE EXCEPTION 'Required routine missing: %', target.signature; END IF;
    original := pg_get_functiondef(fn);
    IF md5(original) <> target.expected_md5 THEN
      RAISE EXCEPTION 'Source changed; review before applying security fix 1: %', target.signature;
    END IF;
    IF (length(original)-length(replace(original,old_guard,'')))/length(old_guard) <> 1 THEN
      RAISE EXCEPTION 'Expected exactly one admin guard: %', target.signature;
    END IF;
    updated := replace(original,old_guard,new_guard);
    EXECUTE updated;
    IF pg_get_functiondef(fn) IS DISTINCT FROM updated THEN
      RAISE EXCEPTION 'Unexpected definition change: %', target.signature;
    END IF;
  END LOOP;
END;
$fix$;
