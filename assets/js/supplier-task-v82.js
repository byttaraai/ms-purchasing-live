/* Build 82: Supplier Quest UI/UX. Existing v81 RPC, business model and verification only. */
'use strict';

const SupplierQuestUI = {
  taskKey:null, task:null, quest:null, masterRevision:null, staleStages:new Set(),
  selected:new Set(), decisions:{}, noAction:false, busy:false, outputs:[],
  drafts:new Map(), user:null, request:0, query:'', selectedOnly:false, dataView:'open',
  summaryTab:'supplier_bo', pageTab:'tasks', outputType:'supplier_bo', outputQuery:'',
  outputFrom:'', outputTo:'', outputLoading:null, returnFocus:null, error:'', saved:false,
  showChanges:false, details:false, closeWarning:false, sourceRows:[], sourceUpload:null
};
const SQ_OUTPUTS = [
  ['supplier_bo','Supplier BO','Purchasing'],
  ['branch_reallocation','Reallocation','Warehouse'],
  ['sales_promotion','Promotion','Sales'],
  ['wholesale','Wholesale','Wholesale Sales'],
  ['supplier_followup','Supplier Follow-up','Purchasing']
];
function sqButton(id,text,cls='',extra=''){
  return '<button type="button" class="sq-btn '+cls+'" '+(id?'id="'+id+'" ':'')+extra+'>'+text+'</button>';
}
function sqEmpty(text){return '<div class="sq-empty">'+esc(text)+'</div>';}
function sqNumber(v,d=0){return typeof v==='number'&&Number.isFinite(v)?fmt(v,d):'\u2014';}
function sqDate(v){const d=new Date(v);return v&&Number.isFinite(d.getTime())?d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'\u2014';}
function supplierQuestMetric(v,d=0){return sqNumber(v,d);}
function supplierQuestSupplier(task){return String(task?.target||task?.title||'Supplier').trim();}
function supplierQuestRows(task){const s=supplierQuestSupplier(task);return (state.rows||[]).filter(r=>String(r.supplier||'').trim()===s);}
function supplierQuestRiskRows(task){const s=supplierQuestSupplier(task);return OverstockRisk.evaluate(state.rows||[],C.profitLabel).rows.filter(r=>String(r.supplier||'').trim()===s);}
function supplierQuestStageRows(task,key){
  if(key==='data')return supplierQuestRows(task).filter(r=>r.needs_review||r.blocking_review);
  if(key==='gt300')return supplierQuestRiskRows(task);
  return supplierQuestRows(task).filter(r=>SupplierQuestModel.stageForRatio(r.stock_ratio)===key);
}
function supplierQuestStage(){return SupplierQuestUI.quest?.current_stage||'data';}
function supplierQuestStageData(key){return SupplierQuestUI.quest?.stage_data?.[key]||{};}
function supplierQuestCurrentStageDef(){return SupplierQuestModel.STAGES.find(s=>s.key===supplierQuestStage())||SupplierQuestModel.STAGES[0];}
function supplierQuestBlockingRows(task){return supplierQuestRows(task).filter(r=>r.blocking_review);}
function supplierQuestAttentionRows(task){return supplierQuestRows(task).filter(r=>r.needs_review&&!r.blocking_review);}
function supplierQuestReviewHint(r){return String(r.review_reason||r.warning_reason||'Review product data.');}
function sqTaskKey(task){return [state.session?.user?.id||'',task.id||task.task_key,state.upload?.id||''].join('|');}
function sqStageKey(task,key){return sqTaskKey(task)+'|'+key;}
function sqCanonical(d){return JSON.stringify({codes:[...(d.codes||[])].sort(),decisions:Object.entries(d.decisions||{}).filter(([,v])=>v).sort(([a],[b])=>a.localeCompare(b)),noAction:Boolean(d.noAction)});}
function sqSavedDraft(key){const r=supplierQuestStageData(key);return {codes:[...(r.codes||[])],decisions:{...r.decisions},noAction:Boolean(r.no_action)};}
function sqStoreDraft(){
  const task=SupplierQuestUI.task,key=supplierQuestStage();if(!task||key==='data'||key==='summary'||SupplierQuestUI.quest?.status==='submitted')return;
  SupplierQuestUI.drafts.set(sqStageKey(task,key),{codes:[...SupplierQuestUI.selected],decisions:{...SupplierQuestUI.decisions},noAction:SupplierQuestUI.noAction,query:SupplierQuestUI.query,selectedOnly:SupplierQuestUI.selectedOnly,scroll:$('supplierQuestContent')?.scrollTop||0});
}
function sqDirty(){
  const task=SupplierQuestUI.task;if(!task||SupplierQuestUI.quest?.status==='submitted')return false;
  sqStoreDraft();
  return SupplierQuestModel.STAGES.some(s=>{
    const d=SupplierQuestUI.drafts.get(sqStageKey(task,s.key));return d&&sqCanonical(d)!==sqCanonical(sqSavedDraft(s.key));
  });
}
function supplierQuestRestoreStageDraft(task,key,rows){
  const draft=SupplierQuestUI.drafts.get(sqStageKey(task,key))||sqSavedDraft(key);
  // Keep unsaved selections in the session; membership is still validated by the existing RPC.
  SupplierQuestUI.selected=new Set(draft.codes||[]);
  SupplierQuestUI.decisions={...draft.decisions};SupplierQuestUI.noAction=Boolean(draft.noAction);
  SupplierQuestUI.query=draft.query||'';SupplierQuestUI.selectedOnly=Boolean(draft.selectedOnly);
}
function supplierQuestApplyServer(task,response){
  const u=state.session?.user?.id||'';
  if(SupplierQuestUI.user!==u){SupplierQuestUI.drafts.clear();SupplierQuestUI.outputs=[];SupplierQuestUI.user=u;}
  SupplierQuestUI.taskKey=task.task_key;SupplierQuestUI.task=task;SupplierQuestUI.quest=response.quest||response;
  SupplierQuestUI.masterRevision=response.master_revision??state.revision;
  SupplierQuestUI.staleStages=new Set(response.stale_stages||[]);
  SupplierQuestUI.sourceUpload=state.upload?.id;
  SupplierQuestUI.sourceRows=structuredClone(supplierQuestRows(task));
}
async function supplierQuestRpc(task,payload){
  if(state.mode!=='live'||!task?.id)throw Error('Supplier Quest is available in Live mode.');
  if(purchaseActionsLocked())throw Error('Upload a current full inventory snapshot to continue.');
  return rpc('purchasing_supplier_quest_v81',{payload:{task_id:task.id,...payload}});
}
async function supplierQuestState(task){return supplierQuestRpc(task,{action:'state'});}
function sqSubmitted(){return SupplierQuestUI.quest?.status==='submitted';}
function sqActiveTask(task){return (state.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open');}
function sqMatches(r,query){return [r.product_name,r.product_code].some(v=>String(v||'').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));}
function sqVisibleRows(rows){return rows.filter(r=>sqMatches(r,SupplierQuestUI.query)&&(!SupplierQuestUI.selectedOnly||SupplierQuestUI.selected.has(r.product_code)));}
function sqProduct(r,withUnit=true){return '<div class="sq-product"><bdi>'+esc(r.product_name||r.product_code)+'</bdi><small>'+esc(r.product_code)+(withUnit?' \u00b7 '+esc(r.purchase_unit||r.unit||'\u2014'):'')+'</small></div>';}
function sqIssueAction(r){
  const reason=supplierQuestReviewHint(r);
  if(/purchase price|price missing/i.test(reason))return ['Add Price','editPurchasePrice'];
  if(/reorder/i.test(reason))return ['Review Reorder Point','editReorderPoint'];
  if(/profitability/i.test(reason))return ['Set Profitability','editProfitability'];
  if(/factor/i.test(reason))return ['Review Factor','editFactor'];
  if(/unit/i.test(reason))return ['Review Unit','editPurchaseUnit'];
  if(/supplier/i.test(reason))return ['Set Supplier','editSupplier'];
  return ['Review Data','editPurchaseUnit'];
}
function sqDataRows(task){
  const all=supplierQuestRows(task),map=new Map(all.map(r=>[r.product_code,r]));
  const initial=[...(SupplierQuestUI.quest?.stage_data?._initial_data_codes||[]),...(SupplierQuestUI.quest?.stage_data?._initial_blocking_codes||[]),...(SupplierQuestUI.quest?.stage_data?._initial_attention_codes||[])];
  return [...new Set([...initial,...all.filter(r=>r.needs_review||r.blocking_review).map(r=>r.product_code)])].map(c=>map.get(c)).filter(Boolean);
}
function supplierQuestDataTable(task){
  const all=sqDataRows(task),rows=all.filter(r=>(SupplierQuestUI.dataView==='resolved'?!(r.needs_review||r.blocking_review):(r.needs_review||r.blocking_review))&&sqMatches(r,SupplierQuestUI.query));
  if(!rows.length)return sqEmpty(SupplierQuestUI.query?'No products match your search.':SupplierQuestUI.dataView==='resolved'?'No resolved items yet.':'No open data issues. You can continue.');
  return '<table class="sq-table sq-data"><thead><tr><th>Product / Unit</th><th>Required information</th><th>Review status</th><th>Action</th></tr></thead><tbody>'+rows.map(r=>{
    const open=r.needs_review||r.blocking_review,[label,field]=sqIssueAction(r);
    return '<tr data-product="'+esc(r.product_code)+'"><td>'+sqProduct(r)+'</td><td>'+esc(open?supplierQuestReviewHint(r):'Required data updated.')+'</td><td><span class="sq-chip '+(r.blocking_review?'danger':open?'warning':'success')+'">'+(r.blocking_review?'Blocking':open?'Attention':'Updated \u2713')+'</span></td><td>'+(open?sqButton('',esc(label),'sq-edit','data-edit="'+esc(r.product_code)+'" data-field="'+field+'"'):'<span class="sq-muted">Reviewed</span>')+'</td></tr>';
  }).join('')+'</tbody></table>';
}
function sqSelectCell(r){return '<td class="sq-check-cell"><label class="sq-hit"><input type="checkbox" data-quest-select="'+esc(r.product_code)+'" aria-label="Select '+esc(r.product_name||r.product_code)+'" '+(SupplierQuestUI.selected.has(r.product_code)?'checked':'')+'></label></td>';}
function sqSelectHead(){return '<th class="sq-check-cell"><label class="sq-hit" title="Select all visible products"><input type="checkbox" id="supplierQuestSelectAll" aria-label="Select all visible products"></label></th>';}
function supplierQuestPurchaseTable(rows){
  return '<table class="sq-table sq-purchase"><thead><tr>'+sqSelectHead()+'<th>Product</th><th>Unit</th><th class="num">Stock %</th><th>Rating</th><th class="num">Price <small>SAR</small></th><th class="num">Min Order</th><th class="num">Max Order</th></tr></thead><tbody>'+rows.map(r=>'<tr class="'+(SupplierQuestUI.selected.has(r.product_code)?'selected':'')+'">'+sqSelectCell(r)+'<td>'+sqProduct(r,false)+'</td><td>'+esc(r.purchase_unit||'\u2014')+'</td><td class="num">'+sqNumber(r.stock_ratio,1)+'%</td><td>'+ratingHtml(r.profitability_class)+'</td><td class="num">'+sqNumber(r.purchase_price,2)+'</td><td class="num">'+sqNumber(r.min_order_qty,4)+'</td><td class="num">'+sqNumber(r.max_order_qty,4)+'</td></tr>').join('')+'</tbody></table>';
}
function supplierQuestReallocationTable(rows){
  return '<table class="sq-table sq-reallocation"><thead><tr>'+sqSelectHead()+'<th>Product / Unit</th><th class="num">Stock %</th><th>Rating</th><th class="num">Stock Value <small>SAR</small></th></tr></thead><tbody>'+rows.map(r=>'<tr class="'+(SupplierQuestUI.selected.has(r.product_code)?'selected':'')+'">'+sqSelectCell(r)+'<td>'+sqProduct(r)+'</td><td class="num">'+sqNumber(r.stock_ratio,1)+'%</td><td>'+ratingHtml(r.profitability_class)+'</td><td class="num">'+sqNumber(r.total_value,2)+'</td></tr>').join('')+'</tbody></table>';
}
function supplierQuestDecisionTable(rows){
  return '<table class="sq-table sq-decisions"><thead><tr><th>Product / Unit</th><th class="num">Stock %</th><th>Rating</th><th>Risk Share</th><th>Suggestion <small>By profitability</small></th><th>Your decision</th></tr></thead><tbody>'+rows.map(r=>{
    const profit=C.profitLabel(r.profitability_class),options=SupplierQuestModel.decisionOptions(profit),value=SupplierQuestUI.decisions[r.product_code]||'',valid=options.includes(value);
    return '<tr><td>'+sqProduct(r)+'</td><td class="num">'+sqNumber(r.stock_ratio,1)+'%</td><td>'+ratingHtml(r.profitability_class)+'</td><td>'+overstockRiskCell(r)+'</td><td class="sq-muted">'+esc(SupplierQuestModel.decisionLabel(SupplierQuestModel.suggestedDecision(profit)))+'</td><td><select class="sq-decision" data-code="'+esc(r.product_code)+'" aria-label="Decision for '+esc(r.product_name||r.product_code)+'"><option value="">Choose decision</option>'+options.map(k=>'<option value="'+k+'" '+(value===k?'selected':'')+'>'+esc(SupplierQuestModel.decisionLabel(k))+'</option>').join('')+'</select>'+(!valid&&value?'<small class="sq-error-text">Previous decision needs review.</small>':'')+'</td></tr>';
  }).join('')+'</tbody></table>';
}
function supplierQuestStageStepHtml(key){
  const data=SupplierQuestUI.quest?.stage_data||{},task=SupplierQuestUI.task;
  return '<nav class="sq-steps supplier-quest-stepper" aria-label="Supplier review stages">'+SupplierQuestModel.STAGES.map((s,i)=>{
    const completed=s.kind!=='summary'&&SupplierQuestModel.stageCompleted(data,s.key),stale=SupplierQuestUI.staleStages.has(s.key),active=s.key===key,reachable=!sqSubmitted()&&SupplierQuestModel.canNavigate(data,s.key);
    const draft=SupplierQuestUI.drafts.get(sqStageKey(task,s.key));
    const dirty=draft&&sqCanonical(draft)!==sqCanonical(sqSavedDraft(s.key));
    const n=s.kind==='summary'?null:supplierQuestStageRows(task,s.key).length;
    const label=s.key==='data'?'Data':s.key==='200_300'?'Reallocate':s.key==='gt300'?'Risk':s.key==='summary'?'Final Review':s.label+'%';
    const title=s.key==='200_300'?'200% to 300% - Warehouse review':s.key==='gt300'?'Above 300% - Risk decisions':s.title;
    return '<button type="button" data-quest-stage="'+s.key+'" class="supplier-quest-step '+(active?'active ':stale?'stale ':dirty?'draft ':completed?'done ':'')+([1,6,7,8].includes(i)?'sq-group-start':'')+'" '+(!reachable||SupplierQuestUI.busy?'disabled':'')+(active?' aria-current="step"':'')+' title="'+esc(title)+'"><span class="sq-step-icon">'+(stale?'!':dirty?'\u2022':completed?'\u2713':i+1)+'</span><span>'+esc(label)+'</span>'+(n!==null?'<small>'+n+'</small>':'')+'</button>';
  }).join('')+'</nav>';
}
function supplierQuestBoRows(task){
  const all=new Map(supplierQuestRows(task).map(r=>[r.product_code,r]));
  return SupplierQuestModel.PURCHASE_STAGE_KEYS.map((key,i)=>{
    const s=supplierQuestStageData(key);
    // A present snapshot, even empty, is authoritative. Never coerce null quantities to zero.
    const rows=Array.isArray(s.snapshot)?s.snapshot.filter(x=>x.selected).map(x=>({product_code:x.product_code,product_name:x.product_name,purchase_unit:x.unit,min_order_qty:x.min_order,max_order_qty:x.max_order})):(s.codes||[]).map(c=>all.get(c)).filter(Boolean);
    return {batch:i+1,key,rows,noAction:Boolean(s.no_action)};
  });
}
function sqSummaryItems(type){
  const key=type==='branch_reallocation'?'200_300':'gt300',s=supplierQuestStageData(key);
  const all=new Map(supplierQuestRows(SupplierQuestUI.task).map(r=>[r.product_code,r]));
  const rows=Array.isArray(s.snapshot)?s.snapshot:(key==='200_300'?(s.codes||[]):Object.keys(s.decisions||{})).map(c=>{const r=all.get(c);return r&&{product_code:c,product_name:r.product_name,unit:r.purchase_unit,stock_pct:r.stock_ratio,rating:r.profitability_class,stock_value:r.total_value,selected:true,decision:s.decisions?.[c]};}).filter(Boolean);
  return rows.filter(x=>type==='branch_reallocation'?x.selected:type==='sales_promotion'?x.decision==='sales_promotion':type==='wholesale'?x.decision==='wholesale_sale':['supplier_return_replacement','supplier_discount_support','supplier_responsibility'].includes(x.decision));
}
function sqBoTable(batches,editable=false){
  return '<table class="sq-table sq-bo"><thead><tr><th>Product</th><th>Unit</th><th class="num">Min Order</th><th class="num">Max Order</th></tr></thead><tbody>'+batches.map(b=>'<tr class="sq-batch"><th colspan="4"><div><span>Batch '+b.batch+' <small>'+b.rows.length+' products</small></span>'+(editable?sqButton('','Edit Batch','sq-link','data-edit-stage="'+b.key+'"'):'')+'</div></th></tr>'+(b.rows.length?b.rows.map(r=>'<tr><td><bdi>'+esc(r.product_name||r.product_code)+'</bdi></td><td>'+esc(r.purchase_unit||'\u2014')+'</td><td class="num">'+sqNumber(r.min_order_qty,4)+'</td><td class="num">'+sqNumber(r.max_order_qty,4)+'</td></tr>').join(''):'<tr><td colspan="4" class="sq-muted">'+(b.noAction?'No purchase required.':'No selected products.')+'</td></tr>')).join('')+'</tbody></table>';
}
function sqListTable(type,items){
  if(!items.length)return sqEmpty('No products in this list.');
  const reallocation=type==='branch_reallocation';
  return '<table class="sq-table sq-list"><thead><tr><th>Product / Unit</th><th class="num">Stock %</th><th>Rating</th><th'+(reallocation?' class="num"':'')+'>'+(reallocation?'Stock Value (SAR)':'Recorded decision')+'</th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+sqProduct(x)+'</td><td class="num">'+sqNumber(x.stock_pct,1)+'%</td><td>'+esc(C.profitLabel(x.rating))+'</td><td'+(reallocation?' class="num"':'')+'>'+(reallocation?sqNumber(x.stock_value,2):esc(SupplierQuestModel.decisionLabel(x.decision)))+'</td></tr>').join('')+'</tbody></table>';
}
function sqSummaryCounts(){return Object.fromEntries(SQ_OUTPUTS.map(([type])=>[type,type==='supplier_bo'?supplierQuestBoRows(SupplierQuestUI.task).reduce((n,b)=>n+b.rows.length,0):sqSummaryItems(type).length]));}
function supplierQuestSummaryHtml(task){
  const counts=sqSummaryCounts(),type=SupplierQuestUI.summaryTab,attention=supplierQuestAttentionRows(task),pending=sqDirty();
  return (pending?'<div class="sq-notice warning">Unconfirmed changes remain. Reopen the marked stages and confirm them before finishing.</div>':'')+(attention.length?'<details class="sq-notice"><summary>'+attention.length+' non-blocking data items remain</summary>'+attention.map(r=>'<p>'+esc(r.product_name)+' \u2014 '+esc(supplierQuestReviewHint(r))+'</p>').join('')+'</details>':'')+'<div class="sq-tabs" role="tablist" aria-label="Review outputs">'+SQ_OUTPUTS.map(([k,title])=>sqButton('',esc(title)+' <b>'+counts[k]+'</b>',k===type?'active':'','role="tab" aria-selected="'+(k===type)+'" data-summary-tab="'+k+'"')).join('')+'</div><div class="sq-summary-list">'+(type==='supplier_bo'?sqBoTable(supplierQuestBoRows(task),!sqSubmitted()):sqListTable(type,sqSummaryItems(type)))+'</div>';
}
function sqChangesHtml(){
  const key=supplierQuestStage(),s=supplierQuestStageData(key),task=SupplierQuestUI.task;
  if(!Array.isArray(s.snapshot))return '<div class="sq-notice">This older stage has no saved source snapshot. Confirm the stage once to record one.</div>';
  const fields=key==='data'?[['Review status','needs_review','needs_review'],['Required information','review_reason','review_reason']]:key==='200_300'?[['Unit','unit','purchase_unit'],['Stock %','stock_pct','stock_ratio'],['Rating','rating','profitability_class'],['Stock Value','stock_value','total_value']]:key==='gt300'?[['Unit','unit','purchase_unit'],['Stock %','stock_pct','stock_ratio'],['Rating','rating','profitability_class'],['Price','price','purchase_price'],['Stock Value','stock_value','total_value']]:[['Unit','unit','purchase_unit'],['Stock %','stock_pct','stock_ratio'],['Rating','rating','profitability_class'],['Price','price','purchase_price'],['Min Order','min_order','min_order_qty'],['Max Order','max_order','max_order_qty']];
  const current=key==='data'?sqDataRows(task):supplierQuestStageRows(task,key),old=new Map(s.snapshot.map(r=>[r.product_code,r])),now=new Map(current.map(r=>[r.product_code,r]));
  const changes=[];
  for(const code of new Set([...old.keys(),...now.keys()])){
    const a=old.get(code),b=now.get(code),name=b?.product_name||a?.product_name||code;
    if(!a||!b){changes.push([name,'Stage membership',a?'In this stage':'Not in this stage',b?'In this stage':'No longer in this stage']);continue;}
    for(const [label,ak,bk] of fields)if((a[ak]??'')!==(b[bk]??''))changes.push([name,label,String(a[ak]??'\u2014'),String(b[bk]??'\u2014')]);
  }
  return changes.length?'<div class="sq-changes"><table class="sq-table"><thead><tr><th>Product</th><th>Changed field</th><th>Previously</th><th>Now</th></tr></thead><tbody>'+changes.map(c=>'<tr>'+c.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'<div class="sq-notice">The server requires this stage to be reviewed. Your previous choices are preserved.</div>';
}
function supplierQuestCanContinue(task,stage,rows){
  if(SupplierQuestUI.busy||sqSubmitted())return false;
  if(stage.kind==='data')return supplierQuestBlockingRows(task).length===0;
  if(stage.kind==='decision')return rows.every(r=>SupplierQuestModel.decisionOptions(C.profitLabel(r.profitability_class)).includes(SupplierQuestUI.decisions[r.product_code]));
  if(stage.kind==='summary')return !SupplierQuestUI.staleStages.size&&!supplierQuestBlockingRows(task).length&&!sqDirty();
  return true;
}
function supplierQuestPrimaryLabel(stage,rows){
  if(sqSubmitted())return 'Review Finished';
  const n=SupplierQuestUI.selected.size;
  if(stage.kind==='data')return 'Confirm Review & Continue';
  if(stage.kind==='purchase')return n?'Add '+n+' to BO & Continue':'No Purchase Required & Continue';
  if(stage.kind==='reallocation')return n?'Add '+n+' to Warehouse List & Continue':'No Reallocation Required & Continue';
  if(stage.kind==='decision')return 'Confirm Decisions & Continue';
  return 'Finish Supplier Review';
}
function sqFeedback(){
  if(SupplierQuestUI.busy)return 'Saving...';
  if(sqDirty())return 'Unconfirmed changes';
  if(sqSubmitted())return 'Review saved';
  return SupplierQuestUI.saved?'Saved \u2713':'Draft review';
}
function sqFooterText(task,stage,rows){
  if(stage.kind==='data'){const b=supplierQuestBlockingRows(task).length,a=supplierQuestAttentionRows(task).length;return b?b+' blocking issue'+(b===1?'':'s')+' must be resolved.':a?'You can continue. '+a+' non-blocking item'+(a===1?'':'s')+' remain.':'Data is ready. You can continue.';}
  if(stage.kind==='decision')return rows.filter(r=>SupplierQuestModel.decisionOptions(C.profitLabel(r.profitability_class)).includes(SupplierQuestUI.decisions[r.product_code])).length+' / '+rows.length+' decisions selected';
  if(stage.kind==='summary')return sqSubmitted()?'Review saved. Inventory verification is still pending.':'Finish saves the review, not task completion or a badge.';
  let total=0;for(const key of SupplierQuestModel.PURCHASE_STAGE_KEYS){const d=key===stage.key?{codes:[...SupplierQuestUI.selected]}:SupplierQuestUI.drafts.get(sqStageKey(task,key))||sqSavedDraft(key);total+=(d.codes||[]).length;}
  return '<b id="supplierQuestSelectedCount">'+SupplierQuestUI.selected.size+'</b> selected in this stage'+(stage.kind==='purchase'?' \u00b7 '+total+' in BO':' \u00b7 Prepared for Warehouse');
}
function sqPaintControls(){
  const task=SupplierQuestUI.task,stage=supplierQuestCurrentStageDef(),rows=supplierQuestStageRows(task,stage.key),p=$('supplierQuestPrimary');
  if(p){p.disabled=!supplierQuestCanContinue(task,stage,rows);p.textContent=SupplierQuestUI.busy?'Saving...':supplierQuestPrimaryLabel(stage,rows);}
  const footer=$('supplierQuestTotals');if(footer)footer.innerHTML=sqFooterText(task,stage,rows);
  const status=$('supplierQuestSaveStatus');if(status){status.textContent=sqFeedback();status.classList.toggle('warning',sqDirty());}
  const print=$('supplierQuestPrint');if(print)print.disabled=SupplierQuestUI.busy||(['purchase','reallocation'].includes(stage.kind)&&SupplierQuestUI.selected.size===0);
  const visible=sqVisibleRows(rows),selectAll=$('supplierQuestSelectAll'),n=visible.filter(r=>SupplierQuestUI.selected.has(r.product_code)).length;
  if(selectAll){selectAll.checked=visible.length>0&&n===visible.length;selectAll.indeterminate=n>0&&n<visible.length;}
  const clear=$('supplierQuestClear');if(clear)clear.disabled=!SupplierQuestUI.selected.size||SupplierQuestUI.busy;
  const d=$('supplierTaskDialog');for(const cb of d?.querySelectorAll('[data-quest-select]')||[]){const checked=SupplierQuestUI.selected.has(cb.dataset.questSelect);cb.checked=checked;cb.closest('tr')?.classList.toggle('selected',checked);}
}
function sqContentHtml(task,stage,rows){
  if(stage.kind==='summary')return supplierQuestSummaryHtml(task);
  if(stage.kind==='data')return supplierQuestDataTable(task);
  const visible=sqVisibleRows(rows);if(!visible.length)return sqEmpty(rows.length?'No products match this view. Hidden selections are kept.':'No products in this stock range. You can continue.');
  if(stage.kind==='purchase')return supplierQuestPurchaseTable(visible);
  if(stage.kind==='reallocation')return supplierQuestReallocationTable(visible);
  return supplierQuestDecisionTable(visible);
}
function sqBindContent(){
  const d=$('supplierTaskDialog');
  for(const b of d.querySelectorAll('[data-edit]'))b.onclick=()=>{
    sqStoreDraft();detail(b.dataset.edit);
    const target=$(b.dataset.field);if(target){document.querySelectorAll('.sq-field-highlight').forEach(x=>x.classList.remove('sq-field-highlight'));target.closest('.edit-field')?.classList.add('sq-field-highlight');target.focus();target.scrollIntoView({block:'center'});}
  };
  for(const cb of d.querySelectorAll('[data-quest-select]'))cb.onchange=()=>{
    if(cb.checked)SupplierQuestUI.selected.add(cb.dataset.questSelect);else SupplierQuestUI.selected.delete(cb.dataset.questSelect);
    SupplierQuestUI.noAction=false;sqStoreDraft();sqPaintControls();
    if(SupplierQuestUI.selectedOnly)sqUpdateContent();
  };
  const all=$('supplierQuestSelectAll');if(all)all.onchange=()=>{
    const rows=sqVisibleRows(supplierQuestStageRows(SupplierQuestUI.task,supplierQuestStage()));
    for(const r of rows){if(all.checked)SupplierQuestUI.selected.add(r.product_code);else SupplierQuestUI.selected.delete(r.product_code);}
    SupplierQuestUI.noAction=false;sqStoreDraft();sqPaintControls();
  };
  for(const select of d.querySelectorAll('.sq-decision'))select.onchange=()=>{if(select.value)SupplierQuestUI.decisions[select.dataset.code]=select.value;else delete SupplierQuestUI.decisions[select.dataset.code];sqStoreDraft();sqPaintControls();};
  for(const b of d.querySelectorAll('[data-summary-tab]'))b.onclick=()=>{SupplierQuestUI.summaryTab=b.dataset.summaryTab;sqUpdateContent();};
  for(const b of d.querySelectorAll('[data-edit-stage]'))b.onclick=()=>sqNavigate(b.dataset.editStage);
}
function sqUpdateContent(){
  const el=$('supplierQuestContent');if(!el)return;const scroll=el.scrollTop,stage=supplierQuestCurrentStageDef(),rows=supplierQuestStageRows(SupplierQuestUI.task,stage.key);
  el.innerHTML=sqContentHtml(SupplierQuestUI.task,stage,rows);sqBindContent();sqPaintControls();el.scrollTop=scroll;
  const count=$('supplierQuestVisibleCount');if(count)count.textContent=stage.kind==='data'?'':sqVisibleRows(rows).length+' of '+rows.length+' visible';
}
function supplierQuestRender(task,response){
  supplierQuestApplyServer(task,response);
  const key=supplierQuestStage(),stage=supplierQuestCurrentStageDef(),rows=supplierQuestStageRows(task,key);
  supplierQuestRestoreStageDraft(task,key,rows);SupplierQuestUI.closeWarning=false;
  let d=$('supplierTaskDialog');if(!d){d=document.createElement('dialog');d.id='supplierTaskDialog';document.body.append(d);}
  const wasOpen=d.open;d.className='sq82';d.setAttribute('aria-labelledby','supplierQuestTitle');d.setAttribute('aria-modal','true');
  const b=supplierQuestBlockingRows(task).length,a=supplierQuestAttentionRows(task).length,stale=SupplierQuestUI.staleStages.has(key);
  const stageTitles={data:'Data Review',lt10:'Batch 1 \u00b7 Below 10%', '10_50':'Batch 2 \u00b7 10% to 50%','50_100':'Batch 3 \u00b7 50% to 100%','100_150':'Batch 4 \u00b7 100% to 150%','150_200':'Batch 5 \u00b7 150% to 200%','200_300':'Branch Reallocation \u00b7 200% to 300%',gt300:'Risk Decisions \u00b7 Above 300%',summary:'Final Review'};
  const helper=stage.kind==='data'?'Complete blocking fields; attention items stay visible for follow-up.':stage.kind==='purchase'?'Choose products for this batch. No selection means no purchase is required.':stage.kind==='reallocation'?'Select products for the Warehouse list. This does not move stock.':stage.kind==='decision'?'Choose each decision. Suggestions are based on profitability, not task completion.':'Review each output before finishing. Nothing is sent to another department automatically.';
  const toolbar=stage.kind==='summary'?'':'<div class="sq-tools"><label class="sq-search"><span class="screen-reader">Search products by name or code</span><input type="search" id="supplierQuestSearch" placeholder="Search product or code" value="'+esc(SupplierQuestUI.query)+'"></label>'+(stage.kind==='data'?'<div class="sq-segment">'+sqButton('','Open ('+(a+b)+')',SupplierQuestUI.dataView==='open'?'active':'','data-data-view="open"')+sqButton('','Resolved ('+sqDataRows(task).filter(r=>!r.needs_review&&!r.blocking_review).length+')',SupplierQuestUI.dataView==='resolved'?'active':'','data-data-view="resolved"')+'</div>':['purchase','reallocation'].includes(stage.kind)?'<label class="sq-toggle"><input type="checkbox" id="supplierQuestSelectedOnly" '+(SupplierQuestUI.selectedOnly?'checked':'')+'> Selected only</label>'+sqButton('supplierQuestClear','Clear Selection','sq-link'):'')+'<small id="supplierQuestVisibleCount" class="sq-muted"></small></div>';
  d.innerHTML='<div class="sq-shell"><header class="sq-header"><div class="sq-heading"><span class="sq-eyebrow">SUPPLIER QUEST</span><div class="sq-title-row"><h2 id="supplierQuestTitle" tabindex="-1"><bdi>'+esc(supplierQuestSupplier(task))+'</bdi></h2><span class="sq-chip '+(sqSubmitted()?'warning':'neutral')+'">'+(sqSubmitted()?'Pending inventory verification':'Review in progress')+'</span></div></div><div class="sq-header-actions">'+sqButton('supplierQuestDetails','Details','sq-link','aria-expanded="false"')+sqButton('supplierTaskCloseX','\u00d7','sq-close','aria-label="Close supplier review"')+'</div></header>'+supplierQuestStageStepHtml(key)+'<section class="sq-stage"><div class="sq-stage-title"><div><h3>'+esc(stageTitles[key])+'</h3><p>'+esc(helper)+'</p></div><span class="sq-chip neutral">'+(stage.kind==='summary'?'5 output lists':stage.kind==='data'?b+' blocking \u00b7 '+a+' attention':rows.length+' products')+'</span></div>'+toolbar+'</section><div class="sq-messages" id="supplierQuestMessages"></div><div class="sq-content" id="supplierQuestContent">'+sqContentHtml(task,stage,rows)+'</div><footer class="sq-footer"><div class="sq-footer-status"><span id="supplierQuestSaveStatus" class="sq-save-status" role="status" aria-live="polite"></span><span id="supplierQuestTotals"></span></div><div class="sq-footer-actions">'+sqButton('supplierQuestPrevious','Previous','sq-secondary',key==='data'||sqSubmitted()?'disabled':'')+sqButton(stage.kind==='summary'?'supplierQuestPrintBo':'supplierQuestPrint',stage.kind==='summary'?'Print Supplier BO':stage.kind==='data'?'Print Data Review':stage.kind==='decision'?'Print Decisions':'Print Selected','sq-secondary')+sqButton('supplierQuestPrimary',supplierQuestPrimaryLabel(stage,rows),'sq-primary')+'</div></footer></div>';
  function paintMessages(){
    const box=$('supplierQuestMessages');box.innerHTML=(SupplierQuestUI.details?'<div class="sq-details"><span>Inventory: '+esc(sqDate(state.upload?.uploaded_at))+'</span><span>Master revision: '+esc(SupplierQuestUI.masterRevision)+'</span><span>Confirmed stages: '+SupplierQuestModel.STAGES.filter(s=>s.kind!=='summary'&&supplierQuestStageData(s.key).saved_at).length+' / 8</span></div>':'')+(SupplierQuestUI.error?'<div class="sq-notice danger" role="alert">'+esc(SupplierQuestUI.error)+sqButton('supplierQuestRetry','Refresh Data','sq-link')+'</div>':'')+(stale||key==='summary'&&SupplierQuestUI.staleStages.size?'<div class="sq-notice warning"><span>'+(key==='summary'?'Changed stages need review: '+esc([...SupplierQuestUI.staleStages].join(', ')):'This stage has updated data. Your choices are preserved.')+'</span>'+(key!=='summary'?sqButton('supplierQuestChanges',SupplierQuestUI.showChanges?'Hide Changes':'View Changes','sq-link','aria-expanded="'+SupplierQuestUI.showChanges+'"'):'')+'</div>':'')+(stale&&SupplierQuestUI.showChanges?sqChangesHtml():'');
    const changes=$('supplierQuestChanges');if(changes)changes.onclick=()=>{SupplierQuestUI.showChanges=!SupplierQuestUI.showChanges;paintMessages();};
    const retry=$('supplierQuestRetry');if(retry)retry.onclick=()=>refreshSupplierQuest(task.task_key);
  }
  paintMessages();sqBindContent();sqPaintControls();
  $('supplierTaskCloseX').onclick=sqRequestClose;d.oncancel=e=>{e.preventDefault();sqRequestClose();};d.onclick=e=>{if(e.target===d)sqRequestClose();};
  // A queued close from the previous opening must not cancel the reopened dialog's save.
  d.onclose=()=>{if(d.open)return;document.body.classList.remove('sq-modal-open');SupplierQuestUI.request++;SupplierQuestUI.returnFocus?.focus?.();sqUpdateTaskButtons();};
  $('supplierQuestDetails').onclick=e=>{SupplierQuestUI.details=!SupplierQuestUI.details;e.currentTarget.setAttribute('aria-expanded',String(SupplierQuestUI.details));paintMessages();};
  for(const step of d.querySelectorAll('[data-quest-stage]'))step.onclick=()=>sqNavigate(step.dataset.questStage);
  const search=$('supplierQuestSearch');if(search)search.oninput=()=>{SupplierQuestUI.query=search.value;sqStoreDraft();sqUpdateContent();};
  const selected=$('supplierQuestSelectedOnly');if(selected)selected.onchange=()=>{SupplierQuestUI.selectedOnly=selected.checked;sqStoreDraft();sqUpdateContent();};
  const clear=$('supplierQuestClear');if(clear)clear.onclick=()=>{SupplierQuestUI.selected.clear();SupplierQuestUI.noAction=false;sqStoreDraft();sqUpdateContent();};
  for(const tab of d.querySelectorAll('[data-data-view]'))tab.onclick=()=>{SupplierQuestUI.dataView=tab.dataset.dataView;for(const x of d.querySelectorAll('[data-data-view]'))x.classList.toggle('active',x===tab);sqUpdateContent();};
  $('supplierQuestPrevious').onclick=()=>sqNavigate(SupplierQuestModel.STAGES[SupplierQuestModel.stageIndex(key)-1]?.key);
  const print=$('supplierQuestPrint');if(print)print.onclick=()=>supplierQuestPrintStage(task,key);
  const printBo=$('supplierQuestPrintBo');if(printBo)printBo.onclick=()=>supplierQuestPrintBo(task);
  $('supplierQuestPrimary').onclick=()=>sqSaveStage();
  document.body.classList.add('sq-modal-open');if(!wasOpen)d.showModal();
  $('supplierQuestTitle').focus({preventScroll:true});
  const draft=SupplierQuestUI.drafts.get(sqStageKey(task,key));if(draft)$('supplierQuestContent').scrollTop=draft.scroll||0;
  sqUpdateContentCount();sqUpdateTaskButtons();return {dialog:d};
}
function sqUpdateContentCount(){const el=$('supplierQuestVisibleCount');if(el)el.textContent=supplierQuestStage()==='data'?'':sqVisibleRows(supplierQuestStageRows(SupplierQuestUI.task,supplierQuestStage())).length+' visible';}
function sqRequestClose(){
  if(SupplierQuestUI.busy)return;sqStoreDraft();const d=$('supplierTaskDialog');if(!sqDirty()){d.close();return;}
  let warning=$('supplierQuestLeaveWarning');if(warning)return;
  warning=document.createElement('div');warning.id='supplierQuestLeaveWarning';warning.className='sq-leave-warning';warning.setAttribute('role','alert');
  warning.innerHTML='<div><strong>Unconfirmed changes</strong><p>Your selections are kept in this tab, but are not confirmed on the server. Reloading or signing out will discard them.</p><div>'+sqButton('supplierQuestKeepEditing','Keep Reviewing','sq-primary')+sqButton('supplierQuestLeave','Leave Review','sq-secondary')+'</div></div>';d.append(warning);
  $('supplierQuestKeepEditing').onclick=()=>{warning.remove();$('supplierTaskCloseX').focus();};$('supplierQuestLeave').onclick=()=>d.close();$('supplierQuestKeepEditing').focus();
}
async function sqBusyOperation(work){
  if(SupplierQuestUI.busy)return;SupplierQuestUI.busy=true;SupplierQuestUI.error='';const ticket=++SupplierQuestUI.request,user=state.session?.user?.id;
  const d=$('supplierTaskDialog');if(d){d.setAttribute('aria-busy','true');for(const el of d.querySelectorAll('button,input,select'))el.disabled=true;sqPaintControls();}
  try{const response=await work();if(ticket!==SupplierQuestUI.request||user!==state.session?.user?.id)return;SupplierQuestUI.busy=false;if(response)supplierQuestRender(response.task||SupplierQuestUI.task,response.response||response);}
  catch(e){if(ticket!==SupplierQuestUI.request)return;SupplierQuestUI.busy=false;SupplierQuestUI.error=e.message||'Could not save. Please try again.';const task=SupplierQuestUI.task;if(task&&SupplierQuestUI.quest)supplierQuestRender(task,{quest:SupplierQuestUI.quest,master_revision:SupplierQuestUI.masterRevision,stale_stages:[...SupplierQuestUI.staleStages]});}
  finally{SupplierQuestUI.busy=false;d?.removeAttribute('aria-busy');}
}
async function sqNavigate(key){
  if(!key||key===supplierQuestStage()||sqSubmitted())return;sqStoreDraft();SupplierQuestUI.showChanges=false;
  return sqBusyOperation(()=>supplierQuestRpc(SupplierQuestUI.task,{action:'goto_stage',stage:key}));
}
function sqSourceFingerprint(rows,key){
  const scoped=rows.filter(r=>key==='data'?r.needs_review||r.blocking_review:SupplierQuestModel.stageForRatio(r.stock_ratio)===key);
  return JSON.stringify(scoped.map(r=>key==='data'?[r.product_code,r.purchase_unit,r.needs_review,r.blocking_review,r.review_reason]:key==='200_300'?[r.product_code,r.purchase_unit,r.stock_ratio,r.profitability_class,r.total_value]:key==='gt300'?[r.product_code,r.purchase_unit,r.stock_ratio,r.profitability_class,r.purchase_price,r.total_value]:[r.product_code,r.purchase_unit,r.stock_ratio,r.profitability_class,r.purchase_price,r.min_order_qty,r.max_order_qty]).sort(([a],[b])=>String(a).localeCompare(String(b))));
}
async function sqSaveStage(){
  const task=SupplierQuestUI.task,stage=supplierQuestCurrentStageDef(),rows=supplierQuestStageRows(task,stage.key);
  if(!supplierQuestCanContinue(task,stage,rows))return;
  sqStoreDraft();const codes=[...SupplierQuestUI.selected],decisions={...SupplierQuestUI.decisions},source=SupplierQuestUI.sourceRows,upload=SupplierQuestUI.sourceUpload,revision=SupplierQuestUI.masterRevision;
  return sqBusyOperation(async()=>{
    // Refresh before confirmation, but never turn a source refresh into a saved action.
    const v=await rpc('purchasing_workspace_revision_v47');
    if(v.upload_id!==upload)throw Error('Inventory changed. Return to current tasks to start the new cycle.');
    if(v.master_revision!==state.revision||v.master_revision!==revision){
      await loadLive();const current=sqActiveTask(task);if(!current)throw Error('This task changed. Return to the current task list.');
      const response=await supplierQuestState(current);supplierQuestApplyServer(current,response);
      if(stage.kind!=='summary'&&sqSourceFingerprint(source,stage.key)!==sqSourceFingerprint(supplierQuestRows(current),stage.key))throw Error('Product data changed while this stage was open. Review the refreshed rows, then confirm again.');
      if(stage.kind==='summary'&&response.stale_stages?.length)throw Error('Some stages changed. Review the highlighted stages before finishing.');
    }
    const payload=stage.kind==='summary'?{action:'finish'}:stage.kind==='decision'?{action:'save_stage',stage:stage.key,decisions}:stage.kind==='data'?{action:'save_stage',stage:stage.key}:{action:'save_stage',stage:stage.key,codes,no_action:codes.length===0};
    const response=await supplierQuestRpc(task,payload);
    SupplierQuestUI.drafts.delete(sqStageKey(task,stage.key));SupplierQuestUI.saved=true;SupplierQuestUI.showChanges=false;
    if(stage.kind==='summary'){for(const s of SupplierQuestModel.STAGES)SupplierQuestUI.drafts.delete(sqStageKey(task,s.key));void supplierQuestLoadOutputs(true);}
    return response;
  });
}
async function refreshSupplierQuest(taskKey){
  if(state.mode!=='live'||!$('supplierTaskDialog')?.open||SupplierQuestUI.busy)return;sqStoreDraft();
  return sqBusyOperation(async()=>{const v=await rpc('purchasing_workspace_revision_v47');if(v.master_revision!==state.revision||v.upload_id!==state.upload?.id)await loadLive();const task=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===taskKey&&t.status==='open');if(!task)throw Error('This task changed. Return to the current task list.');return {task,response:await supplierQuestState(task)};});
}
window.renderSupplierTaskPopup=supplierQuestRender;
window.openSupplierTaskPopup=async function(task){
  if(SupplierQuestUI.busy)return;
  SupplierQuestUI.busy=true;SupplierQuestUI.returnFocus=document.activeElement;
  SupplierQuestUI.error='';SupplierQuestUI.showChanges=false;SupplierQuestUI.details=false;SupplierQuestUI.dataView='open';SupplierQuestUI.summaryTab='supplier_bo';
  const user=state.session?.user?.id;
  try{
    const v=await rpc('purchasing_workspace_revision_v47');
    if(v.master_revision!==state.revision||v.upload_id!==state.upload?.id)await loadLive();
    const current=sqActiveTask(task);if(!current)throw Error('This task changed. Use the current task list.');
    const res=await supplierQuestState(current);if(state.session?.user?.id!==user)return;
    SupplierQuestUI.busy=false;return supplierQuestRender(current,res);
  }finally{SupplierQuestUI.busy=false;}
};
window.ta16OpenTask=async function(task){
  const trigger=document.activeElement,label=trigger?.textContent;
  try{if(trigger?.matches('button')){trigger.disabled=true;trigger.textContent='Opening...';}
    if(task.focus==='suppliers'){await window.openSupplierTaskPopup(task);return;}
    if(state.mode==='live')await loadLive();const refreshed=sqActiveTask(task);if(!refreshed)throw Error('This task changed. Use the current task list.');ta16OpenCodes(refreshed.codes||[]);state.dailyFocus.task_key=refreshed.task_key;
  }catch(e){toast('Task could not be opened: '+e.message);}
  finally{if(trigger?.matches('button')){trigger.disabled=false;trigger.textContent=label;}sqUpdateTaskButtons();}
};

/* One print document path for the final review and every saved BO output. */
function sqPrintDocument(title,subtitle,body){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#17284a;margin:0}h1{font-size:18pt;margin:0 0 5px}p{color:#59667b;margin:0 0 16px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th,td{padding:7px;border-bottom:1px solid #dce2eb;text-align:left;overflow-wrap:anywhere}th{background:#f0f3f8;font-size:9pt}th:first-child{width:48%}.num{text-align:right;font-variant-numeric:tabular-nums}.sq-batch th{background:#e9edf5;padding-top:12px}.sq-batch small{font-weight:normal;margin-left:10px}.sq-batch div{display:block}.sq-muted,small{color:#59667b}.sq-product small{display:block;margin-top:3px}.sq-btn{display:none}</style></head><body><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p>'+body+'</body></html>';
}
function sqOpenPrint(html){const w=window.open('','_blank','width=1000,height=800');if(!w){toast('Please allow pop-ups to open the print preview.');return;}w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{if(!w.closed){w.focus();w.print();}},150);}
function supplierQuestPrintWindow(title,subtitle,headers,rows){if(!rows.length){toast('No products selected to print.');return;}return sqOpenPrint(sqPrintDocument(title,subtitle,'<table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(c=>'<tr>'+c.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table>'));}
function supplierQuestPrintStage(task,key){
  const stage=SupplierQuestModel.STAGES.find(s=>s.key===key);let rows=supplierQuestStageRows(task,key);
  if(['purchase','reallocation'].includes(stage.kind))rows=rows.filter(r=>SupplierQuestUI.selected.has(r.product_code));
  if(!rows.length){toast('No products selected to print.');return;}
  if(key==='data')return supplierQuestPrintWindow(supplierQuestSupplier(task)+' - Data Review','Data issues to review',['Product','Unit','Required information'],rows.map(r=>[esc(r.product_name),esc(r.purchase_unit),esc(supplierQuestReviewHint(r))]));
  if(key==='200_300')return sqOpenPrint(sqPrintDocument(supplierQuestSupplier(task)+' - Branch Reallocation','Prepared for Warehouse - selected products',sqListTable('branch_reallocation',rows.map(r=>({product_code:r.product_code,product_name:r.product_name,unit:r.purchase_unit,stock_pct:r.stock_ratio,rating:r.profitability_class,stock_value:r.total_value})))));
  if(key==='gt300')return supplierQuestPrintWindow(supplierQuestSupplier(task)+' - Risk Decisions','Decision review - no stock movement recorded',['Product','Unit','Decision'],rows.map(r=>[esc(r.product_name),esc(r.purchase_unit),esc(SupplierQuestModel.decisionLabel(SupplierQuestUI.decisions[r.product_code]))]));
  return supplierQuestPrintWindow(supplierQuestSupplier(task)+' - Purchase Review','Selected products',['Product','Unit','Price (SAR)','Min Order','Max Order'],rows.map(r=>[esc(r.product_name),esc(r.purchase_unit),sqNumber(r.purchase_price,2),sqNumber(r.min_order_qty,4),sqNumber(r.max_order_qty,4)]));
}
function supplierQuestPrintBo(task){return sqOpenPrint(sqPrintDocument(supplierQuestSupplier(task)+' - Supplier BO','Recommended staged ordering',sqBoTable(supplierQuestBoRows(task))));}
function supplierQuestOutputItems(o){return o.output_type==='supplier_bo'?(o.payload?.batches||[]).flatMap(b=>(b.items||[]).map(x=>({...x,batch:b.batch}))):o.payload?.items||[];}
function sqOutputBatches(o){return (o.payload?.batches||[]).map(b=>({batch:b.batch,noAction:b.no_action,rows:(b.items||[]).map(x=>({product_code:x.product_code,product_name:x.product_name,purchase_unit:x.unit,min_order_qty:x.min_order,max_order_qty:x.max_order}))}));}
function supplierQuestOutputTitle(type){return SQ_OUTPUTS.find(x=>x[0]===type)?.[1]||type;}
function supplierQuestOutputOwner(type){return SQ_OUTPUTS.find(x=>x[0]===type)?.[2]||'';}
function sqOutputBody(o){return o.output_type==='supplier_bo'?sqBoTable(sqOutputBatches(o)):sqListTable(o.output_type,supplierQuestOutputItems(o));}
function sqOutputPrint(o){return sqOpenPrint(sqPrintDocument(o.supplier+' - '+supplierQuestOutputTitle(o.output_type),o.output_type==='supplier_bo'?'Recommended staged ordering':'Prepared for '+supplierQuestOutputOwner(o.output_type)+' - '+sqDate(o.created_at),sqOutputBody(o)));}
function sqViewOutput(o){
  let d=$('supplierQuestOutputDialog');if(!d){d=document.createElement('dialog');d.id='supplierQuestOutputDialog';document.body.append(d);}d.className='sq82 sq-output-dialog';d.setAttribute('aria-labelledby','supplierQuestOutputTitle');
  const trigger=document.activeElement;d.innerHTML='<div class="sq-output-shell"><header class="sq-header"><div><span class="sq-eyebrow">'+esc(supplierQuestOutputTitle(o.output_type))+'</span><h2 id="supplierQuestOutputTitle" tabindex="-1"><bdi>'+esc(o.supplier)+'</bdi></h2><p class="sq-muted">Prepared for '+esc(supplierQuestOutputOwner(o.output_type))+' \u00b7 '+esc(sqDate(o.created_at))+'</p></div>'+sqButton('sqOutputClose','\u00d7','sq-close','aria-label="Close list"')+'</header><div class="sq-content">'+sqOutputBody(o)+'</div><footer class="sq-footer"><span>Saved review output. Not a sent order or completed task.</span>'+sqButton('sqOutputPrint',o.output_type==='supplier_bo'?'Print Supplier BO':'Print List','sq-primary')+'</footer></div>';
  $('sqOutputClose').onclick=()=>d.close();$('sqOutputPrint').onclick=()=>sqOutputPrint(o);d.onclose=()=>{document.body.classList.remove('sq-modal-open');trigger?.focus();};document.body.classList.add('sq-modal-open');d.showModal();$('supplierQuestOutputTitle').focus();
}
function supplierQuestEnsureOutputsPanel(){
  const board=$('tasksPriorityList');if(!board)return null;let panel=$('supplierQuestOutputs');if(!panel){panel=document.createElement('section');panel.id='supplierQuestOutputs';panel.className='sq82-outputs';board.insertAdjacentElement('afterend',panel);}
  if(!$('supplierQuestPageTabs')){const tabs=document.createElement('div');tabs.id='supplierQuestPageTabs';tabs.className='sq-page-tabs';tabs.innerHTML=sqButton('sqCurrentTasks','Current Tasks','active')+sqButton('sqReviewOutputs','Review Outputs');board.insertAdjacentElement('beforebegin',tabs);$('sqCurrentTasks').onclick=()=>{SupplierQuestUI.pageTab='tasks';sqPaintPageTabs();};$('sqReviewOutputs').onclick=()=>{SupplierQuestUI.pageTab='outputs';sqPaintPageTabs();void supplierQuestLoadOutputs();};}
  sqPaintPageTabs();return panel;
}
function sqPaintPageTabs(){const isOutputs=SupplierQuestUI.pageTab==='outputs';$('tasksPriorityList')?.classList.toggle('hidden',isOutputs);$('supplierQuestOutputs')?.classList.toggle('hidden',!isOutputs);$('sqCurrentTasks')?.classList.toggle('active',!isOutputs);$('sqReviewOutputs')?.classList.toggle('active',isOutputs);}
function sqUpdateTaskButtons(){
  const task=SupplierQuestUI.task;if(!task)return;
  const button=[...document.querySelectorAll('.tasks-open-task')].find(x=>x.dataset.taskId===String(task.id));
  if(button){button.textContent=sqSubmitted()?'View Review':'Resume Review';button.setAttribute('aria-label',button.textContent+' - '+supplierQuestSupplier(task));}
}
function supplierQuestRenderOutputs(outputs){
  const panel=supplierQuestEnsureOutputsPanel();if(!panel)return;const counts=Object.fromEntries(SQ_OUTPUTS.map(([k])=>[k,outputs.filter(o=>o.output_type===k&&supplierQuestOutputItems(o).length).length]));
  panel.innerHTML='<div class="sq-output-header"><div><span class="sq-eyebrow">SAVED SUPPLIER REVIEWS</span><h3>Review Outputs</h3><p>Prepared lists for each department. These have not been sent automatically.</p></div>'+sqButton('refreshQuestOutputs','Refresh Lists','sq-secondary')+'</div><div class="sq-tabs">'+SQ_OUTPUTS.map(([k,t])=>sqButton('',esc(t)+' <b>'+counts[k]+'</b>',k===SupplierQuestUI.outputType?'active':'','data-output-type="'+k+'"')).join('')+'</div><div class="sq-output-filters"><label>Supplier or product<input id="sqOutputSearch" type="search" placeholder="Search saved lists" value="'+esc(SupplierQuestUI.outputQuery)+'"></label><label>From<input id="sqOutputFrom" type="date" value="'+esc(SupplierQuestUI.outputFrom)+'"></label><label>To<input id="sqOutputTo" type="date" value="'+esc(SupplierQuestUI.outputTo)+'"></label>'+sqButton('sqOutputClear','Clear Filters','sq-link')+'</div><div id="sqOutputResults"></div>';
  const render=()=>{
    const q=SupplierQuestUI.outputQuery.toLocaleLowerCase(),from=SupplierQuestUI.outputFrom,to=SupplierQuestUI.outputTo;
    const list=outputs.filter(o=>{const items=supplierQuestOutputItems(o),date=String(o.created_at||'').slice(0,10);return o.output_type===SupplierQuestUI.outputType&&items.length&&(!from||date>=from)&&(!to||date<=to)&&(!q||[o.supplier,...items.flatMap(x=>[x.product_name,x.product_code])].some(s=>String(s||'').toLocaleLowerCase().includes(q)));});
    $('sqOutputResults').innerHTML=list.length?'<div class="sq-output-grid">'+list.map((o,i)=>'<article class="sq-output-card"><small>Prepared for '+esc(supplierQuestOutputOwner(o.output_type))+'</small><h4><bdi>'+esc(o.supplier)+'</bdi></h4><p>'+supplierQuestOutputItems(o).length+' products \u00b7 '+esc(sqDate(o.created_at))+'</p><div>'+sqButton('','View List','sq-primary','data-view-output="'+i+'"')+sqButton('',o.output_type==='supplier_bo'?'Print BO':'Print List','sq-secondary','data-print-output="'+i+'"')+'</div></article>').join('')+'</div>':sqEmpty('No saved lists match this view. Finish a supplier review to prepare its outputs.');
    for(const b of panel.querySelectorAll('[data-view-output]'))b.onclick=()=>sqViewOutput(list[Number(b.dataset.viewOutput)]);
    for(const b of panel.querySelectorAll('[data-print-output]'))b.onclick=()=>sqOutputPrint(list[Number(b.dataset.printOutput)]);
  };
  for(const b of panel.querySelectorAll('[data-output-type]'))b.onclick=()=>{SupplierQuestUI.outputType=b.dataset.outputType;supplierQuestRenderOutputs(outputs);};
  for(const [id,key] of [['sqOutputSearch','outputQuery'],['sqOutputFrom','outputFrom'],['sqOutputTo','outputTo']])$(id).oninput=e=>{SupplierQuestUI[key]=e.target.value;render();};
  $('sqOutputClear').onclick=()=>{SupplierQuestUI.outputQuery='';SupplierQuestUI.outputFrom='';SupplierQuestUI.outputTo='';supplierQuestRenderOutputs(outputs);};
  $('refreshQuestOutputs').onclick=()=>supplierQuestLoadOutputs();render();
}
async function supplierQuestLoadOutputs(force=false){
  if(state.mode!=='live')return;if(SupplierQuestUI.outputLoading){await SupplierQuestUI.outputLoading;if(!force)return;}
  const user=state.session?.user?.id;
  SupplierQuestUI.outputLoading=(async()=>{try{const r=await rpc('purchasing_supplier_quest_outputs_v80');if(state.session?.user?.id!==user)return;SupplierQuestUI.outputs=Array.isArray(r?.outputs)?r.outputs:[];supplierQuestRenderOutputs(SupplierQuestUI.outputs);}
  catch(e){const panel=supplierQuestEnsureOutputsPanel();if(panel){panel.innerHTML='<div class="sq-notice danger" role="alert">Lists could not be loaded: '+esc(e.message)+'</div>'+sqButton('sqOutputRetry','Retry','sq-secondary');$('sqOutputRetry').onclick=()=>supplierQuestLoadOutputs();}}
  finally{SupplierQuestUI.outputLoading=null;}})();return SupplierQuestUI.outputLoading;
}
addEventListener('beforeunload',e=>{if(sqDirty()){e.preventDefault();e.returnValue='';}});
addEventListener('load',()=>{
  $('detailDialog')?.addEventListener('close',()=>{document.querySelectorAll('.sq-field-highlight').forEach(x=>x.classList.remove('sq-field-highlight'));if($('supplierTaskDialog')?.open&&SupplierQuestUI.taskKey)void refreshSupplierQuest(SupplierQuestUI.taskKey);});
  $('logoutBtn')?.addEventListener('click',()=>{SupplierQuestUI.drafts.clear();SupplierQuestUI.outputs=[];SupplierQuestUI.task=null;SupplierQuestUI.quest=null;SupplierQuestUI.sourceRows=[];SupplierQuestUI.selected.clear();SupplierQuestUI.decisions={};SupplierQuestUI.user=null;SupplierQuestUI.request++;$('supplierTaskDialog')?.close();$('supplierQuestOutputDialog')?.close();$('supplierQuestOutputs')?.replaceChildren();},true);
  if(typeof renderTasksAssistant==='function'&&!renderTasksAssistant.__quest82){const base=renderTasksAssistant;window.renderTasksAssistant=function(...args){const result=base.apply(this,args);supplierQuestEnsureOutputsPanel();sqUpdateTaskButtons();return result;};window.renderTasksAssistant.__quest82=true;}
  supplierQuestEnsureOutputsPanel();
});
