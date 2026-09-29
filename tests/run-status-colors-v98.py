"""Build 98: real v97 popup + CSS-only change. Synthetic IO; no production access."""
import importlib.util
import json
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
f=load('fresh97_status98','tests/run-freshness-v97.py')
u=load('units96_status98','tests/run-units-v96.py')
d=f.d
CSS=(ROOT/'assets/css/task-assistant-v98.css').read_text()
GRAY='rgb(111, 119, 137)';GREEN='rgb(67, 128, 94)';AMBER='rgb(139, 107, 67)';RED='rgb(167, 80, 80)'
def styled(html):
    return html.replace('</head>','<style id="status98Styles">'+CSS+'</style></head>')
def standard_fixture():return styled(d.fixture('task-assistant-v97.js'))
def units_fixture():
    html=u.fixture()
    old=(ROOT/'assets/js/task-assistant-v96.js').read_text().replace('</script','<\\/script')
    new=(ROOT/'assets/js/task-assistant-v97.js').read_text().replace('</script','<\\/script')
    assert html.count(old)==1
    bootstrap=f.policy+"\nstate.upload={id:'synthetic-fresh-unit-upload',status:'completed',is_complete:true,excludes_zero:true,uploaded_at:new Date().toISOString()};\n"
    return styled(html.replace(old,bootstrap+new))
def status(p,code):return p.locator(f'.mr93-product[data-code="{code}"] .mr93-row-state')
def color(p,code):return status(p,code).evaluate('(e)=>getComputedStyle(e).color')
def has_saved(p,code):return p.locator(f'.mr93-product[data-code="{code}"]').get_attribute('data-saved95')=='1'
def empty_existing(p):
    assert 'No values entered' in status(p,'A').inner_text()
    assert color(p,'A')==GRAY and p.locator('#mr93Save').is_disabled()
def required_new(p):
    assert color(p,'B')==AMBER
    d.field(p,'B','purchase_price').fill('13')
    assert color(p,'B')==AMBER and not has_saved(p,'B')
    assert p.locator('#mr93Save').is_disabled() and p.evaluate('calls.length')==0
def ready_transition(p):
    d.field(p,'A','purchase_price').fill('25')
    assert color(p,'A')==GREEN and p.locator('#mr93Save').is_enabled()
    assert not has_saved(p,'A') and status(p,'A').inner_text()=='Ready to save'
    d.field(p,'A','purchase_price').fill('')
    assert color(p,'A')==GRAY and p.locator('#mr93Save').is_disabled()
def invalid_transition(p):
    d.field(p,'A','purchase_price').fill('-1')
    assert color(p,'A')==RED and p.locator('#mr93Save').is_disabled()
    d.field(p,'A','purchase_price').fill('1000000000001')
    assert color(p,'A')==RED
    d.field(p,'A','purchase_price').fill('25')
    assert color(p,'A')==GREEN
    d.field(p,'A','purchase_price').fill('');d.field(p,'A','purchase_price').press_sequentially('1e')
    assert color(p,'A')==RED and p.evaluate('calls.length')==0
def saved_and_partial_new(p):
    d.field(p,'A','purchase_price').fill('25');d.field(p,'B','purchase_price').fill('13')
    d.field(p,'B','purchase_price').evaluate('(e)=>window.keep98=e');d.save(p)
    assert has_saved(p,'A') and color(p,'A')==GREEN
    assert color(p,'B')==AMBER and d.field(p,'B','purchase_price').evaluate('(e)=>e===keep98&&e.value==="13"')
    assert p.evaluate('calls[0].args.payload')==[{'product_code':'A','purchase_price':25}]
    assert p.evaluate('task.status')=='open'
def partial_existing(p):
    p.locator('#mr93Cancel').click()
    p.evaluate('state.master[0].supplier=null;server.master=structuredClone(state.master);state.rows=rowsFor(state.master)')
    d.open_popup(p);d.field(p,'A','purchase_price').fill('25');d.save(p)
    assert d.field(p,'A','supplier').count()==1 and d.field(p,'A','purchase_price').count()==0
    assert color(p,'A')==GRAY and not has_saved(p,'A')
    assert p.evaluate('state.rows.find(r=>r.product_code==="A").needs_review')
def save_failure(p):
    p.evaluate('window.failSave=true');d.field(p,'A','purchase_price').fill('25');d.save(p)
    assert not has_saved(p,'A') and color(p,'A')==GREEN
    assert 'could not be confirmed' in p.locator('#mr93Feedback').inner_text()
    assert d.field(p,'A','purchase_price').input_value()=='25' and p.evaluate('server.revision')==7
def source_changed(p):
    d.field(p,'A','purchase_price').fill('25')
    p.evaluate('state.rows.find(r=>r.product_code==="A").raw_quantity=11');f.recheck(p)
    assert color(p,'A')==GRAY and 'data changed' in status(p,'A').inner_text()
    assert p.locator('#mr93Save').is_disabled() and d.field(p,'A','purchase_price').input_value()=='25'
def unit_requirement(p):
    d.field(p,'B','purchase_unit').select_option('Piece');d.field(p,'B','option_unit').select_option('Piece')
    assert color(p,'B')==AMBER and 'Factor' in status(p,'B').inner_text()
    d.field(p,'B','factor').fill('0');assert color(p,'B')==RED
    d.field(p,'B','factor').fill('1');assert color(p,'B')==GREEN
    assert d.field(p,'B','factor').input_value()=='1'
def busy_request(p):
    d.field(p,'A','purchase_price').fill('25');p.evaluate('window.delaySave=true;document.getElementById("mr93Save").onclick();void 0')
    assert color(p,'A')==GRAY and not has_saved(p,'A')
    assert p.locator('#mr93Save').is_disabled()
    p.evaluate('window.releaseSave()');p.wait_for_function('document.getElementById("masterReviewDialog93").getAttribute("aria-busy")==="false"')
    assert color(p,'A')==GREEN and has_saved(p,'A')
def saved_pending(p):
    p.evaluate('window.failRefresh=true');d.field(p,'A','purchase_price').fill('25');d.save(p)
    assert has_saved(p,'A') and color(p,'A')==GREEN
    assert p.locator('#mr93Save').inner_text()=='Retry Refresh'
    d.save(p);assert p.evaluate('calls.length')==1
    assert color(p,'B')==AMBER

def expiry_warning(p):
    d.field(p,'A','purchase_price').fill('25');f.expire(p)
    assert color(p,'A')==AMBER and p.locator('#mr93Save').is_disabled()
    assert p.locator('#mr97Freshness > span').evaluate('(e)=>getComputedStyle(e).color')==AMBER
    f.direct_save(p);assert p.evaluate('calls.length')==0
    assert d.field(p,'A','purchase_price').input_value()=='25'
def geometry_and_scope(p):
    d.field(p,'A','purchase_price').fill('25')
    p.evaluate("const outside=document.createElement('div');outside.id='outside98';outside.innerHTML='<span class=mr93-row-state>Other interface</span>';document.body.append(outside)")
    snapshot="""()=>({state:JSON.stringify(state),calls:JSON.stringify(calls),buttons:[...document.querySelectorAll('#masterReviewDialog93 button')].map(e=>[e.id,e.disabled]),inputs:[...document.querySelectorAll('#masterReviewDialog93 [data-key]')].map(e=>[e.dataset.key,e.value,e.disabled]),rects:[...document.querySelectorAll('#masterReviewDialog93, #masterReviewDialog93 article, #masterReviewDialog93 input, #masterReviewDialog93 select, #masterReviewDialog93 button')].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}),outside:getComputedStyle(document.querySelector('#outside98 span')).color})"""
    on=p.evaluate(snapshot);p.evaluate('document.getElementById("status98Styles").sheet.disabled=true');off=p.evaluate(snapshot)
    assert on==off,'CSS changed geometry, controls, data or an outside element'
    p.evaluate('document.getElementById("status98Styles").sheet.disabled=false')
    assert color(p,'B')==AMBER and color(p,'A')==GREEN
    assert p.evaluate('calls.length')==0
def reopen(p):
    d.cancel_guard(p)
    assert color(p,'A')==GRAY and color(p,'B')==AMBER

COLOR_CASES=[empty_existing,required_new,ready_transition,invalid_transition,saved_and_partial_new,partial_existing,save_failure,source_changed,unit_requirement,busy_request,saved_pending,expiry_warning,geometry_and_scope,reopen]
DRAFT_CASES=[d.partial_new,d.cancel_guard,d.x_guard,d.escape_guard,d.clean_close,d.unload_guard,d.malformed_partial,d.save_failure,d.refresh_failure,d.busy_guards,d.repeated_open,d.partial_fields,d.task_changed,d.source_changed,d.revision_changed,d.owner_changed,d.numeric_regression,d.saved_close,d.twenty_order,d.old_reply_new_owner]
FRESH_CASES=[f.expiry,f.policy_edges,f.idle_expiry,f.visibility_expiry,f.imperative_guard,f.fresh_success,f.fresh_failure,f.server_reject,f.refresh_after_expiry,f.pause_reopen,f.changed_cycle,f.already_stale_open,f.pending_busy,f.missing_helper]
UNIT_CASES=[u.labels,u.valid_conversion,u.identity,u.invalid_factor,u.partial_factor,u.changing_units,u.clear_option_keeps_factor,u.failure]
def main():
    chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser');assert chrome
    groups=[('colors',standard_fixture,COLOR_CASES),('drafts',standard_fixture,DRAFT_CASES),('freshness',standard_fixture,FRESH_CASES),('units',units_fixture,UNIT_CASES)]
    results=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            for width,height in [(1440,1000),(390,844)]:
                for group,fixture,cases in groups:
                    html=fixture()
                    for case in cases:
                        ctx=browser.new_context(viewport={'width':width,'height':height});requests=[];errors=[]
                        ctx.route('**/*',lambda r:(requests.append(r.request.url),r.abort()))
                        p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
                        try:
                            p.set_content(html,wait_until='load');p.wait_for_function('ta16OpenTask.__mr93===true');p.evaluate('ta16OpenTask(task)');case(p)
                            assert not requests and not errors,(requests,errors)
                            results.append(f'{width}: {group}/{case.__name__}');print('PASS '+results[-1],flush=True)
                        finally:ctx.close()
        finally:browser.close()
    print(json.dumps({'browser_scenarios':len(results),'color_scenarios':len(COLOR_CASES)*2,'regression_scenarios':(len(DRAFT_CASES)+len(FRESH_CASES)+len(UNIT_CASES))*2,'runtime':'task-assistant-v97.js','stylesheet':'task-assistant-v98.css','production_requests':0}))
if __name__=='__main__':main()
