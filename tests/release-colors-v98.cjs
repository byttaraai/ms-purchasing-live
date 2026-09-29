'use strict';
const assert=require('node:assert/strict');
// Test-only inverse of the two authorized Build 98 entrypoint changes.
// Existing behavioral assertions and historical hashes are not replaced.
module.exports=function build97Entrypoint(html){
  const link='<link rel="stylesheet" href="assets/css/task-assistant-v98.css?v=98">';
  assert.equal(html.split(link).length-1,1,'Expected exactly one Build 98 stylesheet');
  assert.equal(html.split('Live Build 98</span>').length-1,1,'Expected exactly one Build 98 marker');
  return html.replace(link,'').replace('Live Build 98</span>','Live Build 97</span>');
};
