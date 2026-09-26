const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('assets/js/task-assistant-v88.js'),css=read('assets/css/task-assistant-v88.css'),html=read('index.html');

test('Build 88 is presentation only',()=>{
  assert(!/\brpc\s*\(|\bfetch\s*\(|localStorage|sessionStorage|apply_migration|purchasing_tasks_v5|score_impact\s*=|badge_awarded\s*=/.test(source));
});
test('Cycle Focus explanation moves behind an information control',()=>{
  assert(source.includes("tasksEventText"));
  assert(source.includes("ta88-cycle-info"));
  assert(source.includes("aria-label','Cycle Focus information"));
  assert(css.includes('.ta88-cycle-note-source{display:none!important}'));
  assert(css.includes('.ta88-cycle-popover'));
});
test('supplier cards collapse badge into the same metadata row as products and score',()=>{
  assert(source.includes("meta.append(badge)"));
  assert(source.includes("ta88-inline-badge"));
  assert(css.includes('.ta88-supplier-card .ta16-task-meta'));
  assert(css.includes('.ta88-inline-badge'));
});
test('only Supplier Priorities cards are compacted',()=>{
  assert(source.includes(".ta16-suppliers .ta16-task"));
  assert(css.includes('.ta16-suppliers .ta16-task.ta88-supplier-card'));
  assert(!source.includes('.ta16-products .ta16-task'));
});
test('Build 88 loads after Build 87',()=>{
  assert(html.includes('Live Build 91'));
  assert(html.indexOf('task-assistant-v88.js?v=88')>html.indexOf('task-assistant-v87.js?v=87'));
  assert(html.indexOf('task-assistant-v88.css?v=88')>html.indexOf('task-assistant-v87.css?v=87'));
});
