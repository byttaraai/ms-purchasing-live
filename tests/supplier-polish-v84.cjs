const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('assets/js/supplier-polish-v84.js'),css=read('assets/css/supplier-polish-v84.css');
test('Build 84 preserves the complete draft/save/verification UI and split layout engines',()=>{
 for(const [file,hash] of Object.entries({
  'assets/js/supplier-task-v82.js':'010cf42d408dc815305a3cc5349e763952c6131ec21e098acb9595193ce0ca0e',
  'assets/js/supplier-layout-v83.js':'09c14a7c821b1ebc9581df74ce285029081038de2dcd3c230879cc184fc54575'
 }))assert.equal(crypto.createHash('sha256').update(read(file)).digest('hex'),hash,file);
});
test('polish reads existing review states without business writes or network IO',()=>{
 assert(!/\brpc\s*\(|\bfetch\s*\(|localStorage|sessionStorage|apply_migration|purchasing_tasks_v5/.test(source));
 assert(!/SupplierQuestUI\.\w+\s*=(?!=)/.test(source));
 assert(!/\.on(click|change)\s*=|cloneNode/.test(source));
});
test('all screen table headers and values align left except selection column',()=>{
 assert(css.includes('.sq-table th,#supplierTaskDialog.sq84 .sq-table td{ text-align:left'));
 assert(css.includes('.sq-table .num{ text-align:left'));
 assert(css.includes('.sq-table .sq-check-cell{ text-align:center'));
});
test('footer uses one real row with icon navigation and readable primary action',()=>{
 assert(css.includes('grid-template-columns:34px minmax(0,1fr) 34px'));
 assert(source.includes("'Previous stage'"));assert(source.includes("'Print Data Review'"));
 assert(source.includes("'No Purchase Required'"));assert(source.includes("'No Reallocation Required'"));
 assert(source.includes("'Finish Review'"));assert(source.includes("setAttribute('aria-label'"));
});
test('current location, changed data, unsaved draft and reviewed are separate visual states',()=>{
 for(const state of ['changed','draft','reviewed','pending'])assert(source.includes("'"+state+"'"));
 assert(source.includes("classList.toggle('sq84-current', active)"));
 assert(source.includes("changed ? 'Changed' : 'Draft'"));
 assert(source.includes('Stage review saved. This does not complete the supplier task.'));
});
test('Build 84 follows the unchanged split layer and labels the new release',()=>{
 const index=read('index.html');assert(index.includes('Live Build 92'));
 assert(index.indexOf('supplier-polish-v84.js')>index.indexOf('supplier-layout-v83.js'));
 assert(index.indexOf('supplier-polish-v84.css')>index.indexOf('supplier-layout-v83.css'));
});
