const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),css=read('assets/css/task-assistant-v89.css'),migration=read('supabase/migrations/20260926163215_build89_profit_recovery_two_bands.sql');

test('Profit Recovery is split into two explicit task bands',()=>{
  assert(html.includes("focus:'profit_recovery'"));
  assert(html.includes("focus:'profit_recovery_80_150'"));
  assert(html.includes("task_key:'recovery|profit-80-150'"));
  assert(html.includes("profitRecoveryRows(10,80).slice(0,10)"));
  assert(html.includes("profitRecoveryRows(80,150).slice(0,10)"));
});
test('both Profit Recovery bands preserve Super/High eligibility and positive order need',()=>{
  assert(html.includes("r.min_order_qty>0&&['super','high'].includes"));
  assert(migration.includes("lower(btrim(coalesce(rowdata->>'profitability_class',''))) not in ('super','high','سوبر','مرتفع')"));
  assert(migration.includes("(rowdata->>'min_order_qty')::numeric>0"));
});
test('new 80-150 task is server-authoritative and verifies at 150 percent',()=>{
  assert(migration.includes("when 'profit_recovery_80_150' then 'recovery|profit-80-150'"));
  assert(migration.includes("f='profit_recovery_80_150'"));
  assert(migration.includes("(r->>'stock_ratio')::numeric>=150"));
  assert(migration.includes("x.focus in ('suppliers','profit_recovery','profit_recovery_80_150','shortage_mid')"));
});
test('Profit Recovery is a separate card above Product Recovery and Master Data',()=>{
  assert(html.includes('class="ta16-column ta16-profit"'));
  assert(html.includes("board.innerHTML=supplierColumn+profitColumn+productColumn+masterColumn"));
  assert(css.includes('.ta86-board .ta16-profit'));
  assert(css.includes('grid-row:1'));
  assert(css.includes('.ta86-board .ta16-products'));
  assert(css.includes('grid-row:2'));
});
test('both tasks retain the Profit Protector badge',()=>{
  assert(html.includes("profit_recovery_80_150:['profit_recovery','Profit Protector']"));
  assert(migration.includes("when 'profit_recovery_80_150' then 'Profit Protector'"));
});
test('Build 89 is wired after Build 88',()=>{
  assert(html.includes('Live Build 89'));
  assert(html.indexOf('task-assistant-v89.css?v=89')>html.indexOf('task-assistant-v88.css?v=88'));
});
