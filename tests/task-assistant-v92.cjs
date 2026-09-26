const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('assets/js/task-assistant-v92.js'),css=read('assets/css/task-assistant-v92.css'),html=read('index.html');

test('Build 92 is UI-only and scoped to Master Data Review',()=>{
  assert(!/\brpc\s*\(|\bfetch\s*\(|localStorage|sessionStorage|purchase_price\s*=|reorder_point\s*=|score_impact\s*=|badge_awarded\s*=/.test(source+css));
  assert(source.includes(".ta16-master"));
  assert(!source.includes(".ta16-profit .ta16-task"));
  assert(!source.includes(".ta16-suppliers .ta16-task"));
});
test('Master Data summary shows the approved issue chips',()=>{
  for(const label of ['Supplier','Price','Reorder','Rating','Not in Master']) assert(source.includes("label:'"+label+"'"));
  assert(source.includes("Counts can overlap"));
  assert(css.includes(".ta92-master-chips"));
  assert(css.includes(".ta92-master-chip"));
});
test('Master Data explanation moves behind an information control',()=>{
  assert(source.includes("ta92-master-info"));
  assert(source.includes("Master Data Review information"));
  assert(source.includes("The total includes blocking issues plus non-blocking price, supplier and profitability attention."));
  assert(css.includes(".ta92-master-popover"));
});
test('current Master Data task uses a compact two-row pattern',()=>{
  assert(source.includes("meta.append(badge)"));
  assert(source.includes("CURRENT TASK"));
  assert(source.includes("review items"));
  assert(css.includes(".ta92-master-task .ta16-task-meta"));
  assert(css.includes(".ta92-inline-badge"));
  assert(css.includes("padding:8px 10px"));
});
test('Build 92 loads after Build 91',()=>{
  assert(html.includes('Live Build 92'));
  assert(html.indexOf('task-assistant-v92.js?v=92')>html.indexOf('task-assistant-v91.js?v=91'));
  assert(html.indexOf('task-assistant-v92.css?v=92')>html.indexOf('task-assistant-v91.css?v=91'));
});
