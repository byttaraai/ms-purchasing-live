'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
const current=read('assets/js/task-assistant-v95.js'),baseline=read('assets/js/task-assistant-v94.js');
const span=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b));
const gitHash=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');};
test('rendering and field definitions stay identical to the verified Build 94',()=>{
  assert.equal(gitHash(baseline),'45eaad58fb9c061d791d193de77d0aea89ddf706');
  assert.equal(span(current,'  const issueDefs=','  function ensureDialog('),span(baseline,'  const issueDefs=','  function ensureDialog('));
});
test('numeric parsing and editable payload semantics remain byte-for-byte identical',()=>{
  assert.equal(span(current,'  function numericValue(','  function updateReady('),span(baseline,'  function numericValue(','  function updateReady('));
});
test('non-Master task routing remains byte-for-byte identical',()=>{
  assert.equal(span(current,'  function wrapOpenTask(','  function init('),span(baseline,'  function wrapOpenTask(','  function init('));
});
test('draft protection adds no persistent storage, formula or official task writes',()=>{
  assert(!/localStorage|sessionStorage|indexedDB|badge_awarded|status\s*=\s*['"]completed/.test(current));
  assert(!/masterReviewSeverity|estimateScoreGain|score_impact\s*=/.test(current));
  assert.equal((current.match(/await rpc\(/g)||[]).length,1);
  assert(current.includes("await rpc('purchasing_master_review_save_v93'"));
  assert(current.includes('expected_revision:s.revision'));
  assert(current.includes("codes=(current.codes||[]).slice(0,20)"));
  assert(!span(current,'  function open(','  function sameOwner(').includes('.sort('));
});
test('only two release references differ from the exact pre-fix entrypoint',()=>{
  let html=require('./release-colors-v98.cjs')(require('./release-negative-v99.cjs')(read('index.html')));
  for(const [now,before] of [['Live Build 97</span>','Live Build 94</span>'],['task-assistant-v97.js?v=97','task-assistant-v94.js?v=94']]){
    assert.equal(html.split(now).length-1,1);
    html=html.replace(now,before);
  }
  assert.equal(gitHash(html),'59af8730182baca15d36b0232ba8c5f232ef9137');
  assert.equal(gitHash(read('assets/js/workspace-v47.js')),'479823da0a805b1e15a3e28ad29213d284796534');
  assert.equal(gitHash(read('assets/js/overstock-risk-v69.js')),'48a2fd77f638ab13f28ce6b781982d181479d7f6');
});
