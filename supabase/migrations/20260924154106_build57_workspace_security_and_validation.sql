-- Build 57 hardening. Applied to project mpxpbbpqnvoinyjmuuvf as migration 20260924154106.
-- Approved purchasing/accounting formulas are unchanged.

revoke execute on function public.purchasing_tasks_sync_v5(jsonb) from public, anon, authenticated;
revoke execute on function public.purchasing_tasks_sync_v5(uuid,numeric,integer,text,text,text,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function public.purchasing_tasks_sync_logic_v5(jsonb) from public, anon, authenticated;
revoke execute on function public.purchasing_tasks_rollover_v5(jsonb) from public, anon, authenticated;

create or replace function purchasing_private.workspace_validate_payload_v57(payload jsonb)
returns void
language plpgsql
set search_path to ''
as $$
declare
  d jsonb;
  rowmap jsonb;
  item jsonb;
  rowdata jsonb;
  code text;
  f text;
  expected_key text;
  expected_badge_type text;
  expected_badge_label text;
  n integer;
  score numeric;
  lvl integer;
begin
  if auth.uid() is null or public.purchasing_current_role_v5() is null then
    raise exception 'Purchasing access required';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Invalid workspace payload';
  end if;
  if payload->>'logic_version' is distinct from 'reactive_v1'
     or payload->>'score_model' is distinct from 'commercial_v3' then
    raise exception 'Refresh required: unsupported workspace version';
  end if;

  if coalesce(payload->>'score','') !~ '^[0-9]+$'
     or coalesce(payload->>'bo_level','') !~ '^[0-9]+$' then
    raise exception 'Score and level must be whole numbers';
  end if;
  score := (payload->>'score')::numeric;
  lvl := (payload->>'bo_level')::integer;
  if score < 0 or score > 100
     or lvl <> (case when score < 40 then 0 else least(12,floor((score-40)/5)::integer+1) end) then
    raise exception 'Invalid score or level';
  end if;

  if payload->'tasks' is null or jsonb_typeof(payload->'tasks') <> 'array'
     or jsonb_array_length(payload->'tasks') > 50 then
    raise exception 'Invalid task collection';
  end if;

  d := public.purchasing_dashboard_v5();
  select coalesce(jsonb_object_agg(x->>'product_code',x),'{}'::jsonb)
    into rowmap
  from jsonb_array_elements(d->'rows') x;

  if (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='suppliers') > 10 then
    raise exception 'At most 10 supplier tasks';
  end if;
  if (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='profit_recovery') > 1
     or (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='shortage_mid') > 1
     or (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='shortage_low') > 1
     or (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='aging30') > 1
     or (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='data') > 1 then
    raise exception 'Duplicate task focus';
  end if;

  n := 0;
  for item in select value from jsonb_array_elements(payload->'tasks')
  loop
    n := n + 1;
    f := item->>'focus';
    if coalesce(item->>'priority','') !~ '^[0-9]+$'
       or (item->>'priority')::integer <> n then
      raise exception 'Task priorities must be sequential';
    end if;
    if coalesce(item->>'score_impact','') !~ '^[0-9]+([.][0-9]+)?$'
       or (item->>'score_impact')::numeric < 0
       or (item->>'score_impact')::numeric > 100 then
      raise exception 'Invalid task score impact';
    end if;
    if item->'codes' is null or jsonb_typeof(item->'codes') <> 'array'
       or jsonb_array_length(item->'codes') = 0
       or coalesce(item->>'target_count','') !~ '^[0-9]+$'
       or (item->>'target_count')::integer <> jsonb_array_length(item->'codes') then
      raise exception 'Invalid task targets';
    end if;

    expected_key := case f
      when 'suppliers' then 'supplier|' || coalesce(item->>'target','')
      when 'profit_recovery' then 'recovery|profit'
      when 'shortage_mid' then 'recovery|10-50'
      when 'shortage_low' then 'review|under10'
      when 'aging30' then 'review|30day-decision'
      when 'data' then 'master|review'
      else null end;
    expected_badge_type := case f
      when 'suppliers' then 'supplier_closer'
      when 'profit_recovery' then 'profit_recovery'
      when 'shortage_mid' then 'stock_recovery'
      when 'shortage_low' then 'crisis_resolution'
      when 'aging30' then 'aging_breaker'
      when 'data' then 'data_quality'
      else null end;
    expected_badge_label := case f
      when 'suppliers' then 'Supplier Closer'
      when 'profit_recovery' then 'Profit Protector'
      when 'shortage_mid' then 'Recovery Specialist'
      when 'shortage_low' then 'Crisis Reviewer'
      when 'aging30' then 'Cycle Breaker'
      when 'data' then 'Data Cleaner'
      else null end;

    if expected_key is null
       or item->>'task_key' is distinct from expected_key
       or item->>'badge_type' is distinct from expected_badge_type
       or item->>'badge_label' is distinct from expected_badge_label then
      raise exception 'Invalid task identity';
    end if;

    for code in select jsonb_array_elements_text(item->'codes')
    loop
      rowdata := rowmap->code;
      if rowdata is null then raise exception 'Product missing from current source'; end if;
      if f <> 'data' and coalesce((rowdata->>'blocking_review')::boolean,true) then
        raise exception 'Blocking review cannot be an operational task';
      end if;
      if f='suppliers' then
        if nullif(item->>'target','') is null
           or rowdata->>'supplier' is distinct from item->>'target'
           or not coalesce((rowdata->>'min_order_qty')::numeric > 0,false) then
          raise exception 'SOURCE_REVISION_CHANGED: supplier ownership';
        end if;
      elsif f='profit_recovery' then
        if not coalesce((rowdata->>'stock_ratio')::numeric >= 10
                        and (rowdata->>'stock_ratio')::numeric < 80
                        and (rowdata->>'min_order_qty')::numeric > 0,false)
           or lower(btrim(coalesce(rowdata->>'profitability_class',''))) not in ('super','high','سوبر','مرتفع') then
          raise exception 'Invalid profit recovery target';
        end if;
      elsif f='shortage_mid' then
        if not coalesce((rowdata->>'stock_ratio')::numeric >= 10
                        and (rowdata->>'stock_ratio')::numeric < 50
                        and (rowdata->>'min_order_qty')::numeric > 0,false) then
          raise exception 'Invalid recovery range';
        end if;
      elsif f='shortage_low' then
        if not coalesce((rowdata->>'stock_ratio')::numeric < 10
                        and (rowdata->>'min_order_qty')::numeric > 0,false) then
          raise exception 'Invalid critical review range';
        end if;
      elsif f='aging30' then
        if not coalesce((rowdata->>'min_order_qty')::numeric > 0,false) then
          raise exception 'Invalid aging target';
        end if;
      elsif f='data' then
        if not coalesce((rowdata->>'needs_review')::boolean,false) then
          raise exception 'Review issue no longer exists';
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function purchasing_private.workspace_validate_payload_v57(jsonb) from public, anon, authenticated;

create or replace function public.purchasing_workspace_sync_v47(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null or public.purchasing_current_role_v5() is null then
    raise exception 'Purchasing access required';
  end if;
  perform purchasing_private.workspace_validate_payload_v57(payload);
  return purchasing_private.workspace_sync_v47(payload);
end;
$$;

create or replace function public.purchasing_workspace_revision_v47()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if auth.uid() is null or public.purchasing_current_role_v5() is null then
    raise exception 'Purchasing access required';
  end if;
  return purchasing_private.workspace_revision_v47();
end;
$$;

revoke execute on function purchasing_private.workspace_sync_v47(jsonb) from public, anon, authenticated;
revoke execute on function purchasing_private.workspace_revision_v47() from public, anon, authenticated;
revoke execute on function public.purchasing_workspace_sync_v47(jsonb) from public, anon;
revoke execute on function public.purchasing_workspace_revision_v47() from public, anon;
grant execute on function public.purchasing_workspace_sync_v47(jsonb) to authenticated;
grant execute on function public.purchasing_workspace_revision_v47() to authenticated;

drop policy if exists admin_uploads_insert_v5 on public.inventory_uploads_v5;
create policy admin_uploads_insert_v5
on public.inventory_uploads_v5 for insert
to authenticated
with check (
  public.purchasing_current_role_v5() = 'admin'
  and uploaded_by = (select auth.uid())
);

drop policy if exists admin_request_log_insert_v5 on public.purchasing_request_log_v5;
create policy admin_request_log_insert_v5
on public.purchasing_request_log_v5 for insert
to authenticated
with check (
  public.purchasing_current_role_v5() = 'admin'
  and created_by = (select auth.uid())
);

create index if not exists idx_purchasing_score_history_v5_upload_id
  on public.purchasing_score_history_v5(upload_id);
create index if not exists idx_purchasing_task_cycles_v5_upload_id
  on public.purchasing_task_cycles_v5(upload_id);
create index if not exists idx_purchasing_tasks_v5_completion_upload_id
  on public.purchasing_tasks_v5(completion_upload_id);

comment on table public.products_master is
  'LEGACY baseline table. Live MS Purchasing uses products_master_v5. Do not use for new features.';
comment on table public.inventory_uploads is
  'LEGACY baseline table. Live MS Purchasing uses inventory_uploads_v5. Do not use for new features.';
comment on table public.inventory_lines is
  'LEGACY baseline table. Live MS Purchasing uses inventory_lines_v5. Do not use for new features.';
