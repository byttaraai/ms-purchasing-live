"""Build 85 real pointer/keyboard/layout checks. Synthetic fixtures, no external requests."""
from pathlib import Path
import argparse, runpy, shutil
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
inline_fixture=runpy.run_path(str(ROOT/'tests/run-browser-v82.py'))['inline_fixture']


def tools(page):
    toggle=page.locator('#supplierQuestFilterToggle')
    if toggle.is_visible() and toggle.get_attribute('aria-expanded')!='true': toggle.click()
    expect(page.locator('#supplierQuestSearch')).to_be_visible()


def stage(page,key):
    page.evaluate('''key=>{qaQuest.current_stage=key;supplierQuestRender(SupplierQuestUI.task,{quest:qaQuest,master_revision:qaFixture.master_revision,stale_stages:[]});}''',key)


def main():
    p=argparse.ArgumentParser();p.add_argument('--inline',action='store_true');p.add_argument('--base-url',default='http://127.0.0.1:8765');p.add_argument('--screenshots',default='');args=p.parse_args()
    chrome=shutil.which('google-chrome') or shutil.which('chromium')
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        try:
            for width,height in [(1920,1080),(1366,768),(1280,720),(1024,768),(1366,600),(768,1024),(390,844)]:
                context=browser.new_context(viewport={'width':width,'height':height});context.set_default_timeout(8000)
                context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(args.base_url+'/') else r.abort())
                page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                if args.inline:page.set_content(inline_fixture('quest-qa.html'),wait_until='load')
                else:page.goto(args.base_url+'/quest-qa.html',wait_until='load')
                page.evaluate('''async()=>{await msAudit.loadLive();go('tasks-assistant');await openSupplierTaskPopup(state.taskAssistant.tasks.find(t=>t.focus==='suppliers'&&t.target==='QA Supplier'));for(const s of SupplierQuestModel.STAGES.filter(s=>s.kind!=='summary'))qaQuest.stage_data[s.key]={codes:[],decisions:{},snapshot:qaSnapshot(s.key,[],{}),master_revision:1};}''')
                # All eight review stages and summary remain in the existing split layout.
                for key in ['data','lt10','10_50','50_100','100_150','150_200','200_300','gt300','summary']:
                    stage(page,key)
                    geom=page.evaluate('''()=>{const d=document.getElementById('supplierTaskDialog'),row=d.querySelector('.sq-stage-title'),c=document.getElementById('supplierQuestContent'),h=d.querySelector('.sq-stage'),f=d.querySelector('.sq-footer');return {row:row.getBoundingClientRect().toJSON(),header:h.getBoundingClientRect().toJSON(),content:c.getBoundingClientRect().toJSON(),footer:f.getBoundingClientRect().toJSON(),dialog:d.getBoundingClientRect().toJSON(),overflow:row.scrollWidth-row.clientWidth,compact:row.classList.contains('sq85-compact')};}''')
                    assert geom['overflow']<=1,(width,key,'header overflow',geom)
                    assert geom['footer']['bottom']<=height+1
                    if width>=980:
                        assert geom['header']['height']<=58,(width,key,'extra header height',geom)
                        assert geom['content']['height']/geom['dialog']['height']>.84
                    assert page.locator('.sq-footer').count()==1
                    if key=='summary':
                        assert page.locator('#supplierQuestTableTools').count()==0
                        continue
                    assert page.locator('.sq83-workspace .sq-stage-title #supplierQuestSearch').count()==1
                    assert page.locator('.sq83-controls #supplierQuestSearch').count()==0
                    expect(page.locator('#supplierQuestVisibleCount')).to_be_hidden()
                    assert page.locator('#supplierQuestSearch').count()==1
                    if not geom['compact']:
                        header=geom['header'];search=page.locator('#supplierQuestSearch').bounding_box()
                        assert search['y']>=header['top'] and search['y']+search['height']<=header['bottom']+1
                    else:
                        assert page.locator('#supplierQuestTableTools').evaluate('(el)=>el.hidden&&el.inert')
                        before=page.locator('.sq-stage').bounding_box()['height']
                        tools(page)
                        assert page.locator('.sq-stage').bounding_box()['height']==before
                        page.keyboard.press('Escape')
                        assert page.locator('#supplierQuestFilterToggle').evaluate('(el)=>el===document.activeElement')
                        expect(page.locator('#supplierTaskDialog')).to_be_visible()
                        expect(page.locator('#supplierQuestTableTools')).to_be_hidden()
                stage(page,'lt10')
                page.locator('[data-quest-select="Critical A"]').check();page.locator('[data-quest-select="Critical B"]').check()
                tools(page);page.locator('#supplierQuestSearch').fill('Critical A')
                expect(page.locator('#supplierQuestTableCount')).to_have_text('1 of 26')
                expect(page.locator('#supplierQuestContent [data-quest-select]')).to_have_count(1)
                page.locator('#supplierQuestSearchClear').click()
                assert page.evaluate('SupplierQuestUI.selected.size')==2,'Search clear lost selections'
                expect(page.locator('#supplierQuestTableCount')).to_have_text('26 products')
                page.locator('#supplierQuestSearch').fill('Critical A')
                if page.locator('#supplierQuestTableTools').is_visible() and page.locator('#supplierQuestFilterToggle').is_visible():page.keyboard.press('Escape')
                page.locator('#supplierQuestSelectAll').uncheck()
                assert page.evaluate("!SupplierQuestUI.selected.has('Critical A')&&SupplierQuestUI.selected.has('Critical B')")
                page.locator('#supplierQuestPrint').click()
                assert page.evaluate("qaPrints.at(-1).includes('Critical B')&&!qaPrints.at(-1).includes('Critical A')")
                tools(page);page.locator('#supplierQuestSearchClear').click();page.locator('#supplierQuestSelectedOnly').check()
                expect(page.locator('#supplierQuestTableCount')).to_have_text('1 of 26')
                page.locator('#supplierQuestSearch').fill('Does not exist')
                expect(page.locator('#supplierQuestTableCount')).to_have_text('0 of 26')
                page.locator('#supplierQuestClear').click()
                assert page.evaluate('SupplierQuestUI.selected.size')==0,'Clear selection must include hidden choices'
                expect(page.locator('#supplierQuestClear')).to_be_disabled()
                expect(page.locator('#supplierQuestSearch')).to_have_value('Does not exist')
                page.locator('#supplierQuestSearchClear').click();page.locator('#supplierQuestSelectedOnly').uncheck()
                expect(page.locator('#supplierQuestTableCount')).to_have_text('26 products')
                # Select-all under selected-only must repaint an empty view, not leave ghost rows.
                if page.locator('#supplierQuestFilterToggle').is_visible():page.keyboard.press('Escape')
                page.locator('[data-quest-select="Critical A"]').check()
                tools(page);page.locator('#supplierQuestSelectedOnly').check()
                if page.locator('#supplierQuestFilterToggle').is_visible():page.keyboard.press('Escape')
                page.locator('#supplierQuestSelectAll').click()
                expect(page.locator('#supplierQuestContent [data-quest-select]')).to_have_count(0)
                expect(page.locator('#supplierQuestTableCount')).to_have_text('0 of 26')
                tools(page);page.locator('#supplierQuestSelectedOnly').uncheck()
                # Resize with active query: same input node, same value, no draft loss.
                page.locator('#supplierQuestSearch').fill('Critical A')
                page.set_viewport_size({'width':390 if width>=980 else 1366,'height':height})
                tools(page);expect(page.locator('#supplierQuestSearch')).to_have_value('Critical A')
                expect(page.locator('#supplierQuestTableCount')).to_have_text('1 of 26')
                page.set_viewport_size({'width':width,'height':height});tools(page);page.locator('#supplierQuestSearchClear').click()
                if page.locator('#supplierQuestFilterToggle').is_visible():page.keyboard.press('Escape')
                # The separate stages drawer still works and Escape closes only that drawer.
                if width<980:
                    page.locator('#supplierQuestControlsToggle').click()
                    assert page.locator('.sq83-workspace').evaluate('(el)=>el.inert')
                    page.keyboard.press('Escape')
                    assert not page.locator('.sq83-workspace').evaluate('(el)=>el.inert')
                # Data tab counts and decision search follow the actual visible table.
                stage(page,'data');tools(page)
                page.locator('#supplierQuestSearch').fill('Data Attention')
                expect(page.locator('#supplierQuestTableCount')).to_have_text('1 of 2')
                page.locator('#supplierQuestSearchClear').click()
                page.locator('[data-data-view="resolved"]').click()
                expect(page.locator('#supplierQuestTableCount')).to_have_text('0 products')
                stage(page,'gt300');tools(page);page.locator('#supplierQuestSearch').fill('Risk High')
                expect(page.locator('#supplierQuestTableCount')).to_have_text('1 of 3')
                expect(page.locator('.sq-decision')).to_have_count(1)
                assert page.evaluate("state.taskAssistant.tasks.find(t=>t.task_key===SupplierQuestUI.taskKey).status")=='open'
                assert page.locator('#tasksBadgeTotal').inner_text()=='0'
                assert not page.evaluate("qaCalls.some(c=>c.path==='purchasing_supplier_quest_v81'&&c.p.action==='save_stage')"),'View controls must not confirm reviews'
                if args.screenshots:
                    out=Path(args.screenshots);out.mkdir(parents=True,exist_ok=True);stage(page,'lt10')
                    page.screenshot(path=str(out/f'toolbar-{width}-{height}.png'))
                    if page.locator('#supplierQuestFilterToggle').is_visible():
                        tools(page);page.screenshot(path=str(out/f'filters-{width}-{height}.png'))
                assert not errors,errors
                print(f'{width}x{height}: PASS toolbar geometry, counts, hidden selections, explicit clear, focus, responsive filters and no state writes',flush=True)
                context.close()
        finally:browser.close()
if __name__=='__main__':main()
