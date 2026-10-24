"""Annual forecast visual/interaction regression, synthetic Master only."""
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
mock_source=qa['mock'].replace(
 "else if(path==='purchasing_workspace_revision_v47')",
 "else if(path==='purchasing_forecast_history_preview_v118'){result={last_month:'2026-09',data_state:'staged_review_only',rows:args.p_codes.map(c=>({code:c,historical_12m:120,selling_unit:'Piece',last_3m:36,previous_3m:30,matched_rows:12,review_rows:0,months_covered:12,unit_count:1}))};}\n else if(path==='purchasing_workspace_revision_v47')")
mock='<script>window.qaFixture='+json.dumps(fixture)+';\n'+mock_source+"\naddEventListener('load',()=>{void msAudit.loadLive()});</script>"
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
  for width in (1920,1440,1280,1100,1024,768,390,320):
   ctx=browser.new_context(viewport={'width':width,'height':900},timezone_id='Asia/Riyadh')
   page=ctx.new_page()
   errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base+'/forecast-v116-smoke.html',wait_until='load')
   page.locator('#pfTableBody tr').first.wait_for(timeout=25000)
   card=page.locator('#purchaseForecast116')
   original_master=page.evaluate('JSON.stringify(msAudit.getState().master)')
   check(card.count()==1,str(width)+' one forecast UI section')
   check(not card.evaluate('(e)=>e.closest(".hidden")!==null'),str(width)+' visible on Dashboard')
   check(page.locator('#ropGenerator').count()==1,str(width)+' original ROP remains')
   check(card.locator('thead th').count()==5,str(width)+' 5 annual columns')
   toolbar=card.locator('.pf-toolbar[data-ui-build="119"]')
   check(toolbar.count()==1,str(width)+' one combined title/control toolbar')
   check(card.locator('.pf-kicker,.pf-state').count()==0,str(width)+' redundant heading and status badge removed')
   check(toolbar.locator('#pfGrowthStatus').is_visible(),str(width)+' small growth draft remains visible')
   layout=toolbar.evaluate('''e=>{
      const box=e.getBoundingClientRect();
      const boxes=['.pf-head','.pf-controls','#pfMonthUpload','#pfGrowth','#pfGenerate'].map(s=>{
        const x=e.querySelector(s),r=x.getBoundingClientRect();
        return {selector:s,left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height};
      });
      return {left:box.left,right:box.right,height:box.height,scroll:e.scrollWidth,client:e.clientWidth,boxes,
        titleSize:parseFloat(getComputedStyle(e.querySelector('h3')).fontSize),
        innerBorder:getComputedStyle(e.querySelector('.pf-controls')).borderTopWidth};
   }''')
   check(layout['scroll']<=layout['client']+1,str(width)+' toolbar has no horizontal overflow')
   check(all(x['left']>=layout['left']-1 and x['right']<=layout['right']+1 for x in layout['boxes']),str(width)+' all toolbar content fits')
   check(layout['titleSize']==19,str(width)+' compact 19px forecast title')
   check(layout['innerBorder']=='0px',str(width)+' separate controls card removed')
   if width>=960:
    head,controls=layout['boxes'][:2]
    check(head['right']<=controls['left'],str(width)+' title and controls share a horizontal row')
    tops=[x['top'] for x in layout['boxes'][2:]]
    check(max(tops)-min(tops)<2,str(width)+' inputs and actions align')
    check(layout['height']<=86,str(width)+' compact toolbar height')
   toolbar.screenshot(path=str(ROOT/'tests'/('forecast-toolbar-v119-'+str(width)+'.png')))
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
   if width>=1100:
    tops=[x['top'] for x in geometry['controls']]
    check(max(tops)-min(tops)<3,str(width)+' title, filters and both actions share one desktop row')
    check(geometry['titleFits'],str(width)+' annual header title is fully visible')
   if width<760:
    actions=[x['top'] for x in geometry['controls'] if x['id'] in ('pfReset','pfRefresh')]
    check(max(actions)-min(actions)<3,str(width)+' mobile actions stay adjacent')
   check(card.locator('.pf-summary').count()==0,str(width)+' redundant pending summary removed')
   check(card.locator(':scope > .pf-note:not([hidden])').count()==0,str(width)+' no always-visible banner')
   check(card.locator('#pfMonth option').first.inner_text()=='Full Year',str(width)+' annual option simplified')
   labels=card.locator('.pf-header .pf-filter-label').evaluate_all("els=>els.map(e=>[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(''))")
   check(not any(labels),str(width)+' visible filter labels removed')
   for id,label in [('pfSupplier','Filter by supplier'),('pfProfit','Filter by profitability'),('pfMonth','Forecast month'),('pfSearch','Search forecast products')]:
    check(card.locator('#'+id).get_attribute('aria-label')==label,str(width)+' accessible filter '+id)
   check(card.locator('#pfRefresh').get_attribute('aria-label')=='Refresh sales history',str(width)+' refresh icon retains name')
   headings=card.locator('thead').inner_text()
   check('Historical Sales' in headings and 'Final Forecast' in headings and 'under review' in headings,str(width)+' accurate compact table titles')
   check('Annual Base Forecast' not in headings,str(width)+' actual sales not called a forecast')
   card.locator('#pfInfo').click()
   check(card.locator('#pfInfoDialog').is_visible(),str(width)+' data information opens')
   check('staged and under review' in card.locator('#pfInfoDialog').inner_text(),str(width)+' approval meaning remains available')
   page.keyboard.press('Escape')
   check(not card.locator('#pfInfoDialog').is_visible(),str(width)+' info closes on Escape')
   check(page.evaluate('document.activeElement.id')=='pfInfo',str(width)+' focus restored after info closes')
   if width>=960:
    table=card.locator('.pf-scroll').evaluate("e=>({client:e.clientWidth,scroll:e.scrollWidth,right:e.getBoundingClientRect().right,last:e.querySelector('th:last-child').getBoundingClientRect().right})")
    check(table['scroll']<=table['client']+1 and table['last']<=table['right']+1,str(width)+' all five columns fit without clipping')
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
   card.locator('#pfGrowth').fill('101')
   check('between -100%' in card.locator('#pfGrowthStatus').inner_text(),str(width)+' original growth validation remains visible')
   check(not card.locator('#pfGrowth').evaluate('(e)=>e.checkValidity()'),str(width)+' input validation remains enforced')
   card.locator('#pfGrowth').fill('20')
   card.locator('#pfMonthUpload').click()
   check(card.locator('#pfUploadHelp').is_visible(),str(width)+' monthly upload preview explicitly gated')
   check('Pending model' in card.inner_text(),str(width)+' no invented final forecast')
   card.locator('#pfSearch').fill('FORECAST-002')
   page.wait_for_function("document.querySelector('#pfTableBody .pf120-quantity')?.textContent === '120'")
   check('120' in card.locator('#pfTableBody').inner_text(),str(width)+' synthetic historical totals are read-only')
   check('20%' in card.locator('#pfTableBody').inner_text(),str(width)+' observed trend stays unchanged')
   card.locator('[data-pf-info-code="FORECAST-002"]').click()
   info=card.locator('#pfInfoDialog')
   check(info.is_visible(),str(width)+' product details open')
   check('Historical actuals (staged)' in info.inner_text() and '12/12' in info.inner_text(),str(width)+' product provenance and coverage retained')
   check('36' in info.inner_text() and '30' in info.inner_text(),str(width)+' trend inputs visible on demand')
   card.locator('#pfInfoClose').click()
   check(not info.is_visible(),str(width)+' product details close')
   card.locator('#pfMonthUpload').click()
   check(page.evaluate('JSON.stringify(msAudit.getState().master)')==original_master,str(width)+' Master data unchanged')
   card.locator('#pfReset').click()
   check(not errors,str(width)+' no JS exceptions: '+repr(errors))
   card.locator('.pf-scroll').evaluate('(e)=>e.scrollTop=0')
   card.screenshot(path=str(ROOT/'tests'/('forecast-v116-'+str(width)+'.png')))
   card.locator('.pf-table-card').screenshot(path=str(ROOT/'tests'/('forecast-clean-v120-'+str(width)+'.png')))
   ctx.close()
  browser.close()
finally:
 server.shutdown()
 temp.unlink(missing_ok=True)
