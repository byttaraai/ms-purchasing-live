'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {test}=require('node:test');
const link='\n<link rel="stylesheet" href="assets/css/navigation-v102.css?v=102">';
const printRE=/<div class="bo-header-actions hidden" id="boHeaderActions"><button\b[^>]*id="printSelectedBtn"[\s\S]*?<\/button><\/div>/g;
const exportRE=/<button class="btn table-footer-export" id="exportBtn"[\s\S]*?<\/button>/g;
function once(s,a,b){assert.equal(s.split(a).length-1,1,'unique UI anchor');return s.replace(a,b);}
function control(s,re){const all=[...s.matchAll(re)];assert.equal(all.length,1,'one original control');return all[0][0];}
function next(s){
 const print=control(s,printRE),exp=control(s,exportRE);
 s=once(s,print,'');
 s=once(s,exp,'<div class="table-footer-actions">'+print+exp+'</div>');
 s=once(s,'<link rel="stylesheet" href="assets/css/header-v101.css?v=101"></head>','<link rel="stylesheet" href="assets/css/header-v101.css?v=101">'+link+'</head>');
 return once(s,'Live Build 101</span>','Live Build 102</span>');
}
function previous(s){
 const print=control(s,printRE),exp=control(s,exportRE);
 s=once(s,'<div class="table-footer-actions">'+print+exp+'</div>',exp);
 s=once(s,'<div class="actions"><span class="avatar">','<div class="actions">'+print+'<span class="avatar">');
 s=once(s,link,'');
 return once(s,'Live Build 102</span>','Live Build 101</span>');
}
function as101(s){return s.includes('Live Build 102</span>')?previous(s):s;}
function blob(s){const b=Buffer.from(s);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');}
module.exports={next,previous,as101};
if(require.main===module){
 const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('assets/css/navigation-v102.css','utf8');
 test('exact Build101 is recoverable: runtime logic and every existing control are unchanged',()=>{
  assert.equal(blob(previous(html)),'7d68537f289ed8e47be191265c4d5658cd2a48e4');
  assert.equal(next(previous(html)),html);
 });
 test('print and export occur once together in the footer, not the navigation',()=>{
  assert.equal(html.split('id="printSelectedBtn"').length-1,1);
  assert.equal(html.split('id="selectedCount"').length-1,1);
  assert.equal(html.split('id="boHeaderActions"').length-1,1);
  const head=html.slice(html.indexOf('<header class="topbar">'),html.indexOf('</header>',html.indexOf('<header class="topbar">')));
  assert(!head.includes('printSelectedBtn'));
  const footer=html.match(/<footer class="footer continuous-footer">[\s\S]*?<\/footer>/)[0];
  assert(footer.includes('table-footer-actions'));assert(footer.includes('printSelectedBtn'));assert(footer.includes('exportBtn'));
 });
 test('new stylesheet is scoped and has no positioning for a floating footer or count logic',()=>{
  assert(css.includes('justify-content: flex-start'));assert(css.includes('border-left: 1px solid var(--line)'));
  assert(css.includes('padding-right: 46px!important'));assert(css.includes('height: 32px'));
  assert(!/position:\s*(fixed|sticky)|content:|\.hidden\s*\{/.test(css));
  assert.equal(html.split(link).length-1,1);
  assert(!html.slice(0,html.indexOf('</head>')).includes('\\n'));
 });
 test('inverse hash detects unrelated business changes rather than normalizing them away',()=>{
  const changed=html.replace("'use strict';","'use strict';/* unauthorized */");assert.notEqual(changed,html);
  assert.notEqual(blob(previous(changed)),'7d68537f289ed8e47be191265c4d5658cd2a48e4');
 });
}
