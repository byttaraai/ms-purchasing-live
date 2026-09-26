const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('assets/js/task-assistant-v86.js'),css=read('assets/css/task-assistant-v86.css'),html=read('index.html');

test('Build 86 is presentation/navigation only with no purchasing IO or formulas',()=>{
  assert(!/\brpc\s*\(|\bfetch\s*\(|localStorage|sessionStorage|apply_migration|purchase_price\s*[+*\/-]|reorder_point\s*[+*\/-]/.test(source));
  assert(!/SupplierQuestUI\.\w+\s*=(?!=)/.test(source));
});
test('Output Lists becomes a top-level navigation destination',()=>{
  assert(source.includes("data-tab=\"output-lists\"")||source.includes("dataset.tab='output-lists'"));
  assert(source.includes("Output Lists"));
  assert(source.includes("supplierQuestOutputs"));
  assert(source.includes("supplierQuestPageTabs"));
});
test('Tasks page is task focused with open-task header and right performance rail',()=>{
  assert(source.includes('Tasks Assistant'));
  assert(source.includes('tasksOpenJump'));
  assert(css.includes('grid-template-areas:"head rail" "inventory rail" "board rail"'));
  assert(css.includes('position:sticky'));
});
test('supplier list defaults to five while preserving full ranked list',()=>{
  assert(source.includes('i>=5'));
  assert(source.includes("View All "));
  assert(source.includes("Show Top 5"));
  assert(!source.includes('.splice('));
});
test('Master Data is positioned below Recovery and Reviews on desktop',()=>{
  assert(css.includes('.ta86-board .ta16-products{grid-column:2;grid-row:1}'));
  assert(css.includes('.ta86-board .ta16-master{grid-column:2;grid-row:2}'));
});
test('responsive layouts keep tasks usable on tablet and mobile',()=>{
  assert(css.includes('@media(max-width:1180px)'));
  assert(css.includes('@media(max-width:900px)'));
  assert(css.includes('@media(max-width:640px)'));
});
test('Build 86 loads after Build 85 and labels the release',()=>{
  assert(html.includes('Live Build 90'));
  assert(html.indexOf('task-assistant-v86.js?v=86')>html.indexOf('supplier-toolbar-v85.js?v=85'));
  assert(html.indexOf('task-assistant-v86.css?v=86')>html.indexOf('supplier-toolbar-v85.css?v=85'));
});
