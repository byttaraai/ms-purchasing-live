'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const html=fs.readFileSync('index.html');
const text=html.toString('utf8');
const css=fs.readFileSync('assets/css/reorder-generator-v103.css','utf8');
test('compact layout does not change a byte of the existing entrypoint, inline scripts or disabled controls',()=>{
 const hash=crypto.createHash('sha1').update(Buffer.from('blob '+html.length+'\0')).update(html).digest('hex');
 assert.equal(hash,'2987165ac50b7f3a58204b9e9ed258af4265e111');
});
test('native table starts closed and all three production actions remain disabled',()=>{
 assert(text.includes('<details class="ropg-details" id="ropgProducts">'));
 for(const id of ['ropgUpload','ropgGenerate','ropgApprove']) assert(text.includes('id="'+id+'" disabled'));
 for(const name of ['Super','High','Medium','Low','Loss']) assert(text.includes('aria-label="'+name+' coverage days"'));
});
test('all selectors are restricted to this generator, with no global hiding or fixed overlay',()=>{
 const clean=css.replace(/\/\*[\s\S]*?\*\//g,'');
 const selectors=[...clean.matchAll(/(?:^|\})\s*([^{}]+)\{/g)].flatMap(m=>m[1].split(','));
 assert(selectors.length>15);
 for(const selector of selectors)assert(selector.trim().startsWith('#ropGenerator'),selector);
 assert(!/!important|position\s*:\s*(?:fixed|sticky)|@import|url\(/i.test(clean));
 assert(clean.includes('grid-column: 4 / 5'));
 assert(clean.includes('.ropg-details[open]'));
});
