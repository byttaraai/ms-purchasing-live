-- Build 97: only the restricted Master Review save boundary gains freshness checks.
-- No task/cycle/completion, source data, unit, numeric or general Admin-save edits.
DO $migration$
DECLARE
  fn regprocedure := 'public.purchasing_master_review_save_v93(jsonb,integer,uuid)'::regprocedure;
  original text := pg_get_functiondef(fn);
  updated text;
  acl_before aclitem[];
BEGIN
  IF md5(original) <> 'b7d86b254435bef3f2f3d6bd6bd4bc6a' THEN
    RAISE EXCEPTION 'Build 97 source drift: review current RPC before applying';
  END IF;
  SELECT proacl INTO acl_before FROM pg_proc WHERE oid=fn;
  updated := replace(original, E'  raw jsonb;\nbegin', E'  raw jsonb;\n  fresh97_expires timestamptz;\n  fresh97_result jsonb;\nbegin');
  updated := replace(updated, '  select t.codes into task_codes', E'  -- Share the existing Inventory/Master write lock before reading the source.\n  perform 1 from public.purchasing_meta_v5 where singleton=true for update;\n\n  select t.codes into task_codes');
  updated := replace(updated, '  d := public.purchasing_dashboard_v5();', $gate$
  d := public.purchasing_dashboard_v5();
  -- Same full-snapshot, uploaded-at + 48h contract as inventoryFreshnessFor.
  if nullif(d #>> '{upload,id}','') is null
     or coalesce(nullif(d #>> '{upload,status}',''),'completed') <> 'completed'
     or not coalesce((d #>> '{upload,is_complete}')::boolean,false)
     or not coalesce((d #>> '{upload,excludes_zero}')::boolean,false) then
    raise exception 'INVENTORY_REFRESH_REQUIRED: A current full inventory snapshot is required.';
  end if;
  fresh97_expires := coalesce(
    nullif(d #>> '{upload,uploaded_at}','')::timestamptz,
    (nullif(d #>> '{upload,snapshot_date}','')::date + time '12:00') at time zone 'UTC'
  ) + interval '48 hours';
  if fresh97_expires is null or not isfinite(fresh97_expires) or fresh97_expires <= clock_timestamp() then
    raise exception 'INVENTORY_REFRESH_REQUIRED: Refresh inventory after 48 hours before saving.';
  end if;
$gate$);
  updated := replace(updated, '  return public.purchasing_save_master_v5_impl(', '  fresh97_result := public.purchasing_save_master_v5_impl(');
  updated := replace(updated, E'    request_id\n  );\nend;', E'    request_id\n  );\n  -- An expiry while waiting/validating/saving rolls the whole write back.\n  if fresh97_expires <= clock_timestamp() then\n    raise exception ''INVENTORY_REFRESH_REQUIRED: Inventory expired during save; nothing was saved.'';\n  end if;\n  return fresh97_result;\nend;');
  IF updated=original OR position('fresh97_result :=' in updated)=0
     OR position('return fresh97_result;' in updated)=0
     OR position('fresh97_expires := coalesce(' in updated)=0 THEN
    RAISE EXCEPTION 'Build 97 patch anchors were not found';
  END IF;
  EXECUTE updated;
  IF pg_get_functiondef(fn) IS DISTINCT FROM updated
     OR (SELECT proacl FROM pg_proc WHERE oid=fn) IS DISTINCT FROM acl_before THEN
    RAISE EXCEPTION 'Build 97 unexpected definition or permission change';
  END IF;
END
$migration$;
