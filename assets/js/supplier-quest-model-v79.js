/* Build 79: pure Supplier Quest stage policy. No IO, persistence, score, task or badge side effects. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SupplierQuestModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STAGES=Object.freeze([
    Object.freeze({key:'data',label:'Data',title:'Data Review',kind:'data'}),
    Object.freeze({key:'lt10',label:'<10',title:'Below 10%',kind:'purchase',batch:1}),
    Object.freeze({key:'10_50',label:'10–50',title:'10% to 50%',kind:'purchase',batch:2}),
    Object.freeze({key:'50_100',label:'50–100',title:'50% to 100%',kind:'purchase',batch:3}),
    Object.freeze({key:'100_150',label:'100–150',title:'100% to 150%',kind:'purchase',batch:4}),
    Object.freeze({key:'150_200',label:'150–200',title:'150% to 200%',kind:'purchase',batch:5}),
    Object.freeze({key:'200_300',label:'200–300',title:'Branch Reallocation Review',kind:'reallocation'}),
    Object.freeze({key:'gt300',label:'>300',title:'Overstock Risk Decision',kind:'decision'}),
    Object.freeze({key:'summary',label:'Finish',title:'Supplier Review Summary',kind:'summary'})
  ]);
  const PURCHASE_STAGE_KEYS=Object.freeze(STAGES.filter(s=>s.kind==='purchase').map(s=>s.key));
  const DECISIONS=Object.freeze({
    sales_promotion:'Sales Promotion',
    wholesale_sale:'Wholesale Sale',
    supplier_return_replacement:'Supplier Return / Replacement',
    supplier_discount_support:'Supplier Discount Support',
    supplier_responsibility:'Supplier Responsibility',
    no_action_required:'No Action Required'
  });
  function finite(v){return typeof v==='number'&&Number.isFinite(v);}
  function stageForRatio(v){
    if(!finite(v))return null;
    if(v<10)return'lt10';
    if(v<50)return'10_50';
    if(v<100)return'50_100';
    if(v<150)return'100_150';
    if(v<=200)return'150_200';
    if(v<=300)return'200_300';
    return'gt300';
  }
  function stageIndex(key){return STAGES.findIndex(s=>s.key===key);}
  function nextStage(key){const i=stageIndex(key);return i>=0&&i<STAGES.length-1?STAGES[i+1].key:'summary';}
  function previousPurchaseCodes(stageData,stageKey){
    const index=PURCHASE_STAGE_KEYS.indexOf(stageKey);
    const used=new Set();
    for(const key of PURCHASE_STAGE_KEYS.slice(0,Math.max(0,index))){
      for(const code of stageData?.[key]?.codes||[])used.add(String(code));
    }
    return used;
  }
  function decisionOptions(profit){
    const common=['supplier_responsibility','no_action_required'];
    if(profit==='Super'||profit==='High')return['sales_promotion','wholesale_sale',...common];
    if(profit==='Medium'||profit==='Low')return['supplier_return_replacement',...common];
    if(profit==='Loss')return['supplier_discount_support','wholesale_sale',...common];
    return common;
  }
  function suggestedDecision(profit){
    if(profit==='Super'||profit==='High')return'sales_promotion';
    if(profit==='Medium'||profit==='Low')return'supplier_return_replacement';
    if(profit==='Loss')return'supplier_discount_support';
    return null;
  }
  function decisionLabel(key){return DECISIONS[key]||key||'—';}
  return Object.freeze({STAGES,PURCHASE_STAGE_KEYS,DECISIONS,stageForRatio,stageIndex,nextStage,previousPurchaseCodes,decisionOptions,suggestedDecision,decisionLabel});
});