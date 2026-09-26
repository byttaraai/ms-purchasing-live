"""Build 86 task-focused Tasks Assistant UI checks using synthetic local data only."""
from pathlib import Path
import argparse, runpy, shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
inline_fixture=runpy.run_path(str(ROOT/'tests/run-browser-v82.py'))['inline_fixture']

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--inline',action='store_true')
    parser.add_argument('--base-url',default='http://127.0.0.1:8765')
    args=parser.parse_args()
    chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    assert chrome,'Chromium is required'
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            for width,height in [(1366,768),(1024,768),(390,844)]:
                context=browser.new_context(viewport={'width':width,'height':height})
                context.set_default_timeout(8000)
                context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(args.base_url+'/') else r.abort())
                page=context.new_page();errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                if args.inline: page.set_content(inline_fixture('quest-qa.html'),wait_until='load')
                else: page.goto(args.base_url+'/quest-qa.html',wait_until='load')
                page.evaluate('''async()=>{
                  await msAudit.loadLive();
                  go('tasks-assistant');
                  await syncTasksAssistant();
                  const base=state.taskAssistant.tasks.find(t=>t.focus==='suppliers');
                  if(base){
                    const other=state.taskAssistant.tasks.filter(t=>t.focus!=='suppliers');
                    const suppliers=Array.from({length:7},(_,i)=>({...base,id:'supplier-'+i,task_key:'supplier-'+i,target:'QA Supplier '+(i+1),title:'Pre-order QA Supplier '+(i+1),status:'open'}));
                    state.taskAssistant={...state.taskAssistant,tasks:[...suppliers,...other]};
                    renderTasksAssistant(state.taskAssistant,boHealthModel());
                  }
                }''')
                assert page.locator('#ta86PageHeading').count()==1
                assert page.locator('#ta86HeadingActions #tasksOpenJump').count()==1
                assert page.locator('.ta15-achievements #tasksOpenJump').count()==0
                assert page.locator('#ta86RightRail').count()==1
                order=page.locator('#ta86RightRail>*').evaluate_all('els=>els.map(x=>x.id||[...x.classList].find(c=>c.startsWith("ta15-")))')
                assert len(order)==4,order
                assert page.locator('#ta86Budget').count()==1
                assert 'SAR' in page.locator('#ta86BudgetValue').inner_text()
                cards=page.locator('#tasksPriorityList .ta16-suppliers .ta16-task-list>.ta16-task')
                assert cards.count()==7
                visible=sum(1 for i in range(cards.count()) if cards.nth(i).is_visible())
                assert visible==5,(width,visible)
                assert 'View All 7' in page.locator('#ta86SupplierToggle').inner_text()
                page.locator('#ta86SupplierToggle').click()
                assert sum(1 for i in range(cards.count()) if cards.nth(i).is_visible())==7
                assert page.locator('#supplierQuestPageTabs').count()==0
                page.evaluate('''()=>supplierQuestRenderOutputs([{id:1,quest_id:1,task_id:'x',supplier:'QA Supplier',output_type:'branch_reallocation',created_at:new Date().toISOString(),payload:{items:[{product_code:'P1',product_name:'Product One',unit:'Piece',stock_pct:250,rating:'High',stock_value:100}]}}])''')
                assert page.locator('#outputListsNavCount').inner_text()=='1'
                page.locator('nav [data-tab="output-lists"]').click()
                assert not page.locator('[data-panel="output-lists"]').evaluate('el=>el.classList.contains("hidden")')
                assert page.locator('[data-panel="tasks-assistant"]').evaluate('el=>el.classList.contains("hidden")')
                assert page.locator('#outputListsHost #supplierQuestOutputs').count()==1
                assert page.locator('#supplierQuestOutputs .sq-output-header h3').inner_text()=='Output Lists'
                if width>=1100:
                    prod=page.locator('#tasksPriorityList .ta16-products').bounding_box()
                    master=page.locator('#tasksPriorityList .ta16-master').bounding_box()
                    supplier=page.locator('#tasksPriorityList .ta16-suppliers').bounding_box()
                    rail=page.locator('#ta86RightRail').bounding_box()
                    assert abs(prod['x']-master['x'])<2
                    assert master['y']>=prod['y']+prod['height']-2
                    assert supplier['x']<prod['x']<rail['x']
                if width<=390:
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
                assert not errors,errors
                print(f'{width}x{height}: PASS task focus, top-5 suppliers, right rail and Output Lists tab',flush=True)
                context.close()
        finally:
            browser.close()

if __name__=='__main__': main()
