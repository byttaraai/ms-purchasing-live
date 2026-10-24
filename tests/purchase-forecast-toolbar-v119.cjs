'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const js=fs.readFileSync('assets/js/purchase-forecast-v116.js','utf8');
const css=fs.readFileSync('assets/css/purchase-forecast-v116.css','utf8');
const blob=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
const originalTop=[
 'root.innerHTML=`',
 '  <div class="pf-head"><div><span class="pf-kicker">PURCHASE PLANNING · ANNUAL FORECAST</span><h3>Purchase Forecast Generator <small id="pfYear" class="pf-muted"></small></h3><span id="pfSourceStatus" class="pf-muted" role="status">Loading product master…</span></div><span class="pf-state">UI Preview · No forecast approved</span></div>',
 '  <div class="pf-controls">',
 '    <label>Monthly Sales Upload <button id="pfMonthUpload" class="pf-btn" type="button">Update Month ▴</button></label>',
 '    <label>Annual Growth % <input id="pfGrowth" type="number" min="-100" max="100" step=".1" value="0" aria-label="Annual growth percentage"></label>',
 '    <label>Forecast <button id="pfGenerate" class="pf-btn pf-btn-primary" type="button" disabled title="Requires approved monthly history, mapping rules and a validated annual model">Generate Forecast</button></label>',
 '    <div class="pf-muted" id="pfGrowthStatus" role="status">Growth draft: 0% · not saved</div>',
 '  </div>'
].join('\n')+'\n';
function restorePresentation(text){
 return text.replace(/root\.innerHTML=`\n[\s\S]*?(?=  <div id="pfUploadHelp")/,originalTop)
 .replace("' products · Loading sales history'","' Master products · sales history staged / not approved'")
 .replace("?'Draft · '+g.toLocaleString('en-US')+'%'","?'Growth draft: '+g.toLocaleString('en-US')+'% · not saved'")
 .replace("+' products · Sales through '+visibleMonth;","+' Master products · historical sales through '+visibleMonth+' · staged only';");
}
test('Only approved toolbar markup and three presentation strings changed',()=>{
 assert.equal(blob(restorePresentation(js)),'de44faf0c460ca1b9fb5f367370026a7f8dba685');
});
test('Table, header and all previous CSS are byte-for-byte unchanged',()=>{
 assert.equal(blob(css.split('\n/* Build 119:')[0]),'b02732e47f4dafc82338913a1d206f39d9fb2319');
 const addition=css.split('/* Build 119:')[1];
 assert(addition.includes('#purchaseForecast116 .pf-toolbar'));
 assert(!addition.includes('.pf-header'));
 assert(!css.includes('!important'));
});
test('UI removal cannot grant approval or remove history labels',()=>{
 const top=js.slice(js.indexOf('root.innerHTML=`'),js.indexOf('  <div id="pfUploadHelp"'));
 assert(top.includes('data-ui-build="119"'));
 assert(!top.includes('pf-kicker')&&!top.includes('pf-state'));
 for(const id of ['pfYear','pfSourceStatus','pfMonthUpload','pfGrowth','pfGrowthStatus','pfGenerate']){
  assert.equal((top.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert(top.includes('id="pfGenerate"')&&top.includes(' disabled '));
 assert(js.includes('Historical actuals (staged)'));
 assert(js.includes('Pending model'));
 assert(js.includes('Not assessed'));
});
test('Original application entry point is untouched',()=>{
 assert.equal(blob(fs.readFileSync('index.html','utf8')),'9a003f56f6c41e164452fb93ad4de56266800072');
});
