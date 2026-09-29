"""Build 96: real browser unit-entry and partial-save tests; no production requests."""
import json
import os
import re
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BOOT=r'''
const C=PurchasingCore;
const anchor={product_code:'A',product_name:'Synthetic existing carton',purchase_unit:'Box 12',option_unit:'Piece',factor:12,order_multiple:1,supplier:'QA Supplier',purchase_price:null,reorder_point:null,profitability_class:'High'};
const single={...anchor,product_code:'UNIT',purchase_unit:'Piece',option_unit:null,factor:1,purchase_price:1,reorder_point:10};
const task={task_key:'data|qa',focus:'data',status:'open',codes:['A','B']};
const state={mode:'live',session:{user:{id:'qa-owner'}},revision:7,master:[anchor,single],rows:[],aliases:[],taskAssistant:{tasks:[task]}};
const server={revision:7,master:structuredClone(state.master)};
window.calls=[];window.refreshes=0;window.failSave=false;window.failRefresh=false;
function rowsFor(master){return ['A','B'].map(code=>{
 const m=master.find(x=>x.product_code===code),issues=[];
 if(!m)issues.push('Product is not in the master');
 else{if(!m.supplier)issues.push('Supplier is not assigned');if(!(m.purchase_price>0))issues.push('Master purchase price is missing or zero');if(m.reorder_point==null)issues.push('Reorder point is not confirmed');if(!m.profitability_class)issues.push('Profitability classification is missing');}
 return {product_code:code,product_name:m?.product_name||'Synthetic new carton',raw_unit:'Piece',raw_quantity:120,needs_review:issues.length>0,review_reason:issues.join(' | ')};
});}
state.rows=rowsFor(state.master);
window.ta16OpenTask=async()=>{};window.renderTasksAssistant=()=>{};
async function rpc(name,args){
 calls.push({name,args:structuredClone(args)});
 if(failSave)throw Error('Synthetic failure');
 if(args.expected_revision!==server.revision)throw Error('Stale revision');
 for(const p of args.payload){let m=server.master.find(x=>x.product_code===p.product_code);if(!m){m={product_code:p.product_code,product_name:'Synthetic new carton'};server.master.push(m);}Object.assign(m,p);if('reorder_point' in p)m.reorder_point_unit=m.purchase_unit;}
 server.revision++;return {ok:true,master_revision:server.revision};
}
async function loadLive(){refreshes++;if(failRefresh)throw Error('Synthetic refresh failure');state.master=structuredClone(server.master);state.rows=rowsFor(state.master);state.revision=server.revision;task.codes=state.rows.filter(r=>r.needs_review).map(r=>r.product_code);renderTasksAssistant();}
let seq=0;function uuid(){return 'synthetic-'+(++seq);}function toast(){}
'''
def fixture():
    if os.environ.get('UNIT96_CORE_FILE'):core=Path(os.environ['UNIT96_CORE_FILE']).read_text()
    else:
        html=(ROOT/'index.html').read_text()
        core=next(s for s in re.findall(r'<script\b[^>]*>([\s\S]*?)</script>',html,re.I) if 'root.PurchasingCore=api' in s)
    css=''.join(p.read_text() for p in [ROOT/'assets/css/app-v57.css',ROOT/'assets/css/task-assistant-v93.css'] if p.exists())
    source=(ROOT/'assets/js/task-assistant-v96.js').read_text()
    return '<html><head><style>'+css+'</style></head><body>'+''.join('<script>'+s.replace('</script','<\\/script')+'</script>' for s in [core,BOOT,source])+'</body></html>'
def field(p,code,key):return p.locator(f'.mr93-product[data-code="{code}"] [data-key="{key}"]')
def save(p):
    p.locator('#mr93Save').click()
    p.wait_for_function('document.getElementById("masterReviewDialog93").getAttribute("aria-busy")!=="true"')
def units(p):
    field(p,'B','purchase_unit').select_option('Box 12');field(p,'B','option_unit').select_option('Piece');field(p,'B','factor').fill('12')
def all_b(p):
    units(p);field(p,'B','supplier').select_option('QA Supplier');field(p,'B','purchase_price').fill('100');field(p,'B','reorder_point').fill('20');field(p,'B','profitability_class').select_option('High')
def labels(p):
    assert field(p,'A','purchase_unit').count()==0 and field(p,'A','option_unit').count()==0 and field(p,'A','factor').count()==0
    assert p.locator('[data-code="A"] [data-field="purchase_price"] > span').inner_text()=='Purchase Price (SAR / Box 12)'
    assert p.locator('[data-code="A"] [data-field="reorder_point"] > span').inner_text()=='Reorder Point (Box 12)'
    assert not field(p,'B','factor').is_visible()
    field(p,'B','purchase_unit').select_option('Box 12')
    assert p.locator('#mr93Save').is_disabled()
    assert 'inventory unit' in p.locator('[data-code="B"] .mr93-row-state').inner_text()
def valid_conversion(p):
    all_b(p);save(p)
    data=p.evaluate('calls[0].args.payload[0]')
    assert data['factor']==12 and data['option_unit']=='Piece' and data['purchase_price']==100 and data['reorder_point']==20
    assert p.evaluate("C.toPurchase(120,'Piece',server.master.find(m=>m.product_code==='B'),[]).value")==10
    assert field(p,'B','option_unit').count()==0 and field(p,'B','factor').count()==0
    assert p.evaluate('task.status')=='open'
def identity(p):
    field(p,'B','purchase_unit').select_option('Piece');save(p)
    assert p.evaluate('calls[0].args.payload[0].factor')==1
    assert p.evaluate('calls[0].args.payload[0].option_unit') is None
    assert p.locator('#masterReviewDialog93').evaluate('(d)=>d.open')
def invalid_factor(p):
    field(p,'B','purchase_unit').select_option('Box 12');field(p,'B','option_unit').select_option('Piece')
    assert field(p,'B','factor').input_value()=='' and p.locator('#mr93Save').is_disabled()
    for v in ['0','-1','10000000000000']:
        field(p,'B','factor').fill(v);assert p.locator('#mr93Save').is_disabled()
    field(p,'B','factor').fill('');field(p,'B','factor').press_sequentially('1e')
    assert field(p,'B','factor').evaluate('(e)=>e.validity.badInput') and p.locator('#mr93Save').is_disabled()
    assert p.evaluate('calls.length')==0
def partial_factor(p):
    field(p,'A','purchase_price').fill('25')
    field(p,'B','purchase_unit').select_option('Box 12');field(p,'B','option_unit').select_option('Piece')
    field(p,'B','factor').press_sequentially('1e');field(p,'B','factor').evaluate('(e)=>window.originalFactor=e')
    save(p)
    assert p.evaluate('calls[0].args.payload.map(x=>x.product_code)')==['A']
    assert field(p,'B','factor').evaluate('(e)=>e===window.originalFactor&&e.validity.badInput')
    assert field(p,'B','option_unit').input_value()=='Piece'
    field(p,'B','factor').fill('12');save(p)
    assert p.evaluate('calls[1].args.payload[0].factor')==12
    assert p.evaluate('calls[1].args.expected_revision')==8
def changing_units(p):
    units(p);field(p,'B','purchase_price').fill('100');field(p,'B','reorder_point').fill('20')
    field(p,'B','purchase_unit').select_option('Piece')
    assert field(p,'B','factor').input_value()=='12' and field(p,'B','purchase_price').input_value()=='100' and field(p,'B','reorder_point').input_value()=='20'
    assert p.locator('#mr93Save').is_disabled()
    assert p.locator('[data-code="B"] [data-field="purchase_price"] > span').inner_text()=='Purchase Price (SAR / Piece)'
    field(p,'B','purchase_unit').select_option('Box 12');assert p.locator('#mr93Save').is_enabled()
def clear_option_keeps_factor(p):
    units(p);field(p,'B','option_unit').select_option('')
    assert field(p,'B','factor').is_visible() and field(p,'B','factor').input_value()=='12'
    assert p.locator('#mr93Save').is_disabled()
def failure(p):
    all_b(p);p.evaluate('failSave=true');save(p)
    assert field(p,'B','factor').input_value()=='12' and field(p,'B','option_unit').input_value()=='Piece'
    p.evaluate('failSave=false;failRefresh=true');save(p)
    assert p.locator('#mr93Save').inner_text()=='Retry Refresh'
    count=p.evaluate('calls.length');p.evaluate('failRefresh=false');save(p)
    assert p.evaluate('calls.length')==count

def main():
    chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    assert chrome,'Chrome required';cases=[labels,valid_conversion,identity,invalid_factor,partial_factor,changing_units,clear_option_keeps_factor,failure];done=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            for w,h in [(1440,1000),(390,844)]:
                for case in cases:
                    ctx=browser.new_context(viewport={'width':w,'height':h});requests=[];errors=[]
                    ctx.route('**/*',lambda r:(requests.append(r.request.url),r.abort()));p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
                    try:
                        p.set_content(fixture(),wait_until='load');p.wait_for_function('ta16OpenTask.__mr93===true');p.evaluate('ta16OpenTask(task)');case(p)
                        assert not requests and not errors,(requests,errors)
                        done.append(f'{w}: {case.__name__}');print('PASS '+done[-1],flush=True)
                    finally:ctx.close()
        finally:browser.close()
    print(json.dumps({'passed':len(done),'production_requests':0,'module':'task-assistant-v96.js'}))
if __name__=='__main__':main()
