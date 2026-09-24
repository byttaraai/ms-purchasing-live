-- Build 60 performance hardening for server-authoritative recalculation.
-- Applied live as migration 20260924172132.
-- Business formulas are unchanged: Product Priority 50/30/20, Commercial Exposure 40/60,
-- BO Score 70/15/10/5. The optimization removes repeated full-dataset simulations and
-- reuses the already-loaded dashboard snapshot for cycle/validation work.

CREATE OR REPLACE FUNCTION purchasing_private.workspace_cycles_from_dashboard_v60(client_cycles jsonb, d jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid:=auth.uid();
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
  if d is null or jsonb_typeof(d)<>'object' then raise exception 'Dashboard source required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shortage-state-v58:'||uid::text,0));
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
        'closeReason','stock_recovered_or_no_order_needed','justification',st->'justification'
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
end;
$function$;

CREATE OR REPLACE FUNCTION purchasing_private.workspace_task_impact_v60(rowmap jsonb, cycles jsonb, base_model jsonb, supplier_reorder_counts jsonb, codes jsonb, focus text, as_of_date date)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  code text;
  r jsonb;
  seen jsonb:='{}'::jsonb;
  hits jsonb:='{}'::jsonb;
  supplier text;
  hit_count integer;
  supplier_base_count integer;
  resolved_suppliers integer:=0;
  delta_reorder integer:=0;
  delta_review integer:=0;
  delta_impact numeric:=0;
  delta_exposure numeric:=0;
  ratio numeric;
  minq numeric;
  maxq numeric;
  price numeric;
  avgq numeric;
  shortage_value numeric;
  value_score numeric;
  product_impact numeric;
  age_days integer;
  max_shortage numeric:=coalesce((base_model->'meta'->>'maxShortageValue')::numeric,0);
  reorder_count integer:=coalesce((base_model->'counts'->>'reorderProducts')::integer,0);
  review_count integer:=coalesce((base_model->'counts'->>'review')::integer,0);
  eligible_count integer:=coalesce((base_model->'counts'->>'eligible')::integer,0);
  total_products integer:=greatest(1,coalesce((base_model->'meta'->>'totalProducts')::integer,1));
  supplier_count integer:=coalesce((base_model->'counts'->>'suppliers')::integer,0);
  reorder_supplier_count integer:=coalesce((base_model->'counts'->>'reorderSuppliers')::integer,0);
  impact_total numeric:=coalesce((base_model->>'averageShortageImpact')::numeric,0)*reorder_count;
  exposure numeric:=reorder_count*(1-coalesce((base_model->'components'->>'aging')::numeric,100)/100);
  new_reorder integer;
  new_review integer;
  commercial_score numeric:=coalesce((base_model->'components'->>'commercial')::numeric,100);
  aging_score numeric:=coalesce((base_model->'components'->>'aging')::numeric,100);
  supplier_score numeric:=coalesce((base_model->'components'->>'suppliers')::numeric,100);
  data_score numeric:=coalesce((base_model->'components'->>'data')::numeric,100);
  after_score numeric;
  base_score numeric:=coalesce((base_model->>'score')::numeric,0);
  eligible boolean;
  base_need boolean;
begin
  if codes is null or jsonb_typeof(codes)<>'array' then return 0; end if;

  for code in select jsonb_array_elements_text(codes)
  loop
    if seen ? code then continue; end if;
    seen:=jsonb_set(seen,array[code],'true'::jsonb,true);
    r:=rowmap->code;
    if r is null then continue; end if;
    eligible:=coalesce(cycles->code->'justification'->>'status','')<>'accepted';
    if not eligible then continue; end if;

    if focus='data' then
      if coalesce((r->>'needs_review')::boolean,false) then delta_review:=delta_review+1; end if;
      continue;
    end if;

    base_need:=not coalesce((r->>'blocking_review')::boolean,false)
      and jsonb_typeof(r->'min_order_qty')='number'
      and (r->>'min_order_qty')::numeric>0;
    if not base_need then continue; end if;

    delta_reorder:=delta_reorder+1;
    age_days:=purchasing_private.cycle_age_v58(cycles,code,as_of_date);
    delta_exposure:=delta_exposure+case when age_days<10 then 0 when age_days<20 then .25 when age_days<30 then .6 else 1 end;

    supplier:=nullif(btrim(coalesce(r->>'supplier','')),'');
    if supplier is not null then
      hit_count:=coalesce((hits->>supplier)::integer,0)+1;
      hits:=jsonb_set(hits,array[supplier],to_jsonb(hit_count),true);
    end if;

    if jsonb_typeof(r->'stock_ratio')='number' then
      ratio:=(r->>'stock_ratio')::numeric;
      minq:=(r->>'min_order_qty')::numeric;
      maxq:=case when jsonb_typeof(r->'max_order_qty')='number' then (r->>'max_order_qty')::numeric else null end;
      price:=case when jsonb_typeof(r->'purchase_price')='number' then (r->>'purchase_price')::numeric else null end;
      shortage_value:=0;
      if maxq is not null and price is not null then
        avgq:=(minq+maxq)/2;
        if avgq>0 and price>0 then shortage_value:=avgq*price; end if;
      end if;
      value_score:=case when max_shortage>0 then least(100::numeric,shortage_value/max_shortage*100) else 0 end;
      product_impact:=purchasing_private.clamp_score_v58(
        purchasing_private.profit_priority_v58(r->>'profitability_class')*.50
        +purchasing_private.clamp_score_v58(100-ratio)*.30
        +value_score*.20
      );
      delta_impact:=delta_impact+product_impact;
    end if;
  end loop;

  if focus='data' then
    new_review:=greatest(0,review_count-delta_review);
    data_score:=case when eligible_count>0
      then purchasing_private.clamp_score_v58(100::numeric*(1-new_review::numeric/eligible_count))
      else 100 end;
  else
    new_reorder:=greatest(0,reorder_count-delta_reorder);

    for supplier, r in select key,value from jsonb_each(hits)
    loop
      supplier_base_count:=coalesce((supplier_reorder_counts->>supplier)::integer,0);
      if supplier_base_count>0 and (r#>>'{}')::integer>=supplier_base_count then
        resolved_suppliers:=resolved_suppliers+1;
      end if;
    end loop;

    commercial_score:=purchasing_private.clamp_score_v58(
      100 - (
        100::numeric*new_reorder/total_products*.40
        + (case when new_reorder>0 then greatest(0,impact_total-delta_impact)/new_reorder else 0 end)*.60
      )
    );
    aging_score:=case when new_reorder>0
      then purchasing_private.clamp_score_v58(100::numeric*(1-greatest(0,exposure-delta_exposure)/new_reorder))
      else 100 end;
    supplier_score:=case when supplier_count>0
      then purchasing_private.clamp_score_v58(
        100::numeric*(1-greatest(0,reorder_supplier_count-resolved_suppliers)::numeric/supplier_count)
      )
      else 100 end;
  end if;

  after_score:=purchasing_private.clamp_score_v58(
    commercial_score*.70+aging_score*.15+supplier_score*.10+data_score*.05
  );
  return greatest(0::numeric,least(100::numeric,after_score-base_score));
end;
$function$;

CREATE OR REPLACE FUNCTION purchasing_private.workspace_validate_payload_v60(payload jsonb, d jsonb, cycles jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
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
  if auth.uid() is null or public.purchasing_current_role_v5() is null then raise exception 'Purchasing access required'; end if;
  if payload is null or jsonb_typeof(payload)<>'object' then raise exception 'Invalid workspace payload'; end if;
  if payload->>'logic_version' is distinct from 'reactive_v1'
     or payload->>'score_model' is distinct from 'commercial_v3' then raise exception 'Refresh required: unsupported workspace version'; end if;

  if coalesce(payload->>'score','') !~ '^[0-9]+$'
     or coalesce(payload->>'bo_level','') !~ '^[0-9]+$' then raise exception 'Score and level must be whole numbers'; end if;
  score:=(payload->>'score')::numeric; lvl:=(payload->>'bo_level')::integer;
  if score<0 or score>100 or lvl<>(case when score<40 then 0 else least(12,floor((score-40)/5)::integer+1) end)
    then raise exception 'Invalid score or level'; end if;

  if payload->'tasks' is null or jsonb_typeof(payload->'tasks')<>'array'
     or jsonb_array_length(payload->'tasks')>50 then raise exception 'Invalid task collection'; end if;

  select coalesce(jsonb_object_agg(x->>'product_code',x),'{}'::jsonb)
  into rowmap from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x;

  if (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='suppliers')>10 then
    raise exception 'At most 10 supplier tasks';
  end if;
  if (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='profit_recovery')>1
     or (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='shortage_mid')>1
     or (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='shortage_low')>1
     or (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='aging30')>1
     or (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='data')>1 then
    raise exception 'Duplicate task focus';
  end if;

  n:=0;
  for item in select value from jsonb_array_elements(payload->'tasks')
  loop
    n:=n+1; f:=item->>'focus';

    if coalesce(item->>'priority','') !~ '^[0-9]+$' or (item->>'priority')::integer<>n then raise exception 'Task priorities must be sequential'; end if;
    if coalesce(item->>'score_impact','') !~ '^[0-9]+([.][0-9]+)?$'
       or (item->>'score_impact')::numeric<0 or (item->>'score_impact')::numeric>100 then raise exception 'Invalid task score impact'; end if;
    if item->'codes' is null or jsonb_typeof(item->'codes')<>'array'
       or jsonb_array_length(item->'codes')=0
       or coalesce(item->>'target_count','') !~ '^[0-9]+$'
       or (item->>'target_count')::integer<>jsonb_array_length(item->'codes') then raise exception 'Invalid task targets'; end if;

    expected_key:=case f
      when 'suppliers' then 'supplier|'||coalesce(item->>'target','')
      when 'profit_recovery' then 'recovery|profit'
      when 'shortage_mid' then 'recovery|10-50'
      when 'shortage_low' then 'review|under10'
      when 'aging30' then 'review|30day-decision'
      when 'data' then 'master|review' else null end;
    expected_badge_type:=case f
      when 'suppliers' then 'supplier_closer'
      when 'profit_recovery' then 'profit_recovery'
      when 'shortage_mid' then 'stock_recovery'
      when 'shortage_low' then 'crisis_resolution'
      when 'aging30' then 'aging_breaker'
      when 'data' then 'data_quality' else null end;
    expected_badge_label:=case f
      when 'suppliers' then 'Supplier Closer'
      when 'profit_recovery' then 'Profit Protector'
      when 'shortage_mid' then 'Recovery Specialist'
      when 'shortage_low' then 'Crisis Reviewer'
      when 'aging30' then 'Cycle Breaker'
      when 'data' then 'Data Cleaner' else null end;

    if expected_key is null
       or item->>'task_key' is distinct from expected_key
       or item->>'badge_type' is distinct from expected_badge_type
       or item->>'badge_label' is distinct from expected_badge_label then raise exception 'Invalid task identity'; end if;

    for code in select jsonb_array_elements_text(item->'codes')
    loop
      rowdata:=rowmap->code;
      if rowdata is null then raise exception 'Product missing from current source'; end if;
      if coalesce(cycles->code->'justification'->>'status','')='accepted' then raise exception 'Accepted external shortage cannot be an active employee task'; end if;
      if f<>'data' and coalesce((rowdata->>'blocking_review')::boolean,true) then raise exception 'Blocking review cannot be an operational task'; end if;

      if f='suppliers' then
        if nullif(item->>'target','') is null
           or rowdata->>'supplier' is distinct from item->>'target'
           or not coalesce((rowdata->>'min_order_qty')::numeric>0,false) then
          raise exception 'SOURCE_REVISION_CHANGED: supplier ownership';
        end if;
      elsif f='profit_recovery' then
        if not coalesce((rowdata->>'stock_ratio')::numeric>=10
                        and (rowdata->>'stock_ratio')::numeric<80
                        and (rowdata->>'min_order_qty')::numeric>0,false)
           or lower(btrim(coalesce(rowdata->>'profitability_class',''))) not in ('super','high','سوبر','مرتفع') then raise exception 'Invalid profit recovery target'; end if;
      elsif f='shortage_mid' then
        if not coalesce((rowdata->>'stock_ratio')::numeric>=10
                        and (rowdata->>'stock_ratio')::numeric<50
                        and (rowdata->>'min_order_qty')::numeric>0,false) then raise exception 'Invalid recovery range'; end if;
      elsif f='shortage_low' then
        if not coalesce((rowdata->>'stock_ratio')::numeric<10
                        and (rowdata->>'min_order_qty')::numeric>0,false) then raise exception 'Invalid critical review range'; end if;
      elsif f='aging30' then
        if not coalesce((rowdata->>'min_order_qty')::numeric>0,false)
           or purchasing_private.cycle_age_v58(cycles,code,(now() at time zone 'Asia/Riyadh')::date)<30 then raise exception 'Invalid aging target'; end if;
      elsif f='data' then
        if not coalesce((rowdata->>'needs_review')::boolean,false) then raise exception 'Review issue no longer exists'; end if;
      end if;
    end loop;
  end loop;
end;
$function$;

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
  d:=public.purchasing_dashboard_v5();
  cycles:=purchasing_private.workspace_cycles_from_dashboard_v60(client_cycles,d);
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
end;
$function$;

CREATE OR REPLACE FUNCTION public.purchasing_workspace_sync_v58(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  d jsonb;
  rows jsonb;
  cycles jsonb;
  base_model jsonb;
  rowmap jsonb;
  supplier_reorder_counts jsonb;
  tasks_in jsonb;
  tasks_out jsonb:='[]'::jsonb;
  item jsonb;
  codes jsonb;
  f text;
  asof date:=(now() at time zone 'Asia/Riyadh')::date;
  score integer;
  level integer;
  impact numeric;
  p jsonb;
  result jsonb;
begin
  if auth.uid() is null or public.purchasing_current_role_v5() is null then raise exception 'Purchasing access required'; end if;

  d:=public.purchasing_dashboard_v5();
  rows:=coalesce(d->'rows','[]'::jsonb);
  cycles:=purchasing_private.workspace_cycles_from_dashboard_v60(null,d);
  base_model:=purchasing_private.workspace_model_v58(rows,cycles,'[]'::jsonb,'[]'::jsonb,null,true,asof);
  score:=round((base_model->>'score')::numeric);
  level:=case when score<40 then 0 else least(12,floor((score-40)/5)::integer+1) end;

  select coalesce(jsonb_object_agg(x->>'product_code',x),'{}'::jsonb)
  into rowmap from jsonb_array_elements(rows) x;

  select coalesce(jsonb_object_agg(supplier,cnt),'{}'::jsonb)
  into supplier_reorder_counts
  from (
    select nullif(btrim(x->>'supplier'),'') supplier,count(*)::integer cnt
    from jsonb_array_elements(rows) x
    where coalesce(cycles->(x->>'product_code')->'justification'->>'status','')<>'accepted'
      and not coalesce((x->>'blocking_review')::boolean,false)
      and jsonb_typeof(x->'min_order_qty')='number'
      and (x->>'min_order_qty')::numeric>0
      and nullif(btrim(x->>'supplier'),'') is not null
    group by nullif(btrim(x->>'supplier'),'')
  ) q;

  tasks_in:=payload->'tasks';
  if tasks_in is null or jsonb_typeof(tasks_in)<>'array' then raise exception 'Invalid task collection'; end if;
  for item in select value from jsonb_array_elements(tasks_in)
  loop
    f:=item->>'focus'; codes:=item->'codes';
    if codes is null or jsonb_typeof(codes)<>'array' then raise exception 'Invalid task targets'; end if;
    impact:=purchasing_private.workspace_task_impact_v60(rowmap,cycles,base_model,supplier_reorder_counts,codes,f,asof);
    item:=jsonb_set(item,'{score_impact}',to_jsonb(round(impact,6)),true);
    item:=jsonb_set(item,'{target_count}',to_jsonb(jsonb_array_length(codes)),true);
    tasks_out:=tasks_out||jsonb_build_array(item);
  end loop;

  p:=payload||jsonb_build_object(
    'score',score,'bo_level',level,'evaluated_on',asof,'tasks',tasks_out,
    'logic_version','reactive_v1','score_model','commercial_v3'
  );
  perform purchasing_private.workspace_validate_payload_v60(p,d,cycles);
  result:=purchasing_private.workspace_sync_v47(p);
  return result||jsonb_build_object(
    'cycles',cycles,
    'authority',jsonb_build_object(
      'score',score,'bo_level',level,'components',base_model->'components',
      'model',base_model,'evaluated_on',asof,'authority_version','server_v58'
    )
  );
end;
$function$;

revoke all on function purchasing_private.workspace_cycles_from_dashboard_v60(jsonb,jsonb) from public,anon,authenticated;
revoke all on function purchasing_private.workspace_task_impact_v60(jsonb,jsonb,jsonb,jsonb,jsonb,text,date) from public,anon,authenticated;
revoke all on function purchasing_private.workspace_validate_payload_v60(jsonb,jsonb,jsonb) from public,anon,authenticated;

comment on function public.purchasing_workspace_sync_v58(jsonb) is
  'Build 60 optimized server-authoritative workspace sync. Same commercial_v3/reactive_v1 formulas; avoids repeated full workspace simulations.';
