"""Build 99: active popup, canonical core, existing styles; synthetic IO only."""
import argparse
import importlib.util
import json
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('status98_negative99',ROOT/'tests/run-status-colors-v98.py')
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
d=c.d;f=c.f
SOURCE=(ROOT/'assets/js/task-assistant-v99.js').read_text().replace('</script','<\\/script')
OLD=(ROOT/'assets/js/task-assistant-v97.js').read_text().replace('</script','<\\/script')
def active(html):
    assert html.count(OLD)==1
    return html.replace(OLD,SOURCE)
def standard_fixture():return active(c.standard_fixture())
def units_fixture():return active(c.units_fixture())
def negative_fixture():
    html=standard_fixture()
    bootstrap=r'''
const originalRows99=rowsFor;
rowsFor=function(master){return originalRows99(master).map(row=>{
 if(row.product_code!=='B')return row;
 const found=master.some(m=>m.product_code==='B');
 return {...row,raw_quantity:-12,needs_review:true,review_reason:row.review_reason+(found?' | Negative stock requires review':'')};
});};state.rows=rowsFor(state.master);
'''
    return html.replace(SOURCE,bootstrap+SOURCE)
def badge(p,code='B'):return p.locator(f'.mr93-product[data-code="{code}"] .mr93-negative')
def set_row(p,changes,code='B'):
    p.locator('#mr93Cancel').click()
    p.evaluate('(v)=>Object.assign(state.rows.find(r=>r.product_code===v.code),v.changes)',{'code':code,'changes':changes})
    d.open_popup(p)
def raw_negative(p):
    assert badge(p).count()==1 and badge(p).inner_text()=='Negative Stock'
    assert badge(p).evaluate('(e)=>getComputedStyle(e).color')=='rgb(169, 81, 81)'
    assert p.evaluate('state.rows[1].review_reason')=='Product is not in the master'
    assert p.evaluate('state.rows[1].raw_quantity')==-12
    assert p.evaluate('calls.length')==0 and p.locator('#mr93Save').is_disabled()
def raw_source_edges(p):
    for value in [-0.25,'-12','-1e2',0,'0',10,None,'','invalid','-Infinity','-1000000000001']:
        set_row(p,{'raw_quantity':value,'review_reason':'Product is not in the master'})
        assert badge(p).count()==(1 if value in [-0.25,'-12','-1e2'] else 0),value
    set_row(p,{'raw_quantity':10,'stock_quantity':-12,'stock_percent':-99})
    assert badge(p).count()==0 and p.evaluate('calls.length')==0
def reason_dedup(p):
    set_row(p,{'review_reason':'Product is not in the master | Negative stock requires review'})
    assert badge(p).count()==1
    set_row(p,{'raw_quantity':None})
    assert badge(p).count()==1
    p.evaluate('renderTasksAssistant();window.dispatchEvent(new Event("focus"))')
    assert badge(p).count()==1 and p.evaluate('calls.length')==0
def existing_behavior(p):
    set_row(p,{'raw_quantity':-12,'review_reason':'Master purchase price is missing or zero | Negative stock requires review'},'A')
    assert badge(p,'A').count()==1 and d.field(p,'A','purchase_unit').count()==0
    set_row(p,{'review_reason':'Master purchase price is missing or zero'},'A')
    assert badge(p,'A').count()==0,'New raw-stock fallback leaked to existing-product logic'
def readonly_warning(p):
    keys=p.locator('[data-code="B"] [data-key]').evaluate_all('(es)=>es.map(e=>e.dataset.key)')
    assert keys==['purchase_unit','option_unit','factor','supplier','purchase_price','reorder_point','profitability_class']
    assert badge(p).locator('input,select,button').count()==0
    assert p.locator('[data-key="raw_quantity"],[data-key="stock_quantity"]').count()==0
    assert p.evaluate('JSON.stringify(state.rows)')==p.evaluate('JSON.stringify(rowsFor(state.master))')
def partial_save(p):
    d.field(p,'A','purchase_price').fill('25')
    d.field(p,'B','purchase_price').fill('13')
    d.field(p,'B','purchase_price').evaluate('(e)=>window.kept99=e')
    d.save(p)
    assert p.evaluate('calls[0].args.payload')==[{'product_code':'A','purchase_price':25}]
    assert d.field(p,'B','purchase_price').evaluate('(e)=>e===kept99&&e.value==="13"')
    assert badge(p).count()==1 and p.evaluate('state.rows[1].raw_quantity')==-12
    assert p.evaluate('state.taskAssistant.tasks[0].status')=='open'
def new_product_save(p):
    d.complete_b(p)
    assert p.locator('#mr93Save').is_enabled(),'Warning became an unapproved save blocker'
    d.save(p)
    payload=p.evaluate('calls[0].args.payload')
    assert payload==[{'product_code':'B','purchase_unit':'Piece','supplier':'QA Supplier','purchase_price':12.5,'reorder_point':0,'profitability_class':'Super','option_unit':None,'factor':1}]
    assert p.evaluate('state.rows[1].raw_quantity')==-12
    assert badge(p).count()==1 and p.locator('[data-code="B"]').get_attribute('data-new')=='0'
    assert p.evaluate('state.taskAssistant.tasks[0].status')=='open'
    assert p.locator('[data-code="B"] input,[data-code="B"] select').count()==0

def save_failure(p):
    d.complete_b(p);p.evaluate('window.failSave=true');d.save(p)
    assert badge(p).count()==1 and d.field(p,'B','purchase_price').input_value()=='12.5'
    assert p.evaluate('server.revision')==7 and p.evaluate('state.rows[1].raw_quantity')==-12

def refresh_failure(p):
    d.complete_b(p);p.evaluate('window.failRefresh=true');d.save(p)
    assert p.locator('#mr93Save').inner_text()=='Retry Refresh' and badge(p).count()==1
    d.save(p);assert p.evaluate('calls.length')==1
    p.evaluate('window.failRefresh=false');d.save(p)
    assert p.evaluate('calls.length')==1 and badge(p).count()==1
    assert p.evaluate('state.rows[1].raw_quantity')==-12

def expiry(p):
    d.complete_b(p);f.expire(p);f.direct_save(p)
    assert p.evaluate('calls.length')==0 and badge(p).count()==1
    assert d.field(p,'B','purchase_price').input_value()=='12.5'
    assert p.locator('#mr93Save').is_disabled()
def source_conflict(p):
    d.complete_b(p);p.evaluate('state.rows[1].raw_quantity=-10');f.recheck(p)
    assert p.locator('#mr93Save').is_disabled() and 'data changed' in c.status(p,'B').inner_text()
    f.direct_save(p);assert p.evaluate('calls.length')==0
    assert badge(p).count()==1 and d.field(p,'B','purchase_price').input_value()=='12.5'
def close_and_reopen(p):
    d.field(p,'B','purchase_price').fill('13')
    d.confirm_action(p,False,lambda:p.locator('.mr93-close').click())
    assert badge(p).count()==1 and d.field(p,'B','purchase_price').input_value()=='13'
    d.confirm_action(p,True,lambda:p.locator('#mr93Cancel').click())
    d.open_popup(p);assert badge(p).count()==1 and d.field(p,'B','purchase_price').input_value()==''
NEGATIVE_CASES=[raw_negative,raw_source_edges,reason_dedup,existing_behavior,readonly_warning,partial_save,new_product_save,save_failure,refresh_failure,expiry,source_conflict,close_and_reopen]
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--negative-only',action='store_true');args=parser.parse_args()
    groups=[('negative',negative_fixture,NEGATIVE_CASES)]
    if not args.negative_only:groups += [('colors',standard_fixture,c.COLOR_CASES),('drafts',standard_fixture,c.DRAFT_CASES),('freshness',standard_fixture,c.FRESH_CASES),('units',units_fixture,c.UNIT_CASES)]
    chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser');assert chrome
    done=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            for w,h in [(1440,1000),(390,844)]:
                for group,fixture,cases in groups:
                    html=fixture()
                    for case in cases:
                        ctx=browser.new_context(viewport={'width':w,'height':h});requests=[];errors=[]
                        ctx.route('**/*',lambda route:(requests.append(route.request.url),route.abort()))
                        p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
                        try:
                            p.set_content(html,wait_until='load');p.wait_for_function('ta16OpenTask.__mr93===true');d.open_popup(p);case(p)
                            assert not requests and not errors,(requests,errors)
                            done.append(f'{w}: {group}/{case.__name__}');print('PASS '+done[-1],flush=True)
                        finally:ctx.close()
        finally:browser.close()
    print(json.dumps({'browser_scenarios':len(done),'new_negative_scenarios':24,'prior_scenarios':len(done)-24,'runtime':'task-assistant-v99.js','stylesheet':'task-assistant-v98.css','production_requests':0}))
if __name__=='__main__':main()
