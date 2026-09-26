create table if not exists purchasing_private.supplier_quests_v79 (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.purchasing_tasks_v5(id) on delete cascade,
  upload_id uuid not null references public.inventory_uploads_v5(id),
  supplier text not null,
  current_stage text not null default 'data',
  status text not null default 'in_progress' check (status in ('in_progress','submitted')),
  stage_data jsonb not null default '{}'::jsonb,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,task_id)
);
alter table purchasing_private.supplier_quests_v79 enable row level security;
revoke all on purchasing_private.supplier_quests_v79 from public, anon, authenticated;

create table if not exists purchasing_private.supplier_quest_outputs_v79 (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id bigint not null references purchasing_private.supplier_quests_v79(id) on delete cascade,
  task_id uuid not null references public.purchasing_tasks_v5(id) on delete cascade,
  upload_id uuid not null references public.inventory_uploads_v5(id),
  supplier text not null,
  output_type text not null check (output_type in ('supplier_bo','branch_reallocation','sales_promotion','wholesale','supplier_followup')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(quest_id,output_type)
);
alter table purchasing_private.supplier_quest_outputs_v79 enable row level security;
revoke all on purchasing_private.supplier_quest_outputs_v79 from public, anon, authenticated;

create index if not exists idx_supplier_quests_v79_task on purchasing_private.supplier_quests_v79(task_id);
create index if not exists idx_supplier_quest_outputs_v79_user_type on purchasing_private.supplier_quest_outputs_v79(user_id,output_type,created_at desc);

create or replace function public.purchasing_supplier_quest_v79(payload jsonb)
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
  q purchasing_private.supplier_quests_v79%rowtype;
  d jsonb;
  current_upload uuid;
  rowmap jsonb;
  initial_codes jsonb := '[]'::jsonb;
  fixed_codes jsonb := '[]'::jsonb;
  stage text;
  codes jsonb;
  decisions jsonb;
  code text;
  r jsonb;
  ratio numeric;
  eligible_count integer := 0;
  next_stage text;
  allowed_decisions text[] := array['sales_promotion','wholesale_sale','supplier_return_replacement','supplier_discount_support','supplier_responsibility','no_action_required'];
  stage_keys text[] := array['data','lt10','10_50','50_100','100_150','150_200','200_300','gt300'];
  k text;
  batches jsonb := '[]'::jsonb;
  items jsonb;
  promo jsonb := '[]'::jsonb;
  wholesale jsonb := '[]'::jsonb;
  followup jsonb := '[]'::jsonb;
  realloc jsonb := '[]'::jsonb;
  dec_key text;
begin
  if uid is null or public.purchasing_current_role_v5() is null then raise exception 'Purchasing access required'; end if;
  begin tid := nullif(payload->>'task_id','')::uuid; exception when others then raise exception 'Invalid supplier task id'; end;
  if tid is null then raise exception 'Supplier task id required'; end if;

  select x.* into t from public.purchasing_tasks_v5 x
  where x.id=tid and x.user_id=uid and x.focus='suppliers' and x.status='open' and x.is_current limit 1;
  if t.id is null then raise exception 'Supplier task is not open/current'; end if;

  d:=public.purchasing_dashboard_v5();
  current_upload:=nullif(d->'upload'->>'id','')::uuid;
  if current_upload is null then raise exception 'Current inventory upload required'; end if;
  if exists(select 1 from public.purchasing_task_cycles_v5 c where c.id=t.cycle_id and c.user_id=uid and c.upload_id is distinct from current_upload) then
    raise exception 'Supplier task belongs to an older inventory cycle';
  end if;
  select coalesce(jsonb_object_agg(x->>'product_code',x),'{}'::jsonb) into rowmap from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x;
  select coalesce(jsonb_agg(x->>'product_code'),'[]'::jsonb) into initial_codes
  from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x
  where coalesce(x->>'supplier','')=coalesce(t.target,'') and coalesce((x->>'needs_review')::boolean,false);

  insert into purchasing_private.supplier_quests_v79(user_id,task_id,upload_id,supplier,stage_data)
  values(uid,tid,current_upload,coalesce(t.target,t.title),jsonb_build_object('_initial_data_codes',initial_codes))
  on conflict(user_id,task_id) do nothing;
  select * into q from purchasing_private.supplier_quests_v79 where user_id=uid and task_id=tid;
  if q.upload_id is distinct from current_upload then raise exception 'Supplier Quest belongs to an older inventory cycle'; end if;
  if not (q.stage_data ? '_initial_data_codes') then
    update purchasing_private.supplier_quests_v79 set stage_data=jsonb_set(stage_data,'{_initial_data_codes}',initial_codes,true),updated_at=now() where id=q.id returning * into q;
  end if;

  if act='state' then
    return jsonb_build_object('quest',jsonb_build_object('id',q.id,'task_id',q.task_id,'upload_id',q.upload_id,'supplier',q.supplier,'current_stage',q.current_stage,'status',q.status,'stage_data',q.stage_data,'finished_at',q.finished_at));
  elsif act='save_stage' then
    if q.status='submitted' then raise exception 'Supplier review is already submitted'; end if;
    stage:=coalesce(payload->>'stage','');
    if stage<>q.current_stage then raise exception 'Complete the current Supplier Quest stage first'; end if;
    if not (stage=any(stage_keys)) then raise exception 'Invalid Supplier Quest stage'; end if;

    if stage='data' then
      select coalesce(jsonb_agg(v),'[]'::jsonb) into fixed_codes
      from jsonb_array_elements_text(coalesce(q.stage_data->'_initial_data_codes','[]'::jsonb)) v
      where rowmap ? v and coalesce(rowmap->v->>'supplier','')=coalesce(t.target,'') and not coalesce((rowmap->v->>'needs_review')::boolean,false);
      if jsonb_array_length(coalesce(q.stage_data->'_initial_data_codes','[]'::jsonb))>0 and jsonb_array_length(fixed_codes)<1 then
        raise exception 'Fix at least one listed product before continuing';
      end if;
      q.stage_data:=jsonb_set(q.stage_data,array[stage],jsonb_build_object('fixed_codes',fixed_codes,'saved_at',now()),true);
    elsif stage in ('lt10','10_50','50_100','100_150','150_200','200_300') then
      codes:=coalesce(payload->'codes','[]'::jsonb);
      if jsonb_typeof(codes)<>'array' then raise exception 'Selected products must be an array'; end if;
      if (select count(*)<>count(distinct value) from jsonb_array_elements_text(codes)) then raise exception 'Duplicate supplier products'; end if;
      eligible_count:=0;
      for r in select value from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) loop
        if coalesce(r->>'supplier','')<>coalesce(t.target,'') then continue; end if;
        begin ratio:=(r->>'stock_ratio')::numeric; exception when others then ratio:=null; end;
        if ratio is null then continue; end if;
        if (stage='lt10' and ratio<10) or (stage='10_50' and ratio>=10 and ratio<50) or (stage='50_100' and ratio>=50 and ratio<100) or (stage='100_150' and ratio>=100 and ratio<150) or (stage='150_200' and ratio>=150 and ratio<=200) or (stage='200_300' and ratio>200 and ratio<=300) then eligible_count:=eligible_count+1; end if;
      end loop;
      if stage<>'200_300' and eligible_count>0 and jsonb_array_length(codes)<1 then raise exception 'Select at least one product before continuing'; end if;
      for code in select jsonb_array_elements_text(codes) loop
        if not (rowmap ? code) then raise exception 'Supplier product is not in the current inventory'; end if;
        r:=rowmap->code;
        if coalesce(r->>'supplier','')<>coalesce(t.target,'') then raise exception 'Supplier product no longer belongs to this supplier'; end if;
        begin ratio:=(r->>'stock_ratio')::numeric; exception when others then ratio:=null; end;
        if ratio is null or not ((stage='lt10' and ratio<10) or (stage='10_50' and ratio>=10 and ratio<50) or (stage='50_100' and ratio>=50 and ratio<100) or (stage='100_150' and ratio>=100 and ratio<150) or (stage='150_200' and ratio>=150 and ratio<=200) or (stage='200_300' and ratio>200 and ratio<=300)) then raise exception 'Selected product is outside the current stock stage'; end if;
      end loop;
      q.stage_data:=jsonb_set(q.stage_data,array[stage],jsonb_build_object('codes',codes,'saved_at',now()),true);
    elsif stage='gt300' then
      decisions:=coalesce(payload->'decisions','{}'::jsonb);
      if jsonb_typeof(decisions)<>'object' then raise exception 'Decisions must be an object'; end if;
      eligible_count:=0;
      for r in select value from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) loop
        if coalesce(r->>'supplier','')<>coalesce(t.target,'') then continue; end if;
        begin ratio:=(r->>'stock_ratio')::numeric; exception when others then ratio:=null; end;
        if ratio is null or ratio<=300 then continue; end if;
        eligible_count:=eligible_count+1;code:=r->>'product_code';dec_key:=decisions->>code;
        if dec_key is null or not (dec_key=any(allowed_decisions)) then raise exception 'Choose a decision for every product above 300%%'; end if;
      end loop;
      for code in select jsonb_object_keys(decisions) loop
        if not (rowmap ? code) or coalesce(rowmap->code->>'supplier','')<>coalesce(t.target,'') then raise exception 'Decision product no longer belongs to this supplier'; end if;
        begin ratio:=(rowmap->code->>'stock_ratio')::numeric; exception when others then ratio:=null; end;
        if ratio is null or ratio<=300 then raise exception 'Decision product is outside the above-300 stage'; end if;
        if not ((decisions->>code)=any(allowed_decisions)) then raise exception 'Invalid supplier decision'; end if;
      end loop;
      q.stage_data:=jsonb_set(q.stage_data,array[stage],jsonb_build_object('decisions',decisions,'saved_at',now()),true);
    end if;

    next_stage:=case stage when 'data' then 'lt10' when 'lt10' then '10_50' when '10_50' then '50_100' when '50_100' then '100_150' when '100_150' then '150_200' when '150_200' then '200_300' when '200_300' then 'gt300' when 'gt300' then 'summary' else 'summary' end;
    update purchasing_private.supplier_quests_v79 set stage_data=q.stage_data,current_stage=next_stage,updated_at=now() where id=q.id returning * into q;
    return jsonb_build_object('quest',jsonb_build_object('id',q.id,'task_id',q.task_id,'upload_id',q.upload_id,'supplier',q.supplier,'current_stage',q.current_stage,'status',q.status,'stage_data',q.stage_data,'finished_at',q.finished_at));
  elsif act='finish' then
    if q.current_stage<>'summary' then raise exception 'Complete all Supplier Quest stages before finishing'; end if;
    foreach k in array stage_keys loop if not (q.stage_data ? k) then raise exception 'Supplier Quest stage is incomplete: %',k; end if; end loop;

    batches:='[]'::jsonb;
    for k in select unnest(array['lt10','10_50','50_100','100_150','150_200']) loop
      select coalesce(jsonb_agg(jsonb_build_object('product_code',x->>'product_code','product_name',x->>'product_name','unit',x->>'purchase_unit','min_order',x->'min_order_qty','max_order',x->'max_order_qty') order by ord),'[]'::jsonb) into items
      from jsonb_array_elements_text(coalesce(q.stage_data->k->'codes','[]'::jsonb)) with ordinality c(code,ord)
      join jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x on x->>'product_code'=c.code;
      batches:=batches||jsonb_build_array(jsonb_build_object('batch',jsonb_array_length(batches)+1,'stage',k,'items',items));
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object('product_code',x->>'product_code','product_name',x->>'product_name','unit',x->>'purchase_unit','stock_pct',x->'stock_ratio','rating',x->>'profitability_class','stock_value',x->'total_value') order by ord),'[]'::jsonb) into realloc
    from jsonb_array_elements_text(coalesce(q.stage_data->'200_300'->'codes','[]'::jsonb)) with ordinality c(code,ord)
    join jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x on x->>'product_code'=c.code;

    decisions:=coalesce(q.stage_data->'gt300'->'decisions','{}'::jsonb);
    for code,dec_key in select key,value from jsonb_each_text(decisions) loop
      if not (rowmap ? code) then continue; end if;r:=rowmap->code;
      items:=jsonb_build_object('product_code',code,'product_name',r->>'product_name','unit',r->>'purchase_unit','stock_pct',r->'stock_ratio','rating',r->>'profitability_class','decision',dec_key);
      if dec_key='sales_promotion' then promo:=promo||jsonb_build_array(items);
      elsif dec_key='wholesale_sale' then wholesale:=wholesale||jsonb_build_array(items);
      elsif dec_key in ('supplier_return_replacement','supplier_discount_support','supplier_responsibility') then followup:=followup||jsonb_build_array(items); end if;
    end loop;

    insert into purchasing_private.supplier_quest_outputs_v79(user_id,quest_id,task_id,upload_id,supplier,output_type,payload) values
      (uid,q.id,tid,current_upload,q.supplier,'supplier_bo',jsonb_build_object('batches',batches,'note','Recommended staged ordering')),
      (uid,q.id,tid,current_upload,q.supplier,'branch_reallocation',jsonb_build_object('items',realloc)),
      (uid,q.id,tid,current_upload,q.supplier,'sales_promotion',jsonb_build_object('items',promo)),
      (uid,q.id,tid,current_upload,q.supplier,'wholesale',jsonb_build_object('items',wholesale)),
      (uid,q.id,tid,current_upload,q.supplier,'supplier_followup',jsonb_build_object('items',followup))
    on conflict(quest_id,output_type) do update set payload=excluded.payload,updated_at=now();

    update purchasing_private.supplier_quests_v79 set status='submitted',finished_at=coalesce(finished_at,now()),updated_at=now() where id=q.id returning * into q;
    return jsonb_build_object('quest',jsonb_build_object('id',q.id,'task_id',q.task_id,'upload_id',q.upload_id,'supplier',q.supplier,'current_stage',q.current_stage,'status',q.status,'stage_data',q.stage_data,'finished_at',q.finished_at));
  else raise exception 'Invalid Supplier Quest action'; end if;
end;
$function$;
revoke execute on function public.purchasing_supplier_quest_v79(jsonb) from public, anon;
grant execute on function public.purchasing_supplier_quest_v79(jsonb) to authenticated;
comment on function public.purchasing_supplier_quest_v79(jsonb) is 'Build 79 Supplier Quest progress/output endpoint. It never completes purchasing_tasks_v5 and never awards badges; stock verification remains authoritative.';
