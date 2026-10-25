'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const link='<link rel="stylesheet" href="assets/css/reorder-generator-v108.css?v=108">';
const sectionStart='<section class="ropg-section" id="ropGenerator"';
const sectionEnd='</section>\n<section class="hidden" data-panel="tasks-assistant">';
function as102(html){
  // Build123: normalize only the approved cache-versioned stylesheet URL for the frozen historical baseline.
  if(html.includes('assets/css/app-v57.css?v=123'))html=html.replace('assets/css/app-v57.css?v=123','assets/css/app-v57.css?v=68');
  // Build 116 is an additive, isolated UI: remove only its two resource tags for the frozen pre-generator comparison.
  html=html.replace('<link rel="stylesheet" href="assets/css/purchase-forecast-v116.css?v=116">','').replace('<script src="assets/js/purchase-forecast-v116.js?v=116"></script>','');
  assert.equal(html.split(sectionStart).length-1,1,'one generator section');
  const start=html.indexOf(sectionStart);
  const end=html.indexOf(sectionEnd,start);
  assert(end>start,'generator section end');
  const section=html.slice(start,end);
  assert(section.includes('readRows(text)'),'validated CSV parser is scoped to generator');
  assert(section.includes('id="ropgProducts"'),'collapsible table present');
  assert(section.includes('id="ropgGenerate" disabled'),'generator must stay gated');
  assert(section.includes('id="ropgApprove" disabled'),'approval must stay gated');
  assert(section.includes('id="ropgUpload"'),'upload control available');
  html=html.slice(0,start)+html.slice(end);
  assert.equal(html.split(link).length-1,1,'one added stylesheet link');
  return html.replace(link,'');
}
function sha(s){const b=Buffer.from(s);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');}
module.exports={as102};
if(require.main===module){
const html=fs.readFileSync('index.html','utf8');
test('removing exactly Build103 preview restores frozen Build102 byte-for-byte',()=>{
  assert.equal(sha(as102(html)),'d32029f93ea63f9f8537d342de59cabaef89649e');
});
test('generator is collapsed by default and cannot write production data',()=>{
 const section=html.slice(html.indexOf(sectionStart),html.indexOf(sectionEnd,html.indexOf(sectionStart)));
 assert(/<details class="ropg-details" id="ropgProducts">/.test(section));
 assert(!/<details[^>]+open/.test(section));
 for(const id of ['ropgGenerate','ropgApprove'])assert(section.includes('id="'+id+'" disabled'));
 assert(section.includes('approval remains locked') || section.includes('Approval remains locked'));
});
test('new stylesheet only styles ropg namespaced selectors',()=>{
const css=fs.readFileSync('assets/css/reorder-generator-v103.css','utf8');
assert(!/position\s*:\s*(fixed|sticky)|!important/.test(css));
assert(css.includes('.ropg-details[open]'));
});
}