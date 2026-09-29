const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const migration=fs.readFileSync('supabase/migrations/20260927000607_security_fix1_null_safe_admin_guards.sql','utf8');
const body=migration.replace(/^--.*$/gm,'');
test('only the two approved authorization boundaries are patched',()=>{
  assert(migration.includes("public.purchasing_current_role_v5() IS DISTINCT FROM ''admin''"));
  assert(migration.includes('2adca91fbbdf8d97981606097fb38e42'));
  assert(migration.includes('92bc11d0fb1ca35de7a380c1e35a8834'));
  assert.equal((migration.match(/AS targets\(signature, expected_md5\)/g)||[]).length,1);
  assert(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|GRANT|REVOKE)\b/i.test(body));
  assert(!body.includes('purchasing_master_review_save_v93'));
  assert(!body.includes('purchasing_save_master_v5_impl'));
});
test('migration fails closed on source drift and unexpected extra edits',()=>{
  assert(body.includes('md5(original) <> target.expected_md5'));
  assert(body.includes('pg_get_functiondef(fn) IS DISTINCT FROM updated'));
  assert(body.includes('Expected exactly one admin guard'));
});
test('protected engines match Build 93 except the two approved Build 95 release references',()=>{
  const files={
    'index.html':'c49c2efb894f1b4958d4e3c1955c893dfe546830',
    'assets/js/workspace-v47.js':'479823da0a805b1e15a3e28ad29213d284796534',
    'assets/js/overstock-risk-v69.js':'48a2fd77f638ab13f28ce6b781982d181479d7f6',
    'assets/js/task-assistant-v93.js':'9c90f3dfcd79451b7d65a3f35f902fa6837ffb67'
  };
  for(const [name,expected] of Object.entries(files)){
    let data=fs.readFileSync(name);
    if(name==='index.html'){
      // Invert ONLY the approved marker/asset reference changes; all embedded logic
      // must still reproduce the exact original hash. Do not reset the baseline.
      let html=data.toString('utf8');
      for(const [current,previous] of [
        ['Live Build 97</span>','Live Build 93</span>'],
        ['task-assistant-v97.js?v=97','task-assistant-v93.js?v=93']
      ]){
        assert.equal(html.split(current).length-1,1,'Expected one approved release reference');
        html=html.replace(current,previous);
      }
      data=Buffer.from(html,'utf8');
    }
    const actual=crypto.createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex');
    assert.equal(actual,expected,name);
  }
});
