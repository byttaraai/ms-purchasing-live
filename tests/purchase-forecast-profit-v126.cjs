'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const model=require('../assets/js/forecast-profitability-v126.js');
const {restore126,restore126Index}=require('./forecast-profit-v126-inverse.cjs');
const source=fs.readFileSync('assets/js/purchase-forecast-v116.js','utf8');
const row=p=>({source_rows:1,annual_profit_sar:p,profit_invalid_rows:0});
const blob=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
test('Build126 retains exact Build125 sales source and unrelated layout outside explicit edits',()=>{
 assert.equal(blob(restore126(source)),'766a8e4d5170b46383dfd15a287f118073381def');
 assert.equal(blob(restore126Index(fs.readFileSync('index.html','utf8'))),'f97b4b4f8001b9b76aa2193a332f8d788fcba83c');
 assert.equal(blob(fs.readFileSync('assets/css/purchase-forecast-v116.css','utf8').split('\n/* Build 126:')[0]),'f9f6ecb452fe593be90dfc6d201e1643c1abec50');
});
test('ROP annual profit rule: arithmetic mean of positive PRODUCT totals; zero and negative excluded',()=>{
 const data=[row(100),row(300),row(0),row(-50),row(null)];
 const summary=model.summarize(data);
 assert.equal(summary.mean,200);assert.equal(summary.positiveCount,2);assert.equal(summary.missing,1);assert.equal(summary.total,5);
 assert.deepEqual(model.defaults,{super:3,high:1.5,medium:0.5});
});
test('Class boundaries match ROP inclusivity with zero and negative classified Loss',()=>{
 const s={mean:100};
 for(const [p,c] of [[300,'Super'],[299.99,'High'],[150,'High'],[149.99,'Medium'],[50,'Medium'],[49.99,'Low'],[0,'Loss'],[-5,'Loss']])assert.equal(model.classify(row(p),s),c);
});
test('Invalid and missing profit is not zero, low or loss; no positive mean never produces Super',()=>{
 for(const p of [null,undefined,'',NaN,Infinity,'NaN',true,' '])assert.equal(model.classify(row(p),{mean:100}),'Review');
 assert.equal(model.classify({...row(10),profit_invalid_rows:1},{mean:100}),'Review');
 assert.equal(model.classify({...row(10),source_rows:0},{mean:100}),'Review');
 const s=model.summarize([row(0),row(-1)]);assert.equal(s.mean,null);
 assert.equal(model.classify(row(0),s),'Loss');assert.equal(model.classify(row(1),s),'Review');
});
test('Multiplier validation blocks missing, nonfinite, unordered and out-of-range settings',()=>{
 for(const m of [null,{}, {super:1,high:2,medium:0.5},{super:2,high:2,medium:0.5},{super:3,high:1,medium:0},{super:1001,high:1.5,medium:0.5},{super:Infinity,high:1.5,medium:0.5},{super:'',high:1.5,medium:0.5}])assert.throws(()=>model.validate(m));
 assert.deepEqual(model.validate({super:'4',high:'2',medium:'0.75'}),{super:4,high:2,medium:0.75});
});
test('Annual monetary profitability is independent of quantity, unit conversions and Master existence',()=>{
 assert.equal(model.classify({...row(200),unit_count:3,invalid_rows:1},{mean:100}),'High');
 assert(!/st\.master|\?\.master|resolved_product_code|profitability_class/.test(source));
 assert(source.includes('msp_forecast_profit_v126:'));
 assert(source.includes('Settings are saved in this browser for your account only.'));
 assert(source.includes('No purchase-unit conversion'));
});
test('Rating takes its 74px from the original product region, not the quantities or later columns',()=>{
 const css=fs.readFileSync('assets/css/purchase-forecast-v116.css','utf8');
 assert(css.includes('width:calc(35% - 74px)'));
 for(const [i,w] of [[3,20],[4,15],[5,14],[6,16]])assert(css.includes('th:nth-child('+i+'){width:'+w+'%}'));
});
test('Profitability aggregation extends the existing source read without writing sales or Master',()=>{
 const path=process.env.FORECAST126_SQL||'supabase/migrations/'+fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_forecast_profitability_v126.sql'));
 const sql=fs.readFileSync(path,'utf8'),branch=sql;
 assert(sql.includes('pg_get_functiondef'));assert(sql.includes('Legacy branch was changed'));
 for(const token of ['historical_profit_sar','sum(historical_profit_sar)','annual_profit_sar','profit_invalid_rows'])assert(branch.includes(token));
 assert(!/products_master|resolved_product_code|validation_status/.test(branch));
 assert(!/CREATE\s+TABLE|UPDATE\s+public|INSERT\s+INTO|DELETE\s+FROM/.test(sql));
 assert(sql.includes('auth.uid() IS NULL'));assert(sql.includes('FROM PUBLIC,anon'));
});
