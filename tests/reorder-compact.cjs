'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/css/reorder-generator-v103.css','utf8');
const {as102}=require('./reorder-preview-v103.cjs');
const crypto=require('node:crypto');
test('generator modification restores the frozen pre-generator app byte for byte',()=>{
 const old=Buffer.from(as102(html));
 const hash=crypto.createHash('sha1').update(Buffer.from('blob '+old.length+'\0')).update(old).digest('hex');
 assert.equal(hash,'d32029f93ea63f9f8537d342de59cabaef89649e');
});
test('table collapsed, approval disabled, importer isolated to preview',()=>{
 assert(html.includes('<details class="ropg-details" id="ropgProducts">'));
 assert(html.includes('id="ropgApprove" disabled'));
 assert(html.includes('id="ropgUpload"'));
 assert(html.includes('class="ropg-controls"'));
 assert(html.includes("root.querySelector('.ropg-inputs').after(multipliers)"));
 assert(html.includes('readRows(text)'));
 for(const name of ['Super','High','Medium','Low','Loss']) assert(html.includes('aria-label="'+name+' coverage days"'));
});
test('all CSS selectors scoped to generator',()=>{
 const clean=css.replace(/\/\*[\s\S]*?\*\//g,'');
 const selectors=[...clean.matchAll(/(?:^|\})\s*([^{}]+)\{/g)].flatMap(m=>m[1].split(','));
 assert(selectors.length>15);
 for(const selector of selectors)assert(selector.trim().startsWith('#ropGenerator'),selector);
 assert(!/!important|position\s*:\s*(?:fixed|sticky)|@import|url\(/i.test(clean));
 assert(clean.includes('width: calc(100% - 44px)'));
 assert(clean.includes('top: 11px'));
 assert(!clean.includes('inset: 0'));
 assert(clean.includes('.ropg-details:has(.ropg-empty)'));
 assert(html.includes('reorder-generator-v103.css?v=105'));

});