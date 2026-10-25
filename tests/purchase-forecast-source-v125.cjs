
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const source=fs.readFileSync('assets/js/purchase-forecast-v116.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261025214043_forecast_sales_source_in_place_v125.sql','utf8');
const {restore125,restore125Index}=require('./forecast-source-v125-inverse.cjs');
const blob=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
test('Only reviewed source read/render edits differ from Build124',()=>assert.equal(blob(restore125(source)),'962c1998cb7373050e9b139cf28a81fffe632a61'));
test('Main app changes only forecast asset cache URL',()=>assert.equal(blob(restore125Index(fs.readFileSync('index.html','utf8'))),'c4dd0e5b1bc6b49777e91f7625e63862896aeba8'));
test('No Master identities or purchase-unit gates drive source UI',()=>{
 assert(!/st\.master|\?\.master|resolved_product_code|matched_rows|No matched sales/.test(source));
 for(const token of ['p_codes:[]','h.source_name','h.monthly','Not reported','data.source_mode'])assert(source.includes(token));
});
test('Source SQL reads reports in place without copies or approval changes',()=>{
 assert(!/CREATE\s+TABLE|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+purchasing|DROP\s+TABLE/i.test(sql));
 const branch=sql.split('IF cardinality(p_codes)=0 THEN')[1].split(' WITH asked AS')[0];
 assert(!/products_master|resolved_product_code|validation_status/.test(branch));
 for(const token of ['forecast_report_lines_v1','source_product_name','net_qty','net_unit','report_month','source_row_number','count(*)>1'])assert(branch.includes(token),token);
 assert(sql.includes('auth.uid() IS NULL'));assert(sql.includes('purchasing_current_role_v5() IS NULL'));assert(sql.includes('FROM PUBLIC,anon'));
});
test('Quantity validity preserves zero and negatives but rejects missing/invalid',()=>{
 const fn=source.match(/function hasQuantity\(value\)\{[^}]+\}/)[0],f=vm.runInNewContext('('+fn+')');
 for(const x of [0,-2,1.25,'0','-2.25'])assert(f(x));
 for(const x of [null,undefined,'',NaN,Infinity,'bad'])assert(!f(x));
});
test('Trend formula, thresholds, Generate gating and readonly behavior retained',()=>{
 assert(source.includes('((latest-baseline)/baseline*100)'));
 assert(source.includes("trend>5?'pf-trend-up':trend< -5?'pf-trend-down':'pf-trend-stable'"));
 assert(source.includes('id="pfGenerate"')&&source.includes('disabled title="Requires approved'));
 assert(!/\.insert\(|\.update\(|\.delete\(|p_approve/.test(source));
});
