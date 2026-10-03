"""TASK02: actual validator/caller and frontend payload on isolated PostgreSQL only."""
import json, os, re, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
if os.environ.get('TASK02_ISOLATED')!='1':
    raise SystemExit('Requires ephemeral localhost TASK02_ISOLATED=1')
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env['PGPASSWORD']='synthetic-task01'
args=['psql','-X','-v','ON_ERROR_STOP=1','-At','-h','127.0.0.1','-p','5432','-U','postgres','-d','task01_test']
def lit(s):return "'"+s.replace("'","''")+"'"
def j(v):return lit(json.dumps(v,ensure_ascii=True))+'::jsonb'
source=(ROOT/'supabase/migrations/20260926163215_build89_profit_recovery_two_bands.sql').read_text()
def extract(name):
    m=re.search(r'CREATE OR REPLACE FUNCTION '+re.escape(name)+r'\([\s\S]*?\$function\$;',source)
    assert m,name
    return m.group(0)
validator=extract('purchasing_private.workspace_validate_payload_v60')
caller=extract('purchasing_private.workspace_sync_v47')
recovery=extract('purchasing_private.recovered_v47')
paths=list((ROOT/'supabase/migrations').glob('*_task02_profit_recovery_range.sql'));assert len(paths)==1
migration=paths[0].read_text()
task01=list((ROOT/'supabase/migrations').glob('*_task01_nonblocking_attention_completion.sql'));assert len(task01)==1
setup=(ROOT/'tests/fixtures/recovery-attention-task01.sql').read_text()
fixture=json.loads(Path('/tmp/task02-payloads.json').read_text())
task={'focus':'profit_recovery_80_150','task_key':'recovery|profit-80-150','badge_type':'profit_recovery','badge_label':'Profit Protector','priority':1,'score_impact':0,'target_count':1,'codes':['A'],'title':'QA upper recovery'}
base={'product_code':'A','purchase_unit':'Piece','factor':1,'stock_qty':125,'raw_quantity':125,'stock_ratio':125,'reorder_point':100,'min_order_qty':0,'max_order_qty':75,'stock_origin':'reported','raw_unit':'Piece','conversion_role':'purchase','supplier':'QA Supplier','profitability_class':'Super','blocking_review':False,'needs_review':False,'review_reason':None,'purchase_price':20}
checks=[]
def check(label,expr):checks.append('SELECT qa.check('+lit(label)+','+expr+');')
def payload(t):return {'logic_version':'reactive_v1','score_model':'commercial_v3','score':63,'bo_level':5,'tasks':[t]}
def allow(label,r,expected=True,t=task,cycles=None):
    p=payload(t);d={'rows':[r]}
    check(label,'qa.allowed('+','.join(map(j,[p,d,cycles or {}]))+') IS NOT DISTINCT FROM '+str(expected).lower())
for ratio in [9.999,10,79.999,80,119.999,120,120.001,149.999,150,150.001,200]:
    for rating in ['Super','High','Medium','Low','Loss']:
        allow(str(ratio)+'/'+rating,{**base,'stock_ratio':ratio,'stock_qty':ratio,'raw_quantity':ratio,'min_order_qty':max(0,120-ratio),'profitability_class':rating},80<=ratio<150 and rating in ['Super','High'])
for key,val in [('min_order_qty',None),('min_order_qty',-1),('blocking_review',True),('blocking_review',None),('stock_ratio',None)]:
    allow('invalid/'+key+'/'+str(val),{**base,key:val},False)
allow('min-zero-below120',{**base,'stock_ratio':119.99},False)
allow('missing-min',{k:v for k,v in base.items() if k!='min_order_qty'},False)
allow('missing-blocker',{k:v for k,v in base.items() if k!='blocking_review'},False)
allow('attention-retained',{**base,'needs_review':True,'review_reason':'Master purchase price is missing or zero','purchase_price':None})
allow('accepted-excluded',base,False,cycles={'A':{'justification':{'status':'accepted'}}})
for focus,key in [('profit_recovery','recovery|profit'),('suppliers','supplier|QA Supplier'),('shortage_mid','recovery|10-50')]:
    badge={'profit_recovery':('profit_recovery','Profit Protector'),'suppliers':('supplier_closer','Supplier Closer'),'shortage_mid':('stock_recovery','Recovery Specialist')}[focus]
    t={**task,'focus':focus,'task_key':key,'target':'QA Supplier','badge_type':badge[0],'badge_label':badge[1]}
    allow(focus+'/zero-min-excluded',base,False,t=t)
    allow(focus+'/normal-unchanged',{**base,'stock_qty':20,'stock_ratio':20,'min_order_qty':100},True,t=t)
check('actual-frontend-payload-accepted','qa.allowed('+','.join(map(j,[fixture['payload'],fixture['dataset'],fixture['cycles']]))+')')
# Exact caller persists actual new targets, without immediate completion/badges.
integrations=[]
for final in [149.999,150]:
    d=fixture['dataset'];p=fixture['payload'];rows=d['rows']
    block='DO $journey$ DECLARE d jsonb:='+j(d)+'; p jsonb:='+j(p)+'; u jsonb; BEGIN\n'
    block+='TRUNCATE public.purchasing_tasks_v5,public.purchasing_task_cycles_v5,public.purchasing_badges_v5,purchasing_private.task_evidence_v47,purchasing_private.stock_outcomes_v47,public.purchasing_score_history_v5,qa.dashboard;\n'
    block+="UPDATE public.purchasing_meta_v5 SET master_revision=(p->>'master_revision')::integer;\n"
    block+="u:=jsonb_build_object('id',d->'upload'->'id','uploaded_at',now()-interval '1 hour','is_complete',true,'excludes_zero',true); d:=jsonb_set(d,'{upload}',u); INSERT INTO qa.dashboard VALUES(d);\n"
    block+="PERFORM purchasing_private.workspace_validate_payload_v60(p,d,'{}'); PERFORM purchasing_private.workspace_sync_v47(p);\n"
    block+="PERFORM qa.check('journey/"+str(final)+"/open',EXISTS(SELECT 1 FROM public.purchasing_tasks_v5 WHERE focus='profit_recovery_80_150' AND status='open' AND target_count=3));\n"
    block+="PERFORM qa.check('journey/"+str(final)+"/no-early-badge',(SELECT count(*)=0 FROM public.purchasing_badges_v5));\n"
    updated=[{**r,'stock_qty':final,'stock_ratio':final,'raw_quantity':final,'min_order_qty':0,'max_order_qty':200-final} for r in rows]
    block+="u:=jsonb_build_object('id',gen_random_uuid(),'uploaded_at',now(),'is_complete',true,'excludes_zero',true); d:=jsonb_set(jsonb_set(d,'{upload}',u),'{rows}',"+j(updated)+"); UPDATE qa.dashboard SET value=d; p:=jsonb_set(jsonb_set(p,'{upload_id}',u->'id'),'{tasks}','[]'); PERFORM purchasing_private.workspace_sync_v47(p);\n"
    exp=1 if final==150 else 0
    block+="PERFORM qa.check('journey/"+str(final)+"/completion',(SELECT count(*)="+str(exp)+" FROM public.purchasing_tasks_v5 WHERE focus='profit_recovery_80_150' AND status='completed'));\n"
    block+="PERFORM purchasing_private.workspace_sync_v47(p); PERFORM qa.check('journey/"+str(final)+"/dedup',(SELECT count(*)="+str(exp)+" FROM public.purchasing_badges_v5));\nEND; $journey$;"
    integrations.append(block)
header='BEGIN;\n'+setup+'\n'+validator+'\n'+caller+'\n'+recovery+'\n'
header+="REVOKE ALL ON FUNCTION purchasing_private.workspace_validate_payload_v60(jsonb,jsonb,jsonb),purchasing_private.recovered_v47(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;\n"
header+=task01[0].read_text()+"\nSELECT qa.check('validator-baseline',md5(pg_get_functiondef('purchasing_private.workspace_validate_payload_v60(jsonb,jsonb,jsonb)'::regprocedure))='c887efef714a3578d53e8db967019440');\n"
header+="CREATE FUNCTION qa.allowed(p jsonb,d jsonb,c jsonb) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN PERFORM purchasing_private.workspace_validate_payload_v60(p,d,c); RETURN true; EXCEPTION WHEN OTHERS THEN RETURN false; END; $$;\n"
header+="SELECT set_config('qa.uid','00000000-0000-0000-0000-000000000001',true),set_config('qa.role','admin',true);\n"
header+="SELECT qa.check('before-rejects-new-band',NOT qa.allowed("+','.join(map(j,[payload(task),{'rows':[base]},{}]))+"));\n"
tail="SELECT qa.check('caller-unchanged',md5(pg_get_functiondef('purchasing_private.workspace_sync_v47(jsonb)'::regprocedure))='eb380cfb73e4f8be842e60b60713e535');\nSELECT qa.check('TASK01-unchanged',md5(pg_get_functiondef('purchasing_private.recovered_v47(jsonb,jsonb,jsonb)'::regprocedure))='16742434fd89dc063030d17fb04e7184');\n"
tail+="SELECT qa.check('private-ACL',NOT has_function_privilege('authenticated','purchasing_private.workspace_validate_payload_v60(jsonb,jsonb,jsonb)','EXECUTE') AND NOT has_function_privilege('anon','purchasing_private.workspace_validate_payload_v60(jsonb,jsonb,jsonb)','EXECUTE'));\n"
tail+="DO $again$ BEGIN BEGIN EXECUTE "+lit(migration)+"; RAISE EXCEPTION 'repeat accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'TASK02: source drift%' THEN RAISE; END IF; END; PERFORM qa.check('repeat-rejected',true); END; $again$;\n"
tail+=validator+"\nSELECT qa.check('rollback-exact',md5(pg_get_functiondef('purchasing_private.workspace_validate_payload_v60(jsonb,jsonb,jsonb)'::regprocedure))='c887efef714a3578d53e8db967019440');\n"+migration
sql=header+migration+'\n'+'\n'.join(checks+integrations)+tail+"\nSELECT jsonb_build_object('checks',count(*),'failed',count(*) FILTER(WHERE NOT passed),'production_requests',0) FROM qa.results; ROLLBACK;"
result=subprocess.run(args,input=sql,text=True,capture_output=True,env=env,timeout=90)
if result.returncode:raise RuntimeError(result.stdout+'\n'+result.stderr)
print('\n'.join(s for s in result.stdout.splitlines() if s.startswith('{')))
