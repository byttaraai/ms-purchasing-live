'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const html=require('./navigation-v102.cjs').as101(fs.readFileSync('index.html','utf8')); // exact prior UI baseline
const hash=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');};
const files=fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('_security_fix3_retire_legacy_tables.sql'));
assert.equal(files.length,1);
const sql=fs.readFileSync('supabase/migrations/'+files[0],'utf8');
const drill=fs.readFileSync('maintenance/sec03_restore_rehearsal.sql','utf8');
test('frontend preserves verified Build100 except the explicitly approved Build101 header patch',()=>{
 assert.equal(hash(require('./header-v101.cjs').restoreIndex(html)),'9b5d3240bd2b0bae637efe89be89afa5e90d627a');
 assert(html.includes('Live Build 101</span>')); 
});
test('active entrypoint and local scripts have no legacy table identifiers',()=>{
 const sources=[['index.html',html]];
 for(const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)){
  const path=match[1].split('?')[0];
  assert(!/^https?:/.test(path),'Unexpected remote script');
  sources.push([path,fs.readFileSync(path,'utf8')]);
 }
 for(const [name,text] of sources) assert(!/\b(?:products_master|inventory_uploads|inventory_lines)\b/.test(text),name);
});
test('only explicit three-table RESTRICT deletion follows the complete restore gate',()=>{
 const drops=[...sql.matchAll(/\bDROP\s+TABLE\s+([^;]+);/gi)].map(m=>m[1]);
 assert.deepEqual(drops,['public.inventory_lines,public.inventory_uploads,public.products_master RESTRICT']);
 assert(!/DROP\s+(SCHEMA|DATABASE)/i.test(sql));
 assert(sql.includes(drill));
 assert(sql.indexOf(drill)<sql.indexOf('DROP TABLE public.inventory_lines'));
 assert(sql.includes('b IS DISTINCT FROM pg_temp.sec03_capture()'));
 assert(sql.includes('nonlegacy data/structure/routine drift; deletion rolled back'));
});
test('rehearsal is temporary only and recovery refuses to overwrite existing sources',()=>{
 assert(!/\bDROP\s+(TABLE|SCHEMA|DATABASE)\b/i.test(drill));
 assert(drill.includes('pg_my_temp_schema()'));
 assert(drill.includes('REFERENCES pg_temp.sec03_restore_auth_ids('));
 const recovery=fs.readFileSync('maintenance/sec03_restore_retired.sql','utf8');
 assert(recovery.includes('restore refuses existing source tables'));
 assert(recovery.includes('REVOKE ALL ON TABLE %s FROM PUBLIC,anon,authenticated,service_role'));
 assert(!/\bCREATE\s+POLICY\b|\bGRANT\s+(ALL|SELECT|INSERT|UPDATE|DELETE)/i.test(recovery));
});
