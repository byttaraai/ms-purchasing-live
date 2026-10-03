'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const {previous}=require('./release-task02-v100.cjs');
const html=fs.readFileSync('index.html','utf8'),prior=previous(html);
const hash=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');};
const source=fs.readFileSync('tests/workspace-v47.cjs','utf8').split('(async()=>')[0];
const anchor="const root=process.argv[2]||'.',html=fs.readFileSync(root+'/index.html','utf8');";
assert.equal(source.split(anchor).length-1,1);
function harness(text){
  return vm.runInNewContext(source.replace(anchor,"const root='.',html=__html;")+ '\n({run,derive,row,base,context});',{
    __html:text,URL,TextDecoder,TextEncoder,structuredClone,AbortController,Blob,queueMicrotask,require:createRequire(__filename),process:{argv:['node','qa','.']},console:{log(){},error:console.error}
  });
}
const live=harness(html),old=harness(prior),copy=x=>JSON.parse(JSON.stringify(x));
function dataset(rows){const d=copy(live.base);d.rows=rows;d.master=rows.map(r=>({...r,option_unit:null,order_multiple:1,reorder_point_unit:'Piece'}));return d;}
function row(code,stock,profit='Super',extra={}){return {...live.row(code,'QA Supplier',stock,profit),blocking_review:false,...extra};}
function upper(result){return result.tasks.find(t=>t.focus==='profit_recovery_80_150');}
const upperData=dataset([row('at120',120),row('in125',125,'High'),row('under150',149.999,'Super')]);
const derived=live.derive(upperData);
test('only approved candidate predicate and release marker differ from exact Build 99',()=>{
  assert.equal(hash(prior),'65030c976b4c519e733c54c484aec19c27ff2501');
  assert.equal(hash(fs.readFileSync('assets/js/workspace-v47.js','utf8')),'479823da0a805b1e15a3e28ad29213d284796534');
  assert.equal(hash(fs.readFileSync('assets/js/task-assistant-v99.js','utf8')),'ebb290954892fe2f84aa3418a0811002bcd01bb7');
});
test('full workspace adds 120-150 without altering source, stock, price, Min/Max or score model',()=>{
  const before=JSON.stringify(upperData),a=live.derive(upperData),b=old.derive(upperData);
  assert(!upper(b));assert.equal(upper(a).codes.length,3);
  assert.deepEqual(copy(a.dataset),copy(b.dataset));assert.deepEqual(copy(a.model),copy(b.model));
  assert.equal(JSON.stringify(upperData),before);
  assert.deepEqual(copy(a.tasks.filter(t=>t.focus==='suppliers')),copy(b.tasks.filter(t=>t.focus==='suppliers')));
});
let matrix=0;
test('range edges and profitability boundaries use actual full runtime',()=>{
  for(const stock of [9.999,10,79.999,80,119.999,120,120.001,149.999,150,150.001,200]){
    for(const profit of ['Super','High','Medium','Low','Loss']){
      const d=dataset([row('edge',stock,profit)]),a=live.derive(d),b=old.derive(d);
      assert.equal(!!upper(a),stock>=80&&stock<150&&['Super','High'].includes(profit),`${stock}/${profit}`);
      assert.deepEqual(copy(a.tasks.filter(t=>t.focus==='profit_recovery')),copy(b.tasks.filter(t=>t.focus==='profit_recovery')));
      matrix++;
    }
  }
});
test('invalid order/ratio, review blockers and zero-RP cases stay excluded',()=>{
  for(const extra of [{min_order_qty:null},{min_order_qty:-1},{blocking_review:true},{stock_ratio:null},{stock_ratio:150},{reorder_point:0,stock_ratio:null}]){
    assert(!upper(live.derive(dataset([row('guard',125,'Super',extra)]))),JSON.stringify(extra));
  }
  assert(!upper(live.derive(dataset([row('below120',119,'Super',{min_order_qty:0})]))));
});
test('unchanged Super-first then stock-ratio priority and ten-product cap',()=>{
  const rows=[...Array.from({length:12},(_,i)=>row('s'+i,120+i,'Super')),...Array.from({length:12},(_,i)=>row('h'+i,80+i,'High'))].reverse();
  const a=live.derive(dataset(rows));assert.deepEqual(copy(upper(a).codes),Array.from({length:10},(_,i)=>'s'+i));
  const preexisting=dataset([row('s80',80),row('h90',90,'High'),row('s100',100)]);
  assert.deepEqual(copy(upper(live.derive(preexisting))),copy(upper(old.derive(preexisting))));
});
test('nonblocking missing price stays in Master Review and does not invent supplier order',()=>{
  const d=dataset([row('price',125,'High',{purchase_price:null,total_value:null,needs_review:true,review_reason:'Master purchase price is missing or zero'})]);
  const a=live.derive(d);assert(upper(a).codes.includes('price'));
  assert(a.tasks.find(t=>t.focus==='data').codes.includes('price'));assert(!a.tasks.some(t=>t.focus==='suppliers'));
});
test('accepted external shortage remains excluded',()=>{
  const start=html.indexOf('const profitRecoveryRows='),end=html.indexOf('const profitBelow80=',start);
  assert(start>=0&&end>start);
  const f=new Function('state','C','isScoreExcluded','profitabilityKey',html.slice(start,end)+'return profitRecoveryRows(80,150);');
  const frozen=Object.freeze(row('excluded',125));
  assert.equal(f({rows:[frozen]},{finite:Number.isFinite},()=>true,s=>s.toLowerCase()).length,0);
});
test('new eligibility still generates sequential priorities and the original task identity',()=>{
  const a=derived,t=upper(a);assert.equal(t.task_key,'recovery|profit-80-150');assert.equal(t.badge_label,'Profit Protector');
  assert.deepEqual(copy(a.tasks.map(t=>t.priority)),Array.from({length:a.tasks.length},(_,i)=>i+1));assert.equal(t.target_count,t.codes.length);
  assert(a.tasks.every(t=>!t.status&&!t.completed_at));
});
if(process.env.TASK02_EXPORT==='1'){
  fs.writeFileSync('/tmp/task02-payloads.json',JSON.stringify({dataset:upperData,payload:derived.payload,cycles:derived.cycles}));
}
process.on('exit',()=>console.log(JSON.stringify({task02_boundary_cases:matrix,production_requests:0})));
