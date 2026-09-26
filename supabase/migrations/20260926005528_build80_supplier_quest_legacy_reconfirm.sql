create or replace function public.purchasing_supplier_quest_v80(payload jsonb)
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
  current_revision integer := 0;
  rowmap jsonb := '{}'::jsonb;
  blocking_codes jsonb := '[]'::jsonb;
  attention_codes jsonb := '[]'::jsonb;
  stage text;
  target_stage text;
  codes jsonb := '[]'::jsonb;
  decisions jsonb := '{}'::jsonb;
  no_action boolean := false;
  code text;
  r jsonb;
  ratio numeric;
  profit text;
  dec_key text;
  eligible_count integer := 0;
  snapshot jsonb := '[]'::jsonb;
  stage_keys text[] := array['data','lt10','10_50','50_100','100_150','150_200','200_300','gt300'];
  allowed_decisions text[] := array['sales_promotion','wholesale_sale','supplier_return_replacement','supplier_discount_support','supplier_responsibility','no_action_required'];
  next_stage text;
  i integer;
  highest_idx integer := 1;
  target_idx integer := 0;
  saved_rev integer;
  stale jsonb := '[]'::jsonb;
  k text;
  batches jsonb := '[]'::jsonb;
  items jsonb := '[]'::jsonb;
  promo jsonb := '[]'::jsonb;
  wholesale jsonb := '[]'::jsonb;
  followup jsonb := '[]'::jsonb;
  realloc jsonb := '[]'::jsonb;
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
  where x.id=tid and x.user_id=uid and x.focus='suppliers' and x.status='open' and x.is_current
  limit 1;
  if t.id is null then raise exception 'Supplier task is not open/current'; end if;

  d := public.purchasing_dashboard_v5();
  current_upload := nullif(d->'upload'->>'id','')::uuid;
  current_revision := coalesce(nullif(d->>'master_revision','')::integer,0);
  if current_upload is null then raise exception 'Current inventory upload required'; end if;

  if exists(
    select 1
    from public.purchasing_task_cycles_v5 c
    where c.id=t.cycle_id and c.user_id=uid and c.upload_id is distinct from current_upload
  ) then
    raise exception 'Supplier task belongs to an older inventory cycle';
  end if;

  select coalesce(jsonb_object_agg(x->>'product_code',x),'{}'::jsonb)
  into rowmap
  from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x;

  select coalesce(jsonb_agg(x->>'product_code' order by x->>'product_name'),'[]'::jsonb)
  into blocking_codes
  from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x
  where coalesce(x->>'supplier','')=coalesce(t.target,'')
    and coalesce((x->>'blocking_review')::boolean,false);

  select coalesce(jsonb_agg(x->>'product_code' order by x->>'product_name'),'[]'::jsonb)
  into attention_codes
  from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x
  where coalesce(x->>'supplier','')=coalesce(t.target,'')
    and coalesce((x->>'needs_review')::boolean,false)
    and not coalesce((x->>'blocking_review')::boolean,false);

  insert into purchasing_private.supplier_quests_v79(user_id,task_id,upload_id,supplier,stage_data)
  values(
    uid,tid,current_upload,coalesce(t.target,t.title),
    jsonb_build_object(
      '_quest_version',80,
      '_initial_data_codes',blocking_codes||attention_codes,
      '_initial_blocking_codes',blocking_codes,
      '_initial_attention_codes',attention_codes
    )
  )
  on conflict(user_id,task_id) do nothing;

  select * into q
  from purchasing_private.supplier_quests_v79
  where user_id=uid and task_id=tid;

  if q.upload_id is distinct from current_upload then
    raise exception 'Supplier Quest belongs to an older inventory cycle';
  end if;

  if not (q.stage_data ? '_initial_blocking_codes') then
    q.stage_data := jsonb_set(q.stage_data,'{_initial_blocking_codes}',blocking_codes,true);
  end if;
  if not (q.stage_data ? '_initial_attention_codes') then
    q.stage_data := jsonb_set(q.stage_data,'{_initial_attention_codes}',attention_codes,true);
  end if;
  q.stage_data := jsonb_set(q.stage_data,'{_quest_version}','80'::jsonb,true);

  update purchasing_private.supplier_quests_v79
  set stage_data=q.stage_data,updated_at=case when stage_data is distinct from q.stage_data then now() else updated_at end
  where id=q.id
  returning * into q;

  stale := '[]'::jsonb;
  foreach k in array stage_keys loop
    if q.stage_data ? k then
      begin saved_rev := nullif(q.stage_data->k->>'master_revision','')::integer;
      exception when others then saved_rev := null;
      end;
      if saved_rev is null or saved_rev<>current_revision then
        stale := stale || jsonb_build_array(k);
      end if;
    end if;
  end loop;

  if act='state' then
    return jsonb_build_object(
      'quest',jsonb_build_object(
        'id',q.id,'task_id',q.task_id,'upload_id',q.upload_id,'supplier',q.supplier,
        'current_stage',q.current_stage,'status',q.status,'stage_data',q.stage_data,'finished_at',q.finished_at
      ),
      'master_revision',current_revision,
      'stale_stages',stale
    );

  elsif act='goto_stage' then
    if q.status='submitted' then raise exception 'Supplier review is already submitted'; end if;
    target_stage := coalesce(payload->>'stage','');
    if not (target_stage=any(stage_keys) or target_stage='summary') then
      raise exception 'Invalid Supplier Quest stage';
    end if;

    highest_idx := 1;
    for i in 1..array_length(stage_keys,1) loop
      if q.stage_data ? stage_keys[i] then highest_idx := i+1; else exit; end if;
    end loop;
    if highest_idx>array_length(stage_keys,1)+1 then highest_idx:=array_length(stage_keys,1)+1; end if;

    if target_stage='summary' then
      target_idx := array_length(stage_keys,1)+1;
    else
      target_idx := array_position(stage_keys,target_stage);
    end if;
    if target_idx is null or target_idx<1 or target_idx>highest_idx then
      raise exception 'Complete the earlier Supplier Quest stages first';
    end if;

    update purchasing_private.supplier_quests_v79
    set current_stage=target_stage,updated_at=now()
    where id=q.id
    returning * into q;

    return jsonb_build_object(
      'quest',jsonb_build_object(
        'id',q.id,'task_id',q.task_id,'upload_id',q.upload_id,'supplier',q.supplier,
        'current_stage',q.current_stage,'status',q.status,'stage_data',q.stage_data,'finished_at',q.finished_at
      ),
      'master_revision',current_revision,
      'stale_stages',stale
    );

  elsif act='save_stage' then
    if q.status='submitted' then raise exception 'Supplier review is already submitted'; end if;
    stage := coalesce(payload->>'stage','');
    if stage<>q.current_stage then raise exception 'Open the stage before saving it'; end if;
    if not (stage=any(stage_keys)) then raise exception 'Invalid Supplier Quest stage'; end if;

    if stage='data' then
      if jsonb_array_length(blocking_codes)>0 then
        raise exception 'Resolve all blocking data issues before continuing';
      end if;

      select coalesce(jsonb_agg(jsonb_build_object(
        'product_code',x->>'product_code',
        'product_name',x->>'product_name',
        'unit',x->>'purchase_unit',
        'blocking_review',coalesce((x->>'blocking_review')::boolean,false),
        'needs_review',coalesce((x->>'needs_review')::boolean,false),
        'review_reason',x->>'review_reason',
        'master_revision',current_revision
      ) order by x->>'product_name'),'[]'::jsonb)
      into snapshot
      from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x
      where coalesce(x->>'supplier','')=coalesce(t.target,'')
        and (
          coalesce((x->>'needs_review')::boolean,false)
          or (q.stage_data->'_initial_blocking_codes') ? (x->>'product_code')
          or (q.stage_data->'_initial_attention_codes') ? (x->>'product_code')
        );

      q.stage_data := jsonb_set(
        q.stage_data,array[stage],
        jsonb_build_object(
          'master_revision',current_revision,
          'blocking_remaining',blocking_codes,
          'attention_remaining',attention_codes,
          'snapshot',snapshot,
          'saved_at',now()
        ),true
      );

    elsif stage in ('lt10','10_50','50_100','100_150','150_200','200_300') then
      codes := coalesce(payload->'codes','[]'::jsonb);
      no_action := coalesce((payload->>'no_action')::boolean,false);
      if jsonb_typeof(codes)<>'array' then raise exception 'Selected products must be an array'; end if;
      if (select count(*)<>count(distinct value) from jsonb_array_elements_text(codes)) then
        raise exception 'Duplicate supplier products';
      end if;
      if jsonb_array_length(codes)>0 and no_action then
        raise exception 'A stage cannot have selected products and No Action at the same time';
      end if;
      if jsonb_array_length(codes)=0 and not no_action then
        raise exception 'Confirm No Action when no products are selected';
      end if;

      eligible_count := 0;
      for r in select value from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) loop
        if coalesce(r->>'supplier','')<>coalesce(t.target,'') then continue; end if;
        begin ratio := (r->>'stock_ratio')::numeric; exception when others then ratio := null; end;
        if ratio is null then continue; end if;
        if (stage='lt10' and ratio<10)
          or (stage='10_50' and ratio>=10 and ratio<50)
          or (stage='50_100' and ratio>=50 and ratio<100)
          or (stage='100_150' and ratio>=100 and ratio<150)
          or (stage='150_200' and ratio>=150 and ratio<=200)
          or (stage='200_300' and ratio>200 and ratio<=300)
        then eligible_count := eligible_count+1;
        end if;
      end loop;

      for code in select jsonb_array_elements_text(codes) loop
        if not (rowmap ? code) then raise exception 'Supplier product is not in the current inventory'; end if;
        r := rowmap->code;
        if coalesce(r->>'supplier','')<>coalesce(t.target,'') then
          raise exception 'Supplier product no longer belongs to this supplier';
        end if;
        begin ratio := (r->>'stock_ratio')::numeric; exception when others then ratio := null; end;
        if ratio is null or not (
          (stage='lt10' and ratio<10)
          or (stage='10_50' and ratio>=10 and ratio<50)
          or (stage='50_100' and ratio>=50 and ratio<100)
          or (stage='100_150' and ratio>=100 and ratio<150)
          or (stage='150_200' and ratio>=150 and ratio<=200)
          or (stage='200_300' and ratio>200 and ratio<=300)
        ) then
          raise exception 'Selected product is outside the current stock stage';
        end if;
      end loop;

      select coalesce(jsonb_agg(jsonb_build_object(
        'product_code',x->>'product_code',
        'product_name',x->>'product_name',
        'unit',x->>'purchase_unit',
        'stock_pct',x->'stock_ratio',
        'rating',x->>'profitability_class',
        'price',x->'purchase_price',
        'min_order',x->'min_order_qty',
        'max_order',x->'max_order_qty',
        'stock_value',x->'total_value',
        'selected',exists(select 1 from jsonb_array_elements_text(codes) c(v) where c.v=x->>'product_code'),
        'master_revision',current_revision
      ) order by x->>'product_name'),'[]'::jsonb)
      into snapshot
      from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x
      where coalesce(x->>'supplier','')=coalesce(t.target,'')
        and (
          (stage='lt10' and jsonb_typeof(x->'stock_ratio')='number' and (x->>'stock_ratio')::numeric<10)
          or (stage='10_50' and jsonb_typeof(x->'stock_ratio')='number' and (x->>'stock_ratio')::numeric>=10 and (x->>'stock_ratio')::numeric<50)
          or (stage='50_100' and jsonb_typeof(x->'stock_ratio')='number' and (x->>'stock_ratio')::numeric>=50 and (x->>'stock_ratio')::numeric<100)
          or (stage='100_150' and jsonb_typeof(x->'stock_ratio')='number' and (x->>'stock_ratio')::numeric>=100 and (x->>'stock_ratio')::numeric<150)
          or (stage='150_200' and jsonb_typeof(x->'stock_ratio')='number' and (x->>'stock_ratio')::numeric>=150 and (x->>'stock_ratio')::numeric<=200)
          or (stage='200_300' and jsonb_typeof(x->'stock_ratio')='number' and (x->>'stock_ratio')::numeric>200 and (x->>'stock_ratio')::numeric<=300)
        );

      q.stage_data := jsonb_set(
        q.stage_data,array[stage],
        jsonb_build_object(
          'codes',codes,
          'no_action',no_action,
          'eligible_count',eligible_count,
          'master_revision',current_revision,
          'snapshot',snapshot,
          'saved_at',now()
        ),true
      );

    elsif stage='gt300' then
      decisions := coalesce(payload->'decisions','{}'::jsonb);
      if jsonb_typeof(decisions)<>'object' then raise exception 'Decisions must be an object'; end if;
      eligible_count := 0;

      for r in select value from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) loop
        if coalesce(r->>'supplier','')<>coalesce(t.target,'') then continue; end if;
        begin ratio := (r->>'stock_ratio')::numeric; exception when others then ratio := null; end;
        if ratio is null or ratio<=300 then continue; end if;
        eligible_count := eligible_count+1;
        code := r->>'product_code';
        dec_key := decisions->>code;
        if dec_key is null or not (dec_key=any(allowed_decisions)) then
          raise exception 'Choose a decision for every product above 300%%';
        end if;

        profit := coalesce(r->>'profitability_class','');
        if profit in ('Super','High') and dec_key not in ('sales_promotion','wholesale_sale','supplier_responsibility','no_action_required') then
          raise exception 'Decision is not available for this profitability class';
        elsif profit in ('Medium','Low') and dec_key not in ('supplier_return_replacement','supplier_responsibility','no_action_required') then
          raise exception 'Decision is not available for this profitability class';
        elsif profit='Loss' and dec_key not in ('supplier_discount_support','wholesale_sale','supplier_responsibility','no_action_required') then
          raise exception 'Decision is not available for this profitability class';
        elsif profit not in ('Super','High','Medium','Low','Loss') and dec_key not in ('supplier_responsibility','no_action_required') then
          raise exception 'Decision is not available for an unclassified product';
        end if;
      end loop;

      for code in select jsonb_object_keys(decisions) loop
        if not (rowmap ? code) or coalesce(rowmap->code->>'supplier','')<>coalesce(t.target,'') then
          raise exception 'Decision product no longer belongs to this supplier';
        end if;
        begin ratio := (rowmap->code->>'stock_ratio')::numeric; exception when others then ratio := null; end;
        if ratio is null or ratio<=300 then raise exception 'Decision product is outside the above-300 stage'; end if;
      end loop;

      select coalesce(jsonb_agg(jsonb_build_object(
        'product_code',x->>'product_code',
        'product_name',x->>'product_name',
        'unit',x->>'purchase_unit',
        'stock_pct',x->'stock_ratio',
        'rating',x->>'profitability_class',
        'price',x->'purchase_price',
        'stock_value',x->'total_value',
        'decision',decisions->>(x->>'product_code'),
        'master_revision',current_revision
      ) order by x->>'product_name'),'[]'::jsonb)
      into snapshot
      from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x
      where coalesce(x->>'supplier','')=coalesce(t.target,'')
        and jsonb_typeof(x->'stock_ratio')='number'
        and (x->>'stock_ratio')::numeric>300;

      q.stage_data := jsonb_set(
        q.stage_data,array[stage],
        jsonb_build_object(
          'decisions',decisions,
          'eligible_count',eligible_count,
          'master_revision',current_revision,
          'snapshot',snapshot,
          'saved_at',now()
        ),true
      );
    end if;

    next_stage := case stage
      when 'data' then 'lt10'
      when 'lt10' then '10_50'
      when '10_50' then '50_100'
      when '50_100' then '100_150'
      when '100_150' then '150_200'
      when '150_200' then '200_300'
      when '200_300' then 'gt300'
      when 'gt300' then 'summary'
      else 'summary'
    end;

    update purchasing_private.supplier_quests_v79
    set stage_data=q.stage_data,current_stage=next_stage,updated_at=now()
    where id=q.id
    returning * into q;

    stale := '[]'::jsonb;
    foreach k in array stage_keys loop
      if q.stage_data ? k then
        begin saved_rev := nullif(q.stage_data->k->>'master_revision','')::integer;
        exception when others then saved_rev := null;
        end;
        if saved_rev is null or saved_rev<>current_revision then
          stale := stale || jsonb_build_array(k);
        end if;
      end if;
    end loop;

    return jsonb_build_object(
      'quest',jsonb_build_object(
        'id',q.id,'task_id',q.task_id,'upload_id',q.upload_id,'supplier',q.supplier,
        'current_stage',q.current_stage,'status',q.status,'stage_data',q.stage_data,'finished_at',q.finished_at
      ),
      'master_revision',current_revision,
      'stale_stages',stale
    );

  elsif act='finish' then
    if q.current_stage<>'summary' then raise exception 'Open the Supplier Review Summary before finishing'; end if;

    foreach k in array stage_keys loop
      if not (q.stage_data ? k) then raise exception 'Supplier Quest stage is incomplete: %',k; end if;
      begin saved_rev := nullif(q.stage_data->k->>'master_revision','')::integer;
      exception when others then saved_rev := null;
      end;
      if saved_rev is null or saved_rev<>current_revision then
        raise exception 'Supplier data changed after a stage was confirmed. Reconfirm changed stages first';
      end if;
    end loop;

    if jsonb_array_length(blocking_codes)>0 then
      raise exception 'Blocking data issues returned. Resolve them before finishing the Supplier Review';
    end if;

    batches := '[]'::jsonb;
    foreach k in array array['lt10','10_50','50_100','100_150','150_200'] loop
      if jsonb_typeof(q.stage_data->k->'snapshot')='array' then
        select coalesce(jsonb_agg(jsonb_build_object(
          'product_code',x->>'product_code',
          'product_name',x->>'product_name',
          'unit',x->>'unit',
          'min_order',x->'min_order',
          'max_order',x->'max_order',
          'stock_pct',x->'stock_pct',
          'rating',x->>'rating',
          'price',x->'price',
          'master_revision',q.stage_data->k->'master_revision'
        ) order by x->>'product_name'),'[]'::jsonb)
        into items
        from jsonb_array_elements(q.stage_data->k->'snapshot') x
        where coalesce((x->>'selected')::boolean,false);
      else
        select coalesce(jsonb_agg(jsonb_build_object(
          'product_code',x->>'product_code',
          'product_name',x->>'product_name',
          'unit',x->>'purchase_unit',
          'min_order',x->'min_order_qty',
          'max_order',x->'max_order_qty',
          'stock_pct',x->'stock_ratio',
          'rating',x->>'profitability_class',
          'price',x->'purchase_price',
          'master_revision',current_revision
        ) order by x->>'product_name'),'[]'::jsonb)
        into items
        from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x
        where exists(
          select 1 from jsonb_array_elements_text(coalesce(q.stage_data->k->'codes','[]'::jsonb)) c(v)
          where c.v=x->>'product_code'
        );
      end if;
      batches := batches || jsonb_build_array(jsonb_build_object(
        'batch',jsonb_array_length(batches)+1,
        'stage',k,
        'items',items,
        'no_action',coalesce((q.stage_data->k->>'no_action')::boolean,false)
      ));
    end loop;

    if jsonb_typeof(q.stage_data->'200_300'->'snapshot')='array' then
      select coalesce(jsonb_agg(x order by x->>'product_name'),'[]'::jsonb)
      into realloc
      from jsonb_array_elements(q.stage_data->'200_300'->'snapshot') x
      where coalesce((x->>'selected')::boolean,false);
    else
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_code',x->>'product_code',
        'product_name',x->>'product_name',
        'unit',x->>'purchase_unit',
        'stock_pct',x->'stock_ratio',
        'rating',x->>'profitability_class',
        'stock_value',x->'total_value'
      ) order by x->>'product_name'),'[]'::jsonb)
      into realloc
      from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x
      where exists(
        select 1 from jsonb_array_elements_text(coalesce(q.stage_data->'200_300'->'codes','[]'::jsonb)) c(v)
        where c.v=x->>'product_code'
      );
    end if;

    promo := '[]'::jsonb;
    wholesale := '[]'::jsonb;
    followup := '[]'::jsonb;
    if jsonb_typeof(q.stage_data->'gt300'->'snapshot')='array' then
      for r in select value from jsonb_array_elements(q.stage_data->'gt300'->'snapshot') loop
        dec_key := r->>'decision';
        if dec_key='sales_promotion' then promo:=promo||jsonb_build_array(r);
        elsif dec_key='wholesale_sale' then wholesale:=wholesale||jsonb_build_array(r);
        elsif dec_key in ('supplier_return_replacement','supplier_discount_support','supplier_responsibility') then
          followup:=followup||jsonb_build_array(r);
        end if;
      end loop;
    else
      decisions := coalesce(q.stage_data->'gt300'->'decisions','{}'::jsonb);
      for code,dec_key in select key,value from jsonb_each_text(decisions) loop
        if not (rowmap ? code) then continue; end if;
        r := jsonb_build_object(
          'product_code',code,
          'product_name',rowmap->code->>'product_name',
          'unit',rowmap->code->>'purchase_unit',
          'stock_pct',rowmap->code->'stock_ratio',
          'rating',rowmap->code->>'profitability_class',
          'decision',dec_key,
          'master_revision',current_revision
        );
        if dec_key='sales_promotion' then promo:=promo||jsonb_build_array(r);
        elsif dec_key='wholesale_sale' then wholesale:=wholesale||jsonb_build_array(r);
        elsif dec_key in ('supplier_return_replacement','supplier_discount_support','supplier_responsibility') then
          followup:=followup||jsonb_build_array(r);
        end if;
      end loop;
    end if;

    insert into purchasing_private.supplier_quest_outputs_v79(user_id,quest_id,task_id,upload_id,supplier,output_type,payload)
    values
      (uid,q.id,tid,current_upload,q.supplier,'supplier_bo',jsonb_build_object('batches',batches,'note','Recommended staged ordering','master_revision',current_revision)),
      (uid,q.id,tid,current_upload,q.supplier,'branch_reallocation',jsonb_build_object('items',realloc,'owner','Warehouse')),
      (uid,q.id,tid,current_upload,q.supplier,'sales_promotion',jsonb_build_object('items',promo,'owner','Sales')),
      (uid,q.id,tid,current_upload,q.supplier,'wholesale',jsonb_build_object('items',wholesale,'owner','Wholesale Sales')),
      (uid,q.id,tid,current_upload,q.supplier,'supplier_followup',jsonb_build_object('items',followup,'owner','Purchasing'))
    on conflict(quest_id,output_type) do update
      set payload=excluded.payload,updated_at=now();

    update purchasing_private.supplier_quests_v79
    set status='submitted',finished_at=coalesce(finished_at,now()),updated_at=now()
    where id=q.id
    returning * into q;

    return jsonb_build_object(
      'quest',jsonb_build_object(
        'id',q.id,'task_id',q.task_id,'upload_id',q.upload_id,'supplier',q.supplier,
        'current_stage',q.current_stage,'status',q.status,'stage_data',q.stage_data,'finished_at',q.finished_at
      ),
      'master_revision',current_revision,
      'stale_stages','[]'::jsonb
    );
  else
    raise exception 'Invalid Supplier Quest action';
  end if;
end;
$function$;

revoke execute on function public.purchasing_supplier_quest_v80(jsonb) from public, anon;
grant execute on function public.purchasing_supplier_quest_v80(jsonb) to authenticated;

comment on function public.purchasing_supplier_quest_v80(jsonb) is
'Build 80 Supplier Quest: editable draft stages, explicit no-action review, master-revision reconfirmation and snapshot outputs. Does not complete purchasing_tasks_v5 or award badges.';
