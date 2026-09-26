const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const layer=read('assets/js/supplier-layout-v83.js');
const css=read('assets/css/supplier-layout-v83.css');
test('Build 82 lifecycle, draft, save and print engine remains unchanged',()=>{
 const s=read('assets/js/supplier-task-v82.js');
 assert.equal(crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex'),'edaaf09a73d33a3e44f82dbcd68e580ca6b7cfc4');
});
test('layout layer has no IO, business calculations or server state writes',()=>{
 assert(!/\bfetch\s*\(|\brpc\s*\(|localStorage|sessionStorage|purchasing_supplier_quest|apply_migration/.test(layer));
 assert(!/SupplierQuestUI\.[a-zA-Z]+\s*=/.test(layer));
 assert(layer.includes('const result = baseRender(task, response)'));
});
test('sidebar reuses existing controls instead of cloning handlers or buttons',()=>{
 assert(layer.includes('body.append(steps)'));assert(layer.includes('body.append(tools)'));
 assert(layer.includes('sidebar.append(header, body, footer)'));
 assert(layer.includes('workspace.append(stage, content)'));
 assert(!layer.includes('cloneNode'));assert(!layer.includes('innerHTML'));
});
test('desktop has capped 30 percent controls and full height data',()=>{
 assert(css.includes('clamp(300px,30%,430px)'));assert(css.includes('grid-template-rows:auto minmax(0,1fr) auto'));
 assert(css.includes('#supplierTaskDialog.sq83 nav.sq-steps'));
 assert(css.includes('flex-direction:column'));
});
test('compact drawer removes hidden controls from keyboard and keeps a single footer',()=>{
 assert(layer.includes('workspace.inert = drawer'));assert(layer.includes('sidebar.inert = narrow.matches && !drawer'));
 assert(layer.includes("toggle.setAttribute('aria-expanded'"));assert(layer.includes('parent.append(footer)'));
 assert(layer.includes('if (narrow.matches && controlsOpen)'));
});
test('Build 83 is loaded after the verified Build 82 engine and styles',()=>{
 const index=read('index.html');
 assert(index.indexOf('supplier-layout-v83.js')>index.indexOf('supplier-task-v82.js'));
 assert(index.indexOf('supplier-layout-v83.css')>index.indexOf('supplier-task-v82.css'));
 assert(index.includes('Live Build 83'));
});
