"""Build 84 visual contracts and real input checks, using synthetic local fixtures only."""
from pathlib import Path
import argparse, runpy, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
inline_fixture=runpy.run_path(str(ROOT/'tests/run-browser-v82.py'))['inline_fixture']

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--inline',action='store_true')
    parser.add_argument('--base-url',default='http://127.0.0.1:8765')
    parser.add_argument('--screenshots',default='')
    args=parser.parse_args()
    chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    assert chrome,'Chromium is required'
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            for width,height in [(1920,1080),(1366,768),(1024,768),(1366,600),(768,1024),(390,844)]:
                context=browser.new_context(viewport={'width':width,'height':height})
                context.set_default_timeout(8000)
                context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(args.base_url+'/') else r.abort())
                print(f'Checking {width}x{height}',flush=True)
                page=context.new_page();errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                if args.inline:page.set_content(inline_fixture('quest-qa.html'),wait_until='load')
                else:page.goto(args.base_url+'/quest-qa.html',wait_until='load')
                page.evaluate('''async()=>{
                  await msAudit.loadLive();go('tasks-assistant');
                  await openSupplierTaskPopup(state.taskAssistant.tasks.find(t=>t.focus==='suppliers'&&t.target==='QA Supplier'));
                  for(const s of SupplierQuestModel.STAGES.filter(s=>s.kind!=='summary'))qaQuest.stage_data[s.key]={codes:[],decisions:{},snapshot:qaSnapshot(s.key,[],{}),master_revision:1};
                  SupplierQuestUI.drafts.set(sqStageKey(SupplierQuestUI.task,'50_100'),{codes:['Purchase C']});
                  qaQuest.current_stage='lt10';
                  supplierQuestRender(SupplierQuestUI.task,{quest:qaQuest,master_revision:1,stale_stages:['lt10','10_50']});
                }''')
                d=page.locator('#supplierTaskDialog')
                assert d.evaluate('(el)=>el.classList.contains("sq84")')
                # Verify all data table types and the single action row at every viewport.
                for stage in ['data','lt10','200_300','gt300','summary']:
                    page.evaluate('''key=>{qaQuest.current_stage=key;supplierQuestRender(SupplierQuestUI.task,{quest:qaQuest,master_revision:1,stale_stages:['lt10','10_50']});}''',stage)
                    align=page.locator('#supplierQuestContent th,#supplierQuestContent td').evaluate_all('''cells=>cells.map(c=>({check:c.classList.contains('sq-check-cell'),align:getComputedStyle(c).textAlign,pad:getComputedStyle(c).paddingLeft}))''')
                    assert align and all(c['align']==('center' if c['check'] else 'left') for c in align),(width,stage,align)
                    assert all(c['pad']=='10px' for c in align if not c['check']),(width,stage,'unequal padding')
                    actions=page.locator('.sq-footer-actions>.sq-btn').all()
                    assert len(actions)==3
                    boxes=[a.bounding_box() for a in actions]
                    assert max(b['y'] for b in boxes)-min(b['y'] for b in boxes)<1,(width,stage,boxes)
                    primary=page.locator('#supplierQuestPrimary')
                    assert primary.get_attribute('aria-label')
                    assert primary.locator('.sq84-primary-label').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1'),(width,stage,'primary label overflow')
                    assert page.locator('#supplierQuestPrevious svg').count()==1
                    assert page.locator('#supplierQuestPrint svg,#supplierQuestPrintBo svg').count()==1
                    assert boxes[0]['x']<primary.bounding_box()['x']<boxes[1]['x'],(width,stage,'action order')
                # Mixed stage states: current+changed is purple; changed is not a full amber row.
                page.evaluate("()=>{qaQuest.current_stage='lt10';supplierQuestRender(SupplierQuestUI.task,{quest:qaQuest,master_revision:1,stale_stages:['lt10','10_50']});}")
                if width<980:page.locator('#supplierQuestControlsToggle').click()
                active=page.locator('[data-quest-stage="lt10"]')
                assert active.get_attribute('aria-current')=='step' and active.get_attribute('data-sq84-state')=='changed'
                assert active.locator('.sq84-step-flag').inner_text()=='Changed'
                assert page.locator('[data-quest-stage="10_50"]').evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgba(0, 0, 0, 0)'
                assert page.locator('[data-quest-stage="50_100"] .sq84-step-flag').inner_text()=='Draft'
                assert page.locator('[data-quest-stage="data"] .sq-step-icon').inner_text()=='\u2713'
                # Supplier occupies a dedicated second line. Long Arabic text may wrap, but never overlaps actions.
                title=page.locator('#supplierQuestTitle')
                title.locator('bdi').evaluate('(el)=>el.textContent="\u0645\u0624\u0633\u0633\u0629 \u062a\u062f\u0627\u0648\u064a \u0627\u0644\u062a\u062c\u0627\u0631\u064a\u0629"')
                meta=page.locator('.sq84-meta').bounding_box()
                assert title.bounding_box()['y']>=meta['y']+meta['height']
                assert page.locator('.sq84-meta').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
                if width>=980 and height>=720:
                    assert page.locator('.sq83-control-body').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'),'tools still need scroll'
                    assert page.locator('[data-quest-stage="summary"]').bounding_box()['y']<page.locator('#supplierQuestSearch').bounding_box()['y']
                    assert page.locator('#supplierQuestSearch').bounding_box()['y']+32<page.locator('.sq-footer').bounding_box()['y']
                if width<980:page.locator('#supplierQuestControlsBack').click()
                # Make a real pointer selection and keep the short action and count in sync.
                page.locator('[data-quest-select="Critical A"]').check()
                assert 'Add 1 to BO' in page.locator('#supplierQuestPrimary').inner_text()
                assert '1 selected' in page.locator('#supplierQuestTotals').inner_text()
                assert page.locator('#supplierQuestSaveStatus').inner_text()=='Draft'
                assert page.locator('#supplierQuestSaveStatus').get_attribute('data-sq84-feedback')=='draft'
                printer=page.locator('#supplierQuestPrint')
                printer.focus()
                assert page.locator('#sq84Tooltip').inner_text()=='Print Selected'
                printer.click()
                assert page.evaluate("qaPrints.at(-1).includes('Critical A')&&!qaPrints.at(-1).includes('Critical B')")
                # Unknown price gets an explanatory hint; no zero is substituted.
                page.evaluate("()=>{qaQuest.current_stage='10_50';supplierQuestRender(SupplierQuestUI.task,{quest:qaQuest,master_revision:1,stale_stages:[]});}")
                missing=page.locator('.sq84-missing-price');assert missing.count()==1
                missing.focus();assert page.locator('#sq84Tooltip').inner_text()=='Purchase price missing'
                assert missing.inner_text()=='\u2014'
                if args.screenshots:
                    out=Path(args.screenshots);out.mkdir(parents=True,exist_ok=True)
                    page.evaluate("()=>{qaQuest.current_stage='lt10';supplierQuestRender(SupplierQuestUI.task,{quest:qaQuest,master_revision:1,stale_stages:['lt10','10_50']});}")
                    if width<980:page.locator('#supplierQuestControlsToggle').click()
                    page.screenshot(path=str(out/f'polish-{width}-{height}.png'))
                assert not errors,errors
                print(f'{width}x{height}: PASS left alignment, two-line header, stage states, single action row, selection and keyboard hints',flush=True)
                context.close()
        finally:browser.close()

if __name__=='__main__':main()
