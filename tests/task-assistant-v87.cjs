const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('assets/js/task-assistant-v87.js'),css=read('assets/css/task-assistant-v87.css'),html=read('index.html');

test('Build 87 is UI-only and does not touch purchasing or server state',()=>{
  assert(!/\brpc\s*\(|\bfetch\s*\(|localStorage|sessionStorage|apply_migration|purchasing_tasks_v5|purchase_price\s*[+*\/-]|reorder_point\s*[+*\/-]/.test(source));
  assert(!/SupplierQuestUI\.\w+\s*=(?!=)/.test(source));
});
test('open task count is shown on the Tasks Assistant nav tab and hidden at zero',()=>{
  assert(source.includes("data-tab=\"tasks-assistant\""));
  assert(source.includes("ta87TaskCount"));
  assert(source.includes("tasks.filter(t=>t?.status==='open').length"));
  assert(source.includes("badge.classList.toggle('hidden',count===0)"));
  assert(css.includes('.ta87-task-count.hidden{display:none!important}'));
});
test('page heading is removed while the legacy count source remains available to existing renderer',()=>{
  assert(source.includes("byId('ta86TasksHead')?.remove()"));
  assert(source.includes("tasksOpenJump"));
  assert(source.includes("achievements.append(jump)"));
  assert(css.includes('.ta87-source-counter{display:none!important}'));
});
test('Inventory Snapshot is the first Tasks Assistant row on desktop and compact layouts',()=>{
  assert(css.includes('grid-template-areas:"inventory rail" "board rail"'));
  assert(css.includes('grid-template-areas:"inventory" "rail" "board"'));
  assert(css.includes('#ta86TasksHead{display:none!important}'));
});
test('Build 87 loads after Build 86 and labels the release',()=>{
  assert(html.includes('Live Build 90'));
  assert(html.indexOf('task-assistant-v87.js?v=87')>html.indexOf('task-assistant-v86.js?v=86'));
  assert(html.indexOf('task-assistant-v87.css?v=87')>html.indexOf('task-assistant-v86.css?v=86'));
});
