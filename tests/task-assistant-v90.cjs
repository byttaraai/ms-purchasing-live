const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),css=read('assets/css/task-assistant-v90.css');

test('Supplier Priorities keeps the full ranked Top 10 visible by default',()=>{
  assert(css.includes('.ta16-suppliers .ta16-task.ta86-supplier-hidden'));
  assert(css.includes('display:block!important'));
});
test('obsolete View All / Show Top 5 control is hidden while open count remains untouched',()=>{
  assert(css.includes('#ta86SupplierToggle'));
  assert(css.includes('display:none!important'));
  assert(!css.includes('.ta16-open-count'));
});
test('Build 90 is presentation-only and loaded after Build 89',()=>{
  assert(!/\brpc\s*\(|\bfetch\s*\(|localStorage|sessionStorage|purchase_price|reorder_point|score_impact|badge_awarded/.test(css));
  assert(html.includes('Live Build 92'));
  assert(html.indexOf('task-assistant-v90.css?v=90')>html.indexOf('task-assistant-v89.css?v=89'));
});
