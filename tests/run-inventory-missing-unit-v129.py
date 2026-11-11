"""Build129 real browser check for safe unitless inventory upload validation.
Uses synthetic CSV only. Does not authenticate, upload, or alter production inventory.
"""
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
import threading, shutil
root=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
csv='Code,Name,Quantity\nitem 004160,Tenda,12\nitem 004153,Gun,3\nitem 004154,Syringe,3\nitem 000014,Known,10 Piece\n'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for width in (1440,1024,390):
   context=browser.new_context(viewport={'width':width,'height':850})
   page=context.new_page()
   page.goto(f'http://127.0.0.1:{server.server_port}/index.html',wait_until='load',timeout=30000)
   page.wait_for_function('!!window.msAudit')
   page.evaluate("""() => {
    const state=msAudit.getState();state.mode='local';state.role='admin';state.revision=1;state.master=[];state.aliases=[];
    document.querySelector('#app').classList.remove('hidden');
    document.querySelector('#inventoryModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
   }""")
   page.locator('#inventoryFile').set_input_files({'name':'synthetic-unit-review.csv','mimeType':'text/csv','buffer':csv.encode()})
   page.locator('#inventoryDate').fill('2026-10-01')
   page.locator('#inventoryComplete').check(force=True)
   page.evaluate('msAudit.validateInventory()')
   msg=page.locator('#inventoryValidation')
   assert 'product(s) have quantities without explicit units' in msg.inner_text(),(width,msg.inner_text())
   assert 'Needs unit review' in msg.inner_text(),(width,msg.inner_text())
   assert 'item 004160' in msg.inner_text()
   assert 'item 004153' in msg.inner_text()
   assert 'item 004154' in msg.inner_text()
   assert page.locator('#applyInventory').is_enabled(),(width,'Apply should permit safely flagged review rows')
   rows=page.evaluate("msAudit.getState().pendingInventory.lines.map(x=>({code:x.product_code,quantity:x.raw_quantity,unit:x.raw_unit}))")
   assert len(rows)==4
   assert len([r for r in rows if r['unit'] is None])==3
   print('PASS inventory unit review browser width',width,flush=True)
   context.close()
  browser.close()
finally:
 server.shutdown()
