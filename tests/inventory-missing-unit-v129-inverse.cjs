'use strict';
const assert=require('node:assert/strict');
function swap(s,now,before,label){assert.equal(s.split(now).length-1,1,'Unique Build129 '+label);return s.replace(now,before);}
function restore129Index(s){
 s=require('./aging-task-blocking-v130-inverse.cjs').restore130Index(s);
 if(!s.includes('const missingUnits=lines.filter(l=>!C.text(l.raw_unit))'))return s;
 // Revert only approved Build129 Inventory importer edits for frozen legacy hashes.
 const start=s.indexOf('function parseQuantity(s){'),end=s.indexOf('\nfunction parseCSV(',start);
 assert(start>=0&&end>start,'Unique quantity parser boundaries');
 let p=s.slice(start,end);
 assert(p.includes('raw_unit:m[2]?.trim()||null'));
 p=p.replace('(?:\\s+(.+))?$/','\\s+(.+)$/').replace('Invalid inventory quantity: ','Expected quantity followed by its explicit unit: ').replace('raw_unit:m[2]?.trim()||null','raw_unit:m[2].trim()');
 s=s.slice(0,start)+p+s.slice(end);
 s=swap(s,
  "let q;try{q=parseQuantity(r.Quantity);}catch(e){throw Error('Inventory source row '+(i+2)+' ('+code+'): '+e.message);}\n out.push({product_code:code,raw_product_name:text(r.Name),...q,source_row:i+2,raw_record:r});",
  "const q=parseQuantity(r.Quantity);out.push({product_code:code,raw_product_name:text(r.Name),...q,source_row:i+2,raw_record:r});",'source context');
 s=swap(s,"if(!text(rawunit))issues.push('Inventory unit is missing');",'','snapshot review');
 s=swap(s,
  "function reason(r){const missing=r.stock_origin==='reported'&&r.raw_quantity!=null&&!C.text(r.raw_unit);const base=r.review_reason||'';return missing&&!base.includes('Inventory unit is missing')?'Inventory unit is missing'+(base?' | '+base:''):base||'All quantities use the purchase unit shown.';}",
  "function reason(r){return r.review_reason||'All quantities use the purchase unit shown.';}",'reason');
 s=swap(s,
  "function reviewIndicator(r){if(!r.needs_review&&!(r.stock_origin==='reported'&&r.raw_quantity!=null&&!C.text(r.raw_unit)))return'';const msg=reason(r),severe=/Negative stock|not in the master|Invalid|Duplicate|Unknown or conflicting unit|Inventory unit is missing/i.test(msg);",
  "function reviewIndicator(r){if(!r.needs_review)return'';const msg=reason(r),severe=/Negative stock|not in the master|Invalid|Duplicate|Unknown or conflicting unit/i.test(msg);",'badge');
 s=swap(s,
  '<div><strong>${negative}</strong><small>Negative stock</small></div><div><strong>${missingUnits.length}</strong><small>Missing units</small></div></div>${missingUnitDetails}<p><strong>${missing}</strong> master products are not present',
  '<div><strong>${negative}</strong><small>Negative stock</small></div></div><p><strong>${missing}</strong> master products are not present','preview summary');
 const b=s.indexOf('\n  const missingUnits=lines.filter(l=>!C.text(l.raw_unit))');
 const e=s.indexOf('\n  state.pendingInventory=',b);
 assert(b>=0&&e>b&&s.slice(b,e).includes('No unit is inferred, even for a full inventory snapshot.'),'Exactly Build129 unit review preview');
 s=s.slice(0,b)+s.slice(e);
 return s;
}
module.exports={restore129Index};
