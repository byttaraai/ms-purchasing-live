create table if not exists purchasing_private.supplier_task_actions_v78 (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.purchasing_tasks_v5(id) on delete cascade,
  upload_id uuid not null references public.inventory_uploads_v5(id),
  selected_codes jsonb not null default '[]'::jsonb,
  supplier text not null,
  recorded_at timestamptz not null default now(),
  constraint supplier_task_actions_v78_codes_array check (jsonb_typeof(selected_codes) = 'array')
);

alter table purchasing_private.supplier_task_actions_v78 enable row level security;
revoke all on purchasing_private.supplier_task_actions_v78 from public, anon, authenticated;

create index if not exists idx_supplier_task_actions_v78_task_recorded
  on purchasing_private.supplier_task_actions_v78(task_id, recorded_at desc);

create or replace function public.purchasing_supplier_action_v78(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  act text := coalesce(payload->>'action','state');
  tid uuid;
  t public.purchasing_tasks_v5%rowtype;
  cycle_upload uuid;
  d jsonb;
  rowmap jsonb;
  codes jsonb;
  code text;
  latest purchasing_private.supplier_task_actions_v78%rowtype;
begin
  if uid is null or public.purchasing_current_role_v5() is null then
    raise exception 'Purchasing access required';
  end if;

  begin
    tid := nullif(payload->>'task_id','')::uuid;
  exception when others then
    raise exception 'Invalid supplier task id';
  end;
  if tid is null then raise exception 'Supplier task id required'; end if;

  select x.* into t
  from public.purchasing_tasks_v5 x
  where x.id=tid and x.user_id=uid and x.focus='suppliers'
    and x.status='open' and x.is_current
  limit 1;
  if t.id is null then raise exception 'Supplier task is not open/current'; end if;

  if act='state' then
    select a.* into latest
    from purchasing_private.supplier_task_actions_v78 a
    where a.user_id=uid and a.task_id=tid
    order by a.recorded_at desc, a.id desc
    limit 1;
    if latest.id is null then
      return jsonb_build_object('recorded',false,'task_id',tid);
    end if;
    return jsonb_build_object(
      'recorded',true,'task_id',tid,'recorded_at',latest.recorded_at,
      'codes',latest.selected_codes,'supplier',latest.supplier
    );
  elsif act<>'record' then
    raise exception 'Invalid supplier action';
  end if;

  codes:=payload->'codes';
  if codes is null or jsonb_typeof(codes)<>'array' or jsonb_array_length(codes)<1 or jsonb_array_length(codes)>500 then
    raise exception 'Select at least one supplier product';
  end if;
  if (select count(*)<>count(distinct value) from jsonb_array_elements_text(codes)) then
    raise exception 'Duplicate supplier products';
  end if;

  select c.upload_id into cycle_upload
  from public.purchasing_task_cycles_v5 c
  where c.id=t.cycle_id and c.user_id=uid;

  d:=public.purchasing_dashboard_v5();
  if cycle_upload is distinct from nullif(d->'upload'->>'id','')::uuid then
    raise exception 'Supplier task belongs to an older inventory cycle';
  end if;

  select coalesce(jsonb_object_agg(x->>'product_code',x),'{}'::jsonb)
  into rowmap from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x;

  for code in select jsonb_array_elements_text(codes)
  loop
    if not (rowmap ? code) then raise exception 'Supplier product is not in the current inventory'; end if;
    if coalesce(rowmap->code->>'supplier','') is distinct from coalesce(t.target,'') then
      raise exception 'Supplier product no longer belongs to this supplier';
    end if;
  end loop;

  insert into purchasing_private.supplier_task_actions_v78(user_id,task_id,upload_id,selected_codes,supplier)
  values(uid,tid,cycle_upload,codes,coalesce(t.target,t.title))
  returning * into latest;

  return jsonb_build_object(
    'recorded',true,'task_id',tid,'recorded_at',latest.recorded_at,
    'codes',latest.selected_codes,'supplier',latest.supplier
  );
end;
$function$;

revoke execute on function public.purchasing_supplier_action_v78(jsonb) from public, anon;
grant execute on function public.purchasing_supplier_action_v78(jsonb) to authenticated;

comment on function public.purchasing_supplier_action_v78(jsonb) is
  'Build 78 supplier action audit endpoint. Recording an action does not complete a task; later inventory verification remains authoritative.';
