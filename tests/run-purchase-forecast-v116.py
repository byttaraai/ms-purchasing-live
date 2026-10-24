"""Build 116 annual forecast visual/interaction smoke test, synthetic Master only."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
import json,threading,runpy,shutil,datetime
ROOT=Path(__file__).resolve().parents[1]
qa=runpy.run_path(str(ROOT/'tests/browser-v82.py'))
fixture=json.loads(json.dumps(qa['fixture']))
for i in range(85):
 row=qa['row']('FORECAST-%03d'%i,60,profit='High' if i%2 else 'Medium')
 row['product_name']='Annual forecast QA item '+str(i).zfill(3)
 row['supplier']='QA Supplier' if i%2 else 'Secondary Supplier'
 fixture['rows'].append(row);fixture['master'].append(dict(row))
mock='<script>window.qaFixture='+json.dumps(fixture)+';\n'+qa['mock']+"\naddEventListener('load',()=>{void msAudit.loadLive()});</script>"
doc=(ROOT/'index.html').read_text().replace('</head>',mock+'</head>',1)
temp=ROOT/'forecast-v116-smoke.html'
temp.write_text(doc)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
def check(x,name):
 assert x,name
 print('PASS '+name,flush=True)
try:
 with sync_playwright() as playwright:
  browser=playwright.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for width in (1920,1440,1280,1024,390):
   ctx=browser.new_context(viewport={'width':width,'height':900})
   page=ctx.new_page()
   errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base+'/forecast-v116-smoke.html',wait_until='load')
   page.locator('#pfTableBody tr').first.wait_for(timeout=25000)
   card=page.locator('#purchaseForecast116')
   check(card.count()==1,str(width)+' one forecast UI section')
   check(not card.evaluate('(e)=>e.closest(".hidden")!==null'),str(width)+' visible on Dashboard')
   check(page.locator('#ropGenerator').count()==1,str(width)+' original ROP remains')
   check(card.locator('thead th').count()==5,str(width)+' 5 annual columns')
   geometry=card.locator('.pf-header').evaluate('''e=>{
      const bounds=e.getBoundingClientRect();
      const ids=['pfSearch','pfSupplier','pfProfit','pfMonth','pfReset','pfRefresh'];
      const controls=ids.map(id=>{const r=e.querySelector('#'+id).getBoundingClientRect();return {id,top:r.top,left:r.left,right:r.right};});
      const title=e.querySelector('#pfTableTitle');
      return {scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,left:bounds.left,right:bounds.right,controls,
        titleFits:title.scrollWidth<=title.clientWidth+1,
        titleTop:title.getBoundingClientRect().top};
   }''')
   check(geometry['scrollWidth']<=geometry['clientWidth']+1,str(width)+' header has no horizontal overflow')
   check(all(x['left']>=geometry['left']-1 and x['right']<=geometry['right']+1 for x in geometry['controls']),str(width)+' each filter and action fits header')
   if width>=1220:
    tops=[x['top'] for x in geometry['controls']]+[geometry['titleTop']]
    check(max(tops)-min(tops)<3,str(width)+' title, filters and both actions share one desktop row')
    check(geometry['titleFits'],str(width)+' annual header title is fully visible')
   if width<760:
    actions=[x['top'] for x in geometry['controls'] if x['id'] in ('pfReset','pfRefresh')]
    check(max(actions)-min(actions)<3,str(width)+' mobile actions stay adjacent')
   check(card.locator('#pfGenerate').is_disabled(),str(width)+' pending-approval generate gated')
   check(card.locator('#pfTableBody tr').count()==60,str(width)+' product rows are paginated')
   check(card.locator('#pfNext').is_enabled(),str(width)+' next page enabled')
   card.locator('#pfNext').click()
   check('2 / ' in card.locator('#pfCount').inner_text(),str(width)+' pagination advances')
   card.locator('#pfSearch').fill('FORECAST-002')
   check(card.locator('#pfTableBody tr').count()==1,str(width)+' search works by product code')
   card.locator('#pfReset').click()
   card.locator('#pfSupplier').select_option('Secondary Supplier')
   check(card.locator('#pfTableBody tr').count()>0,str(width)+' supplier filter works')
   card.locator('#pfReset').click()
   card.locator('#pfProfit').select_option('high')
   check(card.locator('#pfTableBody tr').count()>0,str(width)+' profitability filter works')
   card.locator('#pfReset').click()
   options=card.locator('#pfMonth option')
   check(options.count()==13,str(width)+' annual + 12 months options')
   value=options.nth(1).get_attribute('value')
   label=options.nth(1).inner_text()
   check(value.endswith('-'+datetime.datetime.strptime(label,'%B %Y').strftime('%m')) and value[:4]==label[-4:],str(width)+' month label matches month key')
   card.locator('#pfMonth').select_option(value)
   check('Forecast view' in card.locator('#pfTableTitle').inner_text(),str(width)+' month view label switches')
   card.locator('#pfGrowth').fill('12.5')
   check('12.5%' in card.locator('#pfGrowthStatus').inner_text(),str(width)+' annual growth draft input works')
   card.locator('#pfMonthUpload').click()
   check(card.locator('#pfUploadHelp').is_visible(),str(width)+' monthly upload preview explicitly gated')
   check('Awaiting approval' in card.inner_text(),str(width)+' no invented forecast values')
   check(not errors,str(width)+' no JS exceptions: '+repr(errors))
   card.screenshot(path=str(ROOT/'tests'/('forecast-v116-'+str(width)+'.png')))
   ctx.close()
  browser.close()
finally:
 server.shutdown()
 temp.unlink(missing_ok=True)
