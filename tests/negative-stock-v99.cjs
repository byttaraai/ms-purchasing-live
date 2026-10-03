'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const read=p=>fs.readFileSync(p,'utf8'),html=read('index.html');
const old=read('assets/js/task-assistant-v97.js'),js=read('assets/js/task-assistant-v99.js');
const hash=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');};
const addition=`    // NEG99: display only; unmatched stock has no purchase-unit conversion yet.
    if(isNew){
      const negative=issueDefs.find(d=>d.key==='negative');
      let quantity=null;
      if(typeof row?.raw_quantity==='number'||typeof row?.raw_quantity==='string'){
        try{quantity=C.number(row.raw_quantity,{nullable:true});}catch{}
      }
      if(negative.match(row)||(Number.isFinite(quantity)&&quantity<0))defs.push(negative);
    }
`;
const core=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('root.PurchasingCore=api'));
assert(core);const box={};vm.runInNewContext(core,box);
function renderApi(source){
 const env={C:box.PurchasingCore,addEventListener(){},setTimeout(){}};
 vm.runInNewContext(source.replace(/\}\)\(\);\s*$/,'globalThis.render99={issueChips};})();'),env);
 return env.render99.issueChips;
}
const render=renderApi(js),before=renderApi(old);
const count=output=>(output.match(/class="mr93-chip mr93-negative"/g)||[]).length;
test('all runtime except the approved new-product chip addition is byte-identical',()=>{
 assert.equal(hash(old),'e05959ee65c5673bbff1e5df16117f61f033c70f');
 assert.equal(js.split(addition).length-1,1);
 assert.equal(js.replace(addition,'').replace(/^\/\*[^\n]*\*\//,old.split('\n')[0]),old);
 assert.equal(hash(read('assets/js/workspace-v47.js')),'479823da0a805b1e15a3e28ad29213d284796534');
 assert.equal(hash(read('assets/js/overstock-risk-v69.js')),'48a2fd77f638ab13f28ce6b781982d181479d7f6');
});
test('only build marker and active module reference changed in the entrypoint',()=>{
 assert.equal(hash(require('./release-negative-v99.cjs')(html)),'0b3b3e305fce9d1a0539d36d62ace911bba5a587');
 assert.equal((html.match(/<script src="assets\/js\/task-assistant-v99.js\?v=99"/g)||[]).length,1);
 assert(!html.includes('<script src="assets/js/task-assistant-v97.js?v=97"'));
});
test('new negative raw stock is visible without requiring master or converted stock',()=>{
 for(const raw_quantity of [-12,-0.25,'-12','-1.25','-1e2',-1000000000000]){
  const row=Object.freeze({review_reason:'Product is not in the master',raw_quantity,stock_quantity:null});
  const output=render(row,true);assert.equal(count(output),1,String(raw_quantity));
  assert.equal(output.replace('<span class="mr93-chip mr93-negative">Negative Stock</span>',''),before(row,true));
 }
});
test('missing, nonnegative, invalid, nonnumeric or oversized source is not invented as negative',()=>{
 for(const raw_quantity of [0,-0,12,'0','12.5',null,undefined,'',' ','invalid','-Infinity','-1e309','-1000000000001',{},[-5],true,false]){
  const row=Object.freeze({review_reason:'Product is not in the master',raw_quantity});
  assert.equal(render(row,true),before(row,true),String(raw_quantity));
 }
});
test('explicit Negative stock review reason is honored exactly once for a new product',()=>{
 for(const raw_quantity of [-12,12,null,'invalid'])assert.equal(count(render({raw_quantity,review_reason:'Product is not in the master | Negative stock requires review'},true)),1);
});
test('existing product warning behavior and non-source numeric fields stay unchanged',()=>{
 for(const review_reason of ['','Supplier is not assigned','Negative stock requires review']){
  const row=Object.freeze({review_reason,raw_quantity:-12,stock_quantity:-12});
  assert.equal(render(row,false),before(row,false));
 }
 assert.equal(count(render({review_reason:'Product is not in the master',raw_quantity:12,stock_quantity:-12,stock_percent:-20,purchase_price:-1},true)),0);
});
test('rendering creates no editable quantity, state mutation, network or storage operation',()=>{
 const row={review_reason:'Product is not in the master',raw_quantity:-12,raw_unit:'Piece'},snapshot=JSON.stringify(row);
 const output=render(Object.freeze(row),true);
 assert.equal(JSON.stringify(row),snapshot);
 assert(!/<input|<select|data-key=/.test(output));
 assert(!/rpc\(|fetch\(|localStorage|sessionStorage|\.sort\(|badge|task|\.raw_quantity\s*=/.test(addition));
});
