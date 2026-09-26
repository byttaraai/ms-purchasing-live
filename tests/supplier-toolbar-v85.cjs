const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('assets/js/supplier-toolbar-v85.js'),css=read('assets/css/supplier-toolbar-v85.css');
const protectedFiles={
  "assets/js/supplier-task-v82.js": "010cf42d408dc815305a3cc5349e763952c6131ec21e098acb9595193ce0ca0e",
  "assets/js/supplier-layout-v83.js": "09c14a7c821b1ebc9581df74ce285029081038de2dcd3c230879cc184fc54575",
  "assets/js/supplier-polish-v84.js": "2584e7f3639c77e81a8cbf5a837e713db827d4e7ae9145d0b63d6e68e39122ef",
  "assets/css/supplier-task-v82.css": "a6b721d60abc6f45691e6203bea564f180d1d70121bfb11f68832cba1d7f7446",
  "assets/css/supplier-layout-v83.css": "9805002069ec09d5a6d2d7a6e88a2941904da90ca7641182dcf9eddae4e2730d",
  "assets/css/supplier-polish-v84.css": "5575b3e14cc7a47630bd94b1235c6e68882e2f140108fafa94a3891e2c1fc717"
};
test('Build 85 preserves the complete prior Quest engines and styles byte-for-byte',()=>{
 for(const [file,hash] of Object.entries(protectedFiles))assert.equal(crypto.createHash('sha256').update(read(file)).digest('hex'),hash,file);
});
test('table tools add no network, persistence, server or business state writes',()=>{
 assert(!/\brpc\s*\(|\bfetch\s*\(|localStorage|sessionStorage|apply_migration|purchasing_tasks_v5/.test(source));
 assert(!/SupplierQuestUI\.\w+\s*=(?!=)/.test(source));
});
test('existing input nodes and handlers are moved, not cloned or replaced',()=>{
 assert(source.includes("row.insertBefore(tools, stages)"));
 assert(!/cloneNode|innerHTML|outerHTML|search\.oninput\s*=|clear\.onclick\s*=/.test(source));
});
test('search reset uses the existing input event without clearing selections',()=>{
 assert(source.includes("new Event('input', {bubbles:true})"));
 assert(!source.includes('selected.clear('));
 assert(source.includes('Clear product search'));
});
test('narrow filters use a hidden inert overlay rather than a permanent extra row',()=>{
 assert(source.includes('c.tools.inert = c.tools.hidden'));
 assert(source.includes("e.key !== 'Escape'"));
 assert(css.includes('position:absolute;right:0;top:calc(100% + 8px)'));
 assert(css.includes('flex-wrap:nowrap'));
});
test('visible counts follow existing query and selection filtering including data review',()=>{
 assert(source.includes('sqVisibleRows(rows)'));assert(source.includes('sqDataRows(ui.task)'));assert(source.includes('sqMatches(r, query)'));
 assert(source.includes("visible.length + ' of ' + rows.length"));
 assert(source.includes('visibleCount.hidden = true'));
});
test('styling is scoped to the toolbar without changing table values or printing',()=>{
 assert(!/\.sq-table|sqPrint|sqBoTable|min_order|max_order/.test(css+source));
 assert(css.includes('#supplierTaskDialog.sq85'));
});
test('Build 85 follows the unchanged Build 84 layer and declares its release',()=>{
 const index=read('index.html');assert(index.includes('Live Build 87'));
 assert(index.indexOf('supplier-toolbar-v85.js')>index.indexOf('supplier-polish-v84.js'));
 assert(index.indexOf('supplier-toolbar-v85.css')>index.indexOf('supplier-polish-v84.css'));
});
