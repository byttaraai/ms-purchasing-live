/* Build 79: staged Supplier Quest workspace. Progress/output capture only; task completion and badges remain server-authoritative. */
'use strict';

const SupplierQuestUI={taskKey:null,quest:null,task:null,busy:false,selected:new Set(),decisions:{}};
function supplierQuestReset(task,quest){
  const changed=SupplierQuestUI.taskKey!==task?.task_key;
  SupplierQuestUI.taskKey=task?.task_key||null;SupplierQuestUI.task=task||null;SupplierQuestUI.quest=quest||null;
  if(changed){SupplierQuestUI.selected=new Set();SupplierQuestUI.decisions={};}
}
function supplierQuestSupplier(task){return String(task?.target||task?.title||'Supplier').trim();}
function supplierQuestRows(task){
  const supplier=supplierQuestSupplier(task);
  return (state.rows||[]).filter(r=>String(r.supplier||'').trim()===supplier);
}
function supplierQuestRiskRows(task){
  const supplier=supplierQuestSupplier(task),scope=OverstockRisk.evaluate(state.rows||[],C.profitLabel);
  return scope.rows.filter(r=>String(r.supplier||'').trim()===supplier);
}
function supplierQuestStageRows(task,stageKey){
  if(stageKey==='data')return supplierQuestRows(task).filter(r=>Boolean(r.needs_review));
  if(stageKey==='gt300')return supplierQuestRiskRows(task);
  return supplierQuestRows(task).filter(r=>SupplierQuestModel.stageForRatio(C.finite(r.stock_ratio)?Number(r.stock_ratio):null)===stageKey);
}
async function supplierQuestRpc(task,payload){
  if(state.mode!=='live'||!task?.id)throw Error('Supplier Quest is available in Live mode.');
  return rpc('purchasing_supplier_quest_v79',{payload:{task_id:task.id,...payload}});
}
async function supplierQuestState(task){return supplierQuestRpc(task,{action:'state'});}
function supplierQuestStage(){return SupplierQuestUI.quest?.current_stage||'data';}
function supplierQuestStageData(key){return SupplierQuestUI.quest?.stage_data?.[key]||{};}
function supplierQuestInitialDataCodes(){return SupplierQuestUI.quest?.stage_data?._initial_data_codes||[];}
function supplierQuestFixedDataCodes(task){
  const rowMap=new Map(supplierQuestRows(task).map(r=>[r.product_code,r]));
  return supplierQuestInitialDataCodes().filter(code=>{const r=rowMap.get(code);return r&&!r.needs_review;});
}
function supplierQuestStageStepHtml(stageKey){
  const current=SupplierQuestModel.stageIndex(stageKey);
  return '<div class="supplier-quest-stepper" aria-label="Supplier Quest progress">'+SupplierQuestModel.STAGES.map((s,i)=>{
    const cls=i<current?'done':i===current?'active':'locked';
    return '<span class="supplier-quest-step '+cls+'"><b>'+(i<current?'✓':(i+1))+'</b><em>'+esc(s.label)+'</em></span>';
  }).join('')+'</div>';
}
function supplierQuestStatusHtml(){
  if(SupplierQuestUI.quest?.status==='submitted')return '<span class="supplier-task-status">Pending stock verification</span>';
  return '';
}
function supplierQuestReviewHint(r){return String(r.review_reason||'Review the highlighted product data before continuing.');}
function supplierQuestMetric(v,d=0){return C.finite(v)?fmt(v,d):'—';}
function supplierQuestPrintWindow(title,subtitle,headers,rows){
  const w=window.open('','_blank','width=1050,height=800');if(!w){toast('Please allow pop-ups to open the print preview.');return;}
  const head=headers.map(h=>'<th>'+esc(h)+'</th>').join('');
  const body=rows.map(cells=>'<tr>'+cells.map((v,i)=>'<td class="'+(i>1?'num':'')+'">'+v+'</td>').join('')+'</tr>').join('');
  w.document.open();w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>@page{size:A4 portrait;margin:11mm}*{box-sizing:border-box}body{font:9.5pt Arial,sans-serif;color:#17284a;margin:0}h1{font-size:17pt;margin:0 0 3px}.sub{color:#68758e;margin-bottom:9mm}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th{background:#eef2f8;text-align:left;font-size:8pt;padding:6px;border-bottom:1px solid #cbd4e3}td{padding:6px;border-bottom:1px solid #e2e7ef;vertical-align:middle;overflow-wrap:anywhere}.num{text-align:right;font-variant-numeric:tabular-nums}</style></head><body><h1>'+esc(title)+'</h1><div class="sub">'+esc(subtitle)+'</div><table><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></body></html>');w.document.close();setTimeout(()=>{if(!w.closed){w.focus();w.print();}},150);
}
function supplierQuestPrintStage(task,stageKey){
  const rows=supplierQuestStageRows(task,stageKey),supplier=supplierQuestSupplier(task),stage=SupplierQuestModel.STAGES.find(s=>s.key===stageKey);
  if(stageKey==='data')return supplierQuestPrintWindow(supplier+' · '+stage.title,'Data issues to review',['Product','Unit','Review Hint'],rows.map(r=>[esc(r.product_name),esc(r.purchase_unit||'—'),esc(supplierQuestReviewHint(r))]));
  if(stageKey==='200_300')return supplierQuestPrintWindow(supplier+' · '+stage.title,'Branch reallocation review',['Product','Unit','Stock %','Rating','Stock Value'],rows.map(r=>[esc(r.product_name),esc(r.purchase_unit||'—'),esc(supplierQuestMetric(r.stock_ratio,1)+'%'),esc(C.profitLabel(r.profitability_class)),esc('SAR '+supplierQuestMetric(r.total_value,0))]));
  if(stageKey==='gt300')return supplierQuestPrintWindow(supplier+' · '+stage.title,'Overstock decision review',['Product','Unit','Stock %','Rating','Decision'],rows.map(r=>[esc(r.product_name),esc(r.purchase_unit||'—'),esc(supplierQuestMetric(r.stock_ratio,1)+'%'),esc(C.profitLabel(r.profitability_class)),esc(SupplierQuestModel.decisionLabel(SupplierQuestUI.decisions[r.product_code]||supplierQuestStageData('gt300').decisions?.[r.product_code]))]));
  const selected=SupplierQuestUI.selected.size?rows.filter(r=>SupplierQuestUI.selected.has(r.product_code)):rows;
  return supplierQuestPrintWindow(supplier+' · '+stage.title,'Purchase review',['Product','Unit','Price','Min Order','Max Order'],selected.map(r=>[esc(r.product_name),esc(r.purchase_unit||'—'),esc('SAR '+supplierQuestMetric(r.purchase_price,1)),esc(supplierQuestMetric(r.min_order_qty,4)),esc(supplierQuestMetric(r.max_order_qty,4))]));
}
function supplierQuestBoRows(task){
  const all=new Map(supplierQuestRows(task).map(r=>[r.product_code,r]));
  return SupplierQuestModel.PURCHASE_STAGE_KEYS.map((key,i)=>({batch:i+1,key,rows:(supplierQuestStageData(key).codes||[]).map(code=>all.get(code)).filter(Boolean)}));
}
function supplierQuestPrintBo(task){
  const batches=supplierQuestBoRows(task),supplier=supplierQuestSupplier(task),body=[];
  for(const b of batches){
    body.push(['<b>Batch '+b.batch+'</b>','','','']);
    for(const r of b.rows)body.push([esc(r.product_name),esc(r.purchase_unit||'—'),esc(supplierQuestMetric(r.min_order_qty,4)),esc(supplierQuestMetric(r.max_order_qty,4))]);
  }
  supplierQuestPrintWindow(supplier+' · Supplier BO','Recommended staged ordering',['Product','Unit','Min Order','Max Order'],body);
}
function supplierQuestPurchaseTable(rows){
  return '<table class="supplier-quest-table"><thead><tr><th class="select"><input type="checkbox" id="supplierQuestSelectAll" aria-label="Select all products in this stage"></th><th>#</th><th>Product</th><th>Unit</th><th>Stock %</th><th>Rating</th><th>Price</th><th>Min Order</th><th>Max Order</th></tr></thead><tbody>'+rows.map((r,i)=>'<tr><td class="select"><input type="checkbox" data-quest-select="'+esc(r.product_code)+'" '+(SupplierQuestUI.selected.has(r.product_code)?'checked':'')+'></td><td>'+(i+1)+'</td><td class="product">'+esc(r.product_name)+'</td><td>'+esc(r.purchase_unit||'—')+'</td><td class="num">'+supplierQuestMetric(r.stock_ratio,1)+'%</td><td>'+ratingHtml(r.profitability_class)+'</td><td class="num">'+supplierQuestMetric(r.purchase_price,1)+'</td><td class="num">'+supplierQuestMetric(r.min_order_qty,4)+'</td><td class="num">'+supplierQuestMetric(r.max_order_qty,4)+'</td></tr>').join('')+'</tbody></table>';
}
function supplierQuestDataTable(task,rows){
  const fixed=new Set(supplierQuestFixedDataCodes(task)),initial=new Set(supplierQuestInitialDataCodes()),current=new Map(supplierQuestRows(task).map(r=>[r.product_code,r]));
  const display=[...new Set([...initial,...rows.map(r=>r.product_code)])].map(code=>current.get(code)).filter(Boolean);
  return '<table class="supplier-quest-table data"><thead><tr><th>#</th><th>Product</th><th>Unit</th><th>What to fix</th><th>Status</th><th>Action</th></tr></thead><tbody>'+(display.length?display.map((r,i)=>'<tr><td>'+(i+1)+'</td><td class="product">'+esc(r.product_name)+'</td><td>'+esc(r.purchase_unit||'—')+'</td><td>'+esc(r.needs_review?supplierQuestReviewHint(r):'Required data was updated.')+'</td><td>'+(fixed.has(r.product_code)?'<span class="quest-ok">Fixed ✓</span>':r.needs_review?'<span class="quest-review">Needs review</span>':'<span class="quest-ok">Ready</span>')+'</td><td>'+(r.needs_review?'<button class="btn outline quest-open-product" data-code="'+esc(r.product_code)+'" type="button">Open Product</button>':'—')+'</td></tr>').join(''):'<tr><td colspan="6" class="supplier-task-empty">No supplier products currently need data review.</td></tr>')+'</tbody></table>';
}
function supplierQuestReallocationTable(rows){
  return '<table class="supplier-quest-table realloc"><thead><tr><th class="select"><input type="checkbox" id="supplierQuestSelectAll" aria-label="Select all products for branch reallocation"></th><th>#</th><th>Product</th><th>Unit</th><th>Stock %</th><th>Rating</th><th>Stock Value</th></tr></thead><tbody>'+(rows.length?rows.map((r,i)=>'<tr><td class="select"><input type="checkbox" data-quest-select="'+esc(r.product_code)+'" '+(SupplierQuestUI.selected.has(r.product_code)?'checked':'')+'></td><td>'+(i+1)+'</td><td class="product">'+esc(r.product_name)+'</td><td>'+esc(r.purchase_unit||'—')+'</td><td class="num">'+supplierQuestMetric(r.stock_ratio,1)+'%</td><td>'+ratingHtml(r.profitability_class)+'</td><td class="num">SAR '+supplierQuestMetric(r.total_value,0)+'</td></tr>').join(''):'<tr><td colspan="7" class="supplier-task-empty">No products are currently between 200% and 300%.</td></tr>')+'</tbody></table>';
}
function supplierQuestDecisionTable(rows){
  const saved=supplierQuestStageData('gt300').decisions||{};
  for(const r of rows)if(!SupplierQuestUI.decisions[r.product_code]&&saved[r.product_code])SupplierQuestUI.decisions[r.product_code]=saved[r.product_code];
  return '<table class="supplier-quest-table decisions"><thead><tr><th>#</th><th>Product</th><th>Unit</th><th>Stock %</th><th>Rating</th><th>Risk</th><th>Suggested</th><th>Decision</th></tr></thead><tbody>'+(rows.length?rows.map((r,i)=>{const profit=C.profitLabel(r.profitability_class),suggested=SupplierQuestModel.suggestedDecision(profit),value=SupplierQuestUI.decisions[r.product_code]||'';const options=['<option value="">Select decision</option>',...SupplierQuestModel.decisionOptions(profit).map(k=>'<option value="'+k+'" '+(value===k?'selected':'')+'>'+esc(SupplierQuestModel.decisionLabel(k))+'</option>')].join('');return '<tr><td>'+(i+1)+'</td><td class="product">'+esc(r.product_name)+'</td><td>'+esc(r.purchase_unit||'—')+'</td><td class="num">'+supplierQuestMetric(r.stock_ratio,1)+'%</td><td>'+ratingHtml(r.profitability_class)+'</td><td class="risk">'+overstockRiskCell(r)+'</td><td><span class="quest-suggested">'+esc(SupplierQuestModel.decisionLabel(suggested))+'</span></td><td><select class="quest-decision" data-code="'+esc(r.product_code)+'">'+options+'</select></td></tr>';}).join(''):'<tr><td colspan="8" class="supplier-task-empty">No products are currently above 300%.</td></tr>')+'</tbody></table>';
}
function supplierQuestOutputCounts(){
  const decisions=supplierQuestStageData('gt300').decisions||{},counts={sales_promotion:0,wholesale_sale:0,supplier_followup:0};
  for(const v of Object.values(decisions)){if(v==='sales_promotion')counts.sales_promotion++;else if(v==='wholesale_sale')counts.wholesale_sale++;else if(['supplier_return_replacement','supplier_discount_support','supplier_responsibility'].includes(v))counts.supplier_followup++;}
  return counts;
}
function supplierQuestSummaryHtml(task){
  const batches=supplierQuestBoRows(task),realloc=(supplierQuestStageData('200_300').codes||[]).length,counts=supplierQuestOutputCounts();
  return '<div class="supplier-quest-summary-page"><div class="quest-summary-grid"><article><span>Supplier BO</span><b>'+batches.reduce((n,b)=>n+b.rows.length,0)+' products</b><small>5 staged purchase batches</small></article><article><span>Branch Reallocation</span><b>'+realloc+' products</b><small>Warehouse follow-up list</small></article><article><span>Sales Promotion</span><b>'+counts.sales_promotion+' products</b><small>Sales department list</small></article><article><span>Wholesale</span><b>'+counts.wholesale_sale+' products</b><small>Wholesale sales list</small></article><article><span>Supplier Follow-up</span><b>'+counts.supplier_followup+' products</b><small>Purchasing follow-up list</small></article></div><div class="quest-bo-preview">'+batches.map(b=>'<section><h4>Batch '+b.batch+'</h4>'+(b.rows.length?'<table><thead><tr><th>Product</th><th>Unit</th><th>Min</th><th>Max</th></tr></thead><tbody>'+b.rows.map(r=>'<tr><td>'+esc(r.product_name)+'</td><td>'+esc(r.purchase_unit||'—')+'</td><td>'+supplierQuestMetric(r.min_order_qty,4)+'</td><td>'+supplierQuestMetric(r.max_order_qty,4)+'</td></tr>').join('')+'</tbody></table>':'<p>No selected products.</p>')+'</section>').join('')+'</div></div>';
}
function renderSupplierQuest(task,quest){
  supplierQuestReset(task,quest);const stageKey=supplierQuestStage(),stage=SupplierQuestModel.STAGES.find(s=>s.key===stageKey)||SupplierQuestModel.STAGES[0],rows=supplierQuestStageRows(task,stageKey),supplier=supplierQuestSupplier(task);
  if(stage.kind==='purchase'||stage.kind==='reallocation'){
    const saved=new Set(supplierQuestStageData(stageKey).codes||[]);
    SupplierQuestUI.selected=new Set([...SupplierQuestUI.selected].filter(code=>rows.some(r=>r.product_code===code)));
    if(!SupplierQuestUI.selected.size&&saved.size)SupplierQuestUI.selected=new Set([...saved].filter(code=>rows.some(r=>r.product_code===code)));
  }else SupplierQuestUI.selected.clear();
  let d=$('supplierTaskDialog');if(!d){d=document.createElement('dialog');d.id='supplierTaskDialog';d.className='supplier-task-dialog supplier-quest-dialog';document.body.append(d);}
  d.className='supplier-task-dialog supplier-quest-dialog';
  let content='';
  if(stage.kind==='data')content=supplierQuestDataTable(task,rows);
  else if(stage.kind==='purchase')content=rows.length?supplierQuestPurchaseTable(rows):'<div class="supplier-task-empty quest-empty-card">No products in this stock stage.</div>';
  else if(stage.kind==='reallocation')content=supplierQuestReallocationTable(rows);
  else if(stage.kind==='decision')content=supplierQuestDecisionTable(rows);
  else content=supplierQuestSummaryHtml(task);
  const currentIndex=SupplierQuestModel.stageIndex(stageKey),totalSteps=SupplierQuestModel.STAGES.length;
  const fixed=supplierQuestFixedDataCodes(task),initial=supplierQuestInitialDataCodes();
  let canContinue=true,primaryLabel='';
  if(stage.kind==='data'){canContinue=!initial.length||fixed.length>0;primaryLabel=initial.length?'Continue After Data Fix':'Continue';}
  else if(stage.kind==='purchase'){canContinue=!rows.length||SupplierQuestUI.selected.size>0;primaryLabel=rows.length?'Confirm Selected & Continue':'Continue';}
  else if(stage.kind==='reallocation'){primaryLabel='Confirm Reallocation Review & Continue';}
  else if(stage.kind==='decision'){canContinue=!rows.length||rows.every(r=>SupplierQuestUI.decisions[r.product_code]);primaryLabel=rows.length?'Confirm Decisions & Continue':'Continue';}
  else primaryLabel=quest?.status==='submitted'?'Review Finished':'Finish Supplier Review';
  const helper=stage.kind==='data'?(initial.length?'Fix at least one listed product to continue. Remaining data issues stay visible for follow-up.':'No data blockers for this supplier.'):
    stage.kind==='purchase'?'Select the products to include in this supplier request. One confirmation saves this batch and moves to the next stage.':
    stage.kind==='reallocation'?'Select only the products to send to the warehouse Branch Reallocation list. No risk score or purchase quantity is created here.':
    stage.kind==='decision'?'The system suggests an action from the approved profitability options. Choose the final decision for every product; this records the decision only.':
    'Review the generated outputs. Finishing the review does not complete the Supplier Task or award a badge; later inventory verification remains authoritative.';
  d.innerHTML='<div class="supplier-task-shell supplier-quest-shell"><header class="supplier-task-head"><div class="supplier-task-title-block"><span class="supplier-task-eyebrow">Supplier Quest</span><div class="supplier-task-title-line"><h2 dir="auto">'+esc(supplier)+'</h2>'+supplierQuestStatusHtml()+'</div><p>'+esc(stage.title)+' · Step '+(currentIndex+1)+' of '+totalSteps+'</p></div><button class="supplier-task-x" id="supplierTaskCloseX" type="button" aria-label="Close">&times;</button></header>'+supplierQuestStageStepHtml(stageKey)+'<div class="supplier-quest-stage-head"><div><span>'+esc(stage.kind==='summary'?'QUEST OUTPUTS':'CURRENT STAGE')+'</span><h3>'+esc(stage.title)+'</h3><p>'+esc(helper)+'</p></div><b>'+fmt(rows.length,0)+' product'+(rows.length===1?'':'s')+'</b></div><div class="supplier-task-table-wrap supplier-quest-content">'+content+'</div><footer class="supplier-task-footer supplier-quest-footer"><div class="supplier-task-totals">'+(stage.kind==='purchase'||stage.kind==='reallocation'?'<span><b id="supplierQuestSelectedCount">'+SupplierQuestUI.selected.size+'</b> Selected</span>':stage.kind==='data'?'<span><b>'+fixed.length+'</b> Data fixes completed</span>':stage.kind==='decision'?'<span><b id="supplierQuestDecisionCount">'+rows.filter(r=>SupplierQuestUI.decisions[r.product_code]).length+'</b> / '+rows.length+' Decisions</span>':'<span>Outputs are stored for downstream worklists.</span>')+'</div><div class="supplier-task-actions">'+(stage.kind!=='summary'?'<button class="btn" id="supplierQuestPrint" type="button">Print Stage</button>':'<button class="btn" id="supplierQuestPrintBo" type="button">Print Supplier BO</button>')+'<button class="btn primary supplier-task-record" id="supplierQuestPrimary" type="button" '+(!canContinue||SupplierQuestUI.busy||quest?.status==='submitted'&&stage.kind==='summary'?'disabled':'')+'>'+esc(primaryLabel)+'</button><button class="btn" id="supplierTaskBack" type="button">Back to Tasks</button></div></footer></div>';
  $('supplierTaskCloseX').onclick=()=>d.close();$('supplierTaskBack').onclick=()=>d.close();d.onclick=e=>{if(e.target===d)d.close();};
  if(stage.kind==='purchase'||stage.kind==='reallocation'){
    const checks=[...d.querySelectorAll('[data-quest-select]')],update=()=>{for(const cb of checks)cb.checked=SupplierQuestUI.selected.has(cb.dataset.questSelect);const count=$('supplierQuestSelectedCount');if(count)count.textContent=SupplierQuestUI.selected.size;const all=$('supplierQuestSelectAll');if(all){const n=checks.filter(c=>c.checked).length;all.checked=checks.length>0&&n===checks.length;all.indeterminate=n>0&&n<checks.length;}const btn=$('supplierQuestPrimary');if(stage.kind==='purchase'&&btn)btn.disabled=rows.length>0&&!SupplierQuestUI.selected.size;};
    for(const cb of checks)cb.onchange=()=>{if(cb.checked)SupplierQuestUI.selected.add(cb.dataset.questSelect);else SupplierQuestUI.selected.delete(cb.dataset.questSelect);update();};
    const all=$('supplierQuestSelectAll');if(all)all.onchange=e=>{for(const r of rows){if(e.target.checked)SupplierQuestUI.selected.add(r.product_code);else SupplierQuestUI.selected.delete(r.product_code);}update();};update();
  }
  for(const b of d.querySelectorAll('.quest-open-product'))b.onclick=()=>detail(b.dataset.code);
  for(const select of d.querySelectorAll('.quest-decision'))select.onchange=()=>{SupplierQuestUI.decisions[select.dataset.code]=select.value;const count=$('supplierQuestDecisionCount');if(count)count.textContent=rows.filter(r=>SupplierQuestUI.decisions[r.product_code]).length;const btn=$('supplierQuestPrimary');if(btn)btn.disabled=rows.length>0&&!rows.every(r=>SupplierQuestUI.decisions[r.product_code]);};
  const print=$('supplierQuestPrint');if(print)print.onclick=()=>supplierQuestPrintStage(task,stageKey);const printBo=$('supplierQuestPrintBo');if(printBo)printBo.onclick=()=>supplierQuestPrintBo(task);
  const primary=$('supplierQuestPrimary');if(primary)primary.onclick=async()=>{if(primary.disabled)return;SupplierQuestUI.busy=true;primary.disabled=true;try{let saved;
    if(stage.kind==='summary')saved=await supplierQuestRpc(task,{action:'finish'});
    else if(stage.kind==='decision')saved=await supplierQuestRpc(task,{action:'save_stage',stage:stageKey,decisions:SupplierQuestUI.decisions});
    else saved=await supplierQuestRpc(task,{action:'save_stage',stage:stageKey,codes:[...SupplierQuestUI.selected]});
    SupplierQuestUI.selected.clear();SupplierQuestUI.decisions={};SupplierQuestUI.quest=saved.quest||saved;renderSupplierQuest(task,SupplierQuestUI.quest);
    if(stage.kind==='summary')toast('Supplier review finished. Task remains pending stock verification.');
  }catch(e){toast('Supplier Quest was not saved: '+e.message);primary.disabled=false;}finally{SupplierQuestUI.busy=false;}};
  if(!d.open)d.showModal();return{dialog:d};
}
async function refreshSupplierQuest(taskKey){
  if(state.mode!=='live')return;const d=$('supplierTaskDialog');if(!d?.open)return;
  try{await loadLive();const task=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===taskKey&&t.status==='open');if(!task){d.close();toast('This supplier task changed after the data refresh.');return;}const q=await supplierQuestState(task);renderSupplierQuest(task,q.quest||q);}catch(e){}
}
window.renderSupplierTaskPopup=renderSupplierQuest;
window.openSupplierTaskPopup=async function(task){const q=await supplierQuestState(task);return renderSupplierQuest(task,q.quest||q);};
window.ta16OpenTask=async function(task){
  try{const current=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open')||task;if(current.focus==='suppliers'){const q=await supplierQuestState(current);renderSupplierQuest(current,q.quest||q);return;}if(state.mode==='live')await loadLive();const refreshed=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open');if(!refreshed){toast('This task changed after a data update. Use the current task list.');return;}ta16OpenCodes(refreshed.codes||[]);state.dailyFocus.task_key=refreshed.task_key;}catch(e){toast('Task data could not be refreshed. Please try again.');}
};
addEventListener('load',()=>{const detailDialog=$('detailDialog');if(detailDialog)detailDialog.addEventListener('close',()=>{const d=$('supplierTaskDialog');if(d?.open&&SupplierQuestUI.taskKey&&supplierQuestStage()==='data')void refreshSupplierQuest(SupplierQuestUI.taskKey);});});
