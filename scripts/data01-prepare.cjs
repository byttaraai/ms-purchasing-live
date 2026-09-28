'use strict';
// One-time branch preparation. Aborts on source drift; never contacts the database.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const blob=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
function once(s,a,b){assert.equal(s.split(a).length-1,1,'Expected one patch site: '+a);return s.replace(a,b);}
const base=read('assets/js/task-assistant-v93.js');
assert.equal(blob(base),'9c90f3dfcd79451b7d65a3f35f902fa6837ffb67');
const oldFn=`  function numericValue(input,allowZero){
    const raw=String(input?.value??'').trim();
    if(raw==='')return null;
    const n=Number(raw);
    if(!Number.isFinite(n)||n<0||(!allowZero&&n===0))return undefined;
    return n;
  }`;
const newFn=`  function numericValue(input,allowZero){
    // DATA-01: bad native number input is not an intentionally blank field.
    if(input?.validity?.badInput)return undefined;
    const raw=String(input?.value??'').trim();
    if(raw==='')return null;
    let n;
    try{n=C.number(raw,{nullable:false});}catch{return undefined;}
    if(n<0||(!allowZero&&n===0))return undefined;
    return n;
  }`;
let js=once(base,oldFn,newFn);
js=once(js,'/* Build 93: Master Data Review first, Top 20 task popup and restricted inline master fixes. */','/* Build 94: DATA-01 numeric validation. All Build 93 task and save semantics retained. */');
assert.equal(js.split('type="number" min="0" step="any"').length-1,2);
js=js.replaceAll('type="number" min="0" step="any"','type="number" min="0" max="1000000000000" step="any"');
js=once(js,"reason:'Check numeric values.'","reason:'Check numeric values; maximum is 1,000,000,000,000.'");
fs.writeFileSync('assets/js/task-assistant-v94.js',js);
let html=read('index.html');assert.equal(blob(html),'c49c2efb894f1b4958d4e3c1955c893dfe546830');
html=once(html,'Live Build 93</span>','Live Build 94</span>');
html=once(html,'task-assistant-v93.js?v=93','task-assistant-v94.js?v=94');
fs.writeFileSync('index.html',html);
let prior=read('tests/task-assistant-v93.cjs');
prior=prior.replaceAll('assets/js/task-assistant-v93.js','assets/js/task-assistant-v94.js').replaceAll('task-assistant-v93.js?v=93','task-assistant-v94.js?v=94').replaceAll('Live Build 93','Live Build 94');
fs.writeFileSync('tests/task-assistant-v93.cjs',prior);
// CLI generates the file first; retain the actual already-applied Supabase version.
const generated=fs.readdirSync('supabase/migrations').filter(x=>/^\d{14}_data01_numeric_validation\.sql$/.test(x));
assert.equal(generated.length,1,'Expected one CLI-generated migration');
const canonical='20260928113235_data01_numeric_validation.sql';
const target='supabase/migrations/'+canonical;
if(generated[0]!==canonical)fs.renameSync('supabase/migrations/'+generated[0],target);
fs.writeFileSync(target,read('scripts/data01-numeric-guard.sql'));
fs.appendFileSync('supabase/MIGRATION_HISTORY.md','\n- 20260928113235 `data01_numeric_validation` - numeric bounds and atomic derived-output validation; no purchasing formula or task changes. Frontend numeric guard: Build 94. SEC-03 deletion remains pending.\n');
console.log('Prepared Build 94, immutable runtime asset and exact applied DATA-01 migration.');
