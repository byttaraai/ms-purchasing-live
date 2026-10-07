"""Build102 actual-page UI checks. Isolated synthetic IO; production security policy retained."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import json,runpy,shutil,threading,time,subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
qa=runpy.run_path(str(ROOT/'tests/browser-v82.py'))
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
checks=[]
def check(ok,label):
    assert ok,label
    checks.append(label)
    print('PASS '+label,flush=True)
def wait(p,expression):
    deadline=time.monotonic()+12
    while time.monotonic()<deadline:
        if p.evaluate(expression):return
        p.wait_for_timeout(60)
    raise AssertionError('Timed out: '+expression)
try:
    fixture=json.loads(json.dumps(qa['fixture']))
    fixture['rows'] += [qa['row']('Navigation item '+str(i),35,price=None,review=True) for i in range(30)]
    fixture['master']=[dict(r) for r in fixture['rows']]
    mock='window.qaFixture='+json.dumps(fixture)+';\n'+qa['mock']+"\naddEventListener('load',()=>{void msAudit.loadLive();});"
    html=(ROOT/'index.html').read_text()
    baseline=subprocess.check_output(['node','-e',"process.stdout.write(require('./tests/navigation-v102.cjs').previous(require('fs').readFileSync('index.html','utf8')))"]).decode()
    for name,source in [('navigation-qa-v102.html',html),('navigation-baseline-v101.html',baseline)]:
        (ROOT/name).write_text(source.replace('</head>','<script>'+mock+'</script></head>',1))
    with sync_playwright() as pw:
        chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
        assert chrome,'Chromium required'
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        for width,height in [(1920,1080),(1440,1000),(1100,768),(1024,768),(768,1024),(390,844),(844,390)]:
            ctx=browser.new_context(viewport={'width':width,'height':height})
            errors=[];external=[]
            def route(r):
                if r.request.url.startswith(origin+'/'):r.continue_()
                else:external.append(r.request.url);r.abort()
            ctx.route('**/*',route)
            label=str(width)+'x'+str(height)
            try:
                old=ctx.new_page();old.goto(origin+'/navigation-baseline-v101.html',wait_until='load')
                wait(old,"()=>state.taskAssistant?.tasks?.some(t=>t.focus==='data')")
                old.evaluate("()=>go('recommendations')")
                old.wait_for_timeout(100)
                old_width=old.evaluate('()=>document.documentElement.scrollWidth');old.close()
                p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
                p.goto(origin+'/navigation-qa-v102.html',wait_until='load')
                wait(p,"()=>state.taskAssistant?.tasks?.some(t=>t.focus==='data')")
                p.evaluate("()=>go('recommendations')")
                check(p.locator('.topbar #printSelectedBtn').count()==0,label+' no header print')
                check(p.locator('.continuous-footer .table-footer-actions #printSelectedBtn').count()==1,label+' original print in footer')
                check(p.locator('#printSelectedBtn').count()==1 and p.locator('#exportBtn').count()==1,label+' unique controls')
                positions=[]
                for tab in ['recommendations','tasks-assistant','daily-tasks','output-lists','recommendations']:
                    p.locator('.topbar nav [data-tab="'+tab+'"]').click()
                    p.wait_for_timeout(100)
                    positions.append(p.evaluate("""()=>{const n=document.querySelector('.topbar>nav');return [...n.children].filter(e=>e.matches('button')).map(e=>{const r=e.getBoundingClientRect();return [r.left+n.scrollLeft,r.width,r.top,r.height];});}"""))
                    check(p.evaluate("()=>!document.querySelector('.topbar #boHeaderActions')"),label+' no page-specific header action '+tab)
                check(all(len(a)==len(positions[0]) and all(abs(x-y)<1 for r,s in zip(a,positions[0]) for x,y in zip(r,s)) for a in positions),label+' tabs fixed across all pages')
                p.evaluate("()=>{const b=document.querySelector('.ta87-task-count');window.navBadgeOriginal=[b.textContent,b.className];}")
                badge_positions=[]
                for number in ['0','1','15','9999']:
                    p.evaluate("n=>{const b=document.querySelector('.ta87-task-count');b.textContent=n;b.classList.toggle('hidden',n==='0');}",number)
                    badge_positions.append(p.evaluate("()=>[...document.querySelector('.topbar>nav').children].filter(e=>e.matches('button')).map(e=>[e.offsetLeft,e.offsetWidth])"))
                check(all(a==badge_positions[0] for a in badge_positions),label+' zero and changing task counts do not move tabs')
                p.evaluate("()=>{const b=document.querySelector('.ta87-task-count');[b.textContent,b.className]=window.navBadgeOriginal;}")
                new_width=p.evaluate('()=>document.documentElement.scrollWidth')
                if new_width>width+1:
                    print('OVERFLOW_BASELINE='+json.dumps({'viewport':width,'build101':old_width,'build102':new_width,'elements':p.evaluate("()=>[...document.querySelectorAll('.topbar,.topbar>nav,.topbar>.actions,.compact-filter-card,.compact-filters,.continuous-footer,.table-footer-actions')].map(e=>({class:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,scroll:e.scrollWidth,width:e.clientWidth}))")}),flush=True)
                check(new_width<=max(width,old_width)+1,label+' no added page overflow vs exact Build101')
                check(p.evaluate("()=>['.topbar','.topbar>nav','.topbar>.actions','.table-footer-actions'].every(s=>{const r=document.querySelector(s).getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;})"),label+' header and footer controls stay within viewport')
                if width>1100:
                    check(p.evaluate("()=>{const n=document.querySelector('.topbar>nav'),b=document.querySelector('.topbar>.brand');return getComputedStyle(n).borderLeftWidth==='1px'&&n.getBoundingClientRect().left>b.getBoundingClientRect().right;}"),label+' subtle brand separator')
                else:
                    check(p.evaluate("()=>document.querySelector('.topbar>nav').getBoundingClientRect().top>=document.querySelector('.topbar>.brand').getBoundingClientRect().bottom"),label+' consistent compact navigation row')
                p.locator('#printSelectedBtn').scroll_into_view_if_needed()
                check(p.evaluate("()=>{const a=document.querySelector('#printSelectedBtn').getBoundingClientRect(),b=document.querySelector('#exportBtn').getBoundingClientRect();return Math.abs(a.height-32)<1&&Math.abs(b.height-32)<1&&Math.abs(a.top-b.top)<1&&b.left>a.right&&b.left-a.right<=9;}"),label+' print and export compact aligned pair')
                check(p.evaluate("()=>getComputedStyle(document.querySelector('.table-footer-actions')).position==='static'"),label+' no floating footer')
                check(p.locator('#printSelectedBtn').is_disabled(),label+' no selection disables print')
                selector='[data-panel="recommendations"] '+('.table-scroll .row-select' if width>760 else '.card-list .row-select')
                boxes=p.locator(selector+':not(:disabled)')
                check(boxes.count()>0,label+' selectable products available')
                chosen=boxes.first
                chosen.check()
                wait(p,"()=>!document.getElementById('printSelectedBtn').disabled")
                check(p.locator('#selectedCount').inner_text()=='(1)',label+' original selected count updates')
                p.locator('.topbar nav [data-tab="tasks-assistant"]').click()
                p.locator('.topbar nav [data-tab="recommendations"]').click()
                check(p.locator('#selectedCount').inner_text()=='(1)' and not p.locator('#printSelectedBtn').is_disabled(),label+' selection survives navigation')
                p.evaluate("""()=>{window.navPrintHtml='';window.navPrintCalled=0;window.open=()=>({closed:false,document:{open(){},write(s){window.navPrintHtml+=s;},close(){}},focus(){},print(){window.navPrintCalled++;}});}""")
                p.locator('#printSelectedBtn').click()
                wait(p,"()=>window.navPrintHtml.length>0")
                check(p.evaluate("()=>window.navPrintHtml.includes('<table')"),label+' original print handler creates document')
                chosen.uncheck()
                wait(p,"()=>document.getElementById('printSelectedBtn').disabled")
                check(p.locator('#selectedCount').inner_text()=='(0)',label+' deselect disables print again')
                p.evaluate("()=>window.scrollTo(0,500)");p.wait_for_timeout(100)
                check(p.evaluate("()=>Math.abs(document.querySelector('.topbar').getBoundingClientRect().top)<1"),label+' sticky header retained')
                check(not external and not errors,label+' no external IO or JS errors '+str((external,errors)))
            finally:ctx.close()
        browser.close()
finally:
    server.shutdown()
    for name in ['navigation-qa-v102.html','navigation-baseline-v101.html','quest-qa.html','quest-smoke.html']:(ROOT/name).unlink(missing_ok=True)
print(json.dumps({'navigation_assertions':len(checks),'viewport_profiles':7,'production_requests':0}))
