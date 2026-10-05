"""Generate the new SEC03 migration and rollback script; never connect to production."""
from pathlib import Path
import re, subprocess
root=Path(__file__).resolve().parents[1]
source=(root/'supabase/migrations/20260928110947_security_fix3_backup_legacy_tables.sql').read_text()
helpers='\n'.join(re.findall(r'CREATE FUNCTION pg_temp\.sec03_(?:capture|fingerprint)\(\)[\s\S]*?END \$f\$;',source))
assert helpers.count('CREATE FUNCTION')==2
rehearsal=(root/'maintenance/sec03_restore_rehearsal.sql').read_text()
prefix="""-- SEC03 phase B. User-authorized retirement of exactly three legacy tables.
-- Restore gate runs first using the protected snapshot; failure aborts everything.
-- No project, V5 table, shared function, current history or Auth account deletion.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
SET LOCAL search_path=pg_catalog;
"""+helpers+"""
LOCK TABLE public.products_master,public.inventory_uploads,public.inventory_lines IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE sec03_guard(before_state jsonb,snapshot_md5 text) ON COMMIT DROP;
DO $gate$
DECLARE b jsonb; h text;
BEGIN
 SELECT payload,payload_md5 INTO b,h FROM purchasing_private.retired_legacy_snapshot_v1 WHERE snapshot_key='sec03_legacy_retirement' FOR UPDATE;
 IF b IS NULL OR md5(b::text) IS DISTINCT FROM h OR b IS DISTINCT FROM pg_temp.sec03_capture()
 THEN RAISE EXCEPTION 'SEC03: snapshot/source drift; deletion refused'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','purchasing_private') AND p.prokind IN ('f','p') AND p.prosrc ~ '\\m(products_master|inventory_uploads|inventory_lines)\\M')
 THEN RAISE EXCEPTION 'SEC03: application routine references legacy source'; END IF;
 IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE schemaname='public' AND tablename IN ('products_master','inventory_uploads','inventory_lines'))
 THEN RAISE EXCEPTION 'SEC03: legacy publication requires separate review'; END IF;
 INSERT INTO pg_temp.sec03_guard VALUES(pg_temp.sec03_fingerprint(),h);
END;
$gate$;
"""
suffix="""
DO $verify$
BEGIN
 IF (SELECT before_state FROM pg_temp.sec03_guard) IS DISTINCT FROM pg_temp.sec03_fingerprint()
 THEN RAISE EXCEPTION 'SEC03: unrelated source changed during rehearsal'; END IF;
 IF (SELECT result->>'snapshot_md5' FROM pg_temp.sec03_restore_result) IS DISTINCT FROM (SELECT snapshot_md5 FROM pg_temp.sec03_guard)
 THEN RAISE EXCEPTION 'SEC03: restore report mismatch'; END IF;
END;
$verify$;
-- Deliberately explicit RESTRICT: any unexpected external dependency aborts.
DROP TABLE public.inventory_lines,public.inventory_uploads,public.products_master RESTRICT;
DO $finish$
DECLARE proof jsonb;
BEGIN
 IF (SELECT before_state FROM pg_temp.sec03_guard) IS DISTINCT FROM pg_temp.sec03_fingerprint()
 THEN RAISE EXCEPTION 'SEC03: nonlegacy data/structure/routine drift; deletion rolled back'; END IF;
 SELECT result INTO proof FROM pg_temp.sec03_restore_result;
 UPDATE purchasing_private.retired_legacy_snapshot_v1
 SET verification=verification||jsonb_build_object('status','retired_after_verified_restore','retirement',jsonb_build_object('at',clock_timestamp(),'restore',proof,'nonlegacy_fingerprint',pg_temp.sec03_fingerprint()))
 WHERE snapshot_key='sec03_legacy_retirement' AND payload_md5=(SELECT snapshot_md5 FROM pg_temp.sec03_guard) AND md5(payload::text)=payload_md5;
 IF NOT FOUND THEN RAISE EXCEPTION 'SEC03: recovery record changed'; END IF;
END;
$finish$;
DROP FUNCTION pg_temp.sec03_capture();
DROP FUNCTION pg_temp.sec03_fingerprint();
"""
paths=list((root/'supabase/migrations').glob('*_security_fix3_retire_legacy_tables.sql'))
if not paths:
 for args in [['--version'],['--help'],['migration','--help'],['migration','new','--help'],['migration','new','security_fix3_retire_legacy_tables']]:
  subprocess.run(['npx','--yes','supabase@2.81.3',*args],cwd=root,check=True)
 paths=list((root/'supabase/migrations').glob('*_security_fix3_retire_legacy_tables.sql'))
assert len(paths)==1
paths[0].write_text(prefix+rehearsal+suffix)
# A separate explicit recovery script: tables must be absent, no broad access restored.
rollback=rehearsal
changes=[
 ('-- SEC03: NON-DESTRUCTIVE full logical restore rehearsal.\n-- Writes only session-local temporary copies. Never drops a legacy/V5 table.\n-- Do not use as a restore into production: old broad grants are never replayed.', '-- SEC03: EXPLICIT OWNER-ONLY RECOVERY after retirement.\n-- Run inside BEGIN/COMMIT only after authorization. Never overwrites existing tables.\n-- Recreates only the three retired tables; broad client policies/grants stay revoked.'),
 ("BEGIN\n SELECT payload,payload_md5", "BEGIN\n IF to_regclass('public.products_master') IS NOT NULL OR to_regclass('public.inventory_uploads') IS NOT NULL OR to_regclass('public.inventory_lines') IS NOT NULL THEN RAISE EXCEPTION 'SEC03: restore refuses existing source tables'; END IF;\n SELECT payload,payload_md5"),
 ("destination:=format('pg_temp.%I','sec03_restore_'||name);", "destination:=format('public.%I',name);"),
 ("  ddl:='CREATE TEMP TABLE '||quote_ident('sec03_restore_'||name)||substr(ddl,length('CREATE TABLE '||source_name)+1)||' ON COMMIT DROP';\n", ''),
 ("   ddl:=replace(ddl,'REFERENCES public.inventory_uploads(','REFERENCES pg_temp.sec03_restore_inventory_uploads(');\n", ''),
 ("   ddl:=replace(ddl,'REFERENCES auth.users(','REFERENCES pg_temp.sec03_restore_auth_ids(');\n", ''),
 ("<>pg_my_temp_schema()", "<>'public'::regnamespace"),
 ('restore sequence is not temporary', 'restore sequence is outside approved public scope'),
 ("'restored_to_session_temporary_tables'", "'restored_legacy_owner_only'"),
 ("'business_table_writes',0", "'legacy_tables_restored',3")]
for old,new in changes:
 assert rollback.count(old)==1,old
 rollback=rollback.replace(old,new)
(root/'maintenance/sec03_restore_retired.sql').write_text(rollback)
print('Generated',paths[0].name,'and explicit owner-only recovery script')
