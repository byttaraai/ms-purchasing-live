-- Build 58 server-authoritative BO score/score-impact foundation.
-- Applied live as migration 20260924161035. Approved formulas remain 50/30/20, 40/60, and 70/15/10/5.

create table if not exists purchasing_private.shortage_cycles_v58(
  user_id uuid not null, product_code text not null, cycle_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(), primary key(user_id,product_code)
);
alter table purchasing_private.shortage_cycles_v58 enable row level security;
revoke all on purchasing_private.shortage_cycles_v58 from public,anon,authenticated;

create table if not exists purchasing_private.shortage_state_meta_v58(
  user_id uuid primary key, initialized_at timestamptz not null default now(),
  source text not null default 'client_bootstrap_v3', updated_at timestamptz not null default now()
);
alter table purchasing_private.shortage_state_meta_v58 enable row level security;
revoke all on purchasing_private.shortage_state_meta_v58 from public,anon,authenticated;

CREATE OR REPLACE FUNCTION purchasing_private.safe_date_v58(v text, fallback_date date)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if v is null or btrim(v)='' then return fallback_date; end if;
  begin return v::date; exception when others then return fallback_date; end;
end $function$;

CREATE OR REPLACE FUNCTION purchasing_private.trim_history_v58(h jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when h is null or jsonb_typeof(h)<>'array' then '[]'::jsonb
    else coalesce((
      select jsonb_agg(e.value order by e.ord)
      from jsonb_array_elements(h) with ordinality e(value,ord)
      where e.ord > greatest(0,jsonb_array_length(h)-20)
    ),'[]'::jsonb)
  end
$function$;

CREATE OR REPLACE FUNCTION purchasing_private.normalize_cycle_v58(raw jsonb, default_start date, as_of_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  x jsonb:=case when jsonb_typeof(raw)='object' then raw else '{}'::jsonb end;
  j jsonb;
  reason text;
  status text;
  active boolean;
  start_date date;
  last_seen date;
  resolved_date date;
begin
  active:=case when jsonb_typeof(x->'active')='boolean' then (x->>'active')::boolean else true end;
  start_date:=purchasing_private.safe_date_v58(x->>'startDate',default_start);
  last_seen:=purchasing_private.safe_date_v58(x->>'lastSeen',as_of_date);
  resolved_date:=case when nullif(x->>'resolvedDate','') is null then null else purchasing_private.safe_date_v58(x->>'resolvedDate',null) end;
  j:=case when jsonb_typeof(x->'justification')='object' then x->'justification' else null end;
  if j is not null then
    reason:=j->>'reason';
    status:=case
      when reason='other' then 'pending'
      when reason in ('supplier_unavailable','alternative_covered','demand_dropped') then 'accepted'
      else 'pending' end;
    j:=j||jsonb_build_object('status',status);
  end if;
  return x||jsonb_build_object(
    'cycleId',coalesce(nullif(x->>'cycleId',''),gen_random_uuid()::text),
    'startDate',start_date::text,
    'lastSeen',last_seen::text,
    'active',active,
    'resolvedDate',case when resolved_date is null then null else to_jsonb(resolved_date::text) end,
    'justification',j,
    'lastJustification',case when jsonb_typeof(x->'lastJustification')='object' then x->'lastJustification' else null end,
    'history',purchasing_private.trim_history_v58(x->'history')
  );
end $function$;

CREATE OR REPLACE FUNCTION purchasing_private.cycle_age_v58(cycles jsonb, code text, as_of_date date)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare c jsonb; d date;
begin
  c:=cycles->code;
  if c is null or not coalesce((c->>'active')::boolean,false) then return 0; end if;
  d:=purchasing_private.safe_date_v58(c->>'startDate',as_of_date);
  return greatest(0,as_of_date-d);
end $function$;

CREATE OR REPLACE FUNCTION purchasing_private.profit_priority_v58(v text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case lower(btrim(coalesce(v,'')))
    when 'super' then 100 when 'سوبر' then 100
    when 'high' then 80 when 'مرتفع' then 80
    when 'medium' then 50 when 'متوسط' then 50
    when 'low' then 20 when 'منخفض' then 20
    when 'loss' then 0 when 'خاسر' then 0
    else 0 end::numeric
$function$;

CREATE OR REPLACE FUNCTION purchasing_private.clamp_score_v58(v numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select greatest(0::numeric,least(100::numeric,coalesce(v,0)))
$function$;

CREATE OR REPLACE FUNCTION purchasing_private.workspace_model_v58(rows jsonb, cycles jsonb, resolved_codes jsonb DEFAULT '[]'::jsonb, resolved_data_codes jsonb DEFAULT '[]'::jsonb, value_scale numeric DEFAULT NULL::numeric, exclude_accepted boolean DEFAULT true, as_of_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  r jsonb;
  code text;
  supplier text;
  eligible boolean;
  accepted boolean;
  comparable boolean;
  base_need boolean;
  is_resolved boolean;
  is_data_resolved boolean;
  needs_review boolean;
  ratio numeric;
  minq numeric;
  maxq numeric;
  price numeric;
  avgq numeric;
  shortage_value numeric;
  max_shortage numeric:=0;
  eligible_count integer:=0;
  comparable_count integer:=0;
  reorder_count integer:=0;
  review_count integer:=0;
  under10_count integer:=0;
  ten50_count integer:=0;
  suppliers text[]:='{}'::text[];
  reorder_suppliers text[]:='{}'::text[];
  shortage_impact_total numeric:=0;
  exposure numeric:=0;
  profit numeric;
  severity numeric;
  value_score numeric;
  product_impact numeric;
  age_days integer;
  total_products integer;
  commercial_exposure numeric;
  commercial_score numeric;
  supplier_score numeric;
  product_score numeric;
  data_score numeric;
  under10_score numeric;
  ten50_score numeric;
  aging_score numeric;
  score numeric;
begin
  if rows is null or jsonb_typeof(rows)<>'array' then rows:='[]'::jsonb; end if;
  if cycles is null or jsonb_typeof(cycles)<>'object' then cycles:='{}'::jsonb; end if;
  if resolved_codes is null or jsonb_typeof(resolved_codes)<>'array' then resolved_codes:='[]'::jsonb; end if;
  if resolved_data_codes is null or jsonb_typeof(resolved_data_codes)<>'array' then resolved_data_codes:='[]'::jsonb; end if;

  for r in select value from jsonb_array_elements(rows)
  loop
    code:=r->>'product_code';
    accepted:=coalesce(cycles->code->'justification'->>'status','')='accepted';
    eligible:=not exclude_accepted or not accepted;
    if not eligible then continue; end if;
    eligible_count:=eligible_count+1;

    comparable:=jsonb_typeof(r->'stock_ratio')='number';
    if comparable then
      ratio:=(r->>'stock_ratio')::numeric;
      comparable_count:=comparable_count+1;
    else ratio:=null; end if;

    supplier:=nullif(btrim(coalesce(r->>'supplier','')),'');
    if supplier is not null and array_position(suppliers,supplier) is null then suppliers:=array_append(suppliers,supplier); end if;

    base_need:=not coalesce((r->>'blocking_review')::boolean,false)
      and jsonb_typeof(r->'min_order_qty')='number'
      and (r->>'min_order_qty')::numeric>0;
    is_resolved:=resolved_codes ? code;
    is_data_resolved:=resolved_data_codes ? code;

    if base_need then
      minq:=(r->>'min_order_qty')::numeric;
      maxq:=case when jsonb_typeof(r->'max_order_qty')='number' then (r->>'max_order_qty')::numeric else null end;
      price:=case when jsonb_typeof(r->'purchase_price')='number' then (r->>'purchase_price')::numeric else null end;
      shortage_value:=0;
      if maxq is not null and price is not null then
        avgq:=(minq+maxq)/2;
        if avgq>0 and price>0 then shortage_value:=avgq*price; end if;
      end if;
      max_shortage:=greatest(max_shortage,shortage_value);
      if not is_resolved then
        reorder_count:=reorder_count+1;
        if supplier is not null and array_position(reorder_suppliers,supplier) is null then reorder_suppliers:=array_append(reorder_suppliers,supplier); end if;
      end if;
    end if;

    needs_review:=coalesce((r->>'needs_review')::boolean,false);
    if needs_review and not is_data_resolved then review_count:=review_count+1; end if;
    if comparable and not is_resolved then
      if ratio<10 then under10_count:=under10_count+1; end if;
      if ratio>=10 and ratio<50 then ten50_count:=ten50_count+1; end if;
    end if;
  end loop;

  if value_scale is not null then max_shortage:=value_scale; end if;

  for r in select value from jsonb_array_elements(rows)
  loop
    code:=r->>'product_code';
    accepted:=coalesce(cycles->code->'justification'->>'status','')='accepted';
    eligible:=not exclude_accepted or not accepted;
    if not eligible then continue; end if;
    base_need:=not coalesce((r->>'blocking_review')::boolean,false)
      and jsonb_typeof(r->'min_order_qty')='number'
      and (r->>'min_order_qty')::numeric>0;
    if not base_need or (resolved_codes ? code) then continue; end if;

    age_days:=purchasing_private.cycle_age_v58(cycles,code,as_of_date);
    exposure:=exposure+case when age_days<10 then 0 when age_days<20 then .25 when age_days<30 then .6 else 1 end;

    if jsonb_typeof(r->'stock_ratio')<>'number' then continue; end if;
    ratio:=(r->>'stock_ratio')::numeric;
    profit:=purchasing_private.profit_priority_v58(r->>'profitability_class');
    severity:=purchasing_private.clamp_score_v58(100-ratio);
    minq:=(r->>'min_order_qty')::numeric;
    maxq:=case when jsonb_typeof(r->'max_order_qty')='number' then (r->>'max_order_qty')::numeric else null end;
    price:=case when jsonb_typeof(r->'purchase_price')='number' then (r->>'purchase_price')::numeric else null end;
    shortage_value:=0;
    if maxq is not null and price is not null then
      avgq:=(minq+maxq)/2;
      if avgq>0 and price>0 then shortage_value:=avgq*price; end if;
    end if;
    value_score:=case when max_shortage>0 then least(100::numeric,shortage_value/max_shortage*100) else 0 end;
    product_impact:=purchasing_private.clamp_score_v58(profit*.50+severity*.30+value_score*.20);
    shortage_impact_total:=shortage_impact_total+product_impact;
  end loop;

  total_products:=greatest(1,comparable_count);
  commercial_exposure:=100::numeric*reorder_count/total_products*.40
    + (case when reorder_count>0 then shortage_impact_total/reorder_count else 0 end)*.60;
  commercial_score:=purchasing_private.clamp_score_v58(100-commercial_exposure);
  supplier_score:=case when cardinality(suppliers)>0
    then 100::numeric*(1-cardinality(reorder_suppliers)::numeric/cardinality(suppliers))
    else 100 end;
  product_score:=100::numeric*(1-reorder_count::numeric/total_products);
  data_score:=case when eligible_count>0 then 100::numeric*(1-review_count::numeric/eligible_count) else 100 end;
  under10_score:=100::numeric*(1-under10_count::numeric/total_products);
  ten50_score:=100::numeric*(1-ten50_count::numeric/total_products);
  aging_score:=case when reorder_count>0 then 100::numeric*(1-exposure/reorder_count) else 100 end;
  aging_score:=purchasing_private.clamp_score_v58(aging_score);
  supplier_score:=purchasing_private.clamp_score_v58(supplier_score);
  data_score:=purchasing_private.clamp_score_v58(data_score);
  score:=purchasing_private.clamp_score_v58(commercial_score*.70+aging_score*.15+supplier_score*.10+data_score*.05);

  return jsonb_build_object(
    'score',score,
    'components',jsonb_build_object(
      'commercial',commercial_score,'shortage',commercial_score,'aging',aging_score,
      'suppliers',supplier_score,'data',data_score,'products',purchasing_private.clamp_score_v58(product_score),
      'under10',purchasing_private.clamp_score_v58(under10_score),'tenTo50',purchasing_private.clamp_score_v58(ten50_score)
    ),
    'counts',jsonb_build_object(
      'eligible',eligible_count,'comparable',comparable_count,'reorderProducts',reorder_count,
      'review',review_count,'under10',under10_count,'tenTo50',ten50_count,
      'suppliers',cardinality(suppliers),'reorderSuppliers',cardinality(reorder_suppliers)
    ),
    'meta',jsonb_build_object('totalProducts',total_products,'maxShortageValue',max_shortage),
    'commercialExposure',commercial_exposure,
    'averageShortageImpact',case when reorder_count>0 then shortage_impact_total/reorder_count else 0 end
  );
end $function$;

CREATE OR REPLACE FUNCTION purchasing_private.workspace_cycles_v58(client_cycles jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid:=auth.uid();
  d jsonb;
  rows jsonb;
  u jsonb;
  rowmap jsonb;
  r jsonb;
  code text;
  raw jsonb;
  st jsonb;
  hist jsonb;
  archived jsonb;
  short boolean;
  blocking boolean;
  active boolean;
  today date:=(now() at time zone 'Asia/Riyadh')::date;
  fallback date;
begin
  if uid is null or public.purchasing_current_role_v5() is null then raise exception 'Purchasing access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shortage-state-v58:'||uid::text,0));
  d:=public.purchasing_dashboard_v5();
  rows:=coalesce(d->'rows','[]'::jsonb);
  u:=coalesce(d->'upload','{}'::jsonb);
  fallback:=purchasing_private.safe_date_v58(
    coalesce(nullif(u->>'snapshot_date',''),nullif(left(coalesce(u->>'uploaded_at',''),10),'')),
    today
  );

  if not exists(select 1 from purchasing_private.shortage_state_meta_v58 where user_id=uid) then
    if client_cycles is not null then
      if jsonb_typeof(client_cycles)<>'object'
         or pg_column_size(client_cycles)>5242880
         or (select count(*) from jsonb_object_keys(client_cycles))>5000 then
        raise exception 'Invalid shortage-cycle bootstrap';
      end if;
      for code,raw in select key,value from jsonb_each(client_cycles)
      loop
        if length(code)>240 or jsonb_typeof(raw)<>'object' then continue; end if;
        st:=purchasing_private.normalize_cycle_v58(raw,fallback,today);
        insert into purchasing_private.shortage_cycles_v58(user_id,product_code,cycle_state)
        values(uid,code,st)
        on conflict(user_id,product_code) do nothing;
      end loop;
    end if;
    insert into purchasing_private.shortage_state_meta_v58(user_id,source)
    values(uid,case when client_cycles is null then 'server_initial' else 'client_bootstrap_v3' end)
    on conflict(user_id) do nothing;
  end if;

  select coalesce(jsonb_object_agg(x->>'product_code',x),'{}'::jsonb)
  into rowmap from jsonb_array_elements(rows) x;

  for r in select value from jsonb_array_elements(rows)
  loop
    code:=r->>'product_code';
    if code is null then continue; end if;
    select cycle_state into st from purchasing_private.shortage_cycles_v58
      where user_id=uid and product_code=code for update;
    blocking:=coalesce((r->>'blocking_review')::boolean,false);
    short:=not blocking and jsonb_typeof(r->'min_order_qty')='number' and (r->>'min_order_qty')::numeric>0;
    active:=coalesce((st->>'active')::boolean,false);

    if short then
      if st is null or not active then
        st:=jsonb_build_object(
          'cycleId',gen_random_uuid()::text,'startDate',fallback::text,'lastSeen',today::text,
          'active',true,'resolvedDate',null,'justification',null,
          'lastJustification',case when jsonb_typeof(st->'lastJustification')='object' then st->'lastJustification' else null end,
          'history',purchasing_private.trim_history_v58(st->'history')
        );
      else
        st:=purchasing_private.normalize_cycle_v58(st,fallback,today)||jsonb_build_object('lastSeen',today::text);
      end if;
      insert into purchasing_private.shortage_cycles_v58(user_id,product_code,cycle_state,updated_at)
      values(uid,code,st,now())
      on conflict(user_id,product_code) do update set cycle_state=excluded.cycle_state,updated_at=now();
    elsif st is not null and active and not blocking then
      st:=purchasing_private.normalize_cycle_v58(st,fallback,today);
      archived:=jsonb_build_object(
        'cycleId',st->>'cycleId','startDate',st->>'startDate','endDate',today::text,
        'closeReason','stock_recovered_or_no_order_needed',
        'justification',st->'justification'
      );
      hist:=purchasing_private.trim_history_v58(coalesce(st->'history','[]'::jsonb)||jsonb_build_array(archived));
      st:=st||jsonb_build_object(
        'history',hist,
        'lastJustification',case when jsonb_typeof(st->'justification')='object' then st->'justification' else st->'lastJustification' end,
        'justification',null,'active',false,'resolvedDate',today::text,'lastSeen',today::text
      );
      update purchasing_private.shortage_cycles_v58 set cycle_state=st,updated_at=now()
      where user_id=uid and product_code=code;
    end if;
  end loop;

  update purchasing_private.shortage_cycles_v58 s
  set cycle_state=s.cycle_state||jsonb_build_object('lastSeen',today::text),updated_at=now()
  where s.user_id=uid
    and coalesce((s.cycle_state->>'active')::boolean,false)
    and not (rowmap ? s.product_code)
    and s.cycle_state->>'lastSeen' is distinct from today::text;

  return coalesce((
    select jsonb_object_agg(product_code,cycle_state order by product_code)
    from purchasing_private.shortage_cycles_v58 where user_id=uid
  ),'{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION purchasing_private.workspace_authority_v58(client_cycles jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d jsonb;
  cycles jsonb;
  model jsonb;
  actual jsonb;
  asof date:=(now() at time zone 'Asia/Riyadh')::date;
  score integer;
  level integer;
begin
  if auth.uid() is null or public.purchasing_current_role_v5() is null then raise exception 'Purchasing access required'; end if;
  cycles:=purchasing_private.workspace_cycles_v58(client_cycles);
  d:=public.purchasing_dashboard_v5();
  model:=purchasing_private.workspace_model_v58(d->'rows',cycles,'[]'::jsonb,'[]'::jsonb,null,true,asof);
  actual:=purchasing_private.workspace_model_v58(d->'rows',cycles,'[]'::jsonb,'[]'::jsonb,(model->'meta'->>'maxShortageValue')::numeric,false,asof);
  score:=round((model->>'score')::numeric);
  level:=case when score<40 then 0 else least(12,floor((score-40)/5)::integer+1) end;
  return jsonb_build_object(
    'cycles',cycles,'score',score,'bo_level',level,'components',model->'components',
    'actual_stock_health',actual->'components'->'commercial',
    'model',model,'evaluated_on',asof,'authority_version','server_v58',
    'source',jsonb_build_object('master_revision',d->'master_revision','upload_id',d->'upload'->'id')
  );
end $function$;

CREATE OR REPLACE FUNCTION public.purchasing_workspace_state_v58(client_cycles jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or public.purchasing_current_role_v5() is null then raise exception 'Purchasing access required'; end if;
  return purchasing_private.workspace_authority_v58(client_cycles);
end $function$;

CREATE OR REPLACE FUNCTION public.purchasing_shortage_decision_v58(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid:=auth.uid();
  action text:=payload->>'action';
  code text:=payload->>'product_code';
  expected_cycle text:=payload->>'cycle_id';
  reason text:=payload->>'reason';
  comment_text text:=left(coalesce(payload->>'comment',''),1500);
  alt text:=nullif(left(btrim(coalesce(payload->>'alternative_product','')),240),'');
  st jsonb;
  j jsonb;
  hist jsonb;
  archived jsonb;
  today date:=(now() at time zone 'Asia/Riyadh')::date;
  review_days integer;
  status text;
  cycles jsonb;
begin
  if uid is null or public.purchasing_current_role_v5() is null then raise exception 'Purchasing access required'; end if;
  if code is null or length(code)>240 then raise exception 'Invalid product'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shortage-state-v58:'||uid::text,0));
  perform purchasing_private.workspace_cycles_v58(null);
  select cycle_state into st from purchasing_private.shortage_cycles_v58
    where user_id=uid and product_code=code for update;
  if st is null or not coalesce((st->>'active')::boolean,false) then raise exception 'Active shortage cycle required'; end if;
  if expected_cycle is not null and st->>'cycleId' is distinct from expected_cycle then raise exception 'SOURCE_REVISION_CHANGED: shortage cycle'; end if;

  if action='justify' then
    if reason not in ('supplier_unavailable','alternative_covered','demand_dropped','other') then raise exception 'Invalid justification reason'; end if;
    if reason='other' and btrim(comment_text)='' then raise exception 'Comment required'; end if;
    if reason='alternative_covered' and alt is null then raise exception 'Alternative product required'; end if;
    status:=case when reason='other' then 'pending' else 'accepted' end;
    review_days:=case reason when 'supplier_unavailable' then 7 when 'alternative_covered' then 14 when 'demand_dropped' then 30 else null end;
    j:=jsonb_build_object(
      'reason',reason,'status',status,'comment',comment_text,'alternativeProduct',alt,
      'at',to_jsonb(now()),'nextReviewDate',case when review_days is null then null else to_jsonb((today+review_days)::text) end,
      'reorderPointChanged',coalesce((payload->>'reorder_point_changed')::boolean,false)
    );
    st:=st||jsonb_build_object('justification',j,'lastSeen',today::text);
  elsif action='reopen' then
    archived:=jsonb_build_object(
      'cycleId',st->>'cycleId','startDate',st->>'startDate','endDate',today::text,
      'closeReason','reopened_by_user','justification',st->'justification'
    );
    hist:=purchasing_private.trim_history_v58(coalesce(st->'history','[]'::jsonb)||jsonb_build_array(archived));
    st:=jsonb_build_object(
      'cycleId',gen_random_uuid()::text,'startDate',today::text,'lastSeen',today::text,
      'active',true,'resolvedDate',null,'justification',null,
      'lastJustification',case when jsonb_typeof(st->'justification')='object' then st->'justification' else st->'lastJustification' end,
      'history',hist
    );
  else
    raise exception 'Invalid shortage decision action';
  end if;

  update purchasing_private.shortage_cycles_v58 set cycle_state=st,updated_at=now()
  where user_id=uid and product_code=code;
  cycles:=purchasing_private.workspace_cycles_v58(null);
  return jsonb_build_object('cycle',cycles->code,'cycles',cycles,'authority_version','server_v58');
end $function$;

CREATE OR REPLACE FUNCTION public.purchasing_workspace_sync_v58(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d jsonb;
  cycles jsonb;
  base_model jsonb;
  after_model jsonb;
  tasks_in jsonb;
  tasks_out jsonb:='[]'::jsonb;
  item jsonb;
  codes jsonb;
  f text;
  code text;
  asof date:=(now() at time zone 'Asia/Riyadh')::date;
  score integer;
  level integer;
  impact numeric;
  p jsonb;
  result jsonb;
begin
  if auth.uid() is null or public.purchasing_current_role_v5() is null then raise exception 'Purchasing access required'; end if;
  cycles:=purchasing_private.workspace_cycles_v58(null);
  d:=public.purchasing_dashboard_v5();
  base_model:=purchasing_private.workspace_model_v58(d->'rows',cycles,'[]'::jsonb,'[]'::jsonb,null,true,asof);
  score:=round((base_model->>'score')::numeric);
  level:=case when score<40 then 0 else least(12,floor((score-40)/5)::integer+1) end;

  tasks_in:=payload->'tasks';
  if tasks_in is null or jsonb_typeof(tasks_in)<>'array' then raise exception 'Invalid task collection'; end if;
  for item in select value from jsonb_array_elements(tasks_in)
  loop
    f:=item->>'focus';
    codes:=item->'codes';
    if codes is null or jsonb_typeof(codes)<>'array' then raise exception 'Invalid task targets'; end if;
    for code in select jsonb_array_elements_text(codes)
    loop
      if coalesce(cycles->code->'justification'->>'status','')='accepted' then
        raise exception 'Accepted external shortage cannot be an active employee task';
      end if;
      if f='aging30' and purchasing_private.cycle_age_v58(cycles,code,asof)<30 then
        raise exception 'Invalid aging target';
      end if;
    end loop;
    if f='data' then
      after_model:=purchasing_private.workspace_model_v58(
        d->'rows',cycles,'[]'::jsonb,codes,(base_model->'meta'->>'maxShortageValue')::numeric,true,asof
      );
    else
      after_model:=purchasing_private.workspace_model_v58(
        d->'rows',cycles,codes,'[]'::jsonb,(base_model->'meta'->>'maxShortageValue')::numeric,true,asof
      );
    end if;
    impact:=greatest(0::numeric,least(100::numeric,(after_model->>'score')::numeric-(base_model->>'score')::numeric));
    item:=jsonb_set(item,'{score_impact}',to_jsonb(round(impact,6)),true);
    item:=jsonb_set(item,'{target_count}',to_jsonb(jsonb_array_length(codes)),true);
    tasks_out:=tasks_out||jsonb_build_array(item);
  end loop;

  p:=payload||jsonb_build_object(
    'score',score,'bo_level',level,'evaluated_on',asof,'tasks',tasks_out,
    'logic_version','reactive_v1','score_model','commercial_v3'
  );
  perform purchasing_private.workspace_validate_payload_v57(p);
  result:=purchasing_private.workspace_sync_v47(p);
  return result||jsonb_build_object(
    'cycles',cycles,
    'authority',jsonb_build_object(
      'score',score,'bo_level',level,'components',base_model->'components',
      'model',base_model,'evaluated_on',asof,'authority_version','server_v58'
    )
  );
end $function$;

revoke execute on function public.purchasing_workspace_state_v58(jsonb) from public,anon;
grant execute on function public.purchasing_workspace_state_v58(jsonb) to authenticated;
revoke execute on function public.purchasing_shortage_decision_v58(jsonb) from public,anon;
grant execute on function public.purchasing_shortage_decision_v58(jsonb) to authenticated;
revoke execute on function public.purchasing_workspace_sync_v58(jsonb) from public,anon;
grant execute on function public.purchasing_workspace_sync_v58(jsonb) to authenticated;

revoke all on function purchasing_private.safe_date_v58(text,date) from public,anon,authenticated;
revoke all on function purchasing_private.trim_history_v58(jsonb) from public,anon,authenticated;
revoke all on function purchasing_private.normalize_cycle_v58(jsonb,date,date) from public,anon,authenticated;
revoke all on function purchasing_private.cycle_age_v58(jsonb,text,date) from public,anon,authenticated;
revoke all on function purchasing_private.profit_priority_v58(text) from public,anon,authenticated;
revoke all on function purchasing_private.clamp_score_v58(numeric) from public,anon,authenticated;
revoke all on function purchasing_private.workspace_model_v58(jsonb,jsonb,jsonb,jsonb,numeric,boolean,date) from public,anon,authenticated;
revoke all on function purchasing_private.workspace_cycles_v58(jsonb) from public,anon,authenticated;
revoke all on function purchasing_private.workspace_authority_v58(jsonb) from public,anon,authenticated;
