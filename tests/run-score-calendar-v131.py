"""Synthetic browser regression: server calendar, validation, save and refresh.
No production credentials or database writes; unexpected network is blocked.
"""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect
import threading, shutil
root=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
setup=r"""() => {
 const s=msAudit.getState();s.mode='live';s.role='admin';s.session={access_token:'synthetic',user:{id:'qa'}};s.revision=0;s.aliases=[];s.master=[];s.rows=[];s.shortageStoreLoaded=true;
 const row={product_code:'qa-stock',product_name:'QA stock',supplier:'QA supplier',purchase_unit:'Piece',option_unit:null,factor:1,order_multiple:1,reorder_point:100,reorder_point_unit:'Piece',stock_qty:20,stock_ratio:20,min_order_qty:100,max_order_qty:180,purchase_price:10,total_value:200,profitability_class:'High',blocking_review:false,needs_review:false,raw_quantity:20,raw_unit:'Piece',stock_origin:'reported',conversion_role:'purchase'};
 const blocked={...row,product_code:'qa-blocked',product_name:'QA negative',raw_quantity:-1,stock_qty:-1,stock_ratio:null,min_order_qty:null,max_order_qty:null,blocking_review:true,needs_review:true,review_reason:'Negative stock'};
 const fixture={schema_version:5,seed_applied:true,master_revision:1,role:'admin',aliases:[],rows:[row,blocked],master:[row,blocked].map(x=>({...x})),upload:{id:'11111111-1111-4111-8111-111111111111',snapshot_date:'2026-11-12',uploaded_at:'2026-11-11T21:00:00Z',status:'completed',is_complete:true,excludes_zero:true,scope_key:'all_products'}};
 const cycles=Object.fromEntries(fixture.rows.map(r=>[r.product_code,{cycleId:'test-'+r.product_code,active:true,startDate:'2026-10-13',lastSeen:'2026-11-12',history:[],justification:null}]));
 s.shortageCycles=structuredClone(cycles);WORKSPACE_RUNTIME.serverShortageReady=true;WORKSPACE_RUNTIME.authority=null;
 window.qa={saves:0,syncs:0,reads:0,fixture};
 http=async(path,{body}={})=>{
  const name=String(path).split('/').pop();
  if(name==='purchasing_workspace_revision_v47')return{master_revision:fixture.master_revision,upload_id:fixture.upload.id};
  if(name==='purchasing_dashboard_v5'){qa.reads++;return structuredClone(fixture);}
  if(name==='purchasing_workspace_state_v58'){
   // Independent server expectation: commercial=9.6, aging=0, supplier=0, data=50.
   // Weighted score=9.22, rounded to 9. A host day one day behind yields a different score.
   return{score:9,bo_level:0,evaluated_on:'2026-11-12',authority_version:'server_v58',cycles:structuredClone(cycles),source:{master_revision:fixture.master_revision,upload_id:fixture.upload.id}};
  }
  if(name==='purchasing_workspace_sync_v58'){
   qa.syncs++;if(body.payload.score!==9)throw Error('SERVER_SCORE_MISMATCH');
   if(body.payload.evaluated_on!=='2026-11-12')throw Error('Wrong business date');
   if(body.payload.tasks.some(t=>t.focus!=='data'&&t.codes.includes('qa-blocked')))throw Error('Blocking review cannot be an operational task');
   return{authority:{score:9,authority_version:'server_v58',evaluated_on:'2026-11-12'},source:{master_revision:fixture.master_revision,upload_id:fixture.upload.id},cycles:structuredClone(cycles),tasks:body.payload.tasks.map(t=>({...t,id:t.task_key,status:'open'})),cycle:{id:'qa-cycle',upload_id:fixture.upload.id}};
  }
  if(name==='purchasing_save_inventory_v5'){
   qa.saves++;if(body.as_of_date!=='2026-11-12')throw Error('Unexpected report date');
   fixture.upload={...fixture.upload,id:body.request_id,file_name:body.file_name};return{ok:true,upload_id:body.request_id,master_revision:1};
  }
  throw Error('Unexpected synthetic RPC '+name);
 };
 document.querySelector('#app').classList.remove('hidden');document.querySelector('#auth').classList.add('hidden');
 openInventoryModal();
}"""
csv='Code,Name,Quantity\nqa-stock,QA stock,20 Piece\nqa-blocked,QA negative,-1 Piece\n'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for zone,width in [('UTC',1440),('America/Los_Angeles',390),('Asia/Riyadh',1440),('Australia/Sydney',1024)]:
   context=browser.new_context(viewport={'width':width,'height':900},timezone_id=zone)
   page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(f'http://127.0.0.1:{server.server_port}/') else route.abort())
   page.clock.set_fixed_time('2026-11-11T21:30:00Z')
   page.goto(f'http://127.0.0.1:{server.server_port}/index.html',wait_until='load')
   assert page.evaluate('() => !!window.msAudit')
   page.evaluate(setup)
   page.locator('#inventoryFile').set_input_files({'name':'synthetic-calendar.csv','mimeType':'text/csv','buffer':csv.encode()})
   page.locator('#inventoryDate').fill('2026-11-12');page.locator('#inventoryComplete').check(force=True)
   page.locator('#validateInventory').click()
   expect(page.locator('#validateInventory')).to_be_enabled(timeout=30000)
   msg=page.locator('#inventoryValidation').inner_text()
   assert page.locator('#applyInventory').is_enabled(),(zone,msg,errors)
   assert 'SERVER_SCORE_MISMATCH' not in msg,(zone,msg)
   assert page.evaluate('() => qa.saves')==0
   assert page.evaluate('() => scoreAsOf()')=='2026-11-12'
   assert page.evaluate("() => shortageAge('qa-stock')")==30
   page.locator('#applyInventory').click()
   expect(page.locator('#inventoryModal')).to_be_hidden(timeout=30000)
   assert page.evaluate('() => qa.saves')==1
   assert page.evaluate('() => qa.syncs')>=2
   assert page.locator('#globalError').is_hidden()
   page.evaluate('() => openInventoryModal()')
   page.locator('#inventoryDate').fill('2026-11-13');page.locator('#validateInventory').click()
   expect(page.locator('#validateInventory')).to_be_enabled(timeout=30000)
   assert 'cannot be in the future' in page.locator('#inventoryValidation').inner_text()
   assert page.locator('#applyInventory').is_disabled()
   assert page.evaluate('() => qa.saves')==1
   assert not errors,(zone,errors)
   print('PASS calendar validation/apply/future-date browser',zone,width,flush=True)
   context.close()
  browser.close()
finally: server.shutdown()
