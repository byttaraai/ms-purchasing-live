'use strict';
const assert=require('node:assert/strict');
// Test-only inverse. Never normalize or modify production data or calculations.
module.exports=function build98Entrypoint(html){
  for(const [current,previous] of [
    ['Live Build 99</span>','Live Build 98</span>'],
    ['task-assistant-v99.js?v=99','task-assistant-v97.js?v=97']
  ]){
    assert.equal(html.split(current).length-1,1,'Expected exactly one approved Build 99 release reference');
    html=html.replace(current,previous);
  }
  return html;
};
