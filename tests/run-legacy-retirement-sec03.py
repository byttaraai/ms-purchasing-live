"""Exercise the exact proposed migration and owner-only recovery in isolated PG17."""
from pathlib import Path
import json, os, runpy, subprocess
ROOT=Path(__file__).resolve().parents[1]
if os.environ.get('SEC03_ISOLATED')!='1': raise SystemExit('Isolated localhost only')
qa=runpy.run_path(str(ROOT/'tests/run-legacy-restore-sec03.py'))
paths=list((ROOT/'supabase/migrations').glob('*_security_fix3_retire_legacy_tables.sql'))
assert len(paths)==1
migration=paths[0].read_text()
restore=(ROOT/'maintenance/sec03_restore_retired.sql').read_text()
assert migration.count('DROP TABLE public.inventory_lines,public.inventory_uploads,public.products_master RESTRICT;')==1
assert 'DROP SCHEMA' not in migration and 'DROP TABLE public.products_master_v5' not in migration
header=qa['setup']+qa['helpers']+qa['seed']
release_helpers='DROP FUNCTION pg_temp.sec03_capture(); DROP FUNCTION pg_temp.sec03_fingerprint();\n'
def execute(label,sql,expected=None):
 p=subprocess.run(qa['args'],input=sql+'\nROLLBACK;',text=True,capture_output=True,env=qa['env'],timeout=90)
 if expected is None:
  if p.returncode:raise RuntimeError(label+'\n'+p.stdout+'\n'+p.stderr)
 elif p.returncode==0 or expected not in p.stderr:raise RuntimeError(label+' wrong result\n'+p.stdout+'\n'+p.stderr)
 print('PASS',label)
check_deleted="""
DO $$ BEGIN
 IF to_regclass('public.products_master') IS NOT NULL OR to_regclass('public.inventory_uploads') IS NOT NULL OR to_regclass('public.inventory_lines') IS NOT NULL THEN RAISE EXCEPTION 'Legacy survived'; END IF;
 IF to_regclass('public.products_master_v5') IS NULL OR to_regclass('public.inventory_uploads_v5') IS NULL OR to_regclass('public.inventory_lines_v5') IS NULL THEN RAISE EXCEPTION 'V5 removed'; END IF;
 IF (SELECT other_state FROM qa_before) IS DISTINCT FROM pg_temp.sec03_fingerprint() THEN RAISE EXCEPTION 'Nonlegacy source changed'; END IF;
 IF (SELECT verification->>'status' FROM purchasing_private.retired_legacy_snapshot_v1)<>'retired_after_verified_restore' THEN RAISE EXCEPTION 'Proof not recorded'; END IF;
 IF (SELECT count(*) FROM auth.users)<>1 THEN RAISE EXCEPTION 'Auth data changed'; END IF;
END; $$;
"""
cleanup_temp="""
DROP TABLE pg_temp.sec03_restore_inventory_lines,pg_temp.sec03_restore_inventory_uploads,pg_temp.sec03_restore_products_master,pg_temp.sec03_restore_auth_ids,pg_temp.sec03_restore_result RESTRICT;
"""
verify_recovery="""
DO $$ DECLARE b jsonb; x jsonb; name text; BEGIN
 SELECT payload INTO b FROM purchasing_private.retired_legacy_snapshot_v1;
 FOREACH name IN ARRAY ARRAY['products_master','inventory_uploads','inventory_lines'] LOOP
  EXECUTE format('SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM public.%I t',name) INTO x;
  IF x IS DISTINCT FROM b->'tables'->name->'data' OR md5(x::text) IS DISTINCT FROM b->'tables'->name->>'data_md5' THEN RAISE EXCEPTION 'Recovered contents differ'; END IF;
  IF has_table_privilege('anon','public.'||name,'SELECT') OR has_table_privilege('authenticated','public.'||name,'SELECT') OR has_table_privilege('service_role','public.'||name,'SELECT') OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=name) THEN RAISE EXCEPTION 'Broad access was restored'; END IF;
 END LOOP;
 IF (SELECT last_value FROM public.inventory_lines_id_seq)<>1309 THEN RAISE EXCEPTION 'Recovery sequence mismatch'; END IF;
 IF (SELECT other_state FROM qa_before) IS DISTINCT FROM pg_temp.sec03_fingerprint() THEN RAISE EXCEPTION 'Recovery changed V5'; END IF;
END; $$;
"""
execute('exact migration followed by owner-only full recovery',header+release_helpers+migration+qa['helpers']+check_deleted+cleanup_temp+restore+verify_recovery)
execute('source data drift refuses deletion',header+"UPDATE public.products_master SET supplier='changed' WHERE product_code='QA0001';\n"+release_helpers+migration,'snapshot/source drift')
execute('external FK stops RESTRICT deletion',header+"CREATE TABLE public.sec03_external(code text REFERENCES public.products_master(product_code));\n"+release_helpers+migration,'other objects depend on it')
execute('routine dependency refuses deletion',header+"CREATE FUNCTION public.sec03_external() RETURNS bigint LANGUAGE sql AS $$SELECT count(*) FROM public.products_master$$;\n"+release_helpers+migration,'application routine references')
execute('damaged snapshot refuses deletion',header+"UPDATE purchasing_private.retired_legacy_snapshot_v1 SET payload_md5='bad';\n"+release_helpers+migration,'snapshot/source drift')
execute('public restore refuses existing source',header+restore,'restore refuses existing source tables')
print(json.dumps({'retirement_recovery_scenarios':6,'restore_scenarios':8,'production_requests':0,'customer_records_exported':0}))
