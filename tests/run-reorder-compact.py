"""Actual-page compact generator verification; synthetic state and blocked external IO."""
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
pagefile=ROOT/'reorder-compact-qa.html'
checks=[]
def check(ok,label):
    assert ok,label
    checks.append(label)
    print('PASS '+label,flush=True)
def wait_state(page,expression):
    deadline=time.monotonic()+30
    while time.monotonic()<deadline:
        if page.evaluate('() => ('+expression+')'): return
        page.wait_for_timeout(50)
    raise AssertionError('Timed out: '+expression)
try:
    fixture=json.loads(json.dumps(qa['fixture']))
    mock='window.qaFixture='+json.dumps(fixture)+';\n'+qa['mock']+"\naddEventListener('load',()=>{void msAudit.loadLive();});"
    pagefile.write_text((ROOT/'index.html').read_text().replace('</head>','<script>'+mock+'</script></head>',1))
    with sync_playwright() as pw:
        chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
        assert chrome,'Chromium is required'
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        for width,height in [(1920,1080),(1440,1000),(1280,900),(1100,768),(1024,768),(768,1024),(390,844)]:
            ctx=browser.new_context(viewport={'width':width,'height':height})
            external=[];errors=[]
            def route(r):
                if r.request.url.startswith(origin+'/'):r.continue_()
                else:external.append(r.request.url);r.abort()
            ctx.route('**/*',route)
            p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
            label=str(width)+'x'+str(height)
            try:
                p.goto(origin+'/reorder-compact-qa.html',wait_until='load')
                wait_state(p,"state.taskAssistant?.tasks?.some(t=>t.focus==='data')")
                p.evaluate("go('daily-tasks');window.scrollTo(0,0)")
                p.wait_for_timeout(100)
                master_before=p.evaluate('JSON.stringify(state.master)')
                check(not p.locator('#ropgProducts').evaluate('(e)=>e.open'),label+' table initially collapsed')
                check(not p.locator('#ropgProducts .ropg-table-scroll').is_visible(),label+' no hidden table leakage')
                for selector in ['.ropg-summary','.ropg-input-head','.ropg-kicker','.ropg-head p','.ropg-note','.ropg-pill']:
                    check(not p.locator('#ropGenerator '+selector).is_visible(),label+' removed visual clutter '+selector)
                geom=p.evaluate("""()=>{const q=document.querySelector('#ropGenerator'),r=q.getBoundingClientRect();const nodes=[...q.querySelectorAll('.ropg-head h3,.ropg-inputs input,.ropg-toolbar button,.ropg-details summary')].map(e=>{const b=e.getBoundingClientRect();return {x:b.x-r.x,y:b.y-r.y,w:b.width,h:b.height}});return {height:r.height,left:r.left,right:r.right,width:r.width,scroll:q.scrollWidth,client:q.clientWidth,nodes};}""")
                print('COMPACT_GEOMETRY='+json.dumps({'viewport':width,**geom}),flush=True)
                check(geom['height']<=72,label+' single compact row at most 72px including scrollbar')
                centers=[n['y']+n['h']/2 for n in geom['nodes']]
                check(max(centers)-min(centers)<2,label+' title inputs actions and arrow share one row')
                check(all(n['w']>0 and n['h']>0 for n in geom['nodes']),label+' controls not clipped to zero')
                check(geom['left']>=-1 and geom['right']<=width+1,label+' card stays inside viewport')
                check(all(geom['nodes'][i]['x']+geom['nodes'][i]['w']<=geom['nodes'][i+1]['x']+1 for i in range(len(geom['nodes'])-1)),label+' no overlapping controls')
                if width>=1280:check(geom['scroll']<=geom['client']+1,label+' full desktop row fits without horizontal scroll')
                for selector in ['#ropgUpload','#ropgGenerate','#ropgApprove']:
                    check(p.locator(selector).is_disabled(),label+' action still disabled '+selector)
                values=p.locator('#ropGenerator input').evaluate_all('(es)=>es.map(e=>e.value)')
                check(values==['30','25','20','15','5'],label+' draft example days unchanged')
                p.get_by_label('Super coverage days',exact=True).fill('42')
                summary=p.locator('#ropgProducts summary')
                summary.click()
                check(p.locator('#ropgProducts .ropg-table-scroll').is_visible(),label+' arrow opens native product table')
                opened=p.locator('#ropGenerator').bounding_box()['height']
                check(opened>geom['height']+30,label+' expanded table below the row')
                p.keyboard.press('Enter')
                check(not p.locator('#ropgProducts').evaluate('(e)=>e.open'),label+' Enter closes native table')
                p.keyboard.press('Space')
                check(p.locator('#ropgProducts').evaluate('(e)=>e.open'),label+' Space opens native table')
                summary.click()
                check(not p.locator('#ropgProducts .ropg-table-scroll').is_visible(),label+' arrow closes table again')
                check(p.get_by_label('Super coverage days',exact=True).input_value()=='42',label+' disclosure preserves edited draft')
                check(p.evaluate('JSON.stringify(state.master)')==master_before,label+' master data unchanged')
                check(p.evaluate("getComputedStyle(document.querySelector('.topbar')).position==='sticky'"),label+' sticky header unchanged')
                check(p.locator('.continuous-footer #printSelectedBtn').count()==1,label+' footer print placement unchanged')
                check(not external and not errors,label+' no external network or page errors '+str((external,errors)))
            finally:ctx.close()
        browser.close()
finally:
    server.shutdown()
    for name in ['reorder-compact-qa.html','quest-qa.html','quest-smoke.html']:(ROOT/name).unlink(missing_ok=True)
print(json.dumps({'compact_assertions':len(checks),'viewport_profiles':7,'production_requests':0}))
