CREATE OR REPLACE FUNCTION public.purchasing_sales_generator_v113(p_rows jsonb, p_start date, p_end date, p_cover jsonb, p_mult jsonb, p_file text, p_revision integer, p_request uuid, p_recent_rows jsonb, p_recent_start date, p_recent_end date, p_recent_complete boolean, p_approve boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_role text;
 v_rev integer;
 v_count integer;
 v_avg numeric;
 v_super numeric;
 v_high numeric;
 v_medium numeric;
 v_days numeric;
 v_profit numeric;
 v_qty numeric;
 v_purchase_qty numeric;
 v_new_rop numeric;
 v_class text;
 v_item jsonb;
 v_name text;
 v_code text;
 v_unit text;
 v_pkey text;
 v_ukey text;
 v_sales_ratio numeric;
 v_recent_map jsonb;
 v_recent_qty numeric;
 v_policy_reason text;
 v_recent_error text;
 v_conflicting_codes jsonb := '{}'::jsonb;
 v_old public.products_master_v5%rowtype;
 v_rows jsonb := '[]'::jsonb;
 v_changes jsonb := '[]'::jsonb;
 v_classes jsonb := jsonb_build_object('Super',0,'High',0,'Medium',0,'Low',0,'Loss',0);
 v_eligible integer := 0;
 v_skipped integer := 0;
 v_changed integer := 0;
 v_unchanged integer := 0;
 v_review text;
 v_is_changed boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 v_role:=public.purchasing_current_role_v5();
 if v_role not in ('admin','purchasing') then raise exception 'Purchasing access required'; end if;
 if p_approve and v_role <> 'admin' then raise exception 'Admin access required to approve sales generator'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Report rows must be JSON array'; end if;
 v_count:=jsonb_array_length(p_rows);
 if v_count<1 or v_count>5000 then raise exception 'Report must have between 1 and 5000 product rows'; end if;
 if p_start is null or p_end is null or p_end<>(p_start + interval '12 months')::date or p_end>current_date+1 then
   raise exception 'Report must cover exactly 12 completed calendar months';
 end if;
 if p_file is null or length(btrim(p_file))<5 or length(p_file)>255 then raise exception 'Invalid report file name'; end if;
 if p_recent_complete IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm a complete all-products four-month report before calculating'; END IF;
 if p_recent_start IS DISTINCT FROM (p_end - interval '4 months')::date OR p_recent_end IS DISTINCT FROM p_end THEN
   RAISE EXCEPTION 'Recent sales report must cover the four months ending on annual report end date';
 end if;
 if jsonb_typeof(p_recent_rows)<>'array' OR jsonb_array_length(p_recent_rows)<1 OR jsonb_array_length(p_recent_rows)>5000 THEN
   RAISE EXCEPTION 'Four-month report must contain 1 to 5000 rows';
 end if;
 for v_item in select value from jsonb_array_elements(p_recent_rows) loop
   if jsonb_typeof(v_item)<>'object' OR jsonb_typeof(v_item->'qty')<>'number'
     OR nullif(btrim(v_item->>'name'),'') IS NULL OR nullif(btrim(v_item->>'unit'),'') IS NULL
     OR abs((v_item->>'qty')::numeric)>1000000000000 THEN
     RAISE EXCEPTION 'Invalid row in recent four-month sales report';
   end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_recent_rows) e
   group by purchasing_private.sales_name_key_v110(e.value->>'name') having count(*)>1) THEN
   RAISE EXCEPTION 'Duplicate product names in recent four-month report';
 end if;
 if jsonb_typeof(p_cover)<>'object' or jsonb_typeof(p_mult)<>'object' then raise exception 'Missing controls'; end if;
 v_super:=(p_mult->>'super')::numeric;
 v_high:=(p_mult->>'high')::numeric;
 v_medium:=(p_mult->>'medium')::numeric;
 if v_super is null or v_high is null or v_medium is null
   or v_super>1000 or v_high>1000 or v_medium>1000
   or not(v_super>v_high and v_high>v_medium and v_medium>0) then
   raise exception 'Profit thresholds invalid';
 end if;
 foreach v_class in array array['Super','High','Medium','Low','Loss'] loop
   v_days:=(p_cover->>lower(v_class))::numeric;
   if v_days is null or v_days<0 or v_days>365 or trunc(v_days)<>v_days then raise exception 'Coverage days invalid for %',v_class; end if;
 end loop;
 for v_item in select value from jsonb_array_elements(p_rows) loop
   if jsonb_typeof(v_item)<>'object' or jsonb_typeof(v_item->'profit')<>'number'
     or jsonb_typeof(v_item->'qty')<>'number'
     or nullif(btrim(v_item->>'name'),'') is null
     or nullif(btrim(v_item->>'unit'),'') is null then
     raise exception 'Malformed CSV report row';
   end if;
   if abs((v_item->>'profit')::numeric)>1000000000000
     or abs((v_item->>'qty')::numeric)>1000000000000 then
     raise exception 'Report amount out of bounds';
   end if;
 end loop;
 if exists(
   select 1 from(
    select lower(regexp_replace(btrim(e.value->>'name'),'\s+',' ','g')) k, count(*) n
    from jsonb_array_elements(p_rows) e group by 1 having count(*)>1
   )dup
 ) then raise exception 'Duplicate product names in report'; end if;
 select avg((e.value->>'profit')::numeric) into v_avg
 from jsonb_array_elements(p_rows) e
 where (e.value->>'profit')::numeric>0;
 if v_avg is null or v_avg<=0 then raise exception 'No positive profits in report'; end if;
 if p_approve then
   if p_request is null then raise exception 'Approval request UUID required'; end if;
   select master_revision into v_rev from public.purchasing_meta_v5 where singleton=true for update;
   if exists(select 1 from public.purchasing_request_log_v5 q where q.request_id=p_request) then
     return jsonb_build_object('ok',true,'duplicate_request',true,'master_revision',v_rev);
   end if;
 else
   select master_revision into v_rev from public.purchasing_meta_v5 where singleton=true;
 end if;
 if p_revision is null or v_rev is distinct from p_revision then
   raise exception 'Master revision changed; refresh and regenerate before approval';
 end if;
 v_recent_map:=purchasing_private.sales_recent_map_v111(p_recent_rows);
 SELECT coalesce(jsonb_object_agg(code,to_jsonb(true)),'{}'::jsonb) INTO v_conflicting_codes
 FROM (
   SELECT resolved.code FROM (
     SELECT coalesce(nullif(btrim(e.value->>'code'),''),
       CASE WHEN a.master_name_at_approval=m.product_name THEN a.product_code ELSE NULL END) AS code
     FROM jsonb_array_elements(p_rows) e
     LEFT JOIN purchasing_private.sales_name_aliases_v110 a
       ON a.report_name_key=purchasing_private.sales_name_key_v110(e.value->>'name')
     LEFT JOIN public.products_master_v5 m ON m.product_code=a.product_code
   ) resolved WHERE resolved.code IS NOT NULL
   GROUP BY resolved.code HAVING count(*)>1
 ) duplicate_codes;
 for v_item in select value from jsonb_array_elements(p_rows) loop
   v_name:=btrim(v_item->>'name');
   v_code:=nullif(btrim(v_item->>'code'),'');
   v_unit:=btrim(v_item->>'unit');
   v_profit:=(v_item->>'profit')::numeric;
   v_qty:=(v_item->>'qty')::numeric;
   v_class:=case when v_profit<=0 then 'Loss'
     when v_profit>=v_avg*v_super then 'Super'
     when v_profit>=v_avg*v_high then 'High'
     when v_profit>=v_avg*v_medium then 'Medium'
     else 'Low' end;
   v_classes:=jsonb_set(v_classes,array[v_class],to_jsonb((v_classes->>v_class)::integer+1));
   v_review:=null;v_new_rop:=null;v_purchase_qty:=null;v_old:=null;
   if v_code is null then
     select a.product_code into v_code
     from purchasing_private.sales_name_aliases_v110 a
     join public.products_master_v5 m on m.product_code=a.product_code
     where a.report_name_key=purchasing_private.sales_name_key_v110(v_name)
       and a.master_name_at_approval=m.product_name;
   end if;
   if v_code is null then
     v_review:='Unmatched product name';
   else
     select m.* into v_old from public.products_master_v5 m where m.product_code=v_code;
     if not found or v_old.product_code is null then
       v_review:='Product code missing in master';
     elsif purchasing_private.sales_name_key_v110(v_old.product_name)
       <>purchasing_private.sales_name_key_v110(v_name)
       and not exists (
         select 1 from purchasing_private.sales_name_aliases_v110 a
         where a.report_name_key=purchasing_private.sales_name_key_v110(v_name)
           and a.product_code=v_code and a.master_name_at_approval=v_old.product_name
       ) then
       v_review:='Product name mismatch';
     elsif v_conflicting_codes ? v_code then
       v_review:='Duplicate report names mapped to the same product';
     elsif v_qty<0 then
       v_review:='Negative net sales requires review';
     else
       v_ukey:=lower(btrim(regexp_replace(translate(v_unit,'()[]','    '),'\s+',' ','g')));
       v_pkey:=lower(btrim(regexp_replace(translate(v_old.purchase_unit,'()[]','    '),'\s+',' ','g')));
       if v_ukey=v_pkey then
         v_purchase_qty:=v_qty;
       elsif v_old.option_unit is not null
         and v_ukey=lower(btrim(regexp_replace(translate(v_old.option_unit,'()[]','    '),'\s+',' ','g')))
         and v_old.factor>0 then
         v_purchase_qty:=v_qty/v_old.factor;
       else
         v_sales_ratio:=purchasing_private.sales_unit_multiplier_v109(v_code,v_unit,v_old.purchase_unit,v_old.option_unit,v_old.factor);
         if v_sales_ratio is null then
           v_review:='Unverified unit conversion';
         else
           v_purchase_qty:=v_qty*v_sales_ratio;
         end if;
       end if;
     end if;
   end if;
   v_recent_qty:=null;
   v_policy_reason:=null;
   if v_review is null then
     if v_purchase_qty < 20 then
       v_policy_reason:='Annual <20 purchase units';
     end if;
     if v_recent_map ? v_code then
       v_recent_error:=v_recent_map->v_code->>'review';
       if v_recent_error is not null and v_policy_reason is null then
         v_review:=v_recent_error;
       elsif v_recent_error is null then
         v_recent_qty:=(v_recent_map->v_code->>'qty')::numeric;
       end if;
     else
       -- Only because Admin explicitly confirmed a complete all-products report.
       v_recent_qty:=0;
     end if;
     if v_recent_qty is not null and v_recent_qty < 10 then
       v_policy_reason:=case when v_policy_reason is null then 'Recent 4M <10 purchase units'
                       else 'Annual <20 and Recent 4M <10 purchase units' end;
     end if;
   end if;
   v_is_changed:=false;
   if v_review is null then
     v_days:=(p_cover->>lower(v_class))::numeric;
     v_new_rop:=case when v_policy_reason is not null then 0 else ceil((v_purchase_qty/12/30)*v_days) end;
     v_is_changed:=v_old.profitability_class is distinct from v_class
       or v_old.reorder_point is distinct from v_new_rop
       or v_old.reorder_point_unit is distinct from v_old.purchase_unit;
     v_eligible:=v_eligible+1;
     if v_is_changed then
       v_changed:=v_changed+1;
       v_changes:=v_changes||jsonb_build_array(jsonb_build_object(
         'product_code',v_code,
         'old_profitability_class',v_old.profitability_class,
         'new_profitability_class',v_class,
         'old_reorder_point',v_old.reorder_point,
         'new_reorder_point',v_new_rop,
         'old_reorder_point_unit',v_old.reorder_point_unit,
         'new_reorder_point_unit',v_old.purchase_unit,
         'report_profit',v_profit,'report_net_quantity',v_qty,
         'report_sales_unit',v_unit,'policy',v_policy_reason,'recent_4m_purchase_units',v_recent_qty
       ));
       if p_approve then
         update public.products_master_v5 set
           profitability_class=v_class,
           reorder_point=v_new_rop,
           reorder_point_unit=v_old.purchase_unit,
           updated_at=now()
         where product_code=v_code;
       end if;
     else
       v_unchanged:=v_unchanged+1;
     end if;
   else
     v_skipped:=v_skipped+1;
   end if;
   v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
     'name',v_name,'code',v_code,'profit',v_profit,
     'classification',v_class,'monthly_sales',v_qty/12,
     'report_unit',v_unit,
     'monthly_purchase_units',case when v_purchase_qty is null then null else v_purchase_qty/12 end,
     'purchase_unit',v_old.purchase_unit,'new_rop',v_new_rop,'rop_rule',v_policy_reason,'recent_sales_purchase_units',v_recent_qty,
     'eligible',v_review is null,'review',v_review,'changed',v_is_changed
   ));
 end loop;
 if p_approve then
   insert into public.purchasing_request_log_v5(request_id,request_type,created_at,created_by)
   values(p_request,'sales_generator_v104',now(),auth.uid());
   if v_changed>0 then
     perform purchasing_private.assert_workspace_numbers_data01(public.purchasing_dashboard_v5_impl());
     update public.purchasing_meta_v5 set
       master_revision=master_revision+1,updated_at=now(),updated_by=auth.uid()
     where singleton=true returning master_revision into v_rev;
   end if;
   insert into purchasing_private.sales_generator_approvals_v104(
     request_id,source_file,period_start,period_end,before_revision,
     after_revision,report_rows,eligible_rows,skipped_rows,changed_rows,
     mean_positive_profit,coverage_days,profit_multipliers,changes,approved_by
   )values(
     p_request,p_file,p_start,p_end,p_revision,v_rev,v_count,v_eligible,
     v_skipped,v_changed,v_avg,p_cover,p_mult,v_changes,auth.uid()
   );
 end if;
 return jsonb_build_object(
   'ok',true,'approved',p_approve,'master_revision',v_rev,
   'source_rows',v_count,'eligible_rows',v_eligible,'skipped_rows',v_skipped,
   'changed_rows',v_changed,'unchanged_rows',v_unchanged,
   'mean_positive_profit',v_avg,'class_counts',v_classes,'rows',v_rows
 );
end;
$function$;
REVOKE ALL ON FUNCTION public.purchasing_sales_generator_v113(jsonb,date,date,jsonb,jsonb,text,integer,uuid,jsonb,date,date,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purchasing_sales_generator_v113(jsonb,date,date,jsonb,jsonb,text,integer,uuid,jsonb,date,date,boolean,boolean) TO authenticated;
