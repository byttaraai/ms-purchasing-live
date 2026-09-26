/* Build 81: Supplier Quest with stage-specific source-change reconfirmation. */
'use strict';

const SupplierQuestUI={
  taskKey:null,task:null,quest:null,masterRevision:null,staleStages:new Set(),
  selected:new Set(),decisions:{},noAction:false,busy:false,outputs:[]
};

function supplierQuestSupplier(task){return String(task?.target||task?.title||'Supplier').trim();}
function supplierQuestRows(task){
  const supplier=supplierQuestSupplier(task);
  return (state.rows||[]).filter(r=>String(r.supplier||'').trim()===supplier);
}
function supplierQuestRiskRows(task){
  const supplier=supplierQuestSupplier(task);
  const scope=OverstockRisk.evaluate(state.rows||[],C.profitLabel);
  return scope.rows.filter(r=>String(r.supplier||'').trim()===supplier);
}
function supplierQuestStageRows(task,stageKey){
  if(stageKey==='data')return supplierQuestRows(task).filter(r=>Boolean(r.needs_review));
  if(stageKey==='gt300')return supplierQuestRiskRows(task);
  return supplierQuestRows(task).filter(r=>SupplierQuestModel.stageForRatio(C.finite(r.stock_ratio)?Number(r.stock_ratio):null)===stageKey);
}
async function supplierQuestRpc(task,payload){
  if(state.mode!=='live'||!task?.id)throw Error('Supplier Quest is available in Live mode.');
  return rpc('purchasing_supplier_quest_v81',{payload:{task_id:task.id,...payload}});
}
function supplierQuestApplyServer(task,response){
  const changed=SupplierQuestUI.taskKey!==task?.task_key;
  SupplierQuestUI.taskKey=task?.task_key||null;
  SupplierQuestUI.task=task||null;
  SupplierQuestUI.quest=response?.quest||response||null;
  SupplierQuestUI.masterRevision=response?.master_revision??state.revision??null;
  const serverStale=Array.isArray(response?.stale_stages)?response.stale_stages:[];
  SupplierQuestUI.staleStages=new Set(serverStale);
  if(changed){SupplierQuestUI.selected.clear();SupplierQuestUI.decisions={};SupplierQuestUI.noAction=false;}
  return SupplierQuestUI.quest;
}
async function supplierQuestState(task){return supplierQuestRpc(task,{action:'state'});}
function supplierQuestStage(){return SupplierQuestUI.quest?.current_stage||'data';}
function supplierQuestStageData(key){return SupplierQuestUI.quest?.stage_data?.[key]||{};}
function supplierQuestMetric(v,d=0){return C.finite(v)?fmt(v,d):'—';}
function supplierQuestCurrentStageDef(){return SupplierQuestModel.STAGES.find(s=>s.key===supplierQuestStage())||SupplierQuestModel.STAGES[0];}
function supplierQuestBlockingRows(task){return supplierQuestRows(task).filter(r=>Boolean(r.blocking_review));}
function supplierQuestAttentionRows(task){return supplierQuestRows(task).filter(r=>Boolean(r.needs_review)&&!r.blocking_review);}
function supplierQuestReviewHint(r){return String(r.review_reason||r.warning_reason||'Review the highlighted product data.');}

function supplierQuestStageStepHtml(stageKey){
  const current=SupplierQuestModel.stageIndex(stageKey),data=SupplierQuestUI.quest?.stage_data||{};
  return '<div class="supplier-quest-stepper" aria-label="Supplier Quest progress">'+SupplierQuestModel.STAGES.map((s,i)=>{
    const completed=SupplierQuestModel.stageCompleted(data,s.key),reachable=SupplierQuestModel.canNavigate(data,s.key);
    const stale=SupplierQuestUI.staleStages.has(s.key);
    const cls=i===current?'active':stale?'stale':completed?'done':reachable?'reachable':'locked';
    const icon=stale?'!':completed&&i!==current?'✓':String(i+1);
    const tag=reachable?'<button type="button" class="supplier-quest-step '+cls+'" data-quest-stage="'+esc(s.key)+'"><b>'+icon+'</b><em>'+esc(s.label)+'</em></button>':'<span class="supplier-quest-step '+cls+'"><b>'+icon+'</b><em>'+esc(s.label)+'</em></span>';
    return tag;
  }).join('')+'</div>';
}

function supplierQuestPrintWindow(title,subtitle,headers,rows){
  if(!rows.length){toast('Select at least one product before printing.');return;}
  const w=window.open('','_blank','width=1050,height=800');
  if(!w){toast('Please allow pop-ups to open the print preview.');return;}
  const head=headers.map(h=>'<th>'+esc(h)+'</th>').join('');
  const body=rows.map(cells=>'<tr>'+cells.map((v,i)=>'<td class="'+(i>1?'num':'')+'">'+v+'</td>').join('')+'</tr>').join('');
  w.document.open();
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>@page{size:A4 portrait;margin:11mm}*{box-sizing:border-box}body{font:9.5pt Arial,sans-serif;color:#17284a;margin:0}h1{font-size:17pt;margin:0 0 3px}.sub{color:#68758e;margin-bottom:9mm}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th{background:#eef2f8;text-align:left;font-size:8pt;padding:6px;border-bottom:1px solid #cbd4e3}td{padding:6px;border-bottom:1px solid #e2e7ef;vertical-align:middle;overflow-wrap:anywhere}.num{text-align:right;font-variant-numeric:tabular-nums}</style></head><body><h1>'+esc(title)+'</h1><div class="sub">'+esc(subtitle)+'</div><table><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></body></html>');
  w.document.close();setTimeout(()=>{if(!w.closed){w.focus();w.print();}},150);
}
function supplierQuestPrintStage(task,stageKey){
  const rows=supplierQuestStageRows(task,stageKey),supplier=supplierQuestSupplier(task),stage=SupplierQuestModel.STAGES.find(s=>s.key===stageKey);
  if(stageKey==='data'){
    const selected=rows;
    return supplierQuestPrintWindow(supplier+' · '+stage.title,'Data issues',['Product','Unit','Type','Review Hint'],selected.map(r=>[esc(r.product_name),esc(r.purchase_unit||'—'),r.blocking_review?'Blocking':'Attention',esc(supplierQuestReviewHint(r))]));
  }
  if(stageKey==='gt300'){
    return supplierQuestPrintWindow(supplier+' · '+stage.title,'Overstock decisions',['Product','Unit','Stock %','Rating','Decision'],rows.map(r=>[esc(r.product_name),esc(r.purchase_unit||'—'),esc(supplierQuestMetric(r.stock_ratio,1)+'%'),esc(C.profitLabel(r.profitability_class)),esc(SupplierQuestModel.decisionLabel(SupplierQuestUI.decisions[r.product_code]||supplierQuestStageData('gt300').decisions?.[r.product_code]))]));
  }
  const selected=rows.filter(r=>SupplierQuestUI.selected.has(r.product_code));
  if(stageKey==='200_300')return supplierQuestPrintWindow(supplier+' · '+stage.title,'Selected branch reallocation products',['Product','Unit','Stock %','Rating','Stock Value'],selected.map(r=>[esc(r.product_name),esc(r.purchase_unit||'—'),esc(supplierQuestMetric(r.stock_ratio,1)+'%'),esc(C.profitLabel(r.profitability_class)),esc('SAR '+supplierQuestMetric(r.total_value,0))]));
  return supplierQuestPrintWindow(supplier+' · '+stage.title,'Selected purchase products',['Product','Unit','Price','Min Order','Max Order'],selected.map(r=>[esc(r.product_name),esc(r.purchase_unit||'—'),esc('SAR '+supplierQuestMetric(r.purchase_price,1)),esc(supplierQuestMetric(r.min_order_qty,4)),esc(supplierQuestMetric(r.max_order_qty,4))]));
}
function supplierQuestBoRows(task){
  const all=new Map(supplierQuestRows(task).map(r=>[r.product_code,r]));
  return SupplierQuestModel.PURCHASE_STAGE_KEYS.map((key,i)=>{
    const saved=supplierQuestStageData(key),snapshot=Array.isArray(saved.snapshot)?saved.snapshot:[];
    const snapRows=snapshot.filter(x=>x.selected).map(x=>({
      product_code:x.product_code,product_name:x.product_name,purchase_unit:x.unit,
      min_order_qty:Number(x.min_order),max_order_qty:Number(x.max_order)
    }));
    const fallback=(saved.codes||[]).map(code=>all.get(code)).filter(Boolean);
    return{batch:i+1,key,rows:snapRows.length?snapRows:fallback,noAction:Boolean(saved.no_action)};
  });
}
function supplierQuestPrintBo(task){
  const batches=supplierQuestBoRows(task),supplier=supplierQuestSupplier(task),body=[];
  for(const b of batches){
    body.push(['<b>Batch '+b.batch+'</b>','','','']);
    if(b.noAction&&!b.rows.length)body.push(['No purchase required','','','']);
    for(const r of b.rows)body.push([esc(r.product_name),esc(r.purchase_unit||'—'),esc(supplierQuestMetric(r.min_order_qty,4)),esc(supplierQuestMetric(r.max_order_qty,4))]);
  }
  supplierQuestPrintWindow(supplier+' · Supplier BO','Recommended staged ordering',['Product','Unit','Min Order','Max Order'],body);
}

function supplierQuestPurchaseTable(rows){
  return '<table class="supplier-quest-table"><thead><tr><th class="select"><input type="checkbox" id="supplierQuestSelectAll" aria-label="Select all products"></th><th>#</th><th>Product</th><th>Unit</th><th>Stock %</th><th>Rating</th><th>Price</th><th>Min Order</th><th>Max Order</th></tr></thead><tbody>'+rows.map((r,i)=>'<tr><td class="select"><input type="checkbox" data-quest-select="'+esc(r.product_code)+'" '+(SupplierQuestUI.selected.has(r.product_code)?'checked':'')+'></td><td>'+(i+1)+'</td><td class="product">'+esc(r.product_name)+'</td><td>'+esc(r.purchase_unit||'—')+'</td><td class="num">'+supplierQuestMetric(r.stock_ratio,1)+'%</td><td>'+ratingHtml(r.profitability_class)+'</td><td class="num">'+supplierQuestMetric(r.purchase_price,1)+'</td><td class="num">'+supplierQuestMetric(r.min_order_qty,4)+'</td><td class="num">'+supplierQuestMetric(r.max_order_qty,4)+'</td></tr>').join('')+'</tbody></table>';
}
function supplierQuestDataTable(task){
  const current=supplierQuestRows(task),saved=supplierQuestStageData('data'),snapshot=Array.isArray(saved.snapshot)?saved.snapshot:[];
  const initial=[...(SupplierQuestUI.quest?.stage_data?._initial_blocking_codes||[]),...(SupplierQuestUI.quest?.stage_data?._initial_attention_codes||[])];
  const map=new Map(current.map(r=>[r.product_code,r]));
  const snapshotMap=new Map(snapshot.map(r=>[r.product_code,r]));
  const codes=[...new Set([...initial,...current.filter(r=>r.needs_review).map(r=>r.product_code)])];
  const items=codes.map(code=>map.get(code)||snapshotMap.get(code)).filter(Boolean);
  return '<div class="quest-data-summary"><span class="blocking"><b>'+supplierQuestBlockingRows(task).length+'</b> Blocking</span><span class="attention"><b>'+supplierQuestAttentionRows(task).length+'</b> Attention</span></div><table class="supplier-quest-table data"><thead><tr><th>#</th><th>Product</th><th>Unit</th><th>Type</th><th>What to fix</th><th>Status</th><th>Action</th></tr></thead><tbody>'+(items.length?items.map((r,i)=>{const live=map.get(r.product_code),needs=Boolean(live?.needs_review),blocking=Boolean(live?.blocking_review);return '<tr><td>'+(i+1)+'</td><td class="product">'+esc(r.product_name)+'</td><td>'+esc(r.purchase_unit||r.unit||'—')+'</td><td>'+(needs?(blocking?'<span class="quest-blocking">Blocking</span>':'<span class="quest-attention">Attention</span>'):'<span class="quest-ok">Resolved</span>')+'</td><td>'+esc(needs?supplierQuestReviewHint(live):'Required data was updated.')+'</td><td>'+(needs?'<span class="quest-review">Needs review</span>':'<span class="quest-ok">Ready ✓</span>')+'</td><td>'+(needs?'<button class="btn outline quest-open-product" data-code="'+esc(r.product_code)+'" type="button">Open Product</button>':'—')+'</td></tr>';}).join(''):'<tr><td colspan="7" class="supplier-task-empty">No data issues for this supplier.</td></tr>')+'</tbody></table>';
}
function supplierQuestReallocationTable(rows){
  return '<table class="supplier-quest-table realloc"><thead><tr><th class="select"><input type="checkbox" id="supplierQuestSelectAll" aria-label="Select all products for branch reallocation"></th><th>#</th><th>Product</th><th>Unit</th><th>Stock %</th><th>Rating</th><th>Stock Value</th></tr></thead><tbody>'+(rows.length?rows.map((r,i)=>'<tr><td class="select"><input type="checkbox" data-quest-select="'+esc(r.product_code)+'" '+(SupplierQuestUI.selected.has(r.product_code)?'checked':'')+'></td><td>'+(i+1)+'</td><td class="product">'+esc(r.product_name)+'</td><td>'+esc(r.purchase_unit||'—')+'</td><td class="num">'+supplierQuestMetric(r.stock_ratio,1)+'%</td><td>'+ratingHtml(r.profitability_class)+'</td><td class="num">SAR '+supplierQuestMetric(r.total_value,0)+'</td></tr>').join(''):'<tr><td colspan="7" class="supplier-task-empty">No products are currently between 200% and 300%.</td></tr>')+'</tbody></table>';
}
function supplierQuestDecisionTable(rows){
  const saved=supplierQuestStageData('gt300').decisions||{};
  for(const r of rows)if(!SupplierQuestUI.decisions[r.product_code]&&saved[r.product_code])SupplierQuestUI.decisions[r.product_code]=saved[r.product_code];
  return '<table class="supplier-quest-table decisions"><thead><tr><th>#</th><th>Product</th><th>Unit</th><th>Stock %</th><th>Rating</th><th>Risk</th><th>Profitability Suggestion</th><th>Decision</th></tr></thead><tbody>'+(rows.length?rows.map((r,i)=>{const profit=C.profitLabel(r.profitability_class),suggested=SupplierQuestModel.suggestedDecision(profit),value=SupplierQuestUI.decisions[r.product_code]||'';const options=['<option value="">Select decision</option>',...SupplierQuestModel.decisionOptions(profit).map(k=>'<option value="'+k+'" '+(value===k?'selected':'')+'>'+esc(SupplierQuestModel.decisionLabel(k))+'</option>')].join('');return '<tr><td>'+(i+1)+'</td><td class="product">'+esc(r.product_name)+'</td><td>'+esc(r.purchase_unit||'—')+'</td><td class="num">'+supplierQuestMetric(r.stock_ratio,1)+'%</td><td>'+ratingHtml(r.profitability_class)+'</td><td class="risk">'+overstockRiskCell(r)+'</td><td><span class="quest-suggested">'+esc(SupplierQuestModel.decisionLabel(suggested))+'</span></td><td><select class="quest-decision" data-code="'+esc(r.product_code)+'">'+options+'</select></td></tr>';}).join(''):'<tr><td colspan="8" class="supplier-task-empty">No products are currently above 300%.</td></tr>')+'</tbody></table>';
}
function supplierQuestSummaryHtml(task){
  const batches=supplierQuestBoRows(task),realloc=(supplierQuestStageData('200_300').codes||[]).length,decisions=supplierQuestStageData('gt300').decisions||{};
  const counts={sales:0,wholesale:0,supplier:0};
  for(const v of Object.values(decisions)){if(v==='sales_promotion')counts.sales++;else if(v==='wholesale_sale')counts.wholesale++;else if(['supplier_return_replacement','supplier_discount_support','supplier_responsibility'].includes(v))counts.supplier++;}
  const unresolved=supplierQuestRows(task).filter(r=>r.needs_review).length;
  const stale=[...SupplierQuestUI.staleStages];
  return '<div class="supplier-quest-summary-page">'+(stale.length?'<div class="quest-stale-banner"><b>Data changed after confirmation.</b> Reopen and reconfirm: '+stale.map(k=>esc(SupplierQuestModel.STAGES.find(s=>s.key===k)?.label||k)).join(', ')+'</div>':'')+(unresolved?'<div class="quest-attention-banner"><b>'+unresolved+' data attention item'+(unresolved===1?'':'s')+' remain.</b> Non-blocking attention stays visible for follow-up.</div>':'')+'<div class="quest-summary-grid"><article><span>Supplier BO</span><b>'+batches.reduce((n,b)=>n+b.rows.length,0)+' products</b><small>5 staged purchase batches</small></article><article><span>Branch Reallocation</span><b>'+realloc+' products</b><small>Warehouse worklist</small></article><article><span>Sales Promotion</span><b>'+counts.sales+' products</b><small>Sales worklist</small></article><article><span>Wholesale</span><b>'+counts.wholesale+' products</b><small>Wholesale worklist</small></article><article><span>Supplier Follow-up</span><b>'+counts.supplier+' products</b><small>Purchasing worklist</small></article></div><div class="quest-bo-preview">'+batches.map(b=>'<section><h4>Batch '+b.batch+'</h4>'+(b.rows.length?'<table><thead><tr><th>Product</th><th>Unit</th><th>Min</th><th>Max</th></tr></thead><tbody>'+b.rows.map(r=>'<tr><td>'+esc(r.product_name)+'</td><td>'+esc(r.purchase_unit||'—')+'</td><td>'+supplierQuestMetric(r.min_order_qty,4)+'</td><td>'+supplierQuestMetric(r.max_order_qty,4)+'</td></tr>').join('')+'</tbody></table>':'<p>'+(b.noAction?'No purchase required.':'No selected products.')+'</p>')+'</section>').join('')+'</div></div>';
}

function supplierQuestRestoreStageDraft(task,stageKey,rows){
  const saved=supplierQuestStageData(stageKey);
  SupplierQuestUI.selected=new Set((saved.codes||[]).filter(code=>rows.some(r=>r.product_code===code)));
  SupplierQuestUI.noAction=Boolean(saved.no_action)&&SupplierQuestUI.selected.size===0;
  if(stageKey==='gt300'){
    SupplierQuestUI.decisions={...saved.decisions};
  }else{
    SupplierQuestUI.decisions={};
  }
}
function supplierQuestCanContinue(task,stage,rows){
  if(stage.kind==='data')return supplierQuestBlockingRows(task).length===0;
  if(stage.kind==='purchase'||stage.kind==='reallocation')return SupplierQuestUI.selected.size>0||SupplierQuestUI.noAction||rows.length===0;
  if(stage.kind==='decision')return rows.length===0||rows.every(r=>SupplierQuestUI.decisions[r.product_code]);
  if(stage.kind==='summary')return SupplierQuestUI.staleStages.size===0&&supplierQuestBlockingRows(task).length===0;
  return true;
}
function supplierQuestPrimaryLabel(stage,rows){
  if(stage.kind==='data')return 'Confirm Data Review & Continue';
  if(stage.kind==='purchase')return rows.length?'Save Batch & Continue':'Continue';
  if(stage.kind==='reallocation')return rows.length?'Save Reallocation Review & Continue':'Continue';
  if(stage.kind==='decision')return rows.length?'Save Decisions & Continue':'Continue';
  return SupplierQuestUI.quest?.status==='submitted'?'Review Finished':'Finish Supplier Review';
}
function supplierQuestHelper(task,stage){
  if(stage.kind==='data')return 'Blocking issues must be resolved. Attention items may remain and will stay visible in the final review.';
  if(stage.kind==='purchase')return 'Select the products to include in this BO batch, or explicitly confirm No Purchase Required.';
  if(stage.kind==='reallocation')return 'Select products for the Warehouse reallocation worklist, or explicitly confirm No Reallocation Required.';
  if(stage.kind==='decision')return 'Risk uses the approved Overstock model. The suggestion is based on profitability only; you choose the final decision.';
  return 'Review the five BO batches and downstream worklists. Finishing records the review only; task completion and badges still require later inventory verification.';
}
function supplierQuestRender(task,response){
  supplierQuestApplyServer(task,response);
  const stageKey=supplierQuestStage(),stage=supplierQuestCurrentStageDef(),rows=supplierQuestStageRows(task,stageKey),supplier=supplierQuestSupplier(task);
  supplierQuestRestoreStageDraft(task,stageKey,rows);
  if((stage.kind==='purchase'||stage.kind==='reallocation')&&rows.length===0)SupplierQuestUI.noAction=true;
  let d=$('supplierTaskDialog');
  if(!d){d=document.createElement('dialog');d.id='supplierTaskDialog';document.body.append(d);}
  d.className='supplier-task-dialog supplier-quest-dialog';
  let content='';
  if(stage.kind==='data')content=supplierQuestDataTable(task);
  else if(stage.kind==='purchase')content=rows.length?supplierQuestPurchaseTable(rows):'<div class="supplier-task-empty quest-empty-card">No products in this stock stage.</div>';
  else if(stage.kind==='reallocation')content=supplierQuestReallocationTable(rows);
  else if(stage.kind==='decision')content=supplierQuestDecisionTable(rows);
  else content=supplierQuestSummaryHtml(task);

  const staleCurrent=SupplierQuestUI.staleStages.has(stageKey);
  const canContinue=supplierQuestCanContinue(task,stage,rows);
  const noActionLabel=stage.kind==='reallocation'?'No Reallocation Required':'No Purchase Required';
  const noActionControl=(stage.kind==='purchase'||stage.kind==='reallocation')&&rows.length?'<label class="quest-no-action"><input type="checkbox" id="supplierQuestNoAction" '+(SupplierQuestUI.noAction?'checked':'')+'> <span>'+noActionLabel+'</span></label>':'';
  const status=SupplierQuestUI.quest?.status==='submitted'?'<span class="supplier-task-status">Pending stock verification</span>':staleCurrent?'<span class="supplier-task-status warning">Reconfirm after data change</span>':'';
  const footerCount=stage.kind==='decision'?'<span><b id="supplierQuestDecisionCount">'+rows.filter(r=>SupplierQuestUI.decisions[r.product_code]).length+'</b> / '+rows.length+' Decisions</span>':stage.kind==='purchase'||stage.kind==='reallocation'?'<span><b id="supplierQuestSelectedCount">'+SupplierQuestUI.selected.size+'</b> Selected</span>':stage.kind==='data'?'<span><b>'+supplierQuestBlockingRows(task).length+'</b> Blocking · <b>'+supplierQuestAttentionRows(task).length+'</b> Attention</span>':'<span>Review outputs before finishing.</span>';

  d.innerHTML='<div class="supplier-task-shell supplier-quest-shell"><header class="supplier-task-head"><div class="supplier-task-title-block"><span class="supplier-task-eyebrow">Supplier Quest</span><div class="supplier-task-title-line"><h2 dir="auto">'+esc(supplier)+'</h2>'+status+'</div><p>'+esc(stage.title)+' · Master revision '+esc(SupplierQuestUI.masterRevision??'—')+'</p></div><button class="supplier-task-x" id="supplierTaskCloseX" type="button" aria-label="Close">&times;</button></header>'+supplierQuestStageStepHtml(stageKey)+'<div class="supplier-quest-stage-head"><div><span>'+esc(stage.kind==='summary'?'FINAL REVIEW':'CURRENT STAGE')+'</span><h3>'+esc(stage.title)+'</h3><p>'+esc(supplierQuestHelper(task,stage))+'</p></div><b>'+fmt(rows.length,0)+' product'+(rows.length===1?'':'s')+'</b></div><div class="supplier-task-table-wrap supplier-quest-content">'+content+'</div><footer class="supplier-task-footer supplier-quest-footer"><div class="supplier-task-totals">'+footerCount+noActionControl+'</div><div class="supplier-task-actions">'+(stage.kind!=='summary'?'<button class="btn" id="supplierQuestPrint" type="button">Print Selected</button>':'<button class="btn" id="supplierQuestPrintBo" type="button">Print Supplier BO</button>')+'<button class="btn primary supplier-task-record" id="supplierQuestPrimary" type="button" '+(!canContinue||SupplierQuestUI.busy||SupplierQuestUI.quest?.status==='submitted'&&stage.kind==='summary'?'disabled':'')+'>'+esc(supplierQuestPrimaryLabel(stage,rows))+'</button><button class="btn" id="supplierTaskBack" type="button">Back to Tasks</button></div></footer></div>';

  $('supplierTaskCloseX').onclick=()=>d.close();$('supplierTaskBack').onclick=()=>d.close();d.onclick=e=>{if(e.target===d)d.close();};

  const updatePrimary=()=>{
    const btn=$('supplierQuestPrimary');if(btn)btn.disabled=SupplierQuestUI.busy||!supplierQuestCanContinue(task,stage,rows);
    const count=$('supplierQuestSelectedCount');if(count)count.textContent=SupplierQuestUI.selected.size;
  };
  if(stage.kind==='purchase'||stage.kind==='reallocation'){
    const checks=[...d.querySelectorAll('[data-quest-select]')];
    const sync=()=>{
      for(const cb of checks)cb.checked=SupplierQuestUI.selected.has(cb.dataset.questSelect);
      const all=$('supplierQuestSelectAll'),n=checks.filter(c=>c.checked).length;
      if(all){all.checked=checks.length>0&&n===checks.length;all.indeterminate=n>0&&n<checks.length;}
      const no=$('supplierQuestNoAction');if(no){no.checked=SupplierQuestUI.noAction;no.disabled=SupplierQuestUI.selected.size>0;}
      updatePrimary();
    };
    for(const cb of checks)cb.onchange=()=>{if(cb.checked){SupplierQuestUI.selected.add(cb.dataset.questSelect);SupplierQuestUI.noAction=false;}else SupplierQuestUI.selected.delete(cb.dataset.questSelect);sync();};
    const all=$('supplierQuestSelectAll');if(all)all.onchange=e=>{SupplierQuestUI.selected.clear();if(e.target.checked)for(const r of rows)SupplierQuestUI.selected.add(r.product_code);SupplierQuestUI.noAction=false;sync();};
    const no=$('supplierQuestNoAction');if(no)no.onchange=e=>{SupplierQuestUI.noAction=e.target.checked;if(SupplierQuestUI.noAction)SupplierQuestUI.selected.clear();sync();};
    sync();
  }
  for(const b of d.querySelectorAll('.quest-open-product'))b.onclick=()=>detail(b.dataset.code);
  for(const select of d.querySelectorAll('.quest-decision'))select.onchange=()=>{if(select.value)SupplierQuestUI.decisions[select.dataset.code]=select.value;else delete SupplierQuestUI.decisions[select.dataset.code];const count=$('supplierQuestDecisionCount');if(count)count.textContent=rows.filter(r=>SupplierQuestUI.decisions[r.product_code]).length;updatePrimary();};
  for(const step of d.querySelectorAll('[data-quest-stage]'))step.onclick=async()=>{const target=step.dataset.questStage;if(target===stageKey)return;step.disabled=true;try{const res=await supplierQuestRpc(task,{action:'goto_stage',stage:target});supplierQuestRender(task,res);}catch(e){toast('Stage could not be opened: '+e.message);}};

  const print=$('supplierQuestPrint');if(print)print.onclick=()=>supplierQuestPrintStage(task,stageKey);
  const printBo=$('supplierQuestPrintBo');if(printBo)printBo.onclick=()=>supplierQuestPrintBo(task);

  const primary=$('supplierQuestPrimary');
  if(primary)primary.onclick=async()=>{
    if(primary.disabled)return;
    SupplierQuestUI.busy=true;primary.disabled=true;primary.classList.add('loading');const old=primary.textContent;primary.textContent='Saving...';
    try{
      let res;
      if(stage.kind==='summary')res=await supplierQuestRpc(task,{action:'finish'});
      else if(stage.kind==='decision')res=await supplierQuestRpc(task,{action:'save_stage',stage:stageKey,decisions:SupplierQuestUI.decisions});
      else if(stage.kind==='data')res=await supplierQuestRpc(task,{action:'save_stage',stage:stageKey});
      else res=await supplierQuestRpc(task,{action:'save_stage',stage:stageKey,codes:[...SupplierQuestUI.selected],no_action:SupplierQuestUI.noAction});
      SupplierQuestUI.selected.clear();SupplierQuestUI.decisions={};SupplierQuestUI.noAction=false;
      supplierQuestRender(task,res);
      if(stage.kind==='summary'){toast('Supplier review finished. Task remains pending stock verification.');void supplierQuestLoadOutputs();}
    }catch(e){toast('Supplier Quest was not saved: '+e.message);primary.disabled=false;primary.textContent=old;primary.classList.remove('loading');}
    finally{SupplierQuestUI.busy=false;}
  };
  if(!d.open)d.showModal();
  return{dialog:d};
}

async function refreshSupplierQuest(taskKey){
  if(state.mode!=='live')return;
  const d=$('supplierTaskDialog');if(!d?.open)return;
  try{
    const v=await rpc('purchasing_workspace_revision_v47');
    if(v.master_revision!==state.revision||v.upload_id!==state.upload?.id)await loadLive();
    const task=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===taskKey&&t.status==='open');
    if(!task){d.close();toast('This supplier task changed after the data refresh.');return;}
    const res=await supplierQuestState(task);supplierQuestRender(task,res);
  }catch(e){toast('Supplier Quest refresh failed: '+e.message);}
}
window.renderSupplierTaskPopup=supplierQuestRender;
window.openSupplierTaskPopup=async function(task){
  const v=await rpc('purchasing_workspace_revision_v47');
  if(v.master_revision!==state.revision||v.upload_id!==state.upload?.id)await loadLive();
  const current=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open')||task;
  const res=await supplierQuestState(current);
  return supplierQuestRender(current,res);
};
window.ta16OpenTask=async function(task){
  try{
    if(state.mode==='live'){
      const v=await rpc('purchasing_workspace_revision_v47');
      if(v.master_revision!==state.revision||v.upload_id!==state.upload?.id)await loadLive();
    }
    const current=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open')||task;
    if(current.focus==='suppliers'){const res=await supplierQuestState(current);supplierQuestRender(current,res);return;}
    const refreshed=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open');
    if(!refreshed){toast('This task changed after a data update. Use the current task list.');return;}
    ta16OpenCodes(refreshed.codes||[]);state.dailyFocus.task_key=refreshed.task_key;
  }catch(e){toast('Task data could not be refreshed: '+e.message);}
};

function supplierQuestEnsureOutputsPanel(){
  let panel=$('supplierQuestOutputs');
  if(panel)return panel;
  const board=$('tasksPriorityList');if(!board)return null;
  panel=document.createElement('section');panel.id='supplierQuestOutputs';panel.className='quest-output-board';
  board.insertAdjacentElement('afterend',panel);return panel;
}
function supplierQuestOutputTitle(type){
  return({supplier_bo:'Supplier BOs',branch_reallocation:'Branch Reallocation',sales_promotion:'Sales Promotion',wholesale:'Wholesale',supplier_followup:'Supplier Follow-up'})[type]||type;
}
function supplierQuestOutputOwner(type){
  return({supplier_bo:'Purchasing',branch_reallocation:'Warehouse',sales_promotion:'Sales',wholesale:'Wholesale Sales',supplier_followup:'Purchasing'})[type]||'';
}
function supplierQuestOutputItems(o){
  if(o.output_type==='supplier_bo')return (o.payload?.batches||[]).flatMap(b=>(b.items||[]).map(x=>({...x,batch:b.batch})));
  return o.payload?.items||[];
}
function supplierQuestRenderOutputs(outputs){
  const panel=supplierQuestEnsureOutputsPanel();if(!panel)return;
  const active=(outputs||[]).filter(o=>supplierQuestOutputItems(o).length>0);
  panel.innerHTML='<div class="quest-output-head"><div><span>SUPPLIER QUEST OUTPUTS</span><h3>Operational Worklists</h3><p>Finished supplier reviews are routed here by department. These lists do not award badges or close supplier tasks.</p></div><button type="button" class="btn outline" id="refreshQuestOutputs">Refresh Lists</button></div>'+(active.length?'<div class="quest-output-grid">'+active.map((o,i)=>{const items=supplierQuestOutputItems(o),preview=items.slice(0,4);return '<article class="quest-output-card"><div class="quest-output-card-head"><div><small>'+esc(supplierQuestOutputOwner(o.output_type))+'</small><h4>'+esc(supplierQuestOutputTitle(o.output_type))+'</h4></div><b>'+items.length+'</b></div><p dir="auto">'+esc(o.supplier)+'</p><div class="quest-output-preview">'+preview.map(x=>'<span>'+esc(x.product_name||x.product_code)+(x.batch?' · B'+x.batch:'')+'</span>').join('')+(items.length>4?'<span>+'+(items.length-4)+' more</span>':'')+'</div><button type="button" class="btn quest-output-print" data-output-index="'+i+'">Print List</button></article>';}).join('')+'</div>':'<div class="ta16-empty">No finished Supplier Quest outputs yet.</div>');
  const refresh=$('refreshQuestOutputs');if(refresh)refresh.onclick=()=>supplierQuestLoadOutputs();
  const visible=active;
  for(const b of panel.querySelectorAll('.quest-output-print'))b.onclick=()=>{const o=visible[Number(b.dataset.outputIndex)],items=supplierQuestOutputItems(o);supplierQuestPrintWindow(supplierQuestOutputTitle(o.output_type)+' · '+o.supplier,supplierQuestOutputOwner(o.output_type),['Product','Unit','Action / Batch'],items.map(x=>[esc(x.product_name||x.product_code),esc(x.unit||'—'),esc(x.decision?SupplierQuestModel.decisionLabel(x.decision):x.batch?'Batch '+x.batch:'Review')]))};
}
async function supplierQuestLoadOutputs(){
  if(state.mode!=='live')return;
  try{const r=await rpc('purchasing_supplier_quest_outputs_v80');SupplierQuestUI.outputs=Array.isArray(r?.outputs)?r.outputs:[];supplierQuestRenderOutputs(SupplierQuestUI.outputs);}
  catch(e){const panel=supplierQuestEnsureOutputsPanel();if(panel)panel.innerHTML='<div class="ta16-empty">Operational worklists could not be loaded. '+esc(e.message)+'</div>';}
}

addEventListener('load',()=>{
  const detailDialog=$('detailDialog');
  if(detailDialog)detailDialog.addEventListener('close',()=>{const d=$('supplierTaskDialog');if(d?.open&&SupplierQuestUI.taskKey)void refreshSupplierQuest(SupplierQuestUI.taskKey);});
  setTimeout(()=>{if(state.mode==='live')void supplierQuestLoadOutputs();},500);
  if(typeof renderTasksAssistant==='function'&&!renderTasksAssistant.__quest80){
    const base=renderTasksAssistant;
    const wrapped=function(...args){const out=base.apply(this,args);setTimeout(()=>{if(state.mode==='live')void supplierQuestLoadOutputs();},0);return out;};
    wrapped.__quest80=true;window.renderTasksAssistant=wrapped;
  }
});