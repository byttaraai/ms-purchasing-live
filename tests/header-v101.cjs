'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {test}=require('node:test');
const link='\n<link rel="stylesheet" href="assets/css/header-v101.css?v=101">';
const cleanBreak='<link rel="stylesheet" href="assets/css/task-assistant-v92.css?v=92">\n<link rel="stylesheet" href="assets/css/task-assistant-v93.css?v=93">';
function once(s,a,b){assert.equal(s.split(a).length-1,1,'Unique header anchor: '+a);return s.replace(a,b);}
function restoreIndex(html){
  html=once(html,link,'');
  html=once(html,'Live Build 101</span>','Live Build 100</span>');
  return once(html,cleanBreak,cleanBreak.replace('\n','\\n'));
}
module.exports={restoreIndex};
if(require.main===module){
 const html=fs.readFileSync('index.html','utf8');
 const css=fs.readFileSync('assets/css/header-v101.css','utf8');
 test('Build 101 changes only the malformed head separator, stylesheet link and visible build label',()=>{
  const b=Buffer.from(restoreIndex(html));
  assert.equal(crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex'),'9b5d3240bd2b0bae637efe89be89afa5e90d627a');
 });
 test('head has a real newline, no visible escaped separator and only one new stylesheet',()=>{
  const head=html.slice(0,html.indexOf('</head>'));
  assert(head.includes(cleanBreak));assert(!head.includes('\\n'));
  assert.equal(head.split(link).length-1,1);
  assert(html.includes('Live Build 101</span>'));
 });
 test('sticky header retains normal flow, dimensions and existing modal hierarchy',()=>{
  assert(/#app > \.topbar\s*\{\s*position: sticky;\s*top: 0;\s*z-index: 50;\s*\}/.test(css));
  assert(!/!important|display:|height:|padding:|margin:|overflow:|position:\s*fixed/.test(css));
  assert(css.includes('top: var(--topbar-height, 83px)'));
  assert(css.includes('[data-panel="recommendations"] .table-scroll thead th'));
  assert(css.includes('@media print'));
 });
 test('baseline guard catches unrelated business-script edits',()=>{
  const changed=html.replace("'use strict';","'use strict';/* unrelated change */");
  assert.notEqual(changed,html);
  const b=Buffer.from(restoreIndex(changed));
  assert.notEqual(crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex'),'9b5d3240bd2b0bae637efe89be89afa5e90d627a');
 });
}
