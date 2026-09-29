'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),js=read('assets/js/task-assistant-v94.js');
const coreScript=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).find(x=>x.includes('root.PurchasingCore=api'));
assert(coreScript,'Canonical core script must exist');
const box={};vm.runInNewContext(coreScript,box);const C=box.PurchasingCore;
const fn=js.slice(js.indexOf('  function numericValue('),js.indexOf('  function updateReady('));
const api=vm.runInNewContext(fn+';({numericValue,patchForCard});',{C});
const input=(value,badInput=false)=>({value,validity:{badInput}});
test('popup uses exactly the canonical numeric parser and existing signs',()=>{
 for(const raw of ['1','1.25','1e3','1000000000000','1,000','\u0661\u0662\u066b\u0665']) assert.equal(api.numericValue(input(raw),false),C.number(raw,{nullable:false}));
 assert.equal(api.numericValue(input('0'),true),0);
 assert.equal(api.numericValue(input('0'),false),undefined);
 assert.equal(api.numericValue(input('-1'),true),undefined);
 assert.equal(api.numericValue(input(''),false),null);
});
test('rejects oversized, nonfinite, malformed and incomplete numbers',()=>{
 for(const raw of ['10000000000000','1000000000001','1e309','Infinity','-Infinity','NaN','0x10','1,2','wrong']) assert.equal(api.numericValue(input(raw),true),undefined,raw);
 assert.equal(api.numericValue(input('',true),true),undefined);
});
test('an invalid numeric row cannot produce a save payload',()=>{
 const card={dataset:{code:'QA',new:'0'},querySelectorAll:()=>[{dataset:{key:'supplier'},value:'QA Supplier'},{dataset:{key:'purchase_price'},...input('10000000000000')}]};
 const result=api.patchForCard(card);assert.equal(result.patch,null);assert.equal(result.invalid,true);
 card.querySelectorAll=()=>[{dataset:{key:'purchase_price'},...input('25.50')}];
 assert.equal(api.patchForCard(card).patch.purchase_price,25.5);
});
test('only numeric validation differs from the previous runtime',()=>{
 const base=read('assets/js/task-assistant-v93.js');
 const strip=s=>s.replace(/^\/\*[^\n]*\*\//,'').replace(/  function numericValue\([\s\S]*?\n  }\n/,'').replaceAll(' max="1000000000000"','').replace('Check numeric values; maximum is 1,000,000,000,000.','Check numeric values.');
 assert.equal(strip(js),strip(base));
 assert.equal((js.match(/max="1000000000000"/g)||[]).length,2);
 assert(html.includes('Live Build 96</span>'));
 assert(html.includes('task-assistant-v96.js?v=96'));
 assert(!html.includes('<script src="assets/js/task-assistant-v93.js?v=93"'));
});
test('database guard preserves authorization, bounded inputs and calculated values',()=>{
 const sql=read('supabase/migrations/20260928113235_data01_numeric_validation.sql');
 for(const k of ['master_numeric_bounds_data01','inventory_quantity_bounds_data01','inventory_total_bounds_data01','assert_workspace_numbers_data01']) assert(sql.includes(k));
 assert(sql.includes('from public, anon, authenticated'));
 assert(!/drop\s+table|update\s+public\.purchasing_tasks|grant\s+.*\s+to\s+authenticated/i.test(sql));
 assert(sql.includes("expected := '06897369c893983bc22c012c6ea600d6'"));
 assert(sql.includes("expected := 'ee1c47552fbb2d007df09ba6d49abd89'"));
});
