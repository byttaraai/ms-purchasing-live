"""Build 95 browser regressions. Synthetic server/state only; all network blocked."""
import argparse
import json
import os
import re
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP = r'''
const C=PurchasingCore;
const base={product_code:'A',product_name:'Synthetic existing product',purchase_unit:'Piece',option_unit:null,factor:1,order_multiple:1,supplier:'QA Supplier',purchase_price:null,reorder_point:10,reorder_point_unit:'Piece',profitability_class:'Super'};
const task={task_key:'data|qa',focus:'data',status:'open',codes:['A','B']};
const state={mode:'live',session:{user:{id:'qa-owner'}},revision:7,master:[structuredClone(base)],rows:[],taskAssistant:{tasks:[structuredClone(task)]}};
const server={revision:7,master:structuredClone(state.master)};
window.calls=[];window.refreshes=0;window.toasts=[];window.failSave=false;window.failRefresh=false;window.delaySave=false;window.afterRefresh=null;
function rowsFor(master){return ['A','B'].map(code=>{
 const m=master.find(x=>x.product_code===code);let issues=[];
 if(!m)issues=['Product is not in the master'];
 else {if(!m.supplier)issues.push('Supplier is not assigned');if(!(m.purchase_price>0))issues.push('Master purchase price is missing or zero');if(m.reorder_point==null)issues.push('Reorder point is not confirmed');if(!m.profitability_class)issues.push('Profitability classification is missing');}
 return {product_code:code,product_name:m?.product_name||'Synthetic new product',raw_unit:'Piece',raw_quantity:10,needs_review:issues.length>0,review_reason:issues.join(' | ')};
});}
state.rows=rowsFor(state.master);
window.ta16OpenTask=async()=>{};window.renderTasksAssistant=()=>{};
async function rpc(name,args){
 calls.push({name,args:structuredClone(args)});
 if(window.delaySave)await new Promise(resolve=>{window.releaseSave=resolve;});
 if(window.failSave)throw Error('Synthetic save failure');
 if(args.expected_revision!==server.revision)throw Error('Master has changed. Refresh and validate again.');
 for(const patch of args.payload){
  let m=server.master.find(x=>x.product_code===patch.product_code);
  if(!m){m={product_code:patch.product_code,product_name:'Synthetic new product',option_unit:null,factor:1,order_multiple:1};server.master.push(m);}
  Object.assign(m,patch);if('reorder_point' in patch)m.reorder_point_unit=m.purchase_unit;
 }
 server.revision++;
 return {ok:true,master_revision:server.revision};
}
async function loadLive(){
 window.refreshes++;
 if(window.failRefresh)throw Error('Synthetic refresh failure');
 state.master=structuredClone(server.master);state.rows=rowsFor(state.master);state.revision=server.revision;
 state.taskAssistant.tasks[0].codes=state.rows.filter(x=>x.needs_review).map(x=>x.product_code);
 if(window.afterRefresh)window.afterRefresh();
 renderTasksAssistant();
}
let requestCount=0;
function uuid(){return 'synthetic-request-'+(++requestCount);}
function toast(message){window.toasts.push(message);}
'''


def fixture(module):
    local_core = os.environ.get('POPUP95_CORE_FILE')
    if local_core:
        core = Path(local_core).read_text()
    else:
        html = (ROOT / 'index.html').read_text()
        scripts = re.findall(r'<script\b[^>]*>([\s\S]*?)</script>', html, re.I)
        core = next(s for s in scripts if 'root.PurchasingCore=api' in s)
    css = ''
    for name in ['app-v57.css', 'task-assistant-v93.css']:
        p = ROOT / 'assets/css' / name
        if p.exists():
            css += p.read_text()
    source = (ROOT / 'assets/js' / module).read_text()
    return '<html><head><style>'+css+'</style></head><body>'+''.join(
        '<script>'+s.replace('</script', '<\\/script')+'</script>' for s in [core, BOOTSTRAP, source])+'</body></html>'


def field(page, code, key):
    return page.locator(f'.mr93-product[data-code="{code}"] [data-key="{key}"]')


def open_popup(page):
    page.evaluate('ta16OpenTask(task)')


def save(page):
    page.locator('#mr93Save').click()
    page.wait_for_function('document.getElementById("masterReviewDialog93").getAttribute("aria-busy")!=="true"')


def is_open(page):
    return page.locator('#masterReviewDialog93').evaluate('(d)=>d.open')


def confirm_action(page, accept, action):
    seen=[]
    def handle(dialog):
        seen.append(dialog.message)
        dialog.accept() if accept else dialog.dismiss()
    page.once('dialog', handle)
    action()
    assert len(seen)==1, 'Expected exactly one unsaved-input confirmation'
    return seen[0]


def complete_b(page):
    field(page,'B','purchase_unit').select_option('Piece')
    field(page,'B','supplier').select_option('QA Supplier')
    field(page,'B','purchase_price').fill('12.5')
    field(page,'B','reorder_point').fill('0')
    field(page,'B','profitability_class').select_option('Super')


def partial_new(page):
    field(page,'A','purchase_price').fill('25.5')
    field(page,'B','purchase_price').fill('12.5')
    field(page,'B','purchase_price').evaluate('(e)=>window.unsavedNode=e')
    save(page)
    assert is_open(page), 'Partial save closed the popup and lost the remaining draft'
    assert field(page,'B','purchase_price').input_value()=='12.5'
    assert field(page,'B','purchase_price').evaluate('(e)=>e===window.unsavedNode')
    assert page.evaluate('calls[0].args.payload')==[{'product_code':'A','purchase_price':25.5}]
    assert page.locator('.mr93-product').evaluate_all('(es)=>es.map(e=>e.dataset.code)')==['A','B']
    assert page.locator('#mr93Cancel').is_enabled()
    complete_b(page);save(page)
    assert not is_open(page)
    assert page.evaluate('calls.length')==2
    assert page.evaluate('calls[1].args.payload.map(x=>x.product_code)')==['B']
    assert page.evaluate('calls[1].args.expected_revision')==8
    assert page.evaluate('state.taskAssistant.tasks[0].status')=='open'
    open_popup(page)
    assert page.locator('#mr93Cancel').is_enabled(), 'Cancel stayed disabled after reopening'


def cancel_guard(page):
    field(page,'B','purchase_price').fill('31')
    message=confirm_action(page,False,lambda:page.locator('#mr93Cancel').click())
    assert 'Discard unsaved' in message and is_open(page)
    assert field(page,'B','purchase_price').input_value()=='31'
    confirm_action(page,True,lambda:page.locator('#mr93Cancel').click())
    assert not is_open(page)
    open_popup(page)
    assert field(page,'B','purchase_price').input_value()==''
    assert page.evaluate('calls.length')==0


def x_guard(page):
    field(page,'B','supplier').select_option('QA Supplier')
    confirm_action(page,False,lambda:page.locator('.mr93-close').click())
    assert is_open(page) and field(page,'B','supplier').input_value()=='QA Supplier'
    confirm_action(page,True,lambda:page.locator('.mr93-close').click())
    assert not is_open(page)


def escape_guard(page):
    field(page,'B','purchase_price').press_sequentially('1e')
    assert field(page,'B','purchase_price').evaluate('(e)=>e.validity.badInput')
    confirm_action(page,False,lambda:page.keyboard.press('Escape'))
    assert is_open(page) and field(page,'B','purchase_price').evaluate('(e)=>e.validity.badInput')
    confirm_action(page,True,lambda:page.keyboard.press('Escape'))
    assert not is_open(page)


def clean_close(page):
    seen=[]
    page.on('dialog',lambda d:(seen.append(d.message),d.dismiss()))
    page.locator('#mr93Cancel').click()
    assert not is_open(page) and not seen
    open_popup(page)
    field(page,'A','purchase_price').fill('20');field(page,'A','purchase_price').fill('')
    page.keyboard.press('Escape')
    assert not is_open(page) and not seen


def unload_guard(page):
    js="""()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}"""
    assert not page.evaluate(js)
    field(page,'B','purchase_price').fill('4')
    assert page.evaluate(js)
    field(page,'B','purchase_price').fill('')
    assert not page.evaluate(js)


def malformed_partial(page):
    field(page,'A','purchase_price').fill('25')
    field(page,'B','purchase_unit').select_option('Piece')
    field(page,'B','purchase_price').press_sequentially('1e')
    field(page,'B','purchase_price').evaluate('(e)=>window.unsavedNode=e')
    save(page)
    assert is_open(page)
    assert field(page,'B','purchase_price').evaluate('(e)=>e===window.unsavedNode&&e.validity.badInput')
    assert field(page,'B','purchase_unit').input_value()=='Piece'
    assert page.locator('#mr93Save').is_disabled()


def save_failure(page):
    page.evaluate('window.failSave=true')
    field(page,'A','purchase_price').fill('25')
    field(page,'B','purchase_price').fill('13')
    save(page)
    assert is_open(page) and page.evaluate('refreshes')==0
    assert field(page,'A','purchase_price').input_value()=='25'
    assert field(page,'B','purchase_price').input_value()=='13'
    assert page.locator('#mr93Save').is_enabled()
    assert 'entries are kept' in page.locator('#mr93Feedback').inner_text()
    page.evaluate('window.failSave=false');save(page)
    assert is_open(page) and field(page,'B','purchase_price').input_value()=='13'


def refresh_failure(page):
    page.evaluate('window.failRefresh=true')
    field(page,'A','purchase_price').fill('25')
    field(page,'B','purchase_price').fill('13')
    save(page)
    assert is_open(page) and page.evaluate('calls.length')==1
    assert page.locator('#mr93Save').inner_text()=='Retry Refresh'
    assert 'Saved to Master Data' in page.locator('#mr93Feedback').inner_text()
    save(page)  # Retry refresh must never resubmit the committed write.
    assert page.evaluate('calls.length')==1 and page.evaluate('refreshes')==2
    assert field(page,'B','purchase_price').input_value()=='13'
    page.evaluate('window.failRefresh=false');save(page)
    assert page.evaluate('calls.length')==1 and is_open(page)
    assert field(page,'B','purchase_price').input_value()=='13'
    complete_b(page);save(page)
    assert page.evaluate('calls.length')==2 and not is_open(page)


def busy_guards(page):
    field(page,'A','purchase_price').fill('25')
    page.evaluate('window.delaySave=true; document.getElementById("mr93Save").onclick(); document.getElementById("mr93Save").onclick();')
    assert page.evaluate('calls.length')==1
    assert page.locator('.mr93-close').is_disabled() and page.locator('#mr93Cancel').is_disabled()
    page.keyboard.press('Escape')
    assert is_open(page)
    open_popup(page)
    assert field(page,'A','purchase_price').input_value()=='25'
    page.evaluate('window.releaseSave()')
    page.wait_for_function('document.getElementById("masterReviewDialog93").getAttribute("aria-busy")!=="true"')
    assert page.evaluate('calls.length')==1


def repeated_open(page):
    field(page,'B','purchase_price').fill('81')
    field(page,'B','purchase_price').evaluate('(e)=>window.unsavedNode=e')
    open_popup(page);page.evaluate('renderTasksAssistant()')
    assert field(page,'B','purchase_price').evaluate('(e)=>e===window.unsavedNode&&e.value==="81"')
    assert page.evaluate('calls.length')==0
    page.evaluate('document.getElementById("masterReviewDialog93").close()')
    open_popup(page)
    assert field(page,'B','purchase_price').input_value()=='81'


def partial_fields(page):
    page.locator('#mr93Cancel').click()
    page.evaluate("server.master[0].supplier=null;state.master[0].supplier=null;state.rows=rowsFor(state.master)")
    open_popup(page)
    # Keep a supplier in the canonical dropdown without making it a task target.
    page.locator('#mr93Cancel').click()
    page.evaluate("const extra={...base,product_code:'SUPPLIER-LIST',purchase_price:1};server.master.push(extra);state.master.push(structuredClone(extra));")
    open_popup(page)
    field(page,'A','supplier').select_option('QA Supplier');save(page)
    assert is_open(page)
    assert page.evaluate('calls[0].args.payload')==[{'product_code':'A','supplier':'QA Supplier'}]
    assert field(page,'A','supplier').count()==0 and field(page,'A','purchase_price').count()==1
    field(page,'A','purchase_price').fill('9');save(page)
    assert page.evaluate('calls[1].args.payload')==[{'product_code':'A','purchase_price':9}]


def task_changed(page):
    field(page,'A','purchase_price').fill('25');field(page,'B','purchase_price').fill('40')
    page.evaluate("window.afterRefresh=()=>{state.taskAssistant.tasks[0].codes=[];};")
    save(page)
    assert field(page,'B','purchase_price').input_value()=='40'
    complete_b(page)
    assert page.locator('#mr93Save').is_disabled()
    assert 'no longer in the current task' in page.locator('.mr93-product[data-code="B"] .mr93-row-state').inner_text()


def source_changed(page):
    field(page,'A','purchase_price').fill('25');field(page,'B','purchase_price').fill('40')
    page.evaluate("window.afterRefresh=()=>{state.rows.find(x=>x.product_code==='B').raw_unit='Box 10';};")
    save(page)
    assert field(page,'B','purchase_price').input_value()=='40'
    complete_b(page)
    assert page.locator('#mr93Save').is_disabled()
    assert 'Product data changed' in page.locator('.mr93-product[data-code="B"] .mr93-row-state').inner_text()


def revision_changed(page):
    field(page,'A','purchase_price').fill('25')
    page.evaluate('state.revision=8;document.getElementById("mr93Save").onclick()')
    assert page.evaluate('calls.length')==0 and is_open(page)
    assert field(page,'A','purchase_price').input_value()=='25'


def owner_changed(page):
    field(page,'B','purchase_price').fill('93')
    page.evaluate("state.session.user.id='another-qa-user';renderTasksAssistant()")
    assert not is_open(page)
    open_popup(page)
    assert field(page,'B','purchase_price').input_value()==''


def numeric_regression(page):
    for value in ['10000000000000','1000000000001','-2','0']:
        field(page,'A','purchase_price').fill(value)
        assert page.locator('#mr93Save').is_disabled()
        page.evaluate('document.getElementById("mr93Save").onclick()')
        assert page.evaluate('calls.length')==0
    field(page,'A','purchase_price').fill('');field(page,'A','purchase_price').press_sequentially('1e')
    assert page.locator('#mr93Save').is_disabled()
    field(page,'A','purchase_price').fill('0.25');save(page)
    assert page.evaluate('calls[0].args.payload[0].purchase_price')==0.25


def saved_close(page):
    field(page,'A','purchase_price').fill('25');save(page)
    # Blank pending rows alone are not unsaved edits; saved A remains persisted.
    seen=[];page.on('dialog',lambda d:(seen.append(d.message),d.dismiss()))
    page.locator('#mr93Cancel').click()
    assert not is_open(page) and not seen
    assert page.evaluate("server.master.find(x=>x.product_code==='A').purchase_price")==25
    open_popup(page)
    assert page.locator('#mr93Cancel').is_enabled()
    assert field(page,'A','purchase_price').count()==0


def twenty_order(page):
    page.locator('#mr93Cancel').click()
    page.evaluate("""()=>{
      const codes=Array.from({length:23},(_,i)=>'P'+String(22-i).padStart(2,'0'));
      task.codes=codes.slice();state.taskAssistant.tasks[0].codes=codes.slice();
      server.master=codes.map(product_code=>({...base,product_code}));state.master=structuredClone(server.master);
      rowsFor=master=>master.map(m=>({product_code:m.product_code,product_name:m.product_name,raw_quantity:10,raw_unit:'Piece',needs_review:!(m.purchase_price>0),review_reason:m.purchase_price>0?'':'Master purchase price is missing or zero'}));
      state.rows=rowsFor(state.master);
    }""")
    open_popup(page)
    codes=page.locator('.mr93-product').evaluate_all('(es)=>es.map(e=>e.dataset.code)')
    assert len(codes)==20 and codes==[f'P{i:02}' for i in range(22,2,-1)]
    field(page,'P22','purchase_price').fill('10');save(page)
    assert is_open(page)
    assert page.locator('.mr93-product').evaluate_all('(es)=>es.map(e=>e.dataset.code)')==codes
    assert page.evaluate('calls[0].args.payload')==[{'product_code':'P22','purchase_price':10}]


def old_reply_new_owner(page):
    field(page,'A','purchase_price').fill('25')
    page.evaluate('window.delaySave=true;document.getElementById("mr93Save").onclick(); void 0;')
    page.evaluate("state.session.user.id='another-qa-user';renderTasksAssistant()")
    assert not is_open(page)
    open_popup(page);field(page,'B','purchase_price').fill('73')
    page.evaluate('window.releaseSave()')
    page.wait_for_timeout(50)
    assert is_open(page) and field(page,'B','purchase_price').input_value()=='73'


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--module',default='task-assistant-v95.js')
    parser.add_argument('--case',default='')
    args=parser.parse_args()
    cases=[partial_new,cancel_guard,x_guard,escape_guard,clean_close,unload_guard,malformed_partial,
           save_failure,refresh_failure,busy_guards,repeated_open,partial_fields,task_changed,
           source_changed,revision_changed,owner_changed,numeric_regression,saved_close,twenty_order,old_reply_new_owner]
    if args.case:cases=[c for c in cases if c.__name__==args.case]
    chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    if not chrome:raise RuntimeError('Chrome/Chromium required')
    html=fixture(args.module);passed=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'])
        try:
            for width,height in [(1440,1000),(390,844)]:
                for case in cases:
                    context=browser.new_context(viewport={'width':width,'height':height})
                    requests=[]
                    context.route('**/*',lambda route:(requests.append(route.request.url),route.abort()))
                    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                    try:
                        page.set_content(html,wait_until='load')
                        page.wait_for_function('window.ta16OpenTask.__mr93===true')
                        open_popup(page);case(page)
                        assert not errors,errors
                        assert not requests,requests
                        passed.append(f'{width}: {case.__name__}')
                        print('PASS '+passed[-1],flush=True)
                    finally:context.close()
        finally:browser.close()
    print('PASS: '+json.dumps({'browser_scenarios':len(passed),'module':args.module,'production_requests':0}))

if __name__=='__main__':main()
