'use strict';
const assert=require('node:assert/strict');
const before=" if(model.counts.action30){\n  const rows=model.action30.map(([code])=>state.rows.find(r=>r.product_code===code)).filter(Boolean).sort((a,b)=>taskProfitabilityWeight(b.profitability_class)-taskProfitabilityWeight(a.profitability_class)||shortageAge(b.product_code)-shortageAge(a.product_code)).slice(0,5);";
const after=" // Build130: retain shortage history, but only current actionable rows can enter an aging task.\n const agedTaskRows=model.action30.map(([code])=>state.rows.find(r=>r.product_code===code)).filter(r=>r&&r.blocking_review===false&&shortageNeedsOrder(r)&&!isScoreExcluded(r.product_code)).sort((a,b)=>taskProfitabilityWeight(b.profitability_class)-taskProfitabilityWeight(a.profitability_class)||shortageAge(b.product_code)-shortageAge(a.product_code)).slice(0,5);\n if(agedTaskRows.length){\n  const rows=agedTaskRows;";
function restore130Index(s){
 if(!s.includes('// Build130: retain shortage history'))return s;
 assert.equal(s.split(after).length-1,1,'Exactly the approved Build130 aging-task change');
 return s.replace(after,before);
}
module.exports={before,after,restore130Index};
