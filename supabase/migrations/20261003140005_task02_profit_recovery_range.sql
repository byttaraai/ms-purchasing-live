-- TASK02: approved eligibility extension for the existing 80-150 recovery task only.
-- No Min/Max, score, completion, ranking, cap, ownership, or history changes.
DO $task02$
DECLARE
  fn regprocedure:=to_regprocedure('purchasing_private.workspace_validate_payload_v60(jsonb,jsonb,jsonb)');
  original text; updated text; prior_acl aclitem[]; prior_owner oid;
  old_guard constant text:=$old$elsif f='profit_recovery_80_150' then
        if not coalesce((rowdata->>'stock_ratio')::numeric>=80
                        and (rowdata->>'stock_ratio')::numeric<150
                        and (rowdata->>'min_order_qty')::numeric>0,false)$old$;
  new_guard constant text:=$new$elsif f='profit_recovery_80_150' then
        if not coalesce((rowdata->>'stock_ratio')::numeric>=80
                        and (rowdata->>'stock_ratio')::numeric<150
                        and ((rowdata->>'min_order_qty')::numeric>0
                             or ((rowdata->>'stock_ratio')::numeric>=120
                                 and (rowdata->>'min_order_qty')::numeric=0)),false)$new$;
BEGIN
  IF fn IS NULL THEN RAISE EXCEPTION 'TASK02: validator missing'; END IF;
  original:=pg_get_functiondef(fn);
  IF md5(original)<>'c887efef714a3578d53e8db967019440' THEN RAISE EXCEPTION 'TASK02: source drift; review before applying'; END IF;
  IF (length(original)-length(replace(original,old_guard,'')))/length(old_guard)<>1 THEN RAISE EXCEPTION 'TASK02: expected one upper-band guard'; END IF;
  SELECT proacl,proowner INTO prior_acl,prior_owner FROM pg_proc WHERE oid=fn;
  updated:=replace(original,old_guard,new_guard);
  EXECUTE updated;
  IF pg_get_functiondef(fn) IS DISTINCT FROM updated THEN RAISE EXCEPTION 'TASK02: unexpected validator edit'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=fn AND (proacl IS DISTINCT FROM prior_acl OR proowner IS DISTINCT FROM prior_owner OR prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=""'])) THEN RAISE EXCEPTION 'TASK02: security contract changed'; END IF;
END;
$task02$;
