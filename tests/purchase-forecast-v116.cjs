'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('assets/js/purchase-forecast-v116.js','utf8');
const css=fs.readFileSync('assets/css/purchase-forecast-v116.css','utf8');
const {as102}=require('./reorder-preview-v103.cjs');
const crypto=require('node:crypto');
const gitsha=(s)=>{const b=Buffer.from(s);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
test('Build 116 preserves original pre-Reorder app exact blob',()=>assert.equal(gitsha(as102(html)),'d32029f93ea63f9f8537d342de59cabaef89649e'));
test('Only scoped forecast stylesheet and script are installed once',()=>{
  assert.equal(html.split('assets/css/purchase-forecast-v116.css?v=116').length-1,1);
  assert.equal(html.split('assets/js/purchase-forecast-v116.js?v=116').length-1,1);
  assert(!css.includes('!important'));assert(!/@import\b/.test(css));
  const selectors=css.match(/(^|})\s*([^{}]+)\{/gm)||[];
  assert(selectors.length>10);
});
test('Forecast annual UI contains exact agreed columns and header filters',()=>{
  for(const s of ['Annual Base Forecast','Trend (3M / Annual)','Confidence','Base + Growth (Final)','pfSearch','pfSupplier','pfProfit','pfMonth','pfGrowth','pfGenerate','pfMonthUpload'])assert(js.includes(s),s);
  assert(js.includes("anchor.insertAdjacentElement('afterend',root)"));
  assert(js.includes('staged, not approved'));
  assert(js.includes('pfGenerate')&&js.includes('disabled'));
});
test('No Supabase writes, browser network calls or guessed forecast maths',()=>{
 assert(!/\brpc\s*\(|\bfetch\s*\(|\.from\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(/.test(js));
 assert(!js.includes('normalized_net_purchase_qty'));
 assert(!js.includes('purchasing_sales_generator'));
 assert(!/Forecast\s*=/.test(js));
});
test('Legacy Reorder Point integrity and approval code remains in original HTML',()=>{
 assert(html.includes("rpc('purchasing_sales_generator_v113'"));
 assert(html.includes("root.querySelector('.ropg-version').textContent='v113'"));
 assert(html.includes('id="ropgApprove" disabled'));
 assert(html.includes('id="rop111Complete"'));
});
