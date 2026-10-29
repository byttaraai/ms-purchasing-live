"""Annual forecast visual/interaction regression, synthetic Master only."""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
import json,threading,runpy,shutil,datetime,os,re
ROOT=Path(__file__).resolve().parents[1]
qa=runpy.run_path(str(ROOT/'tests/browser-v82.py'))
fixture=json.loads(json.dumps(qa['fixture']))
for i in range(85):
 row=qa['row']('FORECAST-%03d'%i,60,profit='High' if i%2 else 'Medium')
 row['product_name']='Annual forecast QA item '+str(i).zfill(3)
 row['supplier']='QA Supplier' if i%2 else 'Secondary Supplier'
 fixture['rows'].append(row);fixture['master'].append(dict(row))
periods=[f'{2025+(9+i)//12}-{(9+i)%12+1:02d}' for i in range(12)]
def sales_product(code,name,quantities=None,unit='Piece',missing=()):
 quantities=quantities or [10,10,10,9,9,9,9,9,9,12,12,12]
 months=[{'month':period,'qty':quantities[i],'unit':unit,'source_rows':1,'unit_count':1,'invalid_rows':0,
          'source':[{'file':'synthetic-sales.csv','row':i+3,'qty':quantities[i],'unit':unit}]} for i,period in enumerate(periods) if i not in missing]
 return {'source_id':code,'source_name':name,'source_rows':len(months),'historical_12m':sum(m['qty'] for m in months),'selling_unit':unit,
         'annual_profit_sar':1200,'profit_invalid_rows':0,
         'first_3m':sum(quantities[i] for i in range(3) if i not in missing),'last_3m':sum(quantities[i] for i in range(9,12) if i not in missing),
         'first_3m_months':sum(i not in missing for i in range(3)),'last_3m_months':sum(i not in missing for i in range(9,12)),
         'first_3m_errors':0,'last_3m_errors':0,'months_covered':len(months),'unit_count':1,'invalid_rows':0,'monthly':months}
source_products=[sales_product('sales:'+str(i),'FORECAST-'+str(i).zfill(3)+' source report product') for i in range(122)]
source_products.extend([
 sales_product('sales:unlinked','Source only item - never in Master',unit='Box 30'),
 sales_product('sales:negative','Source negative returns',[-2]+[0]*11),
 sales_product('sales:partial','Source partial history',missing=(0,1)),
 sales_product('sales:literal','Source <img src=x onerror=alert(1)> & literal name')
])
for i,p in enumerate(source_products):
 p['annual_profit_sar']=10000 if i<5 else 3000 if i<15 else 1000 if i<55 else 100 if i<110 else -20
for i,p in enumerate(source_products):
 p.update(supplier=('Saved supplier A' if i%2==0 else 'Saved supplier B') if i<122 else None,
          supplier_status='available' if i<122 else 'unmatched_product',
          supplier_source_code='SOURCE-'+str(i) if i<122 else None,
          supplier_source_revision=1,supplier_synced_at='2026-10-25T12:00:00Z')
source_fixture={'source_mode':'sales_reports','ui_build':125,'first_month':periods[0],'last_month':periods[-1],
 'periods':periods,'source_rows':sum(x['source_rows'] for x in source_products),'rows':source_products}
mock_source=qa['mock'].replace(
 "else if(path==='purchasing_workspace_revision_v47')",
 "else if(path==='purchasing_forecast_history_preview_v121'){if(args.p_codes.length)throw Error('Source view must not request Master codes');if(window.qaSalesFail)return new Response('{}',{status:503});result=structuredClone(window.qaSalesFixture); }\n else if(path==='purchasing_workspace_revision_v47')")

supplier_mock=r"""
window.qaSupplierSource=Object.fromEntries(qaSalesFixture.rows.map(r=>[r.source_id,{supplier:r.supplier,status:r.supplier_status,code:r.supplier_source_code}]));
const salesFetch=window.fetch;
window.fetch=async(url,options)=>{
 if(String(url).split('/').pop()!=='purchasing_forecast_refresh_suppliers_v127')return salesFetch(url,options);
 qaCalls.push({path:'purchasing_forecast_refresh_suppliers_v127',p:{}});
 if(window.qaSupplierDelay)await new Promise(resolve=>{window.qaSupplierRelease=resolve;});
 if(window.qaSupplierFail)return new Response('{}',{status:503});
 let changed=0;
 const rows=qaSalesFixture.rows.map(r=>{
  const src=qaSupplierSource[r.source_id]||{supplier:null,status:'unmatched_product',code:null};
  if(r.supplier!==src.supplier||r.supplier_status!==src.status)changed++;
  const item={source_id:r.source_id,supplier:src.supplier,supplier_status:src.status,supplier_source_code:src.code,supplier_source_revision:2,supplier_synced_at:new Date().toISOString()};
  Object.assign(r,item);return item;
 });
 return new Response(JSON.stringify({ok:true,forecast_computed:false,changed,required:rows.filter(r=>r.supplier_status!=='available').length,rows}),{status:200,headers:{'Content-Type':'application/json'}});
};
"""

mock='<script>window.qaFixture='+json.dumps(fixture)+';window.qaSalesFixture='+json.dumps(source_fixture)+';\n'+mock_source+supplier_mock+"\naddEventListener('load',()=>{void msAudit.loadLive()});</script>"
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
  for width in tuple(map(int,os.environ.get('QA_WIDTHS','1920,1440,1280,1100,1024,768,390,320').split(','))):
   ctx=browser.new_context(viewport={'width':width,'height':900},timezone_id='Asia/Riyadh')
   page=ctx.new_page()
   errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   if os.environ.get('QA_OFFLINE'):
    def inline_style(m):return '<style>'+ (ROOT/m.group(1).split('?')[0]).read_text()+'</style>'
    def inline_script(m):return '<script>'+ (ROOT/m.group(1).split('?')[0]).read_text().replace('</script','<\\/script')+'</script>'
    offline=re.sub(r'<link rel="stylesheet" href="([^"]+)">',inline_style,doc)
    offline=re.sub(r'<script src="([^"]+)"></script>',inline_script,offline)
    storage="<script>for(const k of ['localStorage','sessionStorage']){const d=new Map();Object.defineProperty(window,k,{value:{getItem:k=>d.get(k)||null,setItem:(k,v)=>d.set(k,String(v)),removeItem:k=>d.delete(k),clear:()=>d.clear()}})}</script>"
    offline=offline.replace('<head>','<head>'+storage,1)
    page.set_content(offline,wait_until='load')
   else:page.goto(base+'/forecast-v116-smoke.html',wait_until='load')
   page.locator('#pfTableBody tr').first.wait_for(timeout=25000)
   card=page.locator('#purchaseForecast116')
   original_master=page.evaluate('JSON.stringify(msAudit.getState().master)')
   check(card.count()==1,str(width)+' one forecast UI section')
   check(not card.evaluate('(e)=>e.closest(".hidden")!==null'),str(width)+' visible on Dashboard')
   check(page.locator('#ropGenerator').count()==1,str(width)+' original ROP remains')
   check(card.locator('thead th').count()==7,str(width)+' Sales Level added beside Historical Sales')
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
   if width>=1080:
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
    check(table['scroll']<=table['client']+1 and table['last']<=table['right']+1,str(width)+' all seven columns fit without clipping')
   widths=card.locator('thead th').evaluate_all("els=>els.map(e=>{const r=e.getBoundingClientRect();return {left:r.left,width:r.width}})")
   table_width=sum(x['width'] for x in widths)
   check(abs(widths[1]['width']-74)<2,str(width)+' rating is a compact 74px column')
   check(abs(widths[2]['left']-widths[0]['left']-table_width*.28)<2,str(width)+' intentional compact column allocation')
   check([round(x['width']/table_width*100) for x in widths[2:]]==[16,25,12,8,11],str(width)+' scoped seven-column proportions')
   check(card.locator('thead th').nth(2).inner_text().startswith('Historical Sales') and card.locator('thead th').nth(3).inner_text().startswith('Sales Level'),str(width)+' Sales Level immediately right of Historical Sales')
   level=card.locator('.pf128-level').first
   check(level.locator('.pf128-typical').inner_text()=='9.5',str(width)+' annual median shown')
   check(level.locator('.pf128-change').all_text_contents()==['→ 0%','↑ +10.5%'],str(width)+' both halves use annual median')
   level.click()
   check('Oct 2025 - Mar 2026' in card.locator('#pfInfoContent').inner_text() and 'Apr 2026 - Sep 2026' in card.locator('#pfInfoContent').inner_text(),str(width)+' half-year date ranges explicit')
   check('not growth between halves or a future forecast' in card.locator('#pfInfoContent').inner_text(),str(width)+' comparison meaning explicit')
   card.locator('#pfInfoClose').click()
   check(page.evaluate('document.activeElement.classList.contains("pf128-level")'),str(width)+' Sales Level focus restored')
   cellboxes=level.evaluate('(e)=>[...e.children].map(x=>{const r=x.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top}})')
   check(max(b['top'] for b in cellboxes)-min(b['top'] for b in cellboxes)<2,str(width)+' three compact metrics stay in one row')
   card.locator('#pfSettings').click()
   dialog=card.locator('#pfProfitDialog')
   check(dialog.is_visible(),str(width)+' dedicated profit settings open')
   check(card.locator('#pfProfitSuper').input_value()=='3',str(width)+' ROP defaults: Super x3')
   check('125' not in card.locator('#pfProfitMean').inner_text(),str(width)+' benchmark comes from sales profits')
   baseline=card.locator('#pfProfitMean').inner_text()
   card.locator('#pfProfitSuper').fill('1')
   check(card.locator('#pfProfitApply').is_disabled(),str(width)+' invalid multiplier order blocked')
   card.locator('#pfProfitCancel').click()
   card.locator('#pfSettings').click()
   check(card.locator('#pfProfitSuper').input_value()=='3',str(width)+' Cancel discards settings draft')
   card.locator('#pfProfitSuper').fill('10')
   card.locator('#pfProfitApply').click()
   card.locator('#pfProfit').select_option('super')
   check(card.locator('#pfTableBody tr').count()==0,str(width)+' Apply reclassifies current view')
   card.locator('#pfReset').click()
   card.locator('#pfSettings').click()
   check(card.locator('#pfProfitMean').inner_text()==baseline,str(width)+' filters do not change positive-profit mean')
   check(card.locator('#pfProfitSuper').input_value()=='10',str(width)+' Clear filters does not reset applied multipliers')
   dialog.screenshot(path=str(ROOT/'tests'/('forecast-source-v125-settings-'+str(width)+'.png')))
   card.locator('#pfProfitDefaults').click()
   card.locator('#pfProfitApply').click()
   check(page.evaluate("JSON.parse(localStorage.getItem('msp_forecast_profit_v126:qa-user')).multipliers.super")==3,str(width)+' preferences stored separately per account')
   page.wait_for_function("() => !document.querySelector('#pfGenerate').disabled")
   check(card.locator('#pfGenerate').is_enabled(),str(width)+' Generate updates suppliers only; final model remains pending')
   check(page.evaluate("qaCalls.filter(x=>x.path==='purchasing_forecast_refresh_suppliers_v127').length")==0,str(width)+' opening page never refreshes supplier source')
   check(card.locator('#pfTableBody tr').count()==60,str(width)+' product rows are paginated')
   check(card.locator('#pfNext').is_enabled(),str(width)+' next page enabled')
   card.locator('#pfNext').click()
   check('2 / ' in card.locator('#pfCount').inner_text(),str(width)+' pagination advances')
   card.locator('#pfSearch').fill('FORECAST-002')
   check(card.locator('#pfTableBody tr').count()==1,str(width)+' search works by product code')
   card.locator('#pfReset').click()
   check(card.locator('#pfSupplier').is_enabled(),str(width)+' saved supplier filter enabled')
   card.locator('#pfSupplier').select_option('supplier:Saved supplier A')
   check(card.locator('#pfTableBody tr').count()>0,str(width)+' supplier filter uses saved values')
   check(all('Saved supplier A' in t for t in card.locator('.pf127-supplier').all_inner_texts()),str(width)+' filtered suppliers consistent')
   card.locator('#pfSupplier').select_option('required')
   check(card.locator('#pfTableBody tr').count()==4,str(width)+' missing-source items retained and filterable')
   card.locator('#pfReset').click()
   check(card.locator('#pfProfit').is_enabled(),str(width)+' sales-based profitability filter enabled')
   card.locator('#pfProfit').select_option('super')
   check(card.locator('#pfTableBody tr').count()==5,str(width)+' annual Super filter works')
   card.locator('#pfReset').click()
   card.locator('#pfReset').click()
   options=card.locator('#pfMonth option')
   check(options.count()==13,str(width)+' annual + 12 months options')
   value=options.nth(1).get_attribute('value')
   label=options.nth(1).inner_text()
   check(value.endswith('-'+datetime.datetime.strptime(label,'%b %Y').strftime('%m')) and value[:4]==label[-4:],str(width)+' month label matches month key')
   card.locator('#pfMonth').select_option(value)
   check('Sales' in card.locator('#pfTableTitle').inner_text(),str(width)+' month view label switches')
   card.locator('#pfGrowth').fill('12.5')
   check('12.5%' in card.locator('#pfGrowthStatus').inner_text(),str(width)+' annual growth draft input works')
   card.locator('#pfGrowth').fill('101')
   check('between -100%' in card.locator('#pfGrowthStatus').inner_text(),str(width)+' original growth validation remains visible')
   check(not card.locator('#pfGrowth').evaluate('(e)=>e.checkValidity()'),str(width)+' input validation remains enforced')
   card.locator('#pfGrowth').fill('20')
   card.locator('#pfMonthUpload').click()
   check(card.locator('#pfUploadHelp').is_visible(),str(width)+' monthly upload preview explicitly gated')
   check('Pending model' in card.inner_text(),str(width)+' no invented final forecast')
   card.locator('#pfMonth').select_option('annual')
   card.locator('#pfSearch').fill('FORECAST-002')
   page.wait_for_function("() => document.querySelector('#pfTableBody .pf120-quantity')?.textContent === '120'")
   check('120' in card.locator('#pfTableBody').inner_text(),str(width)+' synthetic historical totals are read-only')
   check('+20%' in card.locator('#pfTableBody').inner_text(),str(width)+' annual first-vs-last trend calculated')
   card.locator('.pf120-info[data-pf-info-code="sales:2"]').click()
   info=card.locator('#pfInfoDialog')
   check(info.is_visible(),str(width)+' product details open')
   check('Historical actuals (staged)' in info.inner_text() and '12/12' in info.inner_text(),str(width)+' product provenance and coverage retained')
   check('36' in info.inner_text() and '30' in info.inner_text(),str(width)+' trend inputs visible on demand')
   card.locator('#pfInfoClose').click()
   check(not info.is_visible(),str(width)+' product details close')
   check(card.locator('#pfInfoDialog [data-sales-month]').count()==12,str(width)+' all twelve monthly quantities accessible')
   card.locator('#pfMonthUpload').click()
   card.locator('#pfSearch').fill('Source only item')
   check(card.locator('#pfTableBody .pf120-quantity').inner_text()=='120',str(width)+' unlinked source product is not excluded')
   check('Box 30' in card.locator('#pfTableBody').inner_text(),str(width)+' original selling unit retained without purchase conversion')
   check('No matched' not in card.locator('#pfTableBody').inner_text(),str(width)+' incorrect No Match placeholder removed')
   level_before=card.locator('.pf128-level').inner_text()
   card.locator('#pfMonth').select_option('2025-10')
   check(card.locator('.pf128-level').inner_text()==level_before,str(width)+' selected month does not change annual level')
   check(card.locator('#pfTableBody .pf120-quantity').inner_text()=='10',str(width)+' selected month shows recorded quantity')
   card.locator('#pfMonth').select_option('annual')
   card.locator('#pfSearch').fill('Source negative returns')
   check(card.locator('#pfTableBody .pf120-quantity').inner_text()=='-2',str(width)+' negative returns are never clamped')
   check(card.locator('.pf128-change').all_text_contents()==['—','—'],str(width)+' nonpositive median suppresses ratios')
   card.locator('#pfSearch').fill('Source partial history')
   check(card.locator('.pf128-typical').inner_text()=='—' and '10/12' in card.locator('.pf128-level').inner_text(),str(width)+' missing months are not imputed')
   card.locator('.pf120-info[data-pf-info-code="sales:partial"]').click()
   check('Not reported' in card.locator('#pfInfoContent').inner_text(),str(width)+' missing months distinct from zero')
   card.locator('#pfInfoClose').click()
   card.locator('#pfSearch').fill('literal name')
   check(card.locator('#pfTableBody img').count()==0,str(width)+' source names escaped safely')
   card.locator('#pfSearch').fill('Critical A')
   check(card.locator('#pfTableBody tr').count()==0,str(width)+' Master-only products are not included')
   if width in (1440,390):
    card.locator('#pfReset').click()
    card.locator('#pfSearch').fill('FORECAST-002')
    quantity_before=card.locator('.pf120-quantity').inner_text()
    rating_before=card.locator('.pf126-rating').inner_text()
    check(card.locator('.pf127-supplier').inner_text()=='Saved supplier A',str(width)+' supplier displayed below name')
    page.evaluate("qaSupplierSource['sales:2']={supplier:'Updated Source Supplier',status:'available',code:'SOURCE-2'}")
    card.locator('#pfRefresh').click()
    page.wait_for_function("() => !document.querySelector('#pfRefresh').disabled && document.querySelector('#pfTableBody .pf127-supplier')")
    check(card.locator('.pf127-supplier').inner_text()=='Saved supplier A',str(width)+' refresh does not fetch live supplier changes')
    page.evaluate('window.qaSupplierDelay=true')
    card.locator('#pfGenerate').click()
    check(card.locator('#pfGenerate').is_disabled(),str(width)+' Generate locks during snapshot write')
    page.evaluate("document.querySelector('#pfGenerate').dispatchEvent(new Event('click'));qaSupplierRelease();window.qaSupplierDelay=false")
    page.wait_for_function("() => document.querySelector('#pfSupplierSyncStatus').textContent.startsWith('Suppliers saved:')")
    check(page.evaluate("qaCalls.filter(x=>x.path==='purchasing_forecast_refresh_suppliers_v127').length")==1,str(width)+' repeated click cannot duplicate sync')
    check(card.locator('.pf127-supplier').inner_text()=='Updated Source Supplier',str(width)+' Generate copies changed supplier')
    check(card.locator('.pf120-quantity').inner_text()==quantity_before and card.locator('.pf126-rating').inner_text()==rating_before,str(width)+' supplier sync does not change quantities or ratings')
    check('Pending model' in card.locator('#pfTableBody').inner_text(),str(width)+' Generate never invents forecast results')
    card.locator('#pfRefresh').click()
    page.wait_for_function("() => !document.querySelector('#pfRefresh').disabled && document.querySelector('#pfTableBody .pf127-supplier')")
    check(card.locator('.pf127-supplier').inner_text()=='Updated Source Supplier',str(width)+' saved supplier persists on data reload')
    page.evaluate("window.qaSupplierFail=true;qaSupplierSource['sales:2'].supplier='Next supplier'")
    card.locator('#pfGenerate').click()
    page.wait_for_function("() => document.querySelector('#pfSupplierSyncStatus').textContent.includes('not confirmed')")
    check(card.locator('.pf127-supplier').inner_text()=='Updated Source Supplier',str(width)+' failed sync retains previous supplier')
    page.evaluate('window.qaSupplierFail=false')
    card.locator('#pfGenerate').click()
    page.wait_for_function("() => document.querySelector('#pfSupplierSyncStatus').textContent.startsWith('Suppliers saved:')")
    check(card.locator('.pf127-supplier').inner_text()=='Next supplier',str(width)+' retry succeeds')
    page.evaluate("qaSupplierSource['sales:2']={supplier:null,status:'missing_supplier',code:'SOURCE-2'};qaSupplierSource['sales:unlinked']={supplier:'New supplier for source-only item',status:'available',code:'SOURCE-NEW'}")
    card.locator('#pfGenerate').click()
    page.wait_for_function("() => document.querySelector('#pfSupplierSyncStatus').textContent.startsWith('Suppliers saved:')")
    check(card.locator('.pf127-supplier').inner_text()=='Supplier required',str(width)+' source supplier removal clears stale saved supplier')
    check(card.locator('.pf120-quantity').inner_text()==quantity_before,str(width)+' missing supplier never hides quantities')
    card.locator('#pfSearch').fill('Source only item')
    check(card.locator('.pf127-supplier').inner_text()=='New supplier for source-only item',str(width)+' newly identified supplier is copied')
    card.locator('#pfReset').click()
    page.evaluate('window.qaSupplierAudit=msAudit.getState;msAudit.getState=()=>({...qaSupplierAudit(),role:"viewer"})')
    page.wait_for_function("() => document.querySelector('#pfGenerate').disabled")
    count=page.evaluate("qaCalls.filter(x=>x.path==='purchasing_forecast_refresh_suppliers_v127').length")
    page.evaluate("document.querySelector('#pfGenerate').dispatchEvent(new Event('click'))")
    check(page.evaluate("qaCalls.filter(x=>x.path==='purchasing_forecast_refresh_suppliers_v127').length")==count,str(width)+' read-only user cannot start supplier write')
    page.evaluate('msAudit.getState=qaSupplierAudit')
    page.wait_for_function("() => !document.querySelector('#pfGenerate').disabled")
   if width==1440:
    page.evaluate('window.qaOldAudit=msAudit.getState;msAudit.getState=()=>({...qaOldAudit(),master:[]})')
    card.locator('#pfRefresh').click()
    page.wait_for_function("() => document.querySelector('#pfSourceStatus').textContent.includes('126 sales products')")
    card.locator('#pfSearch').fill('Source only item')
    check(card.locator('#pfTableBody .pf120-quantity').inner_text()=='120','empty Master cannot suppress sales')
    page.evaluate('msAudit.getState=qaOldAudit;window.qaSalesFail=true')
    card.locator('#pfRefresh').click()
    page.wait_for_function("() => document.querySelector('#pfSourceStatus').textContent.includes('503')")
    check(card.locator('#pfTableBody tr').count()==0,'failed fetch does not leave stale quantities')
    page.evaluate('window.qaSalesFail=false')
    card.locator('#pfRefresh').click()
    page.wait_for_function("() => document.querySelector('#pfSourceStatus').textContent.includes('126 sales products')")
   check(page.evaluate('JSON.stringify(msAudit.getState().master)')==original_master,str(width)+' Master data unchanged')
   card.locator('#pfReset').click()
   check(not errors,str(width)+' no JS exceptions: '+repr(errors))
   card.locator('.pf-scroll').evaluate('(e)=>e.scrollTop=0')
   card.screenshot(path=str(ROOT/'tests'/('forecast-v116-'+str(width)+'.png')))
   card.locator('.pf-table-card').screenshot(path=str(ROOT/'tests'/('forecast-source-v125-'+str(width)+'.png')))
   if width==1440:
    card.locator('#pfSearch').fill('FORECAST-002')
    page.evaluate("qaSalesFixture.rows[2].monthly.forEach((m,i)=>m.qty=i<6?80:120)")
    card.locator('#pfRefresh').click()
    page.wait_for_function("() => document.querySelector('.pf128-typical')?.textContent==='100'")
    check(card.locator('.pf128-change').all_text_contents()==['↓ -20%','↑ +20%'],'80 / 120 halves compared to median 100')
    card.locator('.pf128-level').click()
    card.locator('#pfInfoDialog').screenshot(path=str(ROOT/'tests'/'forecast-sales-level-v128-details-1440.png'))
    card.locator('#pfInfoClose').click()
    for data,expected in [([0]*12,'0'),([-3]*12,'-3'),([100]*11+[3000],'100')]:
     page.evaluate('(q)=>qaSalesFixture.rows[2].monthly.forEach((m,i)=>m.qty=q[i])',data)
     card.locator('#pfRefresh').click()
     page.wait_for_function("v => document.querySelector('.pf128-typical')?.textContent===v",arg=expected)
     check(card.locator('.pf128-typical').inner_text()==expected,'edge-case median '+expected)
    page.evaluate("qaSalesFixture.rows[2].monthly[0].unit='Other unit'")
    card.locator('#pfRefresh').click()
    page.wait_for_function("() => document.querySelector('.pf128-level')?.textContent.includes('Check data')")
    check(card.locator('.pf128-typical').inner_text()=='—','mixed units block level only')
    card.locator('#pfReset').click()
   if width==1440:
    page.evaluate('window.qaSupplierDelay=true')
    card.locator('#pfGenerate').click()
    page.evaluate('window.qaLogoutAudit=msAudit.getState;msAudit.getState=()=>({...qaLogoutAudit(),session:null,role:null})')
    page.wait_for_function("() => document.querySelector('#pfSourceStatus').textContent.includes('Sign in')")
    check(card.locator('#pfTableBody tr').count()==0,'logout clears supplier data with sales rows')
    page.evaluate('qaSupplierRelease();window.qaSupplierDelay=false')
    page.wait_for_timeout(150)
    check(card.locator('#pfTableBody tr').count()==0,'late supplier response cannot repopulate logged-out view')
    check(card.locator('#pfInfoContent').inner_text()=='','logout clears supplier provenance in info dialog')
   ctx.close()
  browser.close()
finally:
 server.shutdown()
 temp.unlink(missing_ok=True)
