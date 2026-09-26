create or replace function public.purchasing_master_review_save_v93(
  payload jsonb,
  expected_revision integer,
  request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  role_name text;
  d jsonb;
  task_codes jsonb;
  patch jsonb;
  rowdata jsonb;
  existing jsonb;
  out_rows jsonb := '[]'::jsonb;
  code text;
  reason text;
  is_new boolean;
  pu text;
  supplier_value text;
  price_value numeric;
  reorder_value numeric;
  rating_value text;
  raw jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  role_name := public.purchasing_current_role_v5();
  if role_name not in ('admin','purchasing') then raise exception 'Purchasing access required'; end if;
  if payload is null or jsonb_typeof(payload) <> 'array' then raise exception 'payload must be a JSON array'; end if;
  if jsonb_array_length(payload) < 1 or jsonb_array_length(payload) > 20 then raise exception 'Master review save supports 1 to 20 products'; end if;

  select t.codes into task_codes
  from public.purchasing_tasks_v5 t
  where t.user_id=auth.uid() and t.focus='data' and t.status='open' and t.is_current
  order by t.updated_at desc
  limit 1;
  if task_codes is null then raise exception 'No current Master Data task'; end if;

  d := public.purchasing_dashboard_v5();

  for patch in select value from jsonb_array_elements(payload)
  loop
    code := nullif(btrim(patch->>'product_code'),'');
    if code is null then raise exception 'Product code is required'; end if;
    if not exists(select 1 from jsonb_array_elements_text(task_codes) c(v) where c.v=code) then
      raise exception 'Product is not in the current Master Data task: %', code;
    end if;

    select x into rowdata from jsonb_array_elements(coalesce(d->'rows','[]'::jsonb)) x
    where x->>'product_code'=code limit 1;
    if rowdata is null or not coalesce((rowdata->>'needs_review')::boolean,false) then
      raise exception 'Review issue no longer exists for %', code;
    end if;

    select to_jsonb(m) into existing from public.products_master_v5 m where m.product_code=code;
    is_new := existing is null;
    reason := coalesce(rowdata->>'review_reason','');

    if is_new then
      pu := nullif(btrim(patch->>'purchase_unit'),'');
      if pu is null then raise exception 'Purchase unit is required for new product %',code; end if;
      if not exists(select 1 from public.products_master_v5 m where lower(btrim(m.purchase_unit))=lower(pu)) then
        raise exception 'Purchase unit must be selected from the current master list for %',code;
      end if;
      select m.purchase_unit into pu from public.products_master_v5 m
      where lower(btrim(m.purchase_unit))=lower(pu) order by m.purchase_unit limit 1;
      existing := jsonb_build_object(
        'product_code',code,
        'product_name',coalesce(nullif(btrim(rowdata->>'product_name'),''),code),
        'purchase_unit',pu,
        'option_unit',null,
        'factor',1,
        'reorder_point',null,
        'reorder_point_unit',null,
        'profitability_class',null,
        'supplier',null,
        'order_multiple',1,
        'purchase_price',null
      );
    elsif patch ? 'purchase_unit' then
      raise exception 'Purchase Unit cannot be changed from Master Review for existing product %',code;
    end if;

    raw := existing;

    if patch ? 'supplier' then
      if not is_new and position('Supplier is not assigned' in reason)=0 then raise exception 'Supplier is not a current issue for %',code; end if;
      supplier_value := nullif(btrim(patch->>'supplier'),'');
      if supplier_value is null then raise exception 'Supplier cannot be blank for %',code; end if;
      if not exists(select 1 from public.products_master_v5 m where m.supplier=supplier_value) then
        raise exception 'Supplier must be selected from the current supplier list for %',code;
      end if;
      raw := jsonb_set(raw,'{supplier}',to_jsonb(supplier_value),true);
    end if;

    if patch ? 'purchase_price' then
      if not is_new and position('Master purchase price is missing or zero' in reason)=0 then raise exception 'Purchase price is not a current issue for %',code; end if;
      price_value := nullif(patch->>'purchase_price','')::numeric;
      if price_value is null or price_value<=0 then raise exception 'Purchase price must be greater than zero for %',code; end if;
      raw := jsonb_set(raw,'{purchase_price}',to_jsonb(price_value),true);
    end if;

    if patch ? 'reorder_point' then
      if not is_new and position('Reorder point' in reason)=0 then raise exception 'Reorder Point is not a current issue for %',code; end if;
      reorder_value := nullif(patch->>'reorder_point','')::numeric;
      if reorder_value is null or reorder_value<0 then raise exception 'Reorder Point must be zero or greater for %',code; end if;
      raw := jsonb_set(raw,'{reorder_point}',to_jsonb(reorder_value),true);
      raw := jsonb_set(raw,'{reorder_point_unit}',to_jsonb(raw->>'purchase_unit'),true);
    end if;

    if patch ? 'profitability_class' then
      if not is_new and position('Profitability classification is missing' in reason)=0 then raise exception 'Rating is not a current issue for %',code; end if;
      rating_value := nullif(btrim(patch->>'profitability_class'),'');
      if rating_value not in ('Super','High','Medium','Low','Loss') then raise exception 'Invalid profitability rating for %',code; end if;
      raw := jsonb_set(raw,'{profitability_class}',to_jsonb(rating_value),true);
    end if;

    if not (patch ? 'supplier' or patch ? 'purchase_price' or patch ? 'reorder_point' or patch ? 'profitability_class' or is_new) then
      raise exception 'No editable review field supplied for %',code;
    end if;

    out_rows := out_rows || jsonb_build_array(raw);
  end loop;

  return public.purchasing_save_master_v5_impl(
    out_rows,
    'Master Data Review popup - Build 93',
    expected_revision,
    request_id
  );
end;
$function$;

revoke all on function public.purchasing_master_review_save_v93(jsonb,integer,uuid) from public, anon;
grant execute on function public.purchasing_master_review_save_v93(jsonb,integer,uuid) to authenticated;
