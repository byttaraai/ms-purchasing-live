"""DATA-01: real input/popup save tests, with synthetic state and mocked RPC only."""
import json
import re
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]

def main():
    html = (ROOT / 'index.html').read_text()
    scripts = re.findall(r'<script\b[^>]*>([\s\S]*?)</script>', html, re.I)
    core = next(s for s in scripts if 'root.PurchasingCore=api' in s)
    popup = (ROOT / 'assets/js/task-assistant-v94.js').read_text()
    bootstrap = """
    const C=PurchasingCore;
    const task={task_key:'data|qa',focus:'data',status:'open',codes:['QA']};
    const state={mode:'live',revision:7,master:[{product_code:'QA',product_name:'Synthetic QA',purchase_unit:'Piece',supplier:'QA Supplier',purchase_price:null,reorder_point:null}],rows:[{product_code:'QA',product_name:'Synthetic QA',needs_review:true,review_reason:'Master purchase price is missing or zero | Reorder point is not confirmed'}],taskAssistant:{tasks:[task]}};
    window.calls=[];window.refreshes=0;
    window.ta16OpenTask=async()=>{};window.renderTasksAssistant=()=>{};
    async function rpc(name,args){calls.push({name,args});return {ok:true,master_revision:8};}
    async function loadLive(){window.refreshes++;}
    function uuid(){return '00000000-0000-4000-8000-000000000001';}
    function toast(){}
    """
    fixture='<html><head></head><body>'+''.join('<script>'+s.replace('</script','<\\/script')+'</script>' for s in [core,bootstrap,popup])+'</body></html>'
    chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    if not chrome:
        raise RuntimeError('Chrome/Chromium required')
    completed=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-gpu','--disable-dev-shm-usage'])
        try:
            for width,height in [(1440,1000),(390,844)]:
                context=browser.new_context(viewport={'width':width,'height':height})
                context.route('**/*',lambda route:route.abort())
                page=context.new_page();errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                page.set_content(fixture,wait_until='load')
                page.wait_for_function('window.ta16OpenTask.__mr93===true')
                page.evaluate('ta16OpenTask(task)')
                price=page.locator('[data-key="purchase_price"]')
                reorder=page.locator('[data-key="reorder_point"]')
                save=page.locator('#mr93Save')
                assert save.is_disabled()
                for value in ['10000000000000','1000000000001','-2','0']:
                    price.fill(value)
                    assert save.is_disabled(),value
                    assert page.locator('.mr93-product').evaluate('(e)=>e.classList.contains("invalid")'),value
                    page.evaluate('document.getElementById("mr93Save").onclick()')
                    assert page.evaluate('calls.length')==0
                    completed.append(str(width)+': reject '+value)
                price.fill('')
                price.press_sequentially('1e')
                assert price.evaluate('(e)=>e.validity.badInput')
                assert save.is_disabled()
                completed.append(str(width)+': incomplete native number rejected')
                price.fill('25.5');reorder.fill('0')
                assert not save.is_disabled()
                save.click()
                page.wait_for_function('calls.length===1 && refreshes===1 && !document.getElementById("masterReviewDialog93").open')
                call=page.evaluate('calls[0]')
                assert call['name']=='purchasing_master_review_save_v93'
                assert call['args']['expected_revision']==7
                assert call['args']['payload']==[{'product_code':'QA','purchase_price':25.5,'reorder_point':0}]
                assert page.evaluate('state.taskAssistant.tasks[0].status')=='open'
                completed.append(str(width)+': valid save/recalculate, zero RP and task status preserved')
                assert not errors,errors
                context.close()
        finally:
            browser.close()
    print('PASS: '+json.dumps({'checks':len(completed),'cases':completed,'production_requests':0}))

if __name__=='__main__':
    main()
