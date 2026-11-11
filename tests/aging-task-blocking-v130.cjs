'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const html=fs.readFileSync('index.html','utf8');
const {restore130Index}=require('./aging-task-blocking-v130-inverse.cjs');
const start=html.indexOf('function buildPriorityTasks(model){'),end=html.indexOf('\nfunction taskStillOpen(',start);
assert(start>=0&&end>start);
const builder=html.slice(start,end);
function generate(rows,{excluded=[],review=false,actionCodes=rows.map(r=>r.product_code)}={}){
 const blocked=new Set(excluded),history=Object.fromEntries(rows.map(r=>[r.product_code,{active:true,startDate:'2026-09-01',history:[]} ]));
 const state={rows:structuredClone(rows),shortageCycles:history};
 const before=JSON.stringify(state);
 const context={state,C:{finite:Number.isFinite},supplierQuestData:()=>[],isScoreExcluded:c=>blocked.has(c),shortageAge:c=>rows.find(r=>r.product_code===c)?.age||45,taskProfitabilityWeight:p=>({Super:5,High:4,Medium:2,Low:1,Loss:0}[p]||0),profitabilityKey:p=>String(p||'').toLowerCase(),estimateScoreGain:()=>0,masterReviewSeverity:()=>1,fmt:String,tasksBadgeFor:f=>f==='data'?['data_quality','Data Cleaner']:['aging_breaker','Cycle Breaker']};
 const order=html.match(/function shortageNeedsOrder\(r\)\{[^\n]+\}/);
 assert(order,'existing shortage eligibility helper');
 vm.createContext(context);vm.runInContext(order[0]+'\n'+builder,context);
 context.model={counts:{action30:actionCodes.length,review:review?rows.filter(r=>r.needs_review).length:0,tenTo50:0,under10:0},action30:actionCodes.map(c=>[c,history[c]]),reviewRows:rows.filter(r=>r.needs_review)};
 const result=JSON.parse(JSON.stringify(vm.runInContext('buildPriorityTasks(model)',context)));
 assert.equal(JSON.stringify(state),before,'Task generation must not rewrite rows or shortage history');
 return result;
}
const row=(code,extra={})=>({product_code:code,product_name:code,blocking_review:false,needs_review:false,min_order_qty:10,stock_ratio:5,profitability_class:'High',age:45,...extra});
test('exact inverse restores the entire Build129 application blob',()=>{
 const b=Buffer.from(restore130Index(html));
 assert.equal(crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'),'534885bee52315f740c5723bc64645299f9ad762');
});
test('negative, missing-unit and conflicting-unit aged products remain review-only',()=>{
 const rows=[row('negative',{blocking_review:true,needs_review:true,min_order_qty:null,stock_ratio:null,profitability_class:'Super',review_reason:'Negative stock'}),row('unitless',{blocking_review:true,needs_review:true,min_order_qty:null,stock_ratio:null,profitability_class:'Super',review_reason:'Inventory unit is missing'}),row('unknown-unit',{blocking_review:true,needs_review:true,min_order_qty:null,stock_ratio:null,review_reason:'Unknown or conflicting unit'}),row('valid')];
 const tasks=generate(rows,{review:true}),aged=tasks.find(t=>t.focus==='aging30'),data=tasks.find(t=>t.focus==='data');
 assert.deepEqual(aged.codes,['valid']);assert.equal(aged.target_count,1);
 assert.deepEqual(data.codes,['negative','unitless','unknown-unit']);
 assert.equal(aged.task_key,'review|30day-decision');assert.equal(aged.badge_type,'aging_breaker');
 assert(tasks.every((t,i)=>t.priority===i+1));
});
test('all blocked history emits no empty aging task and keeps master review',()=>{
 const tasks=generate([row('blocked',{blocking_review:true,needs_review:true,min_order_qty:null,stock_ratio:null})],{review:true});
 assert.equal(tasks.length,1);assert.equal(tasks[0].focus,'data');assert.equal(tasks[0].priority,1);
});
test('missing rows, no current order, unknown blocker state and accepted exceptions are excluded',()=>{
 const rows=[row('no-order',{min_order_qty:0}),row('unknown-order',{min_order_qty:null}),row('unknown-blocker',{blocking_review:undefined}),row('accepted'),row('valid-attention',{needs_review:true,review_reason:'Supplier is not assigned'})];
 const tasks=generate(rows,{excluded:['accepted'],actionCodes:[...rows.map(r=>r.product_code),'removed']});
 assert.deepEqual(tasks.find(t=>t.focus==='aging30').codes,['valid-attention']);
});
test('filtering happens before the five-product cap; profitability and age ordering are preserved',()=>{
 const rows=[...Array.from({length:7},(_,i)=>row('blocked'+i,{blocking_review:true,min_order_qty:null,profitability_class:'Super'})),...Array.from({length:6},(_,i)=>row('valid'+i,{age:40+i}))];
 const aged=generate(rows).find(t=>t.focus==='aging30');
 assert.deepEqual(aged.codes,['valid5','valid4','valid3','valid2','valid1']);assert.equal(aged.target_count,5);
});
test('an all-valid aging selection remains byte-equivalent to the old builder result',()=>{
 const rows=[row('a',{profitability_class:'Medium',age:60}),row('b',{profitability_class:'Super',age:40}),row('c',{profitability_class:'High',age:50})];
 const aged=generate(rows).find(t=>t.focus==='aging30');
 assert.deepEqual(aged.codes,['b','c','a']);assert.equal(aged.priority,1);assert.equal(aged.score_impact,0);
});
