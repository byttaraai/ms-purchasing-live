'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const begin=html.lastIndexOf('<script>',html.indexOf('root.PurchasingCore=api;'))+8;
const end=html.indexOf('</script>',begin);
assert(begin>=8&&end>begin);
const ctx={};vm.runInNewContext(html.slice(begin,end),ctx);
const C=ctx.PurchasingCore,plain=x=>JSON.parse(JSON.stringify(x));
test('undoing approved importer changes restores exactly the Build128 HTML blob',()=>{
 const crypto=require('node:crypto'),{restore129Index}=require('./inventory-missing-unit-v129-inverse.cjs');
 const restored=restore129Index(html);
 const b=Buffer.from(restored);
 const sha=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
 assert.equal(sha,'c9ab3bb3ff987c2ca7e8b3b7ddcf64437049c140');
});

test('unitless numeric stock is parsed without guessed unit',()=>{
 for(const [input,qty] of [['12',12],['3',3],['0',0],['-2',-2],['3.5',3.5],['١٢',12],['1,000',1000]]){
  assert.deepEqual(plain(C.parseQuantity(input)),{raw_quantity:qty,raw_unit:null});
 }
 assert.deepEqual(plain(C.parseQuantity('12 Piece')),{raw_quantity:12,raw_unit:'Piece'});
 for(const invalid of ['','abc','1.2.3'])assert.throws(()=>C.parseQuantity(invalid),/Invalid inventory quantity/);
});
test('mixed CSV inventory loads all rows, preserving source line',()=>{
 const csv=['Code,Name,Quantity','item 004160,Tenda,12','item 004153,Gun,3','item 004154,Syringe,3','item 000014,Known,10 Piece','Total,Total,28 Piece'].join('\r\n');
 const lines=C.parseInventory(C.recordsFromRows(C.parseCSV(csv)));
 assert.equal(lines.length,4);assert.equal(lines.filter(l=>l.raw_unit===null).length,3);
 assert.deepEqual(plain(lines.slice(0,3).map(l=>l.source_row)),[2,3,4]);
});
test('invalid nonnumeric quantity still fails with exact source product and row',()=>{
 assert.throws(()=>C.parseInventory([{Code:'item 999',Name:'Bad',Quantity:'oops'}]),/source row 2 \(item 999\).*Invalid inventory quantity/);
});
test('Full Snapshot keeps unresolved stock unknown and purchase actions blocked',()=>{
 const m={product_code:'item 000014',product_name:'Known',purchase_unit:'Piece',option_unit:null,factor:1,order_multiple:1,reorder_point:5,reorder_point_unit:'Piece',purchase_price:10,supplier:'A',profitability_class:'Medium'};
 const lines=[{product_code:'item 000014',raw_product_name:'Known',raw_quantity:12,raw_unit:null},{product_code:'item 004160',raw_product_name:'Unknown',raw_quantity:3,raw_unit:null}];
 const snapshot={is_complete:true,excludes_zero:true,scope_key:'all_products'};
 for(const row of C.makeSnapshot([m],lines,snapshot,[])){
  assert.equal(row.stock_qty,null);assert.equal(row.min_order_qty,null);assert.equal(row.blocking_review,true);
  assert.match(row.review_reason,/Inventory unit is missing/);
 }
 const valid=C.makeSnapshot([m],[{...lines[0],raw_unit:'Piece'}],snapshot,[])[0];
 assert.equal(valid.stock_qty,12);assert.equal(valid.blocking_review,false);
});
test('review details are part of upload validation, not a blocking parser error',()=>{
 assert(html.includes('missingUnits=lines.filter(l=>!C.text(l.raw_unit))'));
 assert(html.includes('Needs unit review'));assert(html.includes('<small>Missing units</small>'));
 assert(html.includes('No unit is inferred, even for a full inventory snapshot.'));
});
