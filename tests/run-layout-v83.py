"""Layout-only real-browser checks. Synthetic fixtures; external network is blocked."""
from pathlib import Path
import argparse
import runpy
import shutil
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
    if not chrome:
        raise RuntimeError('Chromium/Chrome is required')
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            for width,height in [(1920,1080),(1366,768),(1024,768),(768,1024),(390,844)]:
                context=browser.new_context(viewport={'width':width,'height':height})
                context.route('**/*',lambda r: r.continue_() if r.request.url.startswith(args.base_url+'/') else r.abort())
                page=context.new_page();errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                if args.inline:
                    page.set_content(inline_fixture('quest-qa.html'),wait_until='load')
                else:
                    page.goto(args.base_url+'/quest-qa.html',wait_until='load')
                page.evaluate("""async()=>{
                    await msAudit.loadLive();go('tasks-assistant');
                    await openSupplierTaskPopup(state.taskAssistant.tasks.find(t=>t.focus==='suppliers'&&t.target==='QA Supplier'));
                }""")
                assert page.locator('#supplierTaskDialog').is_visible()
                assert page.locator('.sq83-controls .sq-steps [data-quest-stage]').count()==9
                assert page.locator('.sq83-controls #supplierQuestSearch').count()==1
                for stage in ['data','lt10','200_300','gt300','summary']:
                    page.evaluate("""key=>{qaQuest.current_stage=key;supplierQuestRender(SupplierQuestUI.task,{quest:qaQuest,master_revision:qaFixture.master_revision,stale_stages:[]});}""",stage)
                    geometry=page.evaluate("""()=>{
                        const d=document.getElementById('supplierTaskDialog'),w=d.querySelector('.sq83-workspace'),s=d.querySelector('.sq83-controls'),c=document.getElementById('supplierQuestContent'),f=d.querySelector('.sq-footer');
                        return {dialog:d.getBoundingClientRect().toJSON(),workspace:w.getBoundingClientRect().toJSON(),sidebar:s.getBoundingClientRect().toJSON(),data:c.getBoundingClientRect().toJSON(),footer:f.getBoundingClientRect().toJSON(),overflow:c.scrollWidth-c.clientWidth};
                    }""")
                    assert geometry['dialog']['left']>=0 and geometry['dialog']['right']<=width+1
                    assert geometry['footer']['bottom']<=height+1
                    if width>=980:
                        assert geometry['workspace']['right']<=geometry['sidebar']['left']+1
                        assert .24<=geometry['sidebar']['width']/geometry['dialog']['width']<=.33
                        assert geometry['data']['height']>=geometry['dialog']['height']*.84
                        assert geometry['overflow']<=1,(width,stage,geometry)
                        assert page.locator('.sq83-controls .sq-footer').count()==1
                        coords=page.locator('.sq-steps').bounding_box()
                        steps=page.locator('[data-quest-stage]').all()
                        assert steps[1].bounding_box()['y']>steps[0].bounding_box()['y']
                        assert coords['x']>=geometry['sidebar']['left']
                    else:
                        assert page.locator('.sq83-workspace .sq-footer').count()==1
                        assert page.locator('.sq83-controls').evaluate('(el)=>el.inert')
                    if args.screenshots and (stage in ['data','lt10','gt300']):
                        out=Path(args.screenshots);out.mkdir(parents=True,exist_ok=True)
                        page.screenshot(path=str(out/f'{stage}-{width}.png'))
                # Exercise real pointer/keyboard controls in the compact layout.
                page.evaluate("()=>{qaQuest.current_stage='lt10';supplierQuestRender(SupplierQuestUI.task,{quest:qaQuest,master_revision:1,stale_stages:[]});}")
                if width<980:
                    page.locator('#supplierQuestControlsToggle').click()
                    assert page.locator('.sq83-controls').is_visible()
                    assert page.locator('.sq83-workspace').evaluate('(el)=>el.inert')
                    assert page.locator('.sq83-controls .sq-footer').count()==1
                page.locator('#supplierQuestSearch').fill('Critical A')
                assert page.locator('#supplierQuestContent [data-quest-select]').count()==1
                if width<980:
                    page.keyboard.press('Escape')
                    assert page.locator('#supplierTaskDialog').is_visible()
                    assert page.locator('.sq83-controls').evaluate('(el)=>el.inert')
                    assert page.locator('#supplierQuestControlsToggle').evaluate('(el)=>el===document.activeElement')
                page.locator('#supplierQuestContent [data-quest-select]').check()
                assert 'Add 1 to BO' in page.locator('#supplierQuestPrimary').inner_text()
                # Bottom actions do not move when the table scrolls.
                y=page.locator('.sq-footer').bounding_box()['y']
                page.locator('#supplierQuestContent').evaluate('(el)=>el.scrollTop=500')
                assert abs(page.locator('.sq-footer').bounding_box()['y']-y)<1
                assert not errors,errors
                print(f'{width}x{height}: PASS split layout, all stages, controls, focus and single fixed action bar',flush=True)
                context.close()
        finally:
            browser.close()

if __name__=='__main__':
    main()
