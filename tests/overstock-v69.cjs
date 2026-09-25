'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const R=require('../assets/js/overstock-risk-v69.js');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
const coreContext=vm.createContext({});
vm.runInContext(scripts.find(m=>m[2].includes('root.PurchasingCore=api'))[2],coreContext);
const C=coreContext.PurchasingCore;
const row=(code,ratio,profit='Low',price=10,rp=100)=>({product_code:code,product_name:code,stock_qty:ratio/100*rp,reorder_point:rp,stock_ratio:ratio,purchase_price:price,profitability_class:profit,supplier:'A',blocking_review:false});
const calc=rows=>R.evaluate(rows,C.profitLabel);
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}`);
test('product factors use the approved profitability and stock policy',()=>{
 for(const [profit,pw] of [['Loss',1.5],['Low',1.2],['Medium',.7],['High',.7],['Super',.7],['Unclassified',1]])
  for(const [ratio,sw] of [[300.01,.7],[400,.7],[500,.7],[500.01,1.2],[1000,1.2],[1000.01,1.5]]){
   const r=calc([row('a',ratio,profit)]).rows[0];near(r.risk_factor,pw*sw);near(r.risk_internal_pct,(pw*sw-1)*100);
  }
});
test('300 percent is excluded, legacy quick filter remains available',()=>{
 assert.equal(calc([row('a',300)]).productCount,0);assert(C.inRange(250,'gt200'));assert(!C.inRange(300,'gt300'));assert(C.inRange(300.01,'gt300'));
});
for(const [pct,tag] of [[-51,'stable'],[0,'stable'],[.01,'low'],[14.999,'low'],[15,'medium'],[24.999,'medium'],[25,'high'],[39.999,'high'],[40,'critical'],[125,'critical']])
 test(`card boundary ${pct}% is ${tag}`,()=>assert.equal(R.classify(pct).cls,tag));
test('Arabic classifications use the existing canonical resolver',()=>{
 const labels=['\u062e\u0627\u0633\u0631','\u0645\u0646\u062e\u0641\u0636','\u0645\u062a\u0648\u0633\u0637','\u0645\u0631\u062a\u0641\u0639','\u0633\u0648\u0628\u0631'];
 for(const [i,name] of ['Loss','Low','Medium','High','Super'].entries())near(calc([row('a',1200,labels[i])]).netImpact,calc([row('a',1200,name)]).netImpact);
});
test('financial impact and positive share distinguish a large product from a small one',()=>{
 const m=calc([row('large',1200,'Loss',100),row('small',1200,'Loss',1)]);
 near(m.rows[0].risk_impact/m.rows[1].risk_impact,100);near(m.rows.reduce((s,r)=>s+r.risk_share_pct,0),100);
});
test('net near zero does not inflate product shares; negative net does not invert them',()=>{
 const positive=row('positive',1200,'Loss',1000/1125);
 const negative=row('stable',400,'High',990/51);
 let m=calc([positive,negative]);near(m.netImpact,10);near(m.rows[0].risk_share_pct,100);
 negative.purchase_price=1100/51;m=calc([positive,negative]);near(m.netImpact,-100);near(m.rows[0].risk_share_pct,100);assert.equal(m.rating.cls,'stable');
});
test('all Stable rows and zero positive pool avoid division by zero',()=>{
 const m=calc([row('a',400,'High'),row('b',600,'Medium')]);assert.equal(m.positiveImpact,0);assert(m.rows.every(r=>r.risk_share_pct===null));assert.equal(m.rating.cls,'stable');
});
test('unpriced, blocked or invalid RP rows are Review, not zero-risk Stable',()=>{
 for(const patch of [{purchase_price:null},{purchase_price:0},{reorder_point:null},{reorder_point:0},{blocking_review:true},{stock_qty:null}]){
  const m=calc([{...row('x',600),...patch}]);assert.equal(m.reviewCount,1);assert.equal(m.rows[0].risk_status,'review');assert.equal(m.rows[0].risk_impact,null);assert.equal(m.cardRiskPct,null);assert.equal(m.rating.cls,'review');
 }
});
test('partial valuations are marked and excluded consistently from both risk totals',()=>{
 const good=row('x',600);const m=calc([good,{...row('missing',600),purchase_price:null}]);near(m.rawExcess,3000);near(m.netImpact,1320);near(m.cardRiskPct,44);assert.equal(m.reviewCount,1);near(m.rows[0].risk_share_pct,100);
});
test('product reclassification recomputes the entire roll-up without changing facts',()=>{
 const rows=[row('a',1200,'Loss'),row('b',400,'Medium')],before=structuredClone(rows),m=calc(rows);
 assert.deepEqual(rows,before);rows[0].profitability_class='High';const next=calc(rows);
 assert.notEqual(next.netImpact,m.netImpact);assert.equal(next.rawExcess,m.rawExcess);assert.equal(next.rows[0].excess_qty,m.rows[0].excess_qty);
 near(next.netImpact,next.rows.reduce((s,r)=>s+r.risk_impact,0));near(next.cardRiskPct,100*next.netImpact/next.rawExcess);
});
test('old parallel overstock risk models are removed from executable source',()=>{
 const ui=fs.readFileSync('assets/js/overstock-ui-v69.js','utf8');
 for(const term of ['overstockProfitRisk','adjustedOverstockPct','valueScore*.40+qtyScore*.35+profitRisk*.25'])assert(!html.includes(term)&&!ui.includes(term));
 assert(!html.includes('<th>Inventory Value</th>'));assert(ui.includes('Stable'));assert(ui.includes('overstockRiskCell(r)'));
});
test('Build 70 changes only the displayed SAR direction and keeps canonical risk math untouched',()=>{
 const ui=fs.readFileSync('assets/js/overstock-ui-v69.js','utf8'),css=fs.readFileSync('assets/css/overstock-risk-v69.css','utf8');
 assert(ui.includes("r.risk_status==='positive'&&r.risk_factor>1")&&ui.includes("1-1/r.risk_factor"));
 assert(ui.includes("r.risk_status==='stable')return Math.abs(Number(r.risk_impact)||0)"));
 assert(ui.includes('overstock-risk-info')&&ui.includes('Card risk calculations are unchanged.'));
 assert(css.includes('width:18%;text-align:left')&&css.includes('width:13%;text-align:center'));
 assert(css.includes('flex-direction:row'));
 const bytes=fs.readFileSync('assets/js/overstock-risk-v69.js');const sha=crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\\0')).update(bytes).digest('hex');
 assert.equal(sha,'55245ceccd8bcf07e6048ae567817a39c9e73370');
});
test('new model has no IO, persistence, task completion or badge side effects',()=>{
 const code=fs.readFileSync('assets/js/overstock-risk-v69.js','utf8');
 for(const pattern of [/\bfetch\s*\(/,/\brpc\s*\(/,/localStorage/,/sessionStorage/,/document\./,/badge_awarded/])assert(!pattern.test(code));
 const bytes=fs.readFileSync('assets/js/workspace-v47.js');const sha=crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
 assert.equal(sha,'479823da0a805b1e15a3e28ad29213d284796534');
});
test('all inline and external JavaScript parses before deployment',()=>{
 for(const match of scripts){const src=match[1].match(/src="([^"]+)"/);new vm.Script(src?fs.readFileSync(src[1].split('?')[0],'utf8'):match[2]);}
});
