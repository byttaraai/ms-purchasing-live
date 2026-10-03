"""TASK01: exact production functions on isolated Postgres 17.6; never production IO."""
import json
import os
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]
if os.environ.get('TASK01_ISOLATED')!='1':
    raise SystemExit('Use only the ephemeral localhost CI database with TASK01_ISOLATED=1')
# Ignore inherited Postgres connection settings; no external host or secret accepted.
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
env['PGPASSWORD']='synthetic-task01'
args=['psql','-X','-v','ON_ERROR_STOP=1','-At','-h','127.0.0.1','-p','5432','-U','postgres','-d','task01_test']
def run(sql,ok=True):
    result=subprocess.run(args,input=sql,text=True,capture_output=True,env=env,timeout=90)
    if (result.returncode==0)!=ok:
        raise RuntimeError(result.stdout+'\n'+result.stderr)
    return result.stdout

def j(value):return "'"+json.dumps(value,ensure_ascii=True).replace("'","''")+"'::jsonb"
def literal(value):return "'"+value.replace("'","''")+"'"
source=(ROOT/'supabase/migrations/20260926163215_build89_profit_recovery_two_bands.sql').read_text()
def extract(name):
    match=re.search(r'CREATE OR REPLACE FUNCTION '+re.escape(name)+r'\([\s\S]*?\$function\$;',source)
    assert match,name
    return match.group(0)
old=extract('purchasing_private.recovered_v47')
caller=extract('purchasing_private.workspace_sync_v47')
paths=list((ROOT/'supabase/migrations').glob('*_task01_nonblocking_attention_completion.sql'))
assert len(paths)==1,paths
migration=paths[0].read_text()
oldguard=re.search(r'old_guard constant text := \$old\$([\s\S]*?)\$old\$',migration).group(1)
newguard=re.search(r'new_guard constant text := \$new\$([\s\S]*?)\$new\$',migration).group(1)
assert old.count(oldguard)==1
updated=old.replace(oldguard,newguard)
price='Master purchase price is missing or zero'
rating='Profitability classification is missing'
allowed=[price,rating,price+' | '+rating,rating+' | '+price]
base={'product_code':'A','purchase_unit':'Box','raw_unit':'Piece','conversion_role':'option','factor':12,'reorder_point':100,'stock_origin':'reported','stock_qty':10,'stock_ratio':10,'min_order_qty':110,'supplier':'QA Supplier','needs_review':False,'blocking_review':False,'review_reason':None,'purchase_price':20,'profitability_class':'High'}
current={**base,'stock_qty':150,'stock_ratio':150,'min_order_qty':0}
checks=[]
focuses=['suppliers','profit_recovery','profit_recovery_80_150','shortage_mid']
def pure(label,row,expected,focus='suppliers',before=None,baseline=base,codes=None):
    task={'focus':focus,'codes':['A'] if codes is None else codes,'target':'QA Supplier'}
    b={} if baseline is None else {'A':baseline}
    r={} if row is None else {'A':row}
    checks.append('SELECT qa.check('+literal(label)+', purchasing_private.recovered_v47('+','.join(map(j,[task,b,r]))+') IS NOT DISTINCT FROM '+str(expected).lower()+');')
    if before is not None:
        checks.append('SELECT qa.check('+literal('baseline/'+label)+', qa.recovered_before('+','.join(map(j,[task,b,r]))+') IS NOT DISTINCT FROM '+str(before).lower()+');')
for focus in focuses:
    pure(focus+'/clean',current,True,focus,before=True)
    for i,reason in enumerate(allowed):
        row={**current,'needs_review':True,'review_reason':reason,'purchase_price':None,'profitability_class':None}
        pure(focus+'/approved-'+str(i),row,True,focus,before=False)
    for reason in ['Supplier is not assigned',price+' | Supplier is not assigned',rating+' | Negative stock','Unknown future issue','',None]:
        pure(focus+'/unapproved-'+str(reason),{**current,'needs_review':True,'review_reason':reason},False,focus,before=False)
    row={**current,'needs_review':True,'review_reason':price}
    for key,val in [('blocking_review',True),('blocking_review',None),('needs_review',None),('stock_qty',10),('stock_qty',9),('stock_qty',None),('stock_origin','inferred_zero'),('purchase_unit','Piece'),('raw_unit','Box'),('conversion_role','purchase'),('factor',24),('reorder_point',50)]:
        pure(focus+'/guard-'+key+'-'+str(val),{**row,key:val},False,focus)
    pure(focus+'/missing-baseline',row,False,focus,baseline=None)
    pure(focus+'/missing-current',None,False,focus)
    pure(focus+'/empty-targets',row,False,focus,codes=[])
    threshold={'profit_recovery':80,'profit_recovery_80_150':150,'shortage_mid':50}.get(focus)
    if threshold is not None:
        pure(focus+'/below-threshold',{**row,'stock_ratio':threshold-0.001},False,focus)
        pure(focus+'/at-threshold',{**row,'stock_ratio':threshold},True,focus)
pure('suppliers/wrong-owner',{**current,'needs_review':True,'review_reason':price,'supplier':'Other'},False)
pure('suppliers/order-still-required',{**current,'needs_review':True,'review_reason':price,'min_order_qty':1},False)
for f in ['data','aging30','shortage_low','unknown']:
    pure('unsupported/'+f,{**current,'needs_review':True,'review_reason':price},False,f)
for passed in [True,False]:
    a={**current,'needs_review':True,'review_reason':price}
    b={**a,'product_code':'B','blocking_review':not passed}
    checks.append('SELECT qa.check('+literal('all-targets/'+str(passed))+', purchasing_private.recovered_v47('+','.join(map(j,[{'focus':'suppliers','codes':['A','B'],'target':'QA Supplier'},{'A':base,'B':{**base,'product_code':'B'}},{'A':a,'B':b}]))+') IS NOT DISTINCT FROM '+str(passed).lower()+');')

integrations=[]
def integrated(name,mode='',row=None,expect=1,focuslist=None,extra=''):
    r=row or {**current,'needs_review':True,'review_reason':price+' | '+rating,'purchase_price':None,'profitability_class':None}
    fs=focuslist or ['suppliers']
    integrations.append('DO $case$ DECLARE p jsonb; n integer; BEGIN\n'
      +'p:=qa.reset_case('+j(r)+','+j(base)+','+literal(mode)+',ARRAY['+','.join(map(literal,fs))+']);\n'
      +'PERFORM purchasing_private.workspace_sync_v47(p);\n'
      +'PERFORM qa.check('+literal('integration/'+name+'/completion')+', (SELECT count(*)='+str(expect)+' FROM public.purchasing_tasks_v5 WHERE task_key LIKE \'old-%\' AND status=\'completed\'));\n'
      +'PERFORM qa.check('+literal('integration/'+name+'/badge')+', (SELECT count(*)='+str(1 if expect else 0)+' FROM public.purchasing_badges_v5));\n'
      +'PERFORM qa.check('+literal('integration/'+name+'/repeat')+', (SELECT count(*)='+str(1 if expect else 0)+' FROM purchasing_private.stock_outcomes_v47));\n'
      +'PERFORM purchasing_private.workspace_sync_v47(p);\n'
      +'PERFORM qa.check('+literal('integration/'+name+'/no-duplicate')+', (SELECT count(*)='+str(1 if expect else 0)+' FROM public.purchasing_badges_v5));\n'
      +'PERFORM qa.check('+literal('integration/'+name+'/review-retained')+', (SELECT (value->\'rows\'->0)= '+j(r)+' FROM qa.dashboard));\n'
      +'PERFORM qa.check('+literal('integration/'+name+'/master-review-open')+', EXISTS(SELECT 1 FROM public.purchasing_tasks_v5 WHERE focus=\'data\' AND status=\'open\' AND task_key=\'data|qa\'));\n'
      +extra+'\nEND; $case$;')
for f in focuses:integrated(f,focuslist=[f])
integrated('overlapping-targets',focuslist=focuses,expect=4)
for mode in ['late','same_upload','no_evidence','other_owner','closed','already_expired']:
    integrated(mode,mode=mode,expect=0)
integrated('at-deadline',mode='at_deadline')
integrated('unconfirmed-stock',row={**current,'needs_review':True,'review_reason':price,'stock_origin':'inferred_zero'},expect=0)
integrated('no-stock-increase',row={**current,'needs_review':True,'review_reason':price,'stock_qty':10},expect=0)
integrated('reorder-edit',row={**current,'needs_review':True,'review_reason':price,'reorder_point':50},expect=0)
integrated('data-attention-not-approved',row={**current,'needs_review':True,'review_reason':'Supplier is not assigned'},expect=0)
integrated('blocking-review',row={**current,'needs_review':True,'review_reason':price+' | Negative stock','blocking_review':True},expect=0)

setup=(ROOT/'tests/fixtures/recovery-attention-task01.sql').read_text()
header='BEGIN;\n'+setup+'\n'+old+'\n'+caller+'\n'+old.replace('purchasing_private.recovered_v47','qa.recovered_before',1)+"\nREVOKE ALL ON FUNCTION purchasing_private.recovered_v47(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;\n"
header+="SELECT qa.check('exact-live-recovery-baseline', md5(pg_get_functiondef('purchasing_private.recovered_v47(jsonb,jsonb,jsonb)'::regprocedure))='8ecdc2f27ccdfbb7d94540785b7d6272');\n"
header+="SELECT qa.check('exact-live-caller', md5(pg_get_functiondef('purchasing_private.workspace_sync_v47(jsonb)'::regprocedure))='eb380cfb73e4f8be842e60b60713e535');\n"
# Source drift and duplicate application fail closed; the original can be restored.
tail="""
SELECT qa.check('ACL-not-widened', NOT has_function_privilege('authenticated','purchasing_private.recovered_v47(jsonb,jsonb,jsonb)','EXECUTE') AND NOT has_function_privilege('anon','purchasing_private.recovered_v47(jsonb,jsonb,jsonb)','EXECUTE'));
SELECT qa.check('caller-still-exact', md5(pg_get_functiondef('purchasing_private.workspace_sync_v47(jsonb)'::regprocedure))='eb380cfb73e4f8be842e60b60713e535');
"""
# A failed migration is contained in a subtransaction. Never replay old migrations on production.
tail+='DO $repeat$ BEGIN BEGIN EXECUTE '+literal(migration)+"; RAISE EXCEPTION 'repeat unexpectedly accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'TASK01: source drift%' THEN RAISE; END IF; END; PERFORM qa.check('migration-repeat-rejected',true); END; $repeat$;\n"
tail+=old+"\nSELECT qa.check('rollback-exact', md5(pg_get_functiondef('purchasing_private.recovered_v47(jsonb,jsonb,jsonb)'::regprocedure))='8ecdc2f27ccdfbb7d94540785b7d6272');\n"+migration
sql=header+migration+'\n'+'\n'.join(checks+integrations)+'\n'+tail+"\nSELECT jsonb_build_object('checks',count(*),'failed',count(*) FILTER (WHERE NOT passed),'integration_scenarios',17,'production_requests',0) FROM qa.results;\nROLLBACK;"
output=run(sql)
print('\n'.join(line for line in output.splitlines() if line.startswith('{')))
print('PASS: exact production recovery and caller, synthetic data, rollback/reapply, no production requests')
