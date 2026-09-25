/* Build 78: supplier task decision workspace. UI filters/actions only; task completion remains stock-verified. */
'use strict';

const SupplierTaskUI={
  taskKey:null,severity:'all',rating:'all',minValue:'',maxValue:'',
  zeroOnly:false,reviewOnly:false,sort:'priority',selected:new Set(),actionState:null
};
function supplierTaskReset(task,selectedCodes){
  if(SupplierTaskUI.taskKey!==task?.task_key){
    Object.assign(SupplierTaskUI,{taskKey:task?.task_key||null,severity:'all',rating:'all',minValue:'',maxValue:'',zeroOnly:false,reviewOnly:false,sort:'priority',selected:new Set(),actionState:null});
  }
  if(selectedCodes instanceof Set) SupplierTaskUI.selected=new Set(selectedCodes);
}
function supplierTaskVisibleRows(baseRows){
  const min=String(SupplierTaskUI.minValue||'').trim()===''?null:Number(SupplierTaskUI.minValue);
  const max=String(SupplierTaskUI.maxValue||'').trim()===''?null:Number(SupplierTaskUI.maxValue);
  const out=baseRows.filter(r=>{
    const ratio=C.finite(r.stock_ratio)?Number(r.stock_ratio):null;
    const zero=C.finite(r.stock_qty)&&Math.abs(Number(r.stock_qty))<1e-12;
    if(SupplierTaskUI.severity==='critical'&&!(ratio!==null&&ratio<10))return false;
    if(SupplierTaskUI.severity==='low'&&!(ratio!==null&&ratio>=10&&ratio<50))return false;
    if(SupplierTaskUI.rating!=='all'&&C.profitLabel(r.profitability_class)!==SupplierTaskUI.rating)return false;
    if(SupplierTaskUI.zeroOnly&&!zero)return false;
    if(SupplierTaskUI.reviewOnly&&!r.needs_review)return false;
    if((Number.isFinite(min)||Number.isFinite(max))&&!C.finite(r.shortage_value))return false;
    if(Number.isFinite(min)&&Number(r.shortage_value)<min)return false;
    if(Number.isFinite(max)&&Number(r.shortage_value)>max)return false;
    return true;
  });
  if(SupplierTaskUI.sort==='shortage_value_desc')return out.sort((a,b)=>Number(b.shortage_value||0)-Number(a.shortage_value||0)||(b.priority_score||0)-(a.priority_score||0)||String(a.product_name||'').localeCompare(String(b.product_name||'')));
  return out.sort((a,b)=>(b.priority_score||0)-(a.priority_score||0)||(b.shortage_value||0)-(a.shortage_value||0)||(C.finite(a.stock_ratio)?a.stock_ratio:Infinity)-(C.finite(b.stock_ratio)?b.stock_ratio:Infinity)||String(a.product_name||'').localeCompare(String(b.product_name||'')));
}
async function supplierTaskActionState(task){
  if(state.mode!=='live'||!task?.id)return null;
  try{return await rpc('purchasing_supplier_action_v78',{payload:{action:'state',task_id:task.id}});}
  catch(e){return null;}
}
async function recordSupplierTaskAction(task,codes){
  if(state.mode!=='live'||!task?.id){toast('Supplier action recording is available in Live mode.');return null;}
  if(!codes.length){toast('Select at least one product first.');return null;}
  try{
    const saved=await rpc('purchasing_supplier_action_v78',{payload:{action:'record',task_id:task.id,codes}});
    toast('Supplier action recorded. Verification will follow a later inventory upload.');
    return saved;
  }catch(e){toast('Supplier action was not recorded: '+e.message);return null;}
}
function supplierTaskFilterValue(input){
  const raw=input.value.trim();
  return raw===''?'':String(Math.max(0,Number(raw)||0));
}
function supplierTaskSelectedRows(baseRows){
  return baseRows.filter(r=>SupplierTaskUI.selected.has(r.product_code));
}
function supplierTaskStatusHtml(action){
  if(!action?.recorded)return '';
  const at=action.recorded_at?new Date(action.recorded_at).toLocaleString():'Recorded';
  return '<span class="supplier-task-status" title="Action recorded; stock verification is still required.">Pending verification · '+esc(at)+'</span>';
}
function renderSupplierTaskPopupV78(task,selectedCodes,actionState){
  supplierTaskReset(task,selectedCodes);
  if(actionState!==undefined)SupplierTaskUI.actionState=actionState;
  const baseRows=supplierTaskRows(task),valid=new Set(baseRows.map(r=>r.product_code));
  SupplierTaskUI.selected=new Set([...SupplierTaskUI.selected].filter(code=>valid.has(code)));
  if(!SupplierTaskUI.selected.size&&!(selectedCodes instanceof Set))for(const r of baseRows.filter(shortageNeedsOrder))SupplierTaskUI.selected.add(r.product_code);
  const rows=supplierTaskVisibleRows(baseRows),supplier=String(task?.target||task?.title||'Supplier').trim();
  const total=baseRows.reduce((sum,r)=>sum+Number(r.shortage_value||0),0);
  const under10=baseRows.filter(r=>C.finite(r.stock_ratio)&&Number(r.stock_ratio)<10).length;
  const reviewCount=baseRows.filter(r=>r.needs_review).length;
  const severityOptions='<option value="all" '+(SupplierTaskUI.severity==='all'?'selected':'')+'>All Stock</option><option value="critical" '+(SupplierTaskUI.severity==='critical'?'selected':'')+'>Critical &lt;10%</option><option value="low" '+(SupplierTaskUI.severity==='low'?'selected':'')+'>Low 10–50%</option>';
  const ratingOptions=['all','Super','High','Medium','Low','Loss','Unclassified'].map(v=>'<option value="'+v+'" '+(SupplierTaskUI.rating===v?'selected':'')+'>'+(v==='all'?'All Rating':v)+'</option>').join('');
  const body=rows.map((r,i)=>'<tr class="'+(r.needs_review?'supplier-task-review-row':'')+'"><td class="supplier-task-select"><input type="checkbox" class="supplier-task-check" data-code="'+esc(r.product_code)+'" aria-label="Select '+esc(r.product_name)+'" '+(SupplierTaskUI.selected.has(r.product_code)?'checked':'')+'></td><td class="supplier-task-rank">'+(i+1)+'</td><td><div class="product-cell"><span class="product-button-wrap"><span class="supplier-task-product" title="'+esc(r.product_name)+'">'+esc(r.product_name)+'</span>'+reviewIndicator(r)+'</span></div></td><td class="unit">'+esc(r.purchase_unit||'—')+'</td><td>'+stockHtml(r)+'</td><td>'+pill(r.stock_ratio)+'</td><td>'+ratingHtml(r.profitability_class)+'</td><td class="money">'+fmt(r.purchase_price,1)+'</td><td class="order">'+fmt(r.min_order_qty,4)+'</td><td class="order">'+fmt(r.max_order_qty,4)+'</td><td class="money">'+fmt(r.shortage_value,0)+'</td></tr>').join('');
  let d=$('supplierTaskDialog');
  if(!d){d=document.createElement('dialog');d.id='supplierTaskDialog';d.className='supplier-task-dialog';document.body.append(d);}
  d.innerHTML='<div class="supplier-task-shell"><header class="supplier-task-head"><div class="supplier-task-title-block"><span class="supplier-task-eyebrow">Supplier Priority</span><div class="supplier-task-title-line"><h2 dir="auto">'+esc(supplier)+'</h2>'+supplierTaskStatusHtml(SupplierTaskUI.actionState)+'</div><p>Prepare the supplier action here. Recording an action does not complete the task; verification comes from a later inventory upload.</p></div><button class="supplier-task-x" id="supplierTaskCloseX" type="button" aria-label="Close">&times;</button></header>'+
  '<div class="supplier-task-summary"><div><span>Products</span><b>'+fmt(baseRows.length,0)+'</b></div><div><span>Shortage Value</span><b>SAR '+fmt(total,0)+'</b></div><div><span>Under 10%</span><b>'+fmt(under10,0)+'</b></div><div><span>Data Review</span><b>'+fmt(reviewCount,0)+'</b></div></div>'+
  '<div class="supplier-task-controls"><label><span>Stock Severity</span><select id="supplierTaskSeverity">'+severityOptions+'</select></label><label><span>Rating</span><select id="supplierTaskRating">'+ratingOptions+'</select></label><label class="supplier-task-value-filter"><span>Shortage Value Range</span><div><input id="supplierTaskValueFrom" type="number" min="0" step="1" inputmode="decimal" placeholder="From" value="'+esc(SupplierTaskUI.minValue)+'"><input id="supplierTaskValueTo" type="number" min="0" step="1" inputmode="decimal" placeholder="To" value="'+esc(SupplierTaskUI.maxValue)+'"></div></label><div class="supplier-task-quick-tags"><button id="supplierTaskZero" class="'+(SupplierTaskUI.zeroOnly?'active':'')+'" type="button" aria-pressed="'+SupplierTaskUI.zeroOnly+'">Zero Stock</button><button id="supplierTaskReview" class="'+(SupplierTaskUI.reviewOnly?'active':'')+'" type="button" aria-pressed="'+SupplierTaskUI.reviewOnly+'">Data Review</button><button id="supplierTaskSortValue" class="'+(SupplierTaskUI.sort==='shortage_value_desc'?'active':'')+'" type="button" aria-pressed="'+(SupplierTaskUI.sort==='shortage_value_desc')+'">Shortage Value ↓</button></div><span class="supplier-task-visible-count">'+fmt(rows.length,0)+' of '+fmt(baseRows.length,0)+'</span></div>'+
  '<div class="supplier-task-table-wrap"><table class="supplier-task-table"><thead><tr><th class="supplier-task-select"><input type="checkbox" id="supplierTaskSelectAll" aria-label="Select all visible"></th><th>#</th><th>Product</th><th>Unit</th><th>Stock / Reorder</th><th>Stock %</th><th>Rating</th><th>Price</th><th>Min Order</th><th>Max Order</th><th>Shortage Value</th></tr></thead><tbody>'+(body||'<tr><td colspan="11" class="supplier-task-empty">No products match the current supplier filters.</td></tr>')+'</tbody></table></div>'+
  '<footer class="supplier-task-footer"><div class="supplier-task-totals"><span><b id="supplierTaskSelectedCount">0</b> Selected / '+fmt(rows.length,0)+'</span><span><b id="supplierTaskSelectedValue">SAR 0</b> Selected Shortage Value</span></div><div class="supplier-task-actions"><button class="btn" id="supplierTaskPrint" type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2 2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"></path></svg> Print Selected</button><button class="btn primary supplier-task-record" id="supplierTaskRecord" type="button">'+(SupplierTaskUI.actionState?.recorded?'Record Another Action':'Record Supplier Action')+'</button><button class="btn" id="supplierTaskBack" type="button">Back to Tasks</button></div></footer></div>';
  const checks=()=>[...d.querySelectorAll('.supplier-task-check')];
  const visibleSelected=()=>rows.filter(r=>SupplierTaskUI.selected.has(r.product_code));
  const updateSelection=()=>{
    const cs=checks(),chosen=supplierTaskSelectedRows(baseRows),visible=visibleSelected(),master=$('supplierTaskSelectAll');
    if(master){master.checked=cs.length>0&&visible.length===cs.length;master.indeterminate=visible.length>0&&visible.length<cs.length;}
    $('supplierTaskSelectedCount').textContent=fmt(chosen.length,0);
    $('supplierTaskSelectedValue').textContent='SAR '+fmt(chosen.reduce((sum,r)=>sum+Number(r.shortage_value||0),0),0);
    $('supplierTaskPrint').disabled=chosen.length===0;$('supplierTaskRecord').disabled=chosen.length===0;
  };
  checks().forEach(x=>x.onchange=()=>{if(x.checked)SupplierTaskUI.selected.add(x.dataset.code);else SupplierTaskUI.selected.delete(x.dataset.code);updateSelection();});
  $('supplierTaskSelectAll').onchange=e=>{for(const r of rows){if(e.target.checked)SupplierTaskUI.selected.add(r.product_code);else SupplierTaskUI.selected.delete(r.product_code);}renderSupplierTaskPopupV78(task,undefined,SupplierTaskUI.actionState);};
  $('supplierTaskSeverity').onchange=e=>{SupplierTaskUI.severity=e.target.value;renderSupplierTaskPopupV78(task,undefined,SupplierTaskUI.actionState);};
  $('supplierTaskRating').onchange=e=>{SupplierTaskUI.rating=e.target.value;renderSupplierTaskPopupV78(task,undefined,SupplierTaskUI.actionState);};
  const from=$('supplierTaskValueFrom'),to=$('supplierTaskValueTo'),applyRange=()=>{SupplierTaskUI.minValue=supplierTaskFilterValue(from);SupplierTaskUI.maxValue=supplierTaskFilterValue(to);renderSupplierTaskPopupV78(task,undefined,SupplierTaskUI.actionState);};
  from.onchange=applyRange;to.onchange=applyRange;from.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyRange();}};to.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyRange();}};
  $('supplierTaskZero').onclick=()=>{SupplierTaskUI.zeroOnly=!SupplierTaskUI.zeroOnly;renderSupplierTaskPopupV78(task,undefined,SupplierTaskUI.actionState);};
  $('supplierTaskReview').onclick=()=>{SupplierTaskUI.reviewOnly=!SupplierTaskUI.reviewOnly;renderSupplierTaskPopupV78(task,undefined,SupplierTaskUI.actionState);};
  $('supplierTaskSortValue').onclick=()=>{SupplierTaskUI.sort=SupplierTaskUI.sort==='shortage_value_desc'?'priority':'shortage_value_desc';renderSupplierTaskPopupV78(task,undefined,SupplierTaskUI.actionState);};
  $('supplierTaskCloseX').onclick=()=>d.close();$('supplierTaskBack').onclick=()=>d.close();
  $('supplierTaskPrint').onclick=()=>supplierTaskPrint(supplierTaskSelectedRows(baseRows),supplier);
  $('supplierTaskRecord').onclick=async()=>{const saved=await recordSupplierTaskAction(task,supplierTaskSelectedRows(baseRows).map(r=>r.product_code));if(saved){SupplierTaskUI.actionState=saved;renderSupplierTaskPopupV78(task,undefined,saved);}};
  d.onclick=e=>{if(e.target===d)d.close();};
  updateSelection();if(!d.open)d.showModal();
  return{dialog:d,selected:new Set(SupplierTaskUI.selected)};
}
window.renderSupplierTaskPopup=renderSupplierTaskPopupV78;
window.openSupplierTaskPopup=function(task){return renderSupplierTaskPopupV78(task);};
window.refreshSupplierTaskPopup=async function(taskKey,selectedCodes){
  if(state.mode!=='live')return;
  try{
    const v=await rpc('purchasing_workspace_revision_v47');
    const changed=v.master_revision!==state.revision||v.upload_id!==state.upload?.id||WORKSPACE_RUNTIME.day!==scoreAsOf()||WORKSPACE_RUNTIME.decisionsDirty;
    if(!changed)return;
    await loadLive();
    const d=$('supplierTaskDialog');if(!d?.open)return;
    const current=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===taskKey&&t.status==='open');
    if(!current){d.close();toast('This supplier task changed after a data update.');return;}
    const action=await supplierTaskActionState(current);
    renderSupplierTaskPopupV78(current,selectedCodes instanceof Set?selectedCodes:new Set(SupplierTaskUI.selected),action);
  }catch(e){}
};
window.ta16OpenTask=async function(task){
  try{
    const current=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open')||task;
    if(current.focus==='suppliers'){
      const action=await supplierTaskActionState(current);
      const view=renderSupplierTaskPopupV78(current,undefined,action);
      void refreshSupplierTaskPopup(current.task_key,view?.selected);
      return;
    }
    if(state.mode==='live')await loadLive();
    const refreshed=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open');
    if(!refreshed){toast('This task changed after a data update. Use the current task list.');return;}
    ta16OpenCodes(refreshed.codes||[]);state.dailyFocus.task_key=refreshed.task_key;
  }catch(e){toast('Task data could not be refreshed. Please try again.');}
};
