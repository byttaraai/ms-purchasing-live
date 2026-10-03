-- Synthetic dependencies for the exact production recovery function and caller.
-- Executed ONLY in an ephemeral localhost database, inside a rolled-back transaction.
CREATE SCHEMA auth;
CREATE SCHEMA purchasing_private;
CREATE SCHEMA qa;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('qa.uid',true),'')::uuid
$$;
CREATE FUNCTION public.purchasing_current_role_v5() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('qa.role',true),'')
$$;
CREATE TABLE qa.dashboard(value jsonb);
CREATE FUNCTION public.purchasing_dashboard_v5() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT value FROM qa.dashboard $$;
CREATE FUNCTION public.purchasing_tasks_sync_v5(jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE TABLE public.purchasing_meta_v5(singleton boolean PRIMARY KEY,master_revision integer);
INSERT INTO public.purchasing_meta_v5 VALUES(true,7);
CREATE TABLE public.purchasing_task_cycles_v5(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,upload_id uuid,generated_at timestamptz,expires_at timestamptz,
 score numeric,bo_level integer,event_focus text,event_title text,event_text text,status text,logic_version text,
 source_revision integer,source_fingerprint text,evaluated_on date,live_score numeric,live_bo_level integer,
 UNIQUE(user_id,upload_id));
CREATE TABLE public.purchasing_tasks_v5(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cycle_id uuid,user_id uuid,task_key text,task_type text,focus text,
 title text,description text,target text,codes jsonb,target_count integer,score_impact numeric,priority integer,
 badge_type text,badge_label text,status text,generated_at timestamptz,is_current boolean,source_revision integer,
 live_meta jsonb,updated_at timestamptz,completed_at timestamptz,completion_upload_id uuid,UNIQUE(cycle_id,task_key));
CREATE TABLE public.purchasing_badges_v5(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,task_id uuid UNIQUE,badge_type text,badge_label text,score_impact numeric);
CREATE TABLE purchasing_private.task_evidence_v47(
 task_id uuid PRIMARY KEY,user_id uuid,upload_id uuid,master_revision integer,rows_by_code jsonb,captured_at timestamptz DEFAULT now());
CREATE TABLE purchasing_private.stock_outcomes_v47(
 user_id uuid,from_upload_id uuid,to_upload_id uuid,product_code text,task_id uuid,
 PRIMARY KEY(user_id,from_upload_id,to_upload_id,product_code));
CREATE TABLE public.purchasing_score_history_v5(
 user_id uuid,upload_id uuid,score numeric,bo_level integer,observed_at timestamptz,UNIQUE(user_id,upload_id));
CREATE TABLE qa.results(label text PRIMARY KEY,passed boolean NOT NULL);
CREATE FUNCTION qa.check(label text,actual boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF actual IS DISTINCT FROM true THEN RAISE EXCEPTION 'TASK01 test failed: %',label; END IF;
 INSERT INTO qa.results VALUES(label,true);
END;$$;
CREATE FUNCTION qa.reset_case(current_row jsonb,baseline_row jsonb,mode text DEFAULT '',focuses text[] DEFAULT ARRAY['suppliers'])
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE uid uuid:='00000000-0000-0000-0000-000000000001';other_uid uuid:='00000000-0000-0000-0000-000000000002';
 oldup uuid:=gen_random_uuid();newup uuid:=gen_random_uuid();cid uuid:=gen_random_uuid();tid uuid;f text;n int:=0;payload jsonb;u jsonb;
BEGIN
 TRUNCATE public.purchasing_tasks_v5,public.purchasing_task_cycles_v5,public.purchasing_badges_v5,
 purchasing_private.task_evidence_v47,purchasing_private.stock_outcomes_v47,public.purchasing_score_history_v5,qa.dashboard;
 PERFORM set_config('qa.uid',uid::text,true);PERFORM set_config('qa.role','admin',true);
 INSERT INTO public.purchasing_task_cycles_v5(id,user_id,upload_id,generated_at,expires_at,status,logic_version)
 VALUES(cid,CASE WHEN mode='other_owner' THEN other_uid ELSE uid END,oldup,
 now()-interval '24 hours',CASE WHEN mode='late' THEN now()-interval '1 second' WHEN mode='at_deadline' THEN now() ELSE now()+interval '24 hours' END,
 CASE WHEN mode='closed' THEN 'closed' ELSE 'open' END,'reactive_v1');
 FOREACH f IN ARRAY focuses LOOP
  n:=n+1;tid:=gen_random_uuid();
  INSERT INTO public.purchasing_tasks_v5(id,cycle_id,user_id,task_key,focus,target,codes,target_count,priority,badge_type,badge_label,status,is_current,generated_at)
  VALUES(tid,cid,CASE WHEN mode='other_owner' THEN other_uid ELSE uid END,'old-'||f,f,'QA Supplier','["A"]',1,n,'qa_badge','QA badge',
   CASE WHEN mode='already_expired' THEN 'expired' ELSE 'open' END,true,now()-interval '24 hours');
  IF mode<>'no_evidence' THEN
   INSERT INTO purchasing_private.task_evidence_v47(task_id,user_id,upload_id,master_revision,rows_by_code)
   VALUES(tid,uid,oldup,7,jsonb_build_object('A',baseline_row));
  END IF;
 END LOOP;
 IF mode='same_upload' THEN newup:=oldup; END IF;
 u:=jsonb_build_object('id',newup,'uploaded_at',now(),'is_complete',true,'excludes_zero',true);
 INSERT INTO qa.dashboard VALUES(jsonb_build_object('upload',u,'rows',jsonb_build_array(current_row)));
 payload:=jsonb_build_object('logic_version','reactive_v1','score_model','commercial_v3','master_revision',7,'upload_id',newup,
 'score',63,'bo_level',5,'evaluated_on',current_date,'tasks',jsonb_build_array(jsonb_build_object(
 'task_key','data|qa','focus','data','title','QA Master Review','badge_type','qa_data','badge_label','Data Cleaner',
 'codes',jsonb_build_array('A'),'priority',1,'score_impact',0,'meta','[]'::jsonb)));
 RETURN payload;
END;$$;
