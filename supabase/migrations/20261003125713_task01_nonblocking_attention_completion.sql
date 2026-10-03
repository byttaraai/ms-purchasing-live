-- TASK01: approved price/rating-only exception to stock-outcome verification.
-- No table writes, public API, permission changes or historical re-evaluation.
DO $task01$
DECLARE
  fn regprocedure := to_regprocedure('purchasing_private.recovered_v47(jsonb,jsonb,jsonb)');
  original text;
  updated text;
  prior_acl aclitem[];
  prior_owner oid;
  old_guard constant text := $old$coalesce((r->>'needs_review')::boolean,true)$old$;
  new_guard constant text := $new$coalesce((r->>'blocking_review')::boolean,true)
   or (coalesce((r->>'needs_review')::boolean,true) and (
     r->>'needs_review' is distinct from 'true'
     or coalesce(r->>'review_reason','') not in (
       'Master purchase price is missing or zero',
       'Profitability classification is missing',
       'Master purchase price is missing or zero | Profitability classification is missing',
       'Profitability classification is missing | Master purchase price is missing or zero'
     )
   ))$new$;
BEGIN
  IF fn IS NULL THEN RAISE EXCEPTION 'TASK01: verification function missing'; END IF;
  original := pg_get_functiondef(fn);
  IF md5(original) <> '8ecdc2f27ccdfbb7d94540785b7d6272' THEN
    RAISE EXCEPTION 'TASK01: source drift; review before applying';
  END IF;
  IF (length(original)-length(replace(original,old_guard,'')))/length(old_guard) <> 1 THEN
    RAISE EXCEPTION 'TASK01: expected one review guard';
  END IF;
  SELECT proacl,proowner INTO prior_acl,prior_owner FROM pg_proc WHERE oid=fn;
  updated := replace(original,old_guard,new_guard);
  EXECUTE updated;
  IF pg_get_functiondef(fn) IS DISTINCT FROM updated THEN
    RAISE EXCEPTION 'TASK01: unexpected function definition';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=fn AND
      (proacl IS DISTINCT FROM prior_acl OR proowner IS DISTINCT FROM prior_owner OR
       prosecdef OR provolatile <> 'i' OR proconfig IS DISTINCT FROM ARRAY['search_path=""'])) THEN
    RAISE EXCEPTION 'TASK01: function security contract changed';
  END IF;
END;
$task01$;
