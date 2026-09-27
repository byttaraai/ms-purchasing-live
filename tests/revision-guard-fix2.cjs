'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const migration=read('supabase/migrations/20260927001941_security_fix2_require_master_revision.sql');
const sandbox=read('tests/sql/revision-guard-fix2-sandbox.sql');

test('SEC-02 targets only the two shared revision checks',()=>{
 assert.equal((migration.match(/'public\.purchasing_save_/g)||[]).length,2);
 assert(migration.includes('public.purchasing_save_master_v5_impl(jsonb,text,integer,uuid)'));
 assert(migration.includes('public.purchasing_save_inventory_v5_fixed(jsonb,text,date,text,boolean,boolean,integer,uuid,text)'));
 assert(migration.includes('if expected_revision is null or v_revision is distinct from expected_revision then'));
 assert(migration.includes('if p_expected_revision is null or v_revision is distinct from p_expected_revision then'));
});
test('source drift, one occurrence and ACL checks protect the rest of each routine',()=>{
 for(const text of ['0c3d952c48dcf5c6e7c35dfd26b529a0','7e4489772ff19ff7a86dbca7d2978c22','md5(original) IS DISTINCT FROM t.expected_md5','/length(t.old_guard)<>1','patched:=replace(original,t.old_guard,t.new_guard)','IS DISTINCT FROM acl_before'])assert(migration.includes(text),text);
 assert(!/\b(?:grant|revoke|drop|truncate)\s/i.test(migration));
 assert(!/\b(?:insert\s+into|update|delete\s+from)\s+public\./i.test(migration));
});
test('SQL regression fixture is temporary, rolls back, and covers save, conflicts and authorization',()=>{
 assert(sandbox.includes('CREATE TEMP TABLE'));
 assert(sandbox.trim().endsWith('ROLLBACK;'));
 assert(!/\b(?:insert\s+into|update|delete\s+from)\s+public\./i.test(sandbox));
 for(const text of ['null_revision','stale_revision','future_revision','inactive_admin','valid_master_save','valid_inventory_save','buyer_popup_and_score_preserved','editor_B_','popup_scope_preserved','execution_grants_preserved','pg_temp.fix2_fingerprint()'])assert(sandbox.includes(text),text);
});
test('ordinary UI callers still send their expected revision, including restricted popup',()=>{
 const html=read('index.html'),popup=read('assets/js/task-assistant-v93.js');
 assert(html.includes('expected_revision:p.revision'));
 assert(html.includes('expected_revision:state.editorRevision??state.revision'));
 assert(popup.includes('expected_revision:state.revision'));
 assert(popup.includes('purchasing_master_review_save_v93'));
});
test('migration is recorded and prior Admin security regression remains present',()=>{
 assert(read('supabase/MIGRATION_HISTORY.md').includes('20260927001941'));
 assert(fs.existsSync(path.join(root,'tests/sql/admin-guard-fix1-sandbox.sql')));
});
