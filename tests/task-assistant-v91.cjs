const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('assets/js/task-assistant-v91.js'),css=read('assets/css/task-assistant-v91.css'),html=read('index.html');

test('Build 91 is UI-only and scoped to Profit Recovery cards',()=>{
  assert(!/\brpc\s*\(|\bfetch\s*\(|localStorage|sessionStorage|purchase_price|reorder_point|score_impact|badge_awarded/.test(source+css));
  assert(source.includes(".ta16-profit .ta16-task"));
  assert(!source.includes(".ta16-suppliers .ta16-task"));
});
test('Profit Recovery badge moves into the task metadata row',()=>{
  assert(source.includes("meta.append(badge)"));
  assert(source.includes("ta91-inline-badge"));
  assert(css.includes(".ta91-profit-card .ta16-task-meta"));
  assert(css.includes(".ta91-inline-badge"));
});
test('Profit Recovery cards use compact two-row spacing',()=>{
  assert(css.includes("padding:8px 10px"));
  assert(css.includes("margin-top:4px"));
  assert(css.includes("min-height:28px"));
  assert(css.includes(".ta16-profit .ta16-task-list"));
});
test('Build 91 loads after Build 90',()=>{
  assert(html.includes('Live Build 91'));
  assert(html.indexOf('task-assistant-v91.js?v=91')>html.indexOf('task-assistant-v88.js?v=88'));
  assert(html.indexOf('task-assistant-v91.css?v=91')>html.indexOf('task-assistant-v90.css?v=90'));
});
