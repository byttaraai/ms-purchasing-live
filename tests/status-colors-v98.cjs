'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),css=read('assets/css/task-assistant-v98.css');
const hash=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');};
test('only the release marker and new stylesheet differ from exact Build 97 entrypoint',()=>{
  assert.equal(hash(require('./release-colors-v98.cjs')(html)),'2347d66d951abd23f5ccf30671fbfd3fda47703c');
  assert(html.indexOf('task-assistant-v98.css?v=98')>html.indexOf('task-assistant-v93.css?v=93'));
  assert.equal((html.match(/<script src="assets\/js\/task-assistant-v97.js\?v=97"/g)||[]).length,1);
  assert(!html.includes('task-assistant-v98.js'));
});
test('active save, drafts, unit, freshness, score and risk JavaScript is byte-identical',()=>{
  for(const [p,expected] of Object.entries({
    'assets/js/task-assistant-v97.js':'e05959ee65c5673bbff1e5df16117f61f033c70f',
    'assets/js/workspace-v47.js':'479823da0a805b1e15a3e28ad29213d284796534',
    'assets/js/overstock-risk-v69.js':'48a2fd77f638ab13f28ce6b781982d181479d7f6',
    'assets/css/task-assistant-v93.css':'34aeba3cd294aae605d49634ea7b5dcdc6c128b6'
  }))assert.equal(hash(read(p)),expected,p);
});
test('every new CSS rule is popup-scoped and contains color declarations only',()=>{
  const body=css.replace(/\/\*[\s\S]*?\*\//g,'');
  const rules=[...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)];assert(rules.length>=4);
  for(const [,selectors,declarations] of rules){
    for(const selector of selectors.split(','))assert(selector.trim().startsWith('#masterReviewDialog93'),selector);
    for(const declaration of declarations.split(';').map(x=>x.trim()).filter(Boolean)){
      const [property,value]=declaration.split(':').map(x=>x.trim());
      assert(['color','background-color','border-color'].includes(property),property);
      assert(/^#[0-9a-f]{6}$/i.test(value),value);
    }
  }
  assert(!/!important|@import|url\(|content:|display:|pointer-events:|visibility:/i.test(body));
});
test('existing state markers are consumed; no new completion or persistence contract',()=>{
  for(const token of ['.mr93-row-state','.ready','.invalid','data-saved95="1"','data-new="1"','aria-busy="true"','#mr97Freshness:not([hidden])'])assert(css.includes(token));
  const js=read('assets/js/task-assistant-v97.js');
  assert(js.includes("card.classList.toggle('ready',!!result.patch)"));
  assert(js.includes("card.classList.toggle('invalid',!!result.invalid)"));
  assert(js.includes("submitted.forEach(entry=>{entry.card.dataset.saved95='1';})"));
});
