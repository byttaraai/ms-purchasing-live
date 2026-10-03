'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('assets/js/task-assistant-v96.js'),base=read('assets/js/task-assistant-v95.js');
const html=fs.existsSync(path.join(root,'index.html'))?require('./release-colors-v98.cjs')(require('./release-negative-v99.cjs')(read('index.html'))):'';
const core=process.env.UNIT96_CORE_FILE?fs.readFileSync(process.env.UNIT96_CORE_FILE,'utf8'):[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).find(x=>x.includes('root.PurchasingCore=api'));
assert(core,'Canonical core required');const box={};vm.runInNewContext(core,box);const C=box.PurchasingCore;
const state={master:[{product_code:'A',purchase_unit:'Box 12',option_unit:'Piece',factor:12,supplier:'QA'}],rows:[{product_code:'B',raw_unit:'Piece'}],aliases:[]};
const patched=js.replace(/\}\)\(\);\s*$/,'globalThis.unit96Test={patchForCard,optionUnits};})();');
const env={C,state,addEventListener(){},setTimeout(){},globalThis:null};env.globalThis=env;
vm.runInNewContext(patched,env);const api=env.unit96Test;
function card(values,isNew=true){return {dataset:{code:isNew?'B':'A',new:isNew?'1':'0'},querySelectorAll(){return Object.entries(values).map(([key,value])=>({dataset:{key},value,validity:{badInput:false}}));}};}
const valid={purchase_unit:'Box 12',option_unit:'Piece',factor:'12',purchase_price:'100',reorder_point:'20'};
test('explicit new unit rule reaches payload without converting price or reorder',()=>{
 const p=api.patchForCard(card(valid)).patch;
 assert.equal(p.factor,12);assert.equal(p.option_unit,'Piece');assert.equal(p.purchase_price,100);assert.equal(p.reorder_point,20);
 assert.equal(C.toPurchase(120,'Piece',{...p},[]).value,10);
});
test('conversion needs an explicit factor; mismatched inventory never silently gets identity',()=>{
 assert.equal(api.patchForCard(card({...valid,factor:''})).patch,null);
 assert.equal(api.patchForCard(card({purchase_unit:'Box 12'})).patch,null);
 assert.equal(api.patchForCard(card({...valid,option_unit:''})).patch,null);
});
test('invalid numeric factors stay blocked by the existing canonical parser',()=>{
 for(const factor of ['0','-1','NaN','Infinity','10000000000000','x'])assert.equal(api.patchForCard(card({...valid,factor})).patch,null,factor);
});
test('no conversion uses the existing identity rule; equal units allow only factor one',()=>{
 let p=api.patchForCard(card({purchase_unit:'Piece'})).patch;assert.equal(p.factor,1);assert.equal(p.option_unit,null);
 assert.equal(api.patchForCard(card({purchase_unit:'Piece',option_unit:'Piece',factor:'2'})).patch,null);
 p=api.patchForCard(card({purchase_unit:'Piece',option_unit:'Piece',factor:'1'})).patch;assert.equal(p.factor,1);
});
test('existing-product payload and unit rule are not changed',()=>{
 const result=api.patchForCard(card({purchase_price:'25.5',reorder_point:'0'},false));
 assert.equal(JSON.stringify(result.patch),JSON.stringify({product_code:'A',purchase_price:25.5,reorder_point:0}));
 assert.equal(state.master[0].factor,12);
});
test('option choices include inventory source units, not invented unit labels',()=>{
 const units=api.optionUnits({raw_unit:'dose'});assert(units.includes('dose'));assert(units.includes('Piece'));assert(units.includes('Box 12'));
});
const segment=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b));
test('all save/draft/retry/owner/task routing behavior remains byte identical',()=>{
 assert.equal(js.slice(js.indexOf('  async function save(')),base.slice(base.indexOf('  async function save(')));
 assert.equal(segment(js,'  function ensureDialog(','  function patchForCard('),segment(base,'  function ensureDialog(','  function patchForCard('));
 assert.equal(segment(js,'  function updateReady(','  async function save(').replace('      updateUnitLabels(card);\n',''),segment(base,'  function updateReady(','  async function save('));
});
test('unit display is scoped to popup; source entrypoint contains only release-reference edits',()=>{
 if(!html)return;
 const reverted=html.replace('Live Build 97</span>','Live Build 95</span>').replace('task-assistant-v97.js?v=97','task-assistant-v95.js?v=95');
 const b=Buffer.from(reverted);assert.equal(crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex'),'078492deb993f6c57e09afe2d5dba2505eade6aa');
 assert(html.includes('Live Build 97</span>'));assert(!/\.sort\(|masterReviewSeverity|localStorage|sessionStorage/.test(js.slice(js.indexOf('  function updateUnitLabels'),js.indexOf('  function optionList'))));
});
