'use strict';
// SEC04 preparation only. Passing this test does NOT activate a GitHub ruleset.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const baseline=JSON.parse(read('tests/ci-required-checks-baseline-sec04.json'));
const alwaysOn='on:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [main]\n';
const command='          node --test tests/ci-required-checks-sec04.cjs\n';
const expectedChecks=['regression','patch-contracts','revision-guard-contracts','recovery-attention','profit-range','restore-rehearsal'];
function blob(s){const b=Buffer.from(s);return crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');}
function validateTrigger(s){
  assert.equal(s.slice(s.indexOf('on:\n'),s.indexOf('permissions:\n')),alwaysOn);
  assert(!/^\s*(?:if|continue-on-error|paths|paths-ignore):/m.test(s));
  assert(!s.includes('pull_request_target'));
  assert(s.includes('permissions:\n  contents: read\n'));
}
for(const [name,b] of Object.entries(baseline)){
  test(name+': every main PR/push runs, all original test steps and permissions retained',()=>{
    let s=read('.github/workflows/'+name);validateTrigger(s);
    if(name==='workspace-v47.yml'){
      assert.equal(s.split(command).length-1,1);
      s=s.replace(command,'');
      // Build102 only adds UI checks and its visible marker; prior workflow contract remains exact.
      for(const extra of ['          node --test tests/navigation-v102.cjs\n','          python3 tests/run-navigation-v102.py\n']){assert.equal(s.split(extra).length-1,1);s=s.replace(extra,'');}
      assert(s.includes('grep -q "Live Build 102"'));
      s=s.replace('grep -q "Live Build 102"','grep -q "Live Build 101"');
      // Build101 adds UI tests and advances only the visible build assertion.
      for(const extra of ['          node --test tests/header-v101.cjs\n','          python3 tests/run-header-v101.py\n']){assert.equal(s.split(extra).length-1,1);s=s.replace(extra,'');}
      assert(s.includes('grep -q "Live Build 101"'));
      s=s.replace('grep -q "Live Build 101"','grep -q "Live Build 100"');
    }
    assert.equal(blob(s.replace(alwaysOn,b.old_on)),b.sha);
  });
}
test('ruleset template requires exactly the six real unique job contexts from GitHub Actions',()=>{
  const cfg=JSON.parse(read('maintenance/sec04-main-ruleset.json'));
  const jobs=Object.keys(baseline).flatMap(n=>[...read('.github/workflows/'+n).split('jobs:\n')[1].matchAll(/^  ([a-z0-9-]+):$/gm)].map(m=>m[1]));
  assert.equal(new Set(jobs).size,6);
  assert.deepEqual([...jobs].sort(),[...expectedChecks].sort());
  const status=cfg.rules.find(r=>r.type==='required_status_checks').parameters;
  assert.deepEqual(status.required_status_checks.map(c=>c.context),expectedChecks);
  assert(status.required_status_checks.every(c=>c.integration_id===15368));
  assert.equal(status.strict_required_status_checks_policy,true);
  assert.equal(status.do_not_enforce_on_create,false);
  assert(!status.required_status_checks.some(c=>['build','deploy','report-build-status'].includes(c.context)));
});
test('activation template targets only main, has no bypass, and cannot require a second reviewer',()=>{
  const cfg=JSON.parse(read('maintenance/sec04-main-ruleset.json'));
  assert.equal(cfg.target,'branch');assert.equal(cfg.enforcement,'active');
  assert.deepEqual(cfg.conditions,{ref_name:{include:['refs/heads/main'],exclude:[]}});
  assert.deepEqual(cfg.bypass_actors,[]);
  assert.deepEqual(cfg.rules.map(r=>r.type).sort(),['deletion','non_fast_forward','pull_request','required_status_checks'].sort());
  const pr=cfg.rules.find(r=>r.type==='pull_request').parameters;
  assert.equal(pr.required_approving_review_count,0);
  assert.equal(pr.require_last_push_approval,false);
  assert.equal(pr.require_code_owner_review,false);
});
test('trigger contract rejects path filtering, skipped jobs, permissive errors and privileged PR execution',()=>{
  const s=read('.github/workflows/workspace-v47.yml');
  for(const bad of [s.replace('  pull_request:\n','    paths: [index.html]\n  pull_request:\n'),s.replace('  regression:\n','  regression:\n    if: false\n'),s.replace('  regression:\n','  regression:\n    continue-on-error: true\n'),s.replace('pull_request:','pull_request_target:')])assert.throws(()=>validateTrigger(bad));
});
