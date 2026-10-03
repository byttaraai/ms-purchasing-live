'use strict';
const assert=require('node:assert/strict');
const oldPredicate="C.finite(r.min_order_qty)&&r.min_order_qty>0&&['super','high'].includes";
const newPredicate="C.finite(r.min_order_qty)&&(r.min_order_qty>0||(min===80&&max===150&&r.stock_ratio>=120&&r.min_order_qty===0))&&['super','high'].includes";
function previous(html){
  assert.equal(html.split('Live Build 100</span>').length-1,1);
  assert.equal(html.split(newPredicate).length-1,1);
  return html.replace('Live Build 100</span>','Live Build 99</span>').replace(newPredicate,oldPredicate);
}
module.exports={previous,oldPredicate,newPredicate};
