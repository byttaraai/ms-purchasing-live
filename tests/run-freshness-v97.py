"""Build 97: actual popup runtime, canonical freshness policy, synthetic IO only."""
import argparse
import importlib.util
import json
import os
import re
import shutil
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('draft95',ROOT/'tests/run-popup-drafts-v95.py')
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
if os.environ.get('FRESH97_POLICY_FILE'):
    policy=Path(os.environ['FRESH97_POLICY_FILE']).read_text()
else:
    html=(ROOT/'index.html').read_text()
    policy=next(line for line in html.splitlines() if line.startswith('function inventoryFreshnessFor('))
d.BOOTSTRAP+='\n'+policy+r'''
window.now97=Date.now();Date.now=()=>window.now97;
window.freshUpload97={id:'synthetic-upload',status:'completed',is_complete:true,excludes_zero:true,uploaded_at:new Date(now97).toISOString()};
state.upload=structuredClone(freshUpload97);
window.inventoryOpened97=0;
const uploadButton97=document.createElement('button');uploadButton97.id='inventoryLockUpload';
uploadButton97.onclick=()=>{window.inventoryOpened97++;};document.body.append(uploadButton97);
function updateInventoryLock(){}
'''
field=d.field

def recheck(p):p.evaluate("window.dispatchEvent(new Event('focus'))")
def expire(p):
    p.evaluate('window.now97=Date.parse(freshUpload97.uploaded_at)+48*3600000')
    recheck(p)
def direct_save(p):p.evaluate('document.getElementById("mr93Save").onclick()')
def expiry(p):
    field(p,'A','purchase_price').fill('25')
    field(p,'B','purchase_price').fill('13')
    field(p,'B','purchase_price').evaluate('(e)=>window.keep97=e')
    expire(p)
    assert p.locator('#mr93Save').is_disabled(),'Expired popup still allows saving'
    direct_save(p)
    assert p.evaluate('calls.length')==0
    assert field(p,'B','purchase_price').evaluate('(e)=>e===window.keep97&&e.value==="13"')
    assert d.is_open(p) and not p.locator('#mr97Freshness').evaluate('(e)=>e.hidden')
def policy_edges(p):
    field(p,'A','purchase_price').fill('25')
    for delta,allowed in [(0,True),(48*3600000-1,True),(48*3600000,False),(48*3600000+1,False),(96*3600000,False),(-1000,True)]:
        p.evaluate('(delta)=>{state.upload=structuredClone(freshUpload97);window.now97=Date.parse(state.upload.uploaded_at)+delta}',delta)
        recheck(p);assert p.locator('#mr93Save').is_enabled()==allowed,(delta,allowed)
    invalid=[None,{'status':'failed'},{'is_complete':False},{'excludes_zero':False},{'uploaded_at':None},{'uploaded_at':'bad-date'}]
    for change in invalid:
        p.evaluate('(change)=>{state.upload=change===null?null:{...freshUpload97,...change};window.now97=Date.parse(freshUpload97.uploaded_at)}',change)
        recheck(p);assert p.locator('#mr93Save').is_disabled(),change
        direct_save(p);assert p.evaluate('calls.length')==0
    p.evaluate("state.upload={...freshUpload97,uploaded_at:null,snapshot_date:new Date(now97).toISOString().slice(0,10)}")
    recheck(p);assert p.locator('#mr93Save').is_enabled(),'Legacy dated snapshot no longer follows canonical fallback'
def idle_expiry(p):
    field(p,'A','purchase_price').fill('25')
    field(p,'B','option_unit').select_option('Piece')
    field(p,'B','factor').press_sequentially('1e')
    assert field(p,'B','factor').evaluate('(e)=>e.validity.badInput')
    field(p,'B','factor').evaluate('(e)=>window.keep97=e')
    p.evaluate('window.now97=Date.parse(freshUpload97.uploaded_at)+48*3600000')
    p.wait_for_timeout(1200)
    assert p.locator('#mr93Save').is_disabled()
    assert field(p,'B','factor').evaluate('(e)=>e===keep97&&e.validity.badInput')
    assert p.evaluate('calls.length')==0

def visibility_expiry(p):
    field(p,'A','purchase_price').fill('25')
    p.evaluate("window.now97+=48*3600000;document.dispatchEvent(new Event('visibilitychange'))")
    assert p.locator('#mr93Save').is_disabled()

def imperative_guard(p):
    field(p,'A','purchase_price').fill('25')
    p.evaluate('window.now97+=48*3600000')
    direct_save(p);assert p.evaluate('calls.length')==0
    assert field(p,'A','purchase_price').input_value()=='25'

def fresh_success(p):
    field(p,'A','purchase_price').fill('25')
    field(p,'B','purchase_price').fill('13')
    d.save(p)
    assert p.evaluate('calls[0].args.payload')==[{'product_code':'A','purchase_price':25}]
    assert p.evaluate('state.revision')==8 and p.evaluate('state.taskAssistant.tasks[0].status')=='open'
    assert field(p,'B','purchase_price').input_value()=='13'

def fresh_failure(p):
    field(p,'A','purchase_price').fill('25');p.evaluate('window.failSave=true')
    d.save(p)
    assert field(p,'A','purchase_price').input_value()=='25'
    assert p.locator('#mr93Save').is_enabled()
    assert p.evaluate('server.revision')==7

def server_reject(p):
    field(p,'A','purchase_price').fill('25')
    p.evaluate("rpc=async(name,args)=>{calls.push({name,args});throw Error('INVENTORY_REFRESH_REQUIRED: server snapshot expired');};void 0")
    d.save(p)
    assert p.locator('#mr93Save').is_disabled()
    assert field(p,'A','purchase_price').input_value()=='25'
    direct_save(p);assert p.evaluate('calls.length')==1
    p.evaluate('window.now97-=3600000');recheck(p)
    assert p.locator('#mr93Save').is_disabled(),'Client clock bypassed a server freshness rejection'

def refresh_after_expiry(p):
    field(p,'A','purchase_price').fill('25');field(p,'B','purchase_price').fill('13')
    p.evaluate('window.failRefresh=true');d.save(p);expire(p)
    assert p.locator('#mr93Save').inner_text()=='Retry Refresh'
    assert p.locator('#mr93Save').is_enabled()
    d.save(p);assert p.evaluate('calls.length')==1
    p.evaluate('window.failRefresh=false');d.save(p)
    assert p.evaluate('calls.length')==1 and field(p,'B','purchase_price').input_value()=='13'
    assert p.locator('#mr93Save').is_disabled()

def pause_reopen(p):
    field(p,'A','purchase_price').fill('25')
    field(p,'A','purchase_price').evaluate('(e)=>window.keep97=e')
    expire(p);p.locator('#mr97Pause').click()
    assert not d.is_open(p) and p.evaluate('inventoryOpened97')==1
    d.open_popup(p)
    assert d.is_open(p) and field(p,'A','purchase_price').evaluate('(e)=>e===keep97&&e.value==="25"')
    assert p.locator('#mr93Save').is_disabled()
    d.confirm_action(p,False,lambda:p.locator('#mr93Cancel').click())
    assert d.is_open(p)

def changed_cycle(p):
    field(p,'A','purchase_price').fill('25');expire(p);p.locator('#mr97Pause').click()
    p.evaluate("state.upload={...freshUpload97,id:'new-upload',uploaded_at:new Date(now97).toISOString()};state.taskAssistant.tasks[0].task_key='new-task'")
    d.open_popup(p)
    assert field(p,'A','purchase_price').input_value()=='25'
    assert p.locator('#mr93Save').is_disabled()
    direct_save(p);assert p.evaluate('calls.length')==0

def already_stale_open(p):
    p.locator('#mr93Cancel').click();expire(p);d.open_popup(p)
    field(p,'A','purchase_price').fill('25')
    assert p.locator('#mr93Save').is_disabled() and p.evaluate('calls.length')==0

def pending_busy(p):
    field(p,'A','purchase_price').fill('25');p.evaluate('window.delaySave=true')
    p.evaluate('document.getElementById("mr93Save").onclick();void 0')
    expire(p)
    assert p.locator('#mr97Pause').is_disabled() and p.locator('#mr93Cancel').is_disabled()
    direct_save(p);assert p.evaluate('calls.length')==1
    p.evaluate('window.releaseSave()');p.wait_for_timeout(100)
    assert p.evaluate('calls.length')==1

def missing_helper(p):
    field(p,'A','purchase_price').fill('25');p.evaluate('inventoryFreshnessFor=undefined');recheck(p)
    assert p.locator('#mr93Save').is_disabled()
    direct_save(p);assert p.evaluate('calls.length')==0

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--prior-drafts',action='store_true');parser.add_argument('--module',default='task-assistant-v97.js');parser.add_argument('--case',default='');args=parser.parse_args()
    if args.prior_drafts:
        sys.argv=[sys.argv[0],'--module',args.module];d.main();return
    cases=[expiry,policy_edges,idle_expiry,visibility_expiry,imperative_guard,fresh_success,fresh_failure,server_reject,refresh_after_expiry,pause_reopen,changed_cycle,already_stale_open,pending_busy,missing_helper]
    if args.case:cases=[c for c in cases if c.__name__==args.case]
    chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser');assert chrome
    passed=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'])
        try:
            for width,height in [(1440,1000),(390,844)]:
                for case in cases:
                    context=browser.new_context(viewport={'width':width,'height':height});requests=[]
                    context.route('**/*',lambda r:(requests.append(r.request.url),r.abort()))
                    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                    try:
                        page.set_content(d.fixture(args.module),wait_until='load');page.wait_for_function('window.ta16OpenTask.__mr93===true');d.open_popup(page);case(page)
                        assert not errors,errors;assert not requests,requests
                        passed.append(f'{width}: {case.__name__}');print('PASS '+passed[-1],flush=True)
                    finally:context.close()
        finally:browser.close()
    print(json.dumps({'browser_scenarios':len(passed),'module':args.module,'production_requests':0}))
if __name__=='__main__':main()
