"""Actual page UX regression, offline synthetic sales and mocked RPC only."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import runpy,json,threading,shutil,time,os,re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
qa=runpy.run_path(str(ROOT/'tests/browser-v82.py'))
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start();origin='http://127.0.0.1:'+str(server.server_port)
checks=[]
def check(ok,label):
 assert ok,label
 checks.append(label); print('PASS '+label,flush=True)
def wait(p,expr):
 end=time.monotonic()+25
 while time.monotonic()<end:
  if p.evaluate('()=>('+expr+')'):return
  p.wait_for_timeout(40)
 raise AssertionError('Timed out '+expr)
def make_fixture():
 f=json.loads(json.dumps(qa['fixture']))
 for i in range(80):
  r=qa['row']('UX%04d'%i,50,profit='Medium')
  r['product_name']='Product %04d long descriptive name for a veterinary purchase pack'%i
  if i==2:r['product_name']='Product 0002 <img src=x onerror=alert(1)> & safe name'
  f['rows'].append(r);f['master'].append(dict(r))
 return f
fixture=make_fixture()
base_mock=qa['mock']
mock_extra=r'''
window.qaGeneratorCalls=[];window.qaRpcFail=false;window.qaDelay=0;
const oldQaFetch=window.fetch;
window.fetch=async(url,options)=>{
 if(!String(url).endsWith('/purchasing_sales_generator_v113'))return oldQaFetch(url,options);
 const a=JSON.parse(options.body);qaGeneratorCalls.push(structuredClone(a));
 if(qaDelay)await new Promise(r=>setTimeout(r,qaDelay));
 if(qaRpcFail)return new Response(JSON.stringify({message:'Synthetic server validation failed'}),{status:400});
 const pos=a.p_rows.filter(r=>r.profit>0),avg=pos.reduce((s,r)=>s+r.profit,0)/pos.length;
 let changed=0,eligible=0,skipped=0;const classes={Super:0,High:0,Medium:0,Low:0,Loss:0};
 const rows=a.p_rows.map((r,i)=>{
  const cls=r.profit<=0?'Loss':r.profit>=avg*a.p_mult.super?'Super':r.profit>=avg*a.p_mult.high?'High':r.profit>=avg*a.p_mult.medium?'Medium':'Low';classes[cls]++;
  const m=qaFixture.master.find(m=>m.product_code===r.code);
  const review=!m?'Unmatched product name':r.unit!=='Piece'?'Unverified unit conversion':null;
  const rop=review?null:Math.ceil(r.qty/12/30*a.p_cover[cls.toLowerCase()]);
  const isChanged=!review&&i!==0;
  if(review)skipped++;else eligible++;if(isChanged)changed++;
  return {name:r.name,code:r.code,profit:r.profit,classification:cls,monthly_sales:r.qty/12,report_unit:r.unit,purchase_unit:m?.purchase_unit||null,new_rop:rop,eligible:!review,changed:isChanged,review};
 });
 if(a.p_approve){for(const r of rows.filter(r=>r.changed)){const m=qaFixture.master.find(m=>m.product_code===r.code);m.profitability_class=r.classification;m.reorder_point=r.new_rop;}qaFixture.master_revision++;}
 return new Response(JSON.stringify({ok:true,approved:a.p_approve,master_revision:qaFixture.master_revision,rows,source_rows:rows.length,eligible_rows:eligible,skipped_rows:skipped,changed_rows:changed,unchanged_rows:eligible-changed,mean_positive_profit:avg,class_counts:classes}),{status:200,headers:{'Content-Type':'application/json'}});
};
'''
mock='window.qaFixture='+json.dumps(fixture)+';\n'+base_mock+mock_extra+"\naddEventListener('load',()=>{void msAudit.loadLive();});"
html=(ROOT/'index.html').read_text().replace('</head>','<script>'+mock+'</script></head>',1)
pagefile=ROOT/'reorder-ux107-qa.html';pagefile.write_text(html)
def csv_data(n=81):
 names=[r['product_name'] for r in fixture['master'] if r['product_code'].startswith('UX')]
 rows=['Product Name,Supplier,Sales,,Refunds,,Net Sales,,Total Cost,Profit,,Profit percentage,',',,Quantity,Value,Quantity,Value,Quantity,Value,,Value,Percentage,To Sales,To Cost']
 for i in range(n):
  name=names[i] if i<len(names) else 'Unmatched synthetic product %04d'%i
  unit='Box 3' if 76<=i<80 else 'Piece'; profit=(100000 if i==1 else -100 if i%17==0 else 500+i*111)
  q='"120 '+unit+'"';name='"'+name.replace('"','""')+'"'
  rows.append(','.join([name,'',q,'0 SR','"0 '+unit+'"','0 SR',q,'0 SR','0 SR',str(profit)+' SR','','','']))
 return {'name':'Synthetic-From 01_10_2025 To 01_10_2026.csv','mimeType':'text/csv','buffer':('\n'.join(rows)+'\n').encode()}
def recent_csv_data(n=81):
 report=csv_data(n)
 report['name']='Synthetic-From 01_06_2026 To 01_10_2026.csv'
 return report
def start(browser,width=1440,live=False):
 ctx=browser.new_context(viewport={'width':width,'height':1000 if width>700 else 844})
 errors=[];external=[]
 # Offline harness: every real repository asset is inlined without modification.
 # No navigation or outbound network is needed in this execution environment.
 def style(m):return '<style>'+ (ROOT/m.group(1).split('?')[0]).read_text()+'</style>'
 def script(m):return '<script>'+ (ROOT/m.group(1).split('?')[0]).read_text().replace('</script','<\\/script')+'</script>'
 doc=re.sub(r'<link rel="stylesheet" href="([^"]+)">',style,html)
 doc=re.sub(r'<script src="([^"]+)"></script>',script,doc)
 storage="""<script>for(const k of ['localStorage','sessionStorage']){const data=new Map();Object.defineProperty(window,k,{value:{getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),clear:()=>data.clear()}});}</script>"""
 doc=doc.replace('<head>','<head>'+storage+'<script>if(!crypto.randomUUID)Object.defineProperty(crypto,\"randomUUID\",{value:()=>\"77777777-7777-4777-8777-777777777777\"});</script>',1)
 if live:
  old="const liveHost=()=>location.hostname==='byttaraai.github.io';"
  assert doc.count(old)==1
  doc=doc.replace(old,'const liveHost=()=>true; // QA only: exercise mocked server path offline')
 ctx.route('**/*',lambda r:(external.append(r.request.url),r.abort()))
 p=ctx.new_page();p.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE_ERROR',str(e),flush=True)));p.on('console',lambda m:print('CONSOLE',m.text[:250],flush=True) if os.environ.get('QA_DEBUG') else None)
 p.set_content(doc,wait_until='load')
 try:wait(p,"typeof state!=='undefined' && state.taskAssistant?.tasks?.some(t=>t.focus==='data')")
 except Exception:
  print('START_ERRORS',errors,flush=True);raise
 p.evaluate("go('daily-tasks');document.querySelector('#ropGenerator').scrollIntoView({block:'center'})")
 return ctx,p,errors,external
screens=Path(os.environ.get('MS_UX107_SCREENSHOTS',str(ROOT/'tests'/'.ux107-artifacts')));screens.mkdir(parents=True,exist_ok=True)
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for width in ([] if os.environ.get('QA_LIVE_ONLY') else [1920,1440,1280,1024,768,390]):
   ctx,p,errors,external=start(browser,width)
   try:
    original=p.evaluate('JSON.stringify(state.master)')
    check(not p.locator('#ropgProducts').evaluate('(e)=>e.open'),str(width)+' initially collapsed')
    check(p.locator('#ropGenerator').bounding_box()['height']<80,str(width)+' initial compact row')
    check(p.locator('#ropgSettingsDialog [data-m]').count()==3,str(width)+' multipliers inside settings dialog')
    geom=p.evaluate("()=>{const r=document.querySelector('#ropGenerator').getBoundingClientRect();return [...document.querySelectorAll('#ropgUpload,#ropgGenerate,#ropgApprove,#ropgSettings,#ropgProducts summary')].map(e=>{const b=e.getBoundingClientRect();return {x:b.x,right:b.right,y:b.y,width:b.width,leftLimit:r.left,rightLimit:r.right}})}")
    check(all(g['x']>=g['leftLimit'] and g['right']<=g['rightLimit']+1 for g in geom),str(width)+' all actions pinned visibly inside card')
    check(max(g['y'] for g in geom)-min(g['y'] for g in geom)<4,str(width)+' fixed actions share one row')
    p.locator('#ropGenerator input[type=file]').first.set_input_files(csv_data())
    p.locator('#ropGenerator input[type=file]').nth(1).set_input_files(recent_csv_data())
    p.locator('#rop111Complete').check()
    wait(p,"document.querySelectorAll('#ropgProducts tbody tr').length===25 && !document.querySelector('#ropgGenerate').disabled")
    check(p.locator('#ropgSummary [data-filter]').count()==4,str(width)+' single summary of four filter chips')
    check(not p.locator('#ropgProducts').evaluate('(e)=>e.open'),str(width)+' imported preview remains collapsed')
    p.locator('#ropgProducts summary').click()
    check(p.locator('#ropgProducts thead').is_visible(),str(width)+' real table header visible')
    check(p.locator('#ropgProducts th[scope=col]').count()==6,str(width)+' all six accessible headers')
    check('Preview only' in p.locator('.ux107-verification').inner_text() and 'Not saved' in p.locator('.ux107-verification').inner_text(),str(width)+' local results explicitly say not saved')
    check(p.locator('#ropgGenerate').evaluate('(e)=>e.classList.contains("primary")') and not p.locator('#ropgApprove').evaluate('(e)=>e.classList.contains("primary")'),str(width)+' local preview never highlights approval')
    check(p.locator('#ropgProducts tbody tr').first.locator('td').nth(3).inner_text().splitlines()[0]=='10',str(width)+' sales hide unnecessary .000 decimals')
    check(p.locator('#ropgProducts tbody tr').first.locator('td').nth(1).inner_text()=='-100.00',str(width)+' profit retains two decimals')
    check(p.locator('#ropgProducts tbody tr').first.locator('td').nth(4).inner_text().splitlines()[0].isdigit(),str(width)+' ROP remains an integer display')
    row_style=p.locator('#ropgProducts tbody td').first.evaluate('(e)=>({padding:getComputedStyle(e).paddingTop,font:getComputedStyle(e).fontSize})')
    check(row_style['padding']=='6px' and row_style['font']=='12px',str(width)+' denser row padding without smaller product font')
    check(p.locator('.ux107-state .ux108-state-icon').count()>0,str(width)+' status has icon and text instead of color only')
    p.locator('#ropgReportInfo').click()
    check(p.locator('#ropgReportDialog').is_visible(),str(width)+' report metadata opens accessibly')
    report_text=p.locator('#ropgReportDialog').inner_text()
    check('Synthetic-From 01_10_2025 To 01_10_2026.csv' in report_text and '2025-10-01 to 2026-10-01' in report_text,str(width)+' report metadata uses actual filename and validated period')
    check('Last calculated (Riyadh)' in report_text and 'Not calculated yet' not in report_text,str(width)+' calculation time is available without another dashboard row')
    box=p.locator('#ropgReportDialog').bounding_box()
    check(box['x']>=0 and box['x']+box['width']<=width+1,str(width)+' report dialog stays inside viewport')
    if width==1440:p.locator('#ropgReportDialog').screenshot(path=str(screens/'report-details.png'))
    p.keyboard.press('Escape')
    check(not p.locator('#ropgReportDialog').is_visible(),str(width)+' report dialog closes on Escape')
    check(p.locator('#ropgProducts .ux107-product img').count()==0,str(width)+' product HTML escaped')
    check(p.locator('#ropgProducts .ux107-product-code').first.inner_text()=='UX0000',str(width)+' master code below name')
    p.locator('#ropgNextPage').click();check('26' in p.locator('#ropgPageRange').inner_text(),str(width)+' pagination advances')
    p.locator('#ropgPageSize').select_option('50');check(p.locator('#ropgProducts tbody tr').count()==50,str(width)+' 50 rows option')
    p.locator('#ropgSearch').fill('UX0002');check(p.locator('#ropgProducts tbody tr').count()==1 and 'UX0002' in p.locator('#ropgProducts tbody').inner_text(),str(width)+' search matches code')
    p.locator('#ropgClearFilters').click();p.locator('#ropgClassFilter').select_option('Loss');check(all(x=='Loss' for x in p.locator('tbody .ux107-rating').all_text_contents()),str(width)+' classification filter')
    p.locator('#ropgClearFilters').click();p.locator('#ropgSummary [data-filter=review]').click()
    check(p.locator('#ropgProducts tbody tr').count()==5,str(width)+' review chip filters five excluded rows')
    p.locator('[data-review-index="76"]').click()
    check(p.locator('#ropgReviewDialog').is_visible(),str(width)+' review dialog opens')
    check('Box 3' in p.locator('#ropgReviewDialog').inner_text() and 'Piece' in p.locator('#ropgReviewDialog').inner_text(),str(width)+' review shows report and Master units')
    check(p.locator('#ropgReviewDialog input').count()==0,str(width)+' review is read only')
    p.keyboard.press('Escape');p.locator('#ropgSettings').click()
    check(p.locator('#ropgSettingsDialog').is_visible(),str(width)+' settings opens modal')
    check('SAR' in p.locator('#ropgMeanProfit').inner_text(),str(width)+' average profit appears in settings')
    p.locator('[data-m=super]').fill('3.2');wait(p,"document.querySelector('.ropg-status').textContent.includes('Local preview only') && !document.querySelector('#ropgGenerate').disabled")
    p.keyboard.press('Escape')
    check(not p.locator('#ropgSettingsDialog').is_visible(),str(width)+' Escape closes settings')
    p.locator('#ropgClearFilters').click()
    if width==1440:
     p.locator('#ropGenerator').screenshot(path=str(screens/'generator-desktop.png'))
     p.locator('#ropgSettings').click();p.locator('#ropgSettingsDialog').screenshot(path=str(screens/'settings.png'));p.keyboard.press('Escape')
    p.locator('.ropg-table-scroll').evaluate('(e)=>e.scrollTop=240')
    top=p.evaluate("()=>({head:document.querySelector('#ropgProducts th').getBoundingClientRect().top,box:document.querySelector('.ropg-table-scroll').getBoundingClientRect().top})")
    check(abs(top['head']-top['box'])<3,str(width)+' headers remain pinned inside scroller')
    p.locator('#ropgProducts summary').click();p.locator('#ropgProducts summary').click()
    check(p.locator('#ropgProducts tbody tr').count()==50,str(width)+' collapse preserves filters and rows')
    check(p.evaluate('JSON.stringify(state.master)')==original,str(width)+' UI never changes Master')
    check(p.locator('#ropgApprove').is_disabled(),str(width)+' local approval gate preserved')
    check(not errors and not external,str(width)+' no JS errors or external IO '+str((errors,external)))
   finally:ctx.close()
  # Mock the authenticated live-host path, without a single request leaving the test.
  ctx,p,errors,external=start(browser,1440,live=True)
  try:
   original=p.evaluate('JSON.stringify(state.master)')
   p.evaluate('qaDelay=900')
   p.locator('#ropGenerator input[type=file]').first.set_input_files(csv_data())
   p.locator('#ropGenerator input[type=file]').nth(1).set_input_files(recent_csv_data())
   p.locator('#rop111Complete').check()
   wait(p,"document.querySelector('#ropgGenerate').getAttribute('aria-busy')==='true'")
   check(p.locator('#ropgGenerate').inner_text().strip()=='Calculating\u2026','button clearly says Calculating during read-only verification')
   check(p.locator('#ropgApprove').is_disabled(),'approval stays gated during verification')
   p.emulate_media(reduced_motion='reduce')
   check(p.locator('#ropgGenerate svg').evaluate('(e)=>getComputedStyle(e).animationName')=='none','reduced motion disables spinner animation but not loading text')
   p.emulate_media(reduced_motion='no-preference')
   wait(p,"!document.querySelector('#ropgApprove').disabled")
   p.evaluate('qaDelay=0')
   check(p.locator('.ux107-verification').inner_text()=='Preview verified \u00b7 Not saved','verified is not misrepresented as saved')
   check(p.locator('#ropgApprove').evaluate('(e)=>e.classList.contains("primary")') and not p.locator('#ropgGenerate').evaluate('(e)=>e.classList.contains("primary")'),'Approve is the sole primary action after verification')
   check(p.locator('#ropgGenerate').inner_text().strip()=='Recalculate' and p.locator('#ropgGenerate').get_attribute('aria-busy')=='false','calculation label resets after verification')
   check(p.locator('#ropgApprove').inner_text().strip()=='Approve \u00b7 75','authoritative changed count on approval button')
   check(p.locator('#ropgSummary [data-filter=unchanged] strong').inner_text()=='1','server unchanged count')
   p.locator('#ropgSummary [data-filter=review]').click()
   check(p.locator('#ropgProducts tbody tr').count()==5,'server review filter')
   p.locator('#ropgApprove').click()
   check(p.locator('#ropgConfirmDialog').is_visible(),'explicit confirm modal')
   check('75' in p.locator('#ropgConfirmDialog').inner_text() and '5 excluded' in p.locator('#ropgConfirmDialog').inner_text(),'confirm shows full changed and excluded counts despite filter')
   check('30 days' in p.locator('#ropgConfirmDialog').inner_text() and '1.5' in p.locator('#ropgConfirmDialog').inner_text(),'confirmation uses preview coverage and multipliers')
   p.locator('#ropgCancelApproval').click()
   check(p.evaluate('qaGeneratorCalls.filter(c=>c.p_approve).length')==0,'cancel makes no write request')
   check(p.evaluate('JSON.stringify(state.master)')==original,'cancel preserves Master')
   p.locator('#ropgApprove').click()
   p.evaluate("(()=>{const e=document.querySelector('[data-rop-class=super]');e.value='31';e.dispatchEvent(new Event('input',{bubbles:true}));})()")
   wait(p,"!document.querySelector('#ropgConfirmDialog').open && !document.querySelector('#ropgApprove').disabled")
   check(p.evaluate('qaGeneratorCalls.filter(c=>c.p_approve).length')==0,'stale confirmation cancelled after settings changed')
   p.locator('#ropgApprove').click();p.locator('#ropgConfirmDialog').screenshot(path=str(screens/'confirmation.png'))
   p.evaluate('qaDelay=900')
   p.locator('#ropgConfirmApproval').click()
   wait(p,"document.querySelector('#ropgApprove').getAttribute('aria-busy')==='true'")
   check(p.locator('#ropgApprove').inner_text().strip()=='Saving\u2026','button clearly says Saving only after explicit confirmation')
   check(p.locator('#ropgApprove').get_attribute('aria-busy')=='true' and p.locator('#ropgApprove').is_disabled(),'saving button is busy and cannot be clicked again')
   check(p.locator('#ropgGenerate').is_disabled() and p.locator('[data-rop-class=super]').is_disabled(),'existing save gates remain active')
   p.evaluate("document.querySelector('#ropgApprove').dispatchEvent(new Event('click'))")
   wait(p,"document.querySelector('#ropgNotice').textContent.includes('Approved') && !document.querySelector('#ropgUpload').disabled")
   check(p.evaluate('qaGeneratorCalls.filter(c=>c.p_approve).length')==1,'exactly one confirmed mocked save')
   check(p.evaluate('qaGeneratorCalls.find(c=>c.p_approve).p_rows.length')==81,'approval includes original report, never filtered/page subset')
   check(p.evaluate("(()=>{const w=qaGeneratorCalls.find(c=>c.p_approve),r=qaGeneratorCalls.filter(c=>!c.p_approve).at(-1);return JSON.stringify(w.p_rows)===JSON.stringify(r.p_rows)&&JSON.stringify(w.p_cover)===JSON.stringify(r.p_cover)&&JSON.stringify(w.p_mult)===JSON.stringify(r.p_mult)&&w.p_revision===r.p_revision;})()"),'approval payload matches the verified preview exactly')
   check('75' in p.locator('#ropgNotice').inner_text(),'success shows actual server updated count')
   check(p.locator('#ropgApprove').is_disabled(),'approval locked after save')
   check(p.locator('#ropgApprove').inner_text().strip()=='Saved \u00b7 75','saved label reflects the actual server count')
   check(p.locator('.ux107-verification').inner_text()=='Saved to Master','saved state appears only after server approval confirmation')
   check(p.locator('#ropgApprove').get_attribute('aria-busy')=='false' and p.locator('#ropGenerator').get_attribute('aria-busy')=='false','busy indicators reset after save')
   p.locator('#ropgProducts summary').evaluate('(e)=>{e.parentElement.open=true}')
   p.locator('#ropgClearFilters').click()
   p.locator('#ropGenerator').screenshot(path=str(screens/'saved.png'))
   check(not errors and not external,'mocked live path has no JS errors or external IO '+str((errors,external)))
  finally:ctx.close()
  # Failed verification changes presentation only and must never enable approval.
  ctx,p,errors,external=start(browser,1440,live=True)
  try:
   p.evaluate('qaRpcFail=true;qaDelay=150')
   p.locator('#ropGenerator input[type=file]').first.set_input_files(csv_data())
   p.locator('#ropGenerator input[type=file]').nth(1).set_input_files(recent_csv_data())
   p.locator('#rop111Complete').check()
   wait(p,"document.querySelector('#ropgNotice').textContent.includes('Server verification unavailable') && !document.querySelector('#ropgGenerate').disabled")
   check(p.locator('#ropgApprove').is_disabled() and not p.locator('#ropgApprove').evaluate('(e)=>e.classList.contains("primary")'),'failed verification never highlights or unlocks Approve')
   check('Not saved' in p.locator('.ux107-verification').inner_text(),'failed verification remains visibly unsaved')
   check(p.locator('#ropgGenerate').inner_text().strip()=='Recalculate','failed verification clears calculating label')
   check(p.evaluate('qaGeneratorCalls.filter(c=>c.p_approve).length')==0,'failed verification sends no approval request')
   p.evaluate('qaRpcFail=false;qaDelay=0');p.locator('#ropgGenerate').click()
   wait(p,"!document.querySelector('#ropgApprove').disabled")
   check(p.locator('#ropgApprove').evaluate('(e)=>e.classList.contains("primary")'),'retry restores primary approval only after verification')
   p.locator('#ropgProducts summary').click()
   p.locator('#ropGenerator').screenshot(path=str(screens/'verified.png'))
   # Rendering decimals never changes the original data used for purchase decisions.
   p.locator('#ropGenerator input[type=file]').first.set_input_files({'name':'bad.csv','mimeType':'text/csv','buffer':b'invalid'})
   wait(p,"document.querySelector('#ropgNotice').textContent.includes('Upload blocked')")
   check(p.locator('#ropgApprove').is_disabled() and p.locator('#ropgSummary').is_hidden(),'invalid replacement clears old preview and approval')
   check(p.locator('#ropgGenerate').get_attribute('aria-busy')=='false','invalid file never leaves a calculating spinner')
   check(not errors and not external,'failure and retry tests have no external IO or script errors')
  finally:ctx.close()
  ctx,p,errors,external=start(browser,1440)
  try:
   p.locator('#ropGenerator input[type=file]').first.set_input_files(csv_data(1561))
   p.locator('#ropGenerator input[type=file]').nth(1).set_input_files(recent_csv_data(1561))
   p.locator('#rop111Complete').check()
   wait(p,"document.querySelectorAll('#ropgProducts tbody tr').length===25 && !document.querySelector('#ropgGenerate').disabled")
   check(p.locator('#ropgSummary [data-filter=all] strong').inner_text()=='1,561','full size report retains all product counts')
   p.locator('#ropgProducts summary').click()
   check('63' in p.locator('#ropgPageLabel').inner_text(),'full size report has 63 pages at 25 rows')
   check(p.locator('#ropgProducts tbody tr').count()==25,'full report renders only current page')
   p.locator('#ropgNextPage').click();p.locator('#ropgProducts summary').click();p.locator('#ropgProducts summary').click()
   check('Page 2' in p.locator('#ropgPageLabel').inner_text(),'full size table keeps page on collapse')
   check(not errors and not external,'full size report has no errors or external writes')
  finally:ctx.close()
  browser.close()
finally:
 server.shutdown();pagefile.unlink(missing_ok=True)
print(json.dumps({'ux108_assertions':len(checks),'viewports':6,'real_production_requests':0}))
