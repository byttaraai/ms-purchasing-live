const {test}=require('node:test'),assert=require('node:assert/strict');
const Q=require('../assets/js/supplier-quest-model-v80.js');

test('approved stock stages are exact and non-overlapping',()=>{
  const cases=[
    [-1,'lt10'],[0,'lt10'],[9.999,'lt10'],[10,'10_50'],[49.999,'10_50'],[50,'50_100'],
    [99.999,'50_100'],[100,'100_150'],[149.999,'100_150'],[150,'150_200'],[200,'150_200'],
    [200.001,'200_300'],[300,'200_300'],[300.001,'gt300']
  ];
  for(const [v,key] of cases)assert.equal(Q.stageForRatio(v),key,String(v));
});
test('supplier BO has five purchase stages including 150-200',()=>{
  assert.deepEqual(Q.PURCHASE_STAGE_KEYS,['lt10','10_50','50_100','100_150','150_200']);
});
test('completed stages stay editable but locked future stages do not',()=>{
  const data={data:{master_revision:2},lt10:{master_revision:2}};
  assert.equal(Q.highestReachableIndex(data),2);
  assert.equal(Q.canNavigate(data,'data'),true);
  assert.equal(Q.canNavigate(data,'lt10'),true);
  assert.equal(Q.canNavigate(data,'10_50'),true);
  assert.equal(Q.canNavigate(data,'50_100'),false);
});
test('master revision changes make confirmed stages stale',()=>{
  const data={data:{master_revision:2},lt10:{master_revision:2},'10_50':{master_revision:3}};
  assert.deepEqual(Q.staleStages(data,3),['data','lt10']);
});
test('legacy stage without snapshot revision requires reconfirmation',()=>{
  assert.deepEqual(Q.staleStages({data:{saved_at:'legacy'}},3),['data']);
});
test('decision suggestions follow approved profitability routes',()=>{
  assert.equal(Q.suggestedDecision('Super'),'sales_promotion');
  assert.equal(Q.suggestedDecision('High'),'sales_promotion');
  assert.equal(Q.suggestedDecision('Medium'),'supplier_return_replacement');
  assert.equal(Q.suggestedDecision('Low'),'supplier_return_replacement');
  assert.equal(Q.suggestedDecision('Loss'),'supplier_discount_support');
});
test('supplier responsibility and no action remain available',()=>{
  for(const p of ['Super','High','Medium','Low','Loss','Unclassified']){
    assert(Q.decisionOptions(p).includes('supplier_responsibility'));
    assert(Q.decisionOptions(p).includes('no_action_required'));
  }
});
