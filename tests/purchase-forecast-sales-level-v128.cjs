'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const model=require('../assets/js/forecast-sales-level-v128.js');
const {restore128,restore128Index}=require('./forecast-sales-level-v128-inverse.cjs');
const periods=Array.from({length:12},(_,i)=>new Date(Date.UTC(2025,9+i,1)).toISOString().slice(0,7));
function row(q){return {monthly:q.map((qty,i)=>({month:periods[i],qty,unit:'piece',unit_count:1,invalid_rows:0,source_rows:1}))};}
const blob=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
test('Build128 changes only approved Sales Level integration, preserving deployed Build127',()=>{
 assert.equal(blob(restore128(fs.readFileSync('assets/js/purchase-forecast-v116.js','utf8'))),'862e6b8c58ddcf05012e9dbb98ec1149b454fd93');
 assert.equal(blob(restore128Index(fs.readFileSync('index.html','utf8'))),'e696347c602f94f07bdfee690aed5d2a7acdf347');
});
test('Annual median and both half-year medians use same monthly quantity basis',()=>{
 const r=row([...Array(6).fill(80),...Array(6).fill(120)]),before=JSON.stringify(r);
 const v=model.calculate(r,periods);
 assert.equal(v.status,'ready');assert.equal(v.typical,100);assert.equal(v.first,80);assert.equal(v.last,120);
 assert.equal(v.firstComparison.percent,-20);assert.equal(v.lastComparison.percent,20);
 assert.equal(v.firstComparison.state,'down');assert.equal(v.lastComparison.state,'up');
 assert.equal(JSON.stringify(r),before,'No data mutation');
});
test('Median uses numeric sorting, even middle pair, and is robust to one isolated peak',()=>{
 assert.equal(model.median([100,2,3,4,5,6]),4.5);assert.equal(model.median([]),null);
 const v=model.calculate(row([...Array(11).fill(100),3000]),periods);
 assert.equal(v.typical,100);assert.equal(v.first,100);assert.equal(v.last,100);
 assert.equal(v.lastComparison.percent,0);
});
test('Incomplete or duplicate months cannot masquerade as zero or shift the half windows',()=>{
 const r=row(Array(12).fill(10));r.monthly.splice(3,1);
 const v=model.calculate(r,periods);assert.equal(v.typical,null);assert.equal(v.reported,11);
 assert.equal(v.firstComparison.percent,null);assert.equal(v.lastComparison.percent,null);
 const duplicate=row(Array(12).fill(10));duplicate.monthly.push({...duplicate.monthly[0]});
 assert.equal(model.calculate(duplicate,periods).status,'invalid');
 for(const p of [[],periods.slice(1),[...periods.slice(0,11),periods[10]],[...periods.slice(0,11),'2026-13'],[...periods].reverse()])assert.equal(model.calculate(row(Array(12).fill(10)),p).typical,null);
});
test('Actual zero and negative values are retained; nonpositive annual baselines never produce a percentage',()=>{
 for(const q of [0,-3]){const v=model.calculate(row(Array(12).fill(q)),periods);assert.equal(v.typical,q);assert.equal(v.status,'nonpositive');assert.equal(v.firstComparison.percent,null);assert.equal(v.lastComparison.percent,null);}
 const v=model.calculate(row([-1,...Array(11).fill(10)]),periods);assert.equal(v.typical,10);assert.equal(v.negativeMonths,1);
});
test('Missing, nonfinite and invalid quantities or units fail closed without inferred conversions',()=>{
 for(const value of [null,undefined,'',NaN,Infinity,'NaN',' ',true,{},[]]){const r=row(Array(12).fill(10));r.monthly[1].qty=value;assert.equal(model.calculate(r,periods).typical,null);}
 for(const fields of [{unit:'box'},{unit:''},{unit_count:2},{invalid_rows:1},{source_rows:0}]){const r=row(Array(12).fill(10));Object.assign(r.monthly[0],fields);assert.equal(model.calculate(r,periods).typical,null);}
 const r=row(Array(12).fill('10.5'));r.monthly[0].unit=' Piece ';
 assert.equal(model.calculate(r,periods).typical,10.5);
});
test('Stable display includes both +/-5 percent boundaries; ratios are not half-to-half growth',()=>{
 for(const [q,state] of [[95,'stable'],[105,'stable'],[94.9,'down'],[105.1,'up']])assert.equal(model.compare(q,100).state,state);
 assert.equal(model.compare(120,100).percent,20);assert.equal(model.compare(120,80).percent,50);
 assert.equal(model.compare(1,0).percent,null);assert.equal(model.compare(1,-1).percent,null);
});
test('Calculation is independent of Master, selection, supplier and profitability metadata',()=>{
 const r=row([...Array(6).fill(30),...Array(6).fill(60)]);
 assert.deepEqual(model.calculate(r,periods),model.calculate({...r,supplier:'Other',annual_profit_sar:9000,selected_month:periods[10]},periods));
 const source=fs.readFileSync('assets/js/forecast-sales-level-v128.js','utf8');
 assert(!/fetch\s*\(|localStorage|sessionStorage|\.master|p_approve|rpc\s*\(/.test(source));
});
