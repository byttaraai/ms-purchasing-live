const {test}=require('node:test'),assert=require('node:assert/strict');
const Q=require('../assets/js/supplier-quest-model-v79.js');

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
test('decision suggestions follow approved profitability routes',()=>{
  assert.equal(Q.suggestedDecision('Super'),'sales_promotion');
  assert.equal(Q.suggestedDecision('High'),'sales_promotion');
  assert.equal(Q.suggestedDecision('Medium'),'supplier_return_replacement');
  assert.equal(Q.suggestedDecision('Low'),'supplier_return_replacement');
  assert.equal(Q.suggestedDecision('Loss'),'supplier_discount_support');
});
test('supplier responsibility is available to every profitability group',()=>{
  for(const p of ['Super','High','Medium','Low','Loss','Unclassified'])assert(Q.decisionOptions(p).includes('supplier_responsibility'));
});
test('no action required is available as a final review decision',()=>{
  for(const p of ['Super','High','Medium','Low','Loss','Unclassified'])assert(Q.decisionOptions(p).includes('no_action_required'));
});
