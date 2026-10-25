"""Build122 Dashboard: title, live freshness, and action buttons in one desktop row.
All authentication and Supabase calls are mocked; no production modifications.
"""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
import json,runpy,threading,shutil
ROOT=Path(__file__).resolve().parents[1]
qa=runpy.run_path(str(ROOT/'tests/browser-v82.py'))
fixture=json.loads(json.dumps(qa['fixture']))
mock='<script>window.qaFixture='+json.dumps(fixture)+';\n'+qa['mock']+"\naddEventListener('load',()=>{void msAudit.loadLive()});</script>"
html=(ROOT/'index.html').read_text().replace('</head>',mock+'</head>',1)
temp=ROOT/'dashboard-header-v122-smoke.html'
temp.write_text(html)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for width in (1920,1600,1440,1280,1024,768,390,320):
   ctx=browser.new_context(viewport={'width':width,'height':900},timezone_id='Asia/Riyadh')
   page=ctx.new_page()
   errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/dashboard-header-v122-smoke.html',wait_until='load')
   page.locator('#inventoryFreshnessCard').wait_for(timeout=20000)
   page.wait_for_function("document.querySelector('#inventoryFreshnessAge')?.textContent?.trim() !== '-'")
   root=page.locator('[data-panel="daily-tasks"] > .ops-dashboard')
   assert root.count()==1,'Dashboard missing'
   info=root.evaluate('''e=>{
    const r=s=>{const x=e.querySelector(s),b=x.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,y:(b.top+b.bottom)/2,width:b.width,height:b.height}};
    return {container:r(':scope'),heading:r('.dashboard-heading > div:first-child'),inventory:r('#inventoryFreshnessCard'),actions:r('.dashboard-heading-actions'),
    status:r('#inventoryFreshnessStatus'),age:r('#inventoryFreshnessAge'),
    scroll:document.documentElement.scrollWidth,viewport:innerWidth,innerScroll:e.scrollWidth,innerWidth:e.clientWidth,
    infoId:!!e.querySelector('#inventoryFreshnessText'),cardCount:e.querySelectorAll('#inventoryFreshnessCard').length,
    buttons:e.querySelectorAll('#openInventoryModal,#goBosFromDashboard').length}
   }''')
   assert info['cardCount']==1 and info['buttons']==2 and info['infoId'],(width,'elements lost',info)
   assert info['scroll']<=info['viewport']+2,(width,'document horizontal overflow',info)
   assert info['innerScroll']<=info['innerWidth']+2,(width,'dashboard horizontal overflow',info)
   for item in ('heading','inventory','actions'):
    a=info[item]
    assert a['left']>=-2 and a['right']<=width+2,(width,item,'out of viewport',a)
   if width>=1440:
    y=[info[x]['y'] for x in ('heading','inventory','actions')]
    assert max(y)-min(y)<9,(width,'dashboard elements not on same row',y)
    assert info['heading']['right']<info['inventory']['left']+1
    assert info['inventory']['right']<info['actions']['left']+1
    assert page.locator('#inventoryFreshnessCard').evaluate('(e)=>getComputedStyle(e).boxShadow')=='none',(width,'separate inventory card shadow remains')
   assert root.locator('#inventoryFreshnessStatus').is_visible()
   assert root.locator('#inventoryFreshnessAge').is_visible()
   assert root.locator('#openInventoryModal').is_enabled()
   assert root.locator('#goBosFromDashboard').is_enabled()
   root.screenshot(path=str(ROOT/'tests'/('dashboard-inline-v122-'+str(width)+'.png')))
   root.locator('#openInventoryModal').click()
   assert page.locator('#inventoryModal').is_visible(),(width,'Inventory upload action broken')
   page.locator('#closeInventoryModal').click()
   assert not page.locator('#inventoryModal').is_visible(),(width,'Inventory modal fails to close')
   assert not errors,(width,errors)
   print('PASS Build122',width,flush=True)
   ctx.close()
  browser.close()
finally:
 server.shutdown()
 temp.unlink(missing_ok=True)
