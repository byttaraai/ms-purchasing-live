'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const source=fs.readFileSync('assets/js/purchase-forecast-v116.js','utf8');
const {restore127,restore127Index}=require('./forecast-supplier-v127-inverse.cjs');
const blob=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
const sqlPath=process.env.FORECAST127_SQL||'supabase/migrations/'+fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_forecast_supplier_snapshots_v127.sql'));
const sql=fs.readFileSync(sqlPath,'utf8');
test('Only explicit supplier snapshot UI changes differ from deployed Build126',()=>{
 assert.equal(blob(restore127(source)),'21bc73dd7c8cd11069f33f7cc81cbba33a34bb8d');
 const baseline=process.env.FORECAST127_BASE_INDEX||'3363bf9a467aed69eef59d27cff85cb7f289afcf';
 assert.equal(blob(restore127Index(fs.readFileSync('index.html','utf8'))),baseline);
});
test('Suppliers never enumerate products or filter out raw sales before user filtering',()=>{
 assert(!/st\.master|\?\.master|resolved_product_code|profitability_class/.test(source));
 for(const x of ['p_codes:[]','h.source_name','h.monthly','supplierMatches','Supplier required','pf127-supplier'])assert(source.includes(x));
 assert(source.includes("'source_id'" )===false); // Supplier identities remain supplied by the sales-native RPC.
});
test('Only explicit Generate calls the server-side supplier import; refresh reads stored copy',()=>{
 assert.equal((source.match(/rest\/v1\/rpc\/purchasing_forecast_refresh_suppliers_v127/g)||[]).length,1);
 assert(source.includes("q('pfGenerate').addEventListener('click',refreshSavedSuppliers)"));
 assert(source.includes("q('pfRefresh').addEventListener('click',load)"));
 assert(source.includes('forecast_computed!==false'));assert(source.includes('Pending model'));
 assert(!/p_approve|\.insert\(|\.update\(|\.delete\(/.test(source));
 assert(source.includes('supplierSync.busy'));assert(source.includes('identity!==getForecastSession()?.user?.id'));
 assert(source.includes('Previously loaded values remain visible'));
});
test('Only explicit valid saved suppliers display as available; missing remains required',()=>{
 const fn=source.match(/function savedSupplier\(h\)\{[^}]+\}/)[0],f=vm.runInNewContext('('+fn+')');
 assert.equal(f({supplier:'  QA Supplier  ',supplier_status:'available'}),'QA Supplier');
 for(const row of [null,{}, {supplier:'QA',supplier_status:'ambiguous_product'},{supplier:' ',supplier_status:'available'},{supplier:null,supplier_status:'missing_supplier'}])assert.equal(f(row),null);
});
test('Migration extends current rows; no replacement product database or Master writes',()=>{
 assert(sql.includes('ALTER TABLE purchasing_private.forecast_report_lines_v1'));
 assert(!/CREATE\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|TRUNCATE|UPDATE\s+public\.|INSERT\s+INTO\s+public\./i.test(sql));
 const updates=[...sql.matchAll(/UPDATE purchasing_private\.forecast_report_lines_v1 l SET([\s\S]*?)FROM planned p/g)];
 assert.equal(updates.length,2);
 for(const u of updates){const cols=[...u[1].matchAll(/\b(forecast_\w+)\s*=/g)].map(x=>x[1]);assert.equal(cols.length,6);assert(cols.every(x=>x.startsWith('forecast_supplier')));}
 assert(!/REFERENCES\s+public\.products_master/i.test(sql));
 assert(sql.includes('m.candidates=1'));assert(sql.includes("'ambiguous_product'"));
 assert(sql.includes("lower(btrim(s.source_product_name))"));assert(!/similarity\(|ILIKE|levenshtein/i.test(sql));
});
test('Write authorization, transaction concurrency and privileged helper isolation are explicit',()=>{
 assert(sql.includes("v_actor IS NULL OR v_role IS NULL OR v_role NOT IN ('admin','purchasing')"));
 assert(sql.includes("USING ERRCODE='42501'"));assert(sql.includes('pg_try_advisory_xact_lock'));
 assert(sql.includes('LANGUAGE sql VOLATILE SECURITY INVOKER'));assert(sql.includes("SET search_path TO ''"));
 assert(sql.includes('FROM PUBLIC,anon,authenticated'));
 assert(sql.includes("'forecast_computed',false"));
 const readPatch=sql.split('-- Add snapshot fields')[1];
 assert(!readPatch.includes('products_master_v5'));assert(readPatch.includes('Legacy forecast branch changed'));
});
