"""Actual page/task Open journey on localhost, synthetic RPCs and blocked external IO."""
from pathlib import Path
import json, runpy, shutil, threading
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
qa=runpy.run_path(str(ROOT/'tests/browser-v82.py'))
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
path=ROOT/'task02-browser.html';checks=0
try:
    with sync_playwright() as pw:
        chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser');assert chrome
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        for width,height in [(1440,1000),(390,844)]:
            for missing_price in [False,True]:
                d=json.loads(json.dumps(qa['fixture']))
                rows=[qa['row']('P'+str(q),q,profit='Super') for q in [79,80,119,120,149.999,150]]
                rows+=[qa['row']('P125',125,profit='High',price=None if missing_price else 20,review=missing_price),qa['row']('M125',125,profit='Medium')]
                d['rows']=rows;d['master']=[dict(r) for r in rows]
                mock='window.qaFixture='+json.dumps(d)+';\n'+qa['mock']+"\naddEventListener('load',()=>{void msAudit.loadLive();});"
                path.write_text((ROOT/'index.html').read_text().replace('</head>','<script>'+mock+'</script></head>',1))
                ctx=browser.new_context(viewport={'width':width,'height':height});external=[];errors=[]
                def route(r):
                    if r.request.url.startswith(origin+'/'):r.continue_()
                    else:external.append(r.request.url);r.abort()
                ctx.route('**/*',route);p=ctx.new_page();p.on('pageerror',lambda e:errors.append(str(e)))
                try:
                    p.goto(origin+'/task02-browser.html',wait_until='load')
                    p.wait_for_function("state.taskAssistant?.tasks?.some(t=>t.focus==='profit_recovery_80_150')")
                    p.evaluate("go('tasks-assistant')")
                    before=p.evaluate('JSON.stringify(qaFixture.rows)')
                    codes=p.evaluate("state.taskAssistant.tasks.find(t=>t.focus==='profit_recovery_80_150').codes")
                    assert codes==['P80','P119','P120','P149.999','P125'],codes
                    p.evaluate("ta16OpenTask(state.taskAssistant.tasks.find(t=>t.focus==='profit_recovery_80_150'))")
                    p.wait_for_function("state.dailyFocus?.task_key==='recovery|profit-80-150'")
                    assert set(p.evaluate('state.filtered.map(r=>r.product_code)'))==set(codes)
                    assert p.evaluate("[...document.querySelectorAll('tbody tr, #cards article.mobile-product')].some(r=>r.getBoundingClientRect().height>0&&r.textContent.includes('P125'))")
                    r=p.evaluate("state.rows.find(r=>r.product_code==='P125')");assert r['min_order_qty']==0 and r['max_order_qty']==75 and r['stock_qty']==125
                    assert p.evaluate('JSON.stringify(qaFixture.rows)')==before
                    assert p.evaluate("state.taskAssistant.tasks.every(t=>t.status==='open'&&!t.badge_awarded)")
                    assert not p.evaluate("qaCalls.some(c=>c.path.startsWith('purchasing_save_'))")
                    if missing_price:assert p.evaluate("state.taskAssistant.tasks.find(t=>t.focus==='data').codes.includes('P125')")
                    assert not external and not errors,(external,errors)
                    checks+=1;print('PASS task02 full-page Open: '+str(width)+' / missing-price='+str(missing_price),flush=True)
                finally:ctx.close()
        browser.close()
finally:
    server.shutdown()
    for name in ['task02-browser.html','quest-qa.html','quest-smoke.html']:(ROOT/name).unlink(missing_ok=True)
print(json.dumps({'browser_scenarios':checks,'production_requests':0}))
