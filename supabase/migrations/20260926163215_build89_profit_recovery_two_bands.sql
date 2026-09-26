CREATE OR REPLACE FUNCTION purchasing_private.recovered_v47(task jsonb, baseline jsonb, current_rows jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare code text; b jsonb; r jsonb; f text:=task->>'focus';
begin
 if f not in ('suppliers','profit_recovery','profit_recovery_80_150','shortage_mid') or jsonb_array_length(task->'codes')=0 then return false; end if;
 for code in select jsonb_array_elements_text(task->'codes') loop
  b:=baseline->code; r:=current_rows->code;
  if b is null or r is null or coalesce((r->>'needs_review')::boolean,true)
   or b->>'purchase_unit' is distinct from r->>'purchase_unit'
   or (b->>'stock_origin'='reported' and b->>'raw_unit' is distinct from r->>'raw_unit')
   or (b->>'stock_origin'='reported' and b->>'conversion_role' is distinct from r->>'conversion_role')
   or b->>'factor' is distinct from r->>'factor'
   or b->>'reorder_point' is distinct from r->>'reorder_point'
   or r->>'stock_origin'<>'reported'
   or not coalesce((r->>'stock_qty')::numeric>(b->>'stock_qty')::numeric,false)
  then return false; end if;
  if f='suppliers' and ((r->>'supplier') is distinct from (task->>'target') or not coalesce((r->>'min_order_qty')::numeric=0,false)) then return false; end if;
  if f='profit_recovery' and not coalesce((r->>'stock_ratio')::numeric>=80,false) then return false; end if;
  if f='profit_recovery_80_150' and not coalesce((r->>'stock_ratio')::numeric>=150,false) then return false; end if;
  if f='shortage_mid' and not coalesce((r->>'stock_ratio')::numeric>=50,false) then return false; end if;
 end loop;
 return true;
end; $function$;

CREATE OR REPLACE FUNCTION purchasing_private.workspace_sync_v47(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=auth.uid(); d jsonb; rowmap jsonb; u jsonb; up uuid; rev integer; cid uuid; oldcycle record; v_existing_task record; item jsonb; rowdata jsonb; code text; codes jsonb; allowed text[]:=array['suppliers','profit_recovery','profit_recovery_80_150','shortage_mid','shortage_low','aging30','data']; v_score numeric; lv integer; fingerprint text; priorfingerprint text; evidence jsonb; result jsonb; tasks_result jsonb; candidates jsonb; newcredits integer; n integer; f text; upload_time timestamptz; fresh boolean; reason text;
begin
 if uid is null or public.purchasing_current_role_v5() is null then raise exception 'Purchasing access required'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or payload->>'logic_version' is distinct from 'reactive_v1' then raise exception 'Refresh required: unsupported workspace version'; end if;
 if payload->>'score_model' is distinct from 'commercial_v3' then raise exception 'Unapproved score model'; end if;
 perform pg_advisory_xact_lock(hashtextextended('workspace-v47:'||uid::text,0));
 select master_revision into rev from public.purchasing_meta_v5 where singleton for share;
 if rev is distinct from (payload->>'master_revision')::integer then raise exception 'SOURCE_REVISION_CHANGED'; end if;
 d:=public.purchasing_dashboard_v5();u:=d->'upload';up:=nullif(u->>'id','')::uuid;
 if up is distinct from nullif(payload->>'upload_id','')::uuid then raise exception 'SOURCE_REVISION_CHANGED'; end if;
 if up is null or not coalesce((u->>'is_complete')::boolean,false) or not coalesce((u->>'excludes_zero')::boolean,false) then return public.purchasing_tasks_sync_v5('{}'::jsonb)||jsonb_build_object('tasks','[]'::jsonb); end if;
 upload_time:=(u->>'uploaded_at')::timestamptz;fresh:=upload_time+interval '48 hours'>now();
 select coalesce(jsonb_object_agg(x->>'product_code',x),'{}'::jsonb) into rowmap from jsonb_array_elements(d->'rows') x;
 v_score:=(payload->>'score')::numeric;lv:=(payload->>'bo_level')::integer;
 if v_score is null or v_score<0 or v_score>100 or lv is null or lv<>(case when v_score<40 then 0 else least(12,floor((v_score-40)/5)::integer+1) end) then raise exception 'Invalid v_score or level'; end if;
 candidates:=payload->'tasks';
 if candidates is null or jsonb_typeof(candidates)<>'array' or jsonb_array_length(candidates)>50 then raise exception 'Invalid task collection'; end if;
 if (select count(*) from jsonb_array_elements(candidates) x where x->>'focus'='suppliers')>10 then raise exception 'At most 10 supplier tasks'; end if;
 if (select count(*)<>count(distinct x->>'task_key') from jsonb_array_elements(candidates) x) then raise exception 'Duplicate task keys'; end if;
 for item in select value from jsonb_array_elements(candidates) loop
  f:=item->>'focus';codes:=item->'codes';
  if not coalesce(f=any(allowed),false) or nullif(item->>'task_key','') is null or nullif(item->>'title','') is null or nullif(item->>'badge_type','') is null or nullif(item->>'badge_label','') is null or codes is null or jsonb_typeof(codes)<>'array' or jsonb_array_length(codes)=0 then raise exception 'Invalid task'; end if;
  if (select count(*)<>count(distinct value) from jsonb_array_elements_text(codes)) then raise exception 'Duplicate product targets'; end if;
  for code in select jsonb_array_elements_text(codes) loop
   rowdata:=rowmap->code;
   if rowdata is null then raise exception 'Product missing from current source'; end if;
   if f='suppliers' and (nullif(item->>'target','') is null or (rowdata->>'supplier') is distinct from (item->>'target') or coalesce((rowdata->>'blocking_review')::boolean,true) or not coalesce((rowdata->>'min_order_qty')::numeric>0,false)) then raise exception 'SOURCE_REVISION_CHANGED: supplier ownership'; end if;
   if f in ('shortage_mid','profit_recovery','profit_recovery_80_150') and coalesce((rowdata->>'blocking_review')::boolean,true) then raise exception 'Review blocker cannot be auto recovery'; end if;
   if f='shortage_mid' and not coalesce((rowdata->>'stock_ratio')::numeric>=10 and (rowdata->>'stock_ratio')::numeric<50,false) then raise exception 'Invalid recovery range'; end if;
   if f='profit_recovery' and not coalesce((rowdata->>'stock_ratio')::numeric>=10 and (rowdata->>'stock_ratio')::numeric<80,false) then raise exception 'Invalid profit recovery range'; end if;
   if f='profit_recovery_80_150' and not coalesce((rowdata->>'stock_ratio')::numeric>=80 and (rowdata->>'stock_ratio')::numeric<150,false) then raise exception 'Invalid profit recovery 80-150 range'; end if;
   if f='data' and not coalesce((rowdata->>'needs_review')::boolean,false) then raise exception 'Review issue no longer exists'; end if;
  end loop;
 end loop;
 for oldcycle in select * from public.purchasing_task_cycles_v5 c where c.user_id=uid and c.upload_id<>up and c.status='open' order by c.generated_at loop
  if upload_time<=oldcycle.expires_at and upload_time>oldcycle.generated_at then
   for v_existing_task in select * from public.purchasing_tasks_v5 x where x.cycle_id=oldcycle.id and x.user_id=uid and x.status='open' and x.is_current and x.focus in ('suppliers','profit_recovery','profit_recovery_80_150','shortage_mid') order by x.priority,x.id loop
    select rows_by_code into evidence from purchasing_private.task_evidence_v47 where task_id=v_existing_task.id and user_id=uid and upload_id=oldcycle.upload_id;
    if evidence is not null and purchasing_private.recovered_v47(to_jsonb(v_existing_task),evidence,rowmap) then
     perform set_config('purchasing.change_reason','verified_stock_upload',true);
     update public.purchasing_tasks_v5 set status='completed',completed_at=now(),completion_upload_id=up,updated_at=now() where id=v_existing_task.id;
     newcredits:=0;
     for code in select jsonb_array_elements_text(v_existing_task.codes) loop
      insert into purchasing_private.stock_outcomes_v47(user_id,from_upload_id,to_upload_id,product_code,task_id) values(uid,oldcycle.upload_id,up,code,v_existing_task.id) on conflict do nothing;
      get diagnostics n=row_count;newcredits:=newcredits+n;
     end loop;
     if newcredits>0 then
      insert into public.purchasing_badges_v5(user_id,task_id,badge_type,badge_label,score_impact) values(uid,v_existing_task.id,v_existing_task.badge_type,v_existing_task.badge_label,0) on conflict(task_id) do nothing;
     end if;
    end if;
   end loop;
  end if;
  update public.purchasing_task_cycles_v5 set status='closed' where id=oldcycle.id;
  perform set_config('purchasing.change_reason','new_inventory_cycle',true);
  update public.purchasing_tasks_v5 set status='expired',updated_at=now() where cycle_id=oldcycle.id and status='open';
 end loop;
 select id,source_fingerprint into cid,priorfingerprint from public.purchasing_task_cycles_v5 where user_id=uid and upload_id=up;
 if cid is null and fresh then
  insert into public.purchasing_task_cycles_v5(user_id,upload_id,generated_at,expires_at,score,bo_level,event_focus,event_title,event_text,status,logic_version) values(uid,up,upload_time,upload_time+interval '48 hours',v_score,lv,payload->>'event_focus',left(payload->>'event_title',160),left(payload->>'event_text',500),'open','reactive_v1') returning id into cid;
  insert into public.purchasing_score_history_v5(user_id,upload_id,score,bo_level,observed_at) values(uid,up,v_score,lv,upload_time) on conflict(user_id,upload_id) do nothing;
 end if;
 fingerprint:=md5((payload-'resolved_task_ids')::text);
 if cid is not null and fresh and exists(select 1 from public.purchasing_task_cycles_v5 where id=cid and status='open') and fingerprint is distinct from priorfingerprint then
  reason:=case when priorfingerprint is null then 'reactive_activation' else 'source_recalculation' end;
  perform set_config('purchasing.change_reason',reason,true);
  update public.purchasing_tasks_v5 t set is_current=false,updated_at=now() where t.cycle_id=cid and t.user_id=uid and t.status='open' and t.is_current and not exists(select 1 from jsonb_array_elements(candidates) x where x->>'task_key'=t.task_key);
  for item in select value from jsonb_array_elements(candidates) loop
   insert into public.purchasing_tasks_v5(cycle_id,user_id,task_key,task_type,focus,title,description,target,codes,target_count,score_impact,priority,badge_type,badge_label,status,generated_at,is_current,source_revision,live_meta,updated_at)
   values(cid,uid,left(item->>'task_key',240),left(item->>'task_type',80),item->>'focus',left(item->>'title',240),left(item->>'description',700),nullif(item->>'target',''),item->'codes',jsonb_array_length(item->'codes'),greatest(0,least(100,(item->>'score_impact')::numeric)),greatest(1,least(50,(item->>'priority')::integer)),item->>'badge_type',item->>'badge_label','open',upload_time,true,rev,coalesce(item->'meta','[]'::jsonb),now())
   on conflict(cycle_id,task_key) do update set task_type=excluded.task_type,focus=excluded.focus,title=excluded.title,description=excluded.description,target=excluded.target,codes=excluded.codes,target_count=excluded.target_count,score_impact=excluded.score_impact,priority=excluded.priority,is_current=true,source_revision=excluded.source_revision,live_meta=excluded.live_meta,updated_at=now()
   where public.purchasing_tasks_v5.status='open' and (public.purchasing_tasks_v5.codes,public.purchasing_tasks_v5.target,public.purchasing_tasks_v5.score_impact,public.purchasing_tasks_v5.priority,public.purchasing_tasks_v5.source_revision,public.purchasing_tasks_v5.is_current,public.purchasing_tasks_v5.description,public.purchasing_tasks_v5.title) is distinct from (excluded.codes,excluded.target,excluded.score_impact,excluded.priority,excluded.source_revision,true,excluded.description,excluded.title);
  end loop;
  insert into purchasing_private.task_evidence_v47(task_id,user_id,upload_id,master_revision,rows_by_code)
   select t.id,uid,up,rev,(select jsonb_object_agg(k.code,rowmap->k.code) from jsonb_array_elements_text(t.codes) as k(code)) from public.purchasing_tasks_v5 t where t.cycle_id=cid and t.user_id=uid and t.status='open' and t.is_current
   on conflict(task_id) do update set master_revision=excluded.master_revision,rows_by_code=excluded.rows_by_code,captured_at=now();
  update public.purchasing_task_cycles_v5 set source_revision=rev,source_fingerprint=fingerprint,evaluated_on=(payload->>'evaluated_on')::date,live_score=v_score,live_bo_level=lv,event_focus=payload->>'event_focus',event_title=left(payload->>'event_title',160),event_text=left(payload->>'event_text',500),logic_version='reactive_v1' where id=cid;
 end if;
 result:=public.purchasing_tasks_sync_v5('{}'::jsonb);
 select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('badge_awarded',exists(select 1 from public.purchasing_badges_v5 b where b.task_id=t.id)) order by t.priority,t.generated_at,t.id),'[]'::jsonb) into tasks_result from public.purchasing_tasks_v5 t where t.cycle_id=cid and t.user_id=uid and (t.is_current or t.status='completed') and t.status in ('open','completed');
 return result||jsonb_build_object('tasks',tasks_result,'source',jsonb_build_object('upload_id',up,'master_revision',rev,'logic_version','reactive_v1','evaluated_on',payload->>'evaluated_on'));
end; $function$;

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
     or (select count(*) from jsonb_array_elements(payload->'tasks') x where x->>'focus'='profit_recovery_80_150')>1
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
      when 'profit_recovery_80_150' then 'recovery|profit-80-150'
      when 'shortage_mid' then 'recovery|10-50'
      when 'shortage_low' then 'review|under10'
      when 'aging30' then 'review|30day-decision'
      when 'data' then 'master|review' else null end;
    expected_badge_type:=case f
      when 'suppliers' then 'supplier_closer'
      when 'profit_recovery' then 'profit_recovery'
      when 'profit_recovery_80_150' then 'profit_recovery'
      when 'shortage_mid' then 'stock_recovery'
      when 'shortage_low' then 'crisis_resolution'
      when 'aging30' then 'aging_breaker'
      when 'data' then 'data_quality' else null end;
    expected_badge_label:=case f
      when 'suppliers' then 'Supplier Closer'
      when 'profit_recovery' then 'Profit Protector'
      when 'profit_recovery_80_150' then 'Profit Protector'
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
      elsif f='profit_recovery_80_150' then
        if not coalesce((rowdata->>'stock_ratio')::numeric>=80
                        and (rowdata->>'stock_ratio')::numeric<150
                        and (rowdata->>'min_order_qty')::numeric>0,false)
           or lower(btrim(coalesce(rowdata->>'profitability_class',''))) not in ('super','high','سوبر','مرتفع') then raise exception 'Invalid profit recovery 80-150 target'; end if;
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

revoke all on function purchasing_private.recovered_v47(jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function purchasing_private.workspace_sync_v47(jsonb) from public,anon,authenticated;
revoke all on function purchasing_private.workspace_validate_payload_v60(jsonb,jsonb,jsonb) from public,anon,authenticated;
comment on function purchasing_private.workspace_validate_payload_v60(jsonb,jsonb,jsonb) is 'Build 89: validates two Profit Recovery bands: 10-80 and 80-150, with Super/High profitability and positive order need.';
