"""Build 101: actual page/CSS/scripts, synthetic state, no production network or writes."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json, runpy, shutil, threading, time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
qa=runpy.run_path(str(ROOT/'tests/browser-v82.py'))
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
pagefile=ROOT/'header-qa-v101.html'
checks=[]
def wait_for_state(page,expression):
    # Poll through DevTools, not Playwright's in-page string eval. Keep the real CSP intact.
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        if page.evaluate('() => ('+expression+')'):return
        page.wait_for_timeout(50)
    raise AssertionError('Timed out waiting for '+expression)
def check(ok,label):
    if not ok:
        print('HEADER_DIAGNOSTIC='+json.dumps(p.evaluate("""()=>({scrollY,viewport:[innerWidth,innerHeight],offset:getComputedStyle(document.documentElement).getPropertyValue('--topbar-height'),nodes:[...document.querySelectorAll('#app,.topbar,.page,[data-panel="recommendations"],.table-card,.table-scroll,.table-scroll table,.table-scroll thead,.table-scroll thead th:first-child')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,cls:e.className,top:r.top,bottom:r.bottom,height:r.height,display:s.display,position:s.position,cssTop:s.top,overflowX:s.overflowX,overflowY:s.overflowY,parent:e.parentElement?.tagName,parentId:e.parentElement?.id};})})""")),flush=True)
    assert ok,label
    checks.append(label)
    print('PASS '+label,flush=True)
try:
    fixture=json.loads(json.dumps(qa['fixture']))
    fixture['rows'] += [qa['row']('Header item '+str(i),35,price=None,review=True) for i in range(90)]
    fixture['master']=[dict(r) for r in fixture['rows']]
    mock='window.qaFixture='+json.dumps(fixture)+';\n'+qa['mock']+"\naddEventListener('load',()=>{void msAudit.loadLive();});"
    pagefile.write_text((ROOT/'index.html').read_text().replace('</head>','<script>'+mock+'</script></head>',1))
    with sync_playwright() as pw:
        chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
        assert chrome,'Chromium is required'
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        for width,height in [(1920,1080),(1440,1000),(1024,768),(768,1024),(390,844),(844,390)]:
            ctx=browser.new_context(viewport={'width':width,'height':height})
            external=[];errors=[]
            def route(r):
                if r.request.url.startswith(origin+'/'):r.continue_()
                else:external.append(r.request.url);r.abort()
            ctx.route('**/*',route)
            p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
            label=str(width)+'x'+str(height)
            try:
                p.goto(origin+'/header-qa-v101.html',wait_until='load')
                wait_for_state(p,"state.taskAssistant?.tasks?.some(t=>t.focus==='data')")
                p.evaluate("go('recommendations');window.scrollTo(0,0)")
                p.wait_for_timeout(150)
                check(p.evaluate("[...document.body.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).length===0"),label+' no stray body text')
                check(p.evaluate("Math.abs(document.querySelector('.topbar').getBoundingClientRect().top)<1"),label+' header starts at viewport top')
                p.locator('#supplierButton').click()
                check(p.locator('#supplierMenu').is_visible(),label+' supplier dropdown opens')
                p.locator('#supplierButton').click()
                p.locator('#profitButton').click()
                check(p.locator('#profitMenu').is_visible(),label+' profitability dropdown opens')
                p.locator('#profitButton').click()
                for tab in ['recommendations','tasks-assistant','daily-tasks','output-lists']:
                    p.locator('.topbar nav [data-tab="'+tab+'"]').click()
                    p.wait_for_timeout(80)
                    p.evaluate("""tab=>{const panel=document.querySelector('[data-panel="'+tab+'"]');if(!panel.querySelector('.header-test-spacer')){const spacer=document.createElement('div');spacer.className='header-test-spacer';spacer.style.height='200vh';panel.append(spacer);}window.scrollTo(0,500);}""",tab)
                    p.wait_for_timeout(120)
                    check(p.evaluate("window.scrollY>200&&getComputedStyle(document.querySelector('.topbar')).position==='sticky'&&Math.abs(document.querySelector('.topbar').getBoundingClientRect().top)<1"),label+' sticky '+tab)
                    check(p.evaluate("(()=>{const h=document.querySelector('.topbar'),r=h.getBoundingClientRect(),e=document.elementFromPoint(Math.min(innerWidth-5,r.right-5),Math.min(r.bottom-5,30));return !!e&&h.contains(e);})()"),label+' header above content '+tab)
                p.locator('.topbar nav [data-tab="recommendations"]').click()
                if width>760:
                    p.evaluate("window.scrollTo(0,document.querySelector('[data-panel=\"recommendations\"] .table-card').getBoundingClientRect().top+window.scrollY+120)")
                    p.wait_for_timeout(120)
                    check(p.evaluate("(()=>{const h=document.querySelector('.topbar').getBoundingClientRect(),th=document.querySelector('[data-panel=\"recommendations\"] .table-scroll thead th').getBoundingClientRect();return th.height>0&&th.top>=h.bottom-1;})()"),label+' BO table heading below app header')
                p.locator('.topbar nav [data-tab="tasks-assistant"]').click()
                p.evaluate("window.scrollTo(0,450);ta16OpenTask(state.taskAssistant.tasks.find(t=>t.focus==='data'))")
                p.wait_for_selector('dialog.mr93-dialog[open]')
                check(p.evaluate("(()=>{const d=document.querySelector('dialog.mr93-dialog[open]'),r=d.getBoundingClientRect();return d.contains(document.elementFromPoint(r.left+r.width/2,r.top+30));})()"),label+' Master popup above sticky header')
                check(p.locator('dialog.mr93-dialog [data-key="purchase_price"]').count()>0,label+' Master fields available')
                p.keyboard.press('Escape')
                wait_for_state(p,"!document.querySelector('dialog.mr93-dialog').open")
                p.evaluate("openSupplierTaskPopup(state.taskAssistant.tasks.find(t=>t.focus==='suppliers'))")
                p.wait_for_selector('#supplierTaskDialog[open]')
                check(p.evaluate("(()=>{const d=document.querySelector('#supplierTaskDialog'),r=d.getBoundingClientRect();return d.contains(document.elementFromPoint(r.left+r.width/2,r.top+30));})()"),label+' Supplier popup above sticky header')
                p.locator('#supplierTaskCloseX').click()
                wait_for_state(p,"!document.querySelector('#supplierTaskDialog').open")
                p.evaluate('window.scrollTo(0,400)');p.wait_for_timeout(100)
                check(p.evaluate("Math.abs(document.querySelector('.topbar').getBoundingClientRect().top)<1"),label+' sticky after popup close')
                p.emulate_media(media='print')
                check(p.evaluate("getComputedStyle(document.querySelector('.topbar')).position!=='sticky'"),label+' no sticky header in print')
                p.emulate_media(media='screen')
                check(not p.evaluate("qaCalls.some(c=>c.path.startsWith('purchasing_save_')||c.path==='purchasing_master_review_save_v93')"),label+' no save RPCs')
                check(not external and not errors,(label+' no external IO or JS errors '+str((external,errors))))
            finally:ctx.close()
        browser.close()
finally:
    server.shutdown()
    for name in ['header-qa-v101.html','quest-qa.html','quest-smoke.html']:(ROOT/name).unlink(missing_ok=True)
print(json.dumps({'header_assertions':len(checks),'viewport_profiles':6,'production_requests':0}))
