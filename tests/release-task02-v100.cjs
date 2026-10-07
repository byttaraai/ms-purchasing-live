'use strict';
const assert=require('node:assert/strict');
const oldPredicate="C.finite(r.min_order_qty)&&r.min_order_qty>0&&['super','high'].includes";
const newPredicate="C.finite(r.min_order_qty)&&(r.min_order_qty>0||(min===80&&max===150&&r.stock_ratio>=120&&r.min_order_qty===0))&&['super','high'].includes";
function previous(html){
  // Strip only the separately hash-verified Build101 UI patch before reconstructing Build99.
  if(html.includes('Live Build 101</span>'))html=require('./header-v101.cjs').restoreIndex(html);
  assert.equal(html.split('Live Build 100</span>').length-1,1);
  assert.equal(html.split(newPredicate).length-1,1);
  return html.replace('Live Build 100</span>','Live Build 99</span>').replace(newPredicate,oldPredicate);
}
module.exports={previous,oldPredicate,newPredicate};
