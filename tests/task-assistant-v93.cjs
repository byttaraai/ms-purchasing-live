const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('assets/js/task-assistant-v97.js'),css=read('assets/css/task-assistant-v93.css'),html=read('index.html');
test('Build 93 moves Master Data above Profit Recovery',()=>{
  assert(css.includes('.ta16-master{grid-column:2;grid-row:1}'));
  assert(css.includes('.ta16-profit{grid-column:2;grid-row:2}'));
  assert(css.includes('.ta16-products{grid-column:2;grid-row:3}'));
});
test('Master Data task expands current ranking cap from 5 to 20 without a new ranking formula',()=>{
  assert(html.includes("masterReviewSeverity(b)-masterReviewSeverity(a)),slice=rows.slice(0,20)"));
  assert(!js.includes('masterReviewSeverity'));
  assert(!js.includes('score_impact='));
});
test('Master task Open is routed to inline popup and preserves official completion semantics',()=>{
  assert(js.includes("if(task?.focus==='data')"));
  assert(js.includes("purchasing_master_review_save_v93"));
  assert(js.includes('saving does not complete the task or award a badge'.replace(/^s/,'S'))||js.includes('saving does not complete the task'));
  assert(!/badge_awarded|status\s*=\s*['"]completed/.test(js));
});
test('Popup supports agreed direct-edit fields and new products',()=>{
  for(const key of ['purchase_unit','supplier','purchase_price','reorder_point','profitability_class']) assert(js.includes('data-key="'+key+'"'));
  assert(js.includes('Product is not in the master'));
  assert(js.includes('Save &amp; Recalculate'));
});
test('Build 93 assets load after Build 92',()=>{
  assert(html.includes('Live Build 97'));
  assert(html.indexOf('task-assistant-v97.js?v=97')>html.indexOf('task-assistant-v92.js?v=92'));
  assert(html.indexOf('task-assistant-v93.css?v=93')>html.indexOf('task-assistant-v92.css?v=92'));
});