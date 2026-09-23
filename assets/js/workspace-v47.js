/* Build 47: one revision-coherent refresh pipeline. Score formula is unchanged. */
'use strict';
const WORKSPACE_RUNTIME = {
  version: 'reactive_v1', pending: false, promise: null, sandbox: false,
  derived: null, day: null, seq: 0, decisionsDirty: false
};
function workspaceDataset(d) {
  const rows=(d.rows||[]).map(r=>({...r}));
  const fields=['stock_qty','reorder_point','stock_ratio','min_order_qty','max_order_qty','factor','raw_quantity','purchase_price','total_value','raw_total_buy','raw_unit_price'];
  for(const r of rows) for(const key of fields) if(r[key]!=null) r[key]=C.number(r[key]);
  return {master:d.master||[],aliases:d.aliases||[],rows,upload:d.upload,revision:d.master_revision,role:d.role};
}
function deriveWorkspace(d) {
  const dataset=workspaceDataset(d), keys=Object.keys(dataset);
  loadShortageStore();
  const saved=Object.fromEntries([...keys,'shortageCycles'].map(k=>[k,state[k]]));
  WORKSPACE_RUNTIME.sandbox=true;
  try {
    Object.assign(state,dataset,{shortageCycles:structuredClone(saved.shortageCycles)});
    const model=boHealthModel(),tasks=buildPriorityTasks(model),event=tasksEventFromSelected(tasks,model);
    const score=Math.round(model.score),level=scoreLevelForScore(score);
    return {dataset,model,tasks,cycles:structuredClone(state.shortageCycles),day:scoreAsOf(),payload:{
      upload_id:dataset.upload?.id||null,master_revision:dataset.revision,
      score,bo_level:level.n,logic_version:WORKSPACE_RUNTIME.version,score_model:'commercial_v3',
      evaluated_on:scoreAsOf(),tasks,event_focus:event.focus,event_title:event.title,event_text:event.text
    }};
  } finally {Object.assign(state,saved);WORKSPACE_RUNTIME.sandbox=false;}
}
function combinedTaskImpact(model,tasks) {
  const stock=new Set(),data=new Set();
  for(const task of tasks) for(const code of task.codes||[]) (task.focus==='data'?data:stock).add(code);
  const after=componentModel(state.rows,{excludeAccepted:true,resolvedCodes:stock,resolvedDataCodes:data,valueScale:model.meta.maxShortageValue});
  return Math.max(0,after.score-model.score);
}
function workspaceVisible() {return state.mode==='live'&&!!state.session&&!$('app').classList.contains('hidden');}
function workspaceEditOpen() {
  return !!document.querySelector('dialog[open], .modal-overlay:not(.hidden)')||!!state.pendingMaster||!!state.pendingInventory;
}
function commitWorkspace(result,data) {
  const changed=state.revision!==result.dataset.revision||state.upload?.id!==result.dataset.upload?.id;
  const selected=new Set(state.selected);
  Object.assign(state,result.dataset,{shortageCycles:result.cycles,taskAssistant:data});
  WORKSPACE_RUNTIME.derived=result;WORKSPACE_RUNTIME.day=result.day;WORKSPACE_RUNTIME.decisionsDirty=false;
  saveShortageStore();
  if(changed){state.pendingInventory=null;state.pendingMaster=null;resetPreviews();}
  if(state.dailyFocus?.task_key) {
    const current=(data.tasks||[]).find(t=>t.task_key===state.dailyFocus.task_key&&t.status==='open');
    state.dailyFocus={kind:'task_selection',task_key:state.dailyFocus.task_key,codes:current?.codes||[]};
  }
  populateSuppliers();applyFilters();
  // A source refresh is not a user filter action: retain still-visible selections.
  state.selected=new Set([...selected].filter(code=>state.filtered.some(r=>r.product_code===code)));
  render();renderTasksAssistant(data,result.model);updateInventoryLock();
  $('masterMaintenance')?.classList.toggle('hidden',state.role!=='admin');
}
async function loadLive() {
  if(state.mode!=='live'||!state.session)return;
  WORKSPACE_RUNTIME.pending=true;
  if(WORKSPACE_RUNTIME.promise)return WORKSPACE_RUNTIME.promise;
  const owner=state.session.user?.id;
  WORKSPACE_RUNTIME.promise=(async()=>{
    state.loading=true;state.taskSyncing=true;
    $('app').setAttribute('aria-busy','true');
    try {
      let conflicts=0;
      while(WORKSPACE_RUNTIME.pending) {
        WORKSPACE_RUNTIME.pending=false;
        const raw=await rpc('purchasing_dashboard_v5');
        if(raw.schema_version!==5||!raw.seed_applied)throw Error('The approved V5 source data is not ready.');
        const result=deriveWorkspace(raw);
        let data;
        try {data=await rpc('purchasing_workspace_sync_v47',{payload:result.payload});}
        catch(e){
          if(/SOURCE_REVISION_CHANGED/.test(e.message)&&conflicts++<3){WORKSPACE_RUNTIME.pending=true;continue;}
          throw e;
        }
        if(data.source&&(data.source.master_revision!==result.dataset.revision||data.source.upload_id!==result.dataset.upload?.id))throw Error('Source acknowledgement does not match the calculation.');
        if(state.session?.user?.id!==owner||state.mode!=='live')return;
        // A newer save queued during this request: do not publish an old result.
        if(WORKSPACE_RUNTIME.pending)continue;
        commitWorkspace(result,data);$('globalError').classList.add('hidden');conflicts=0;
      }
    } catch(e) {
      // Keep the last coherent view; never replace it with a partial recalculation.
      showError('Recalculation not completed: '+e.message);
      throw e;
    } finally {
      state.loading=false;state.taskSyncing=false;
      WORKSPACE_RUNTIME.promise=null;$('app').setAttribute('aria-busy','false');
    }
  })();
  return WORKSPACE_RUNTIME.promise;
}
async function syncTasksAssistant() {
  if(state.mode==='local') {
    const result=deriveWorkspace({schema_version:5,seed_applied:true,master:state.master,rows:state.rows,aliases:state.aliases,upload:state.upload,master_revision:state.revision,role:state.role});
    const old=state.taskAssistant||{};
    const tasks=result.tasks.map(t=>({...t,id:t.task_key,status:'open'}));
    commitWorkspace(result,{...old,tasks});return;
  }
  return loadLive();
}
async function pollWorkspaceRevision() {
  if(!workspaceVisible()||document.hidden||workspaceEditOpen()||WORKSPACE_RUNTIME.promise)return;
  try {
    const v=await rpc('purchasing_workspace_revision_v47');
    if(v.master_revision!==state.revision||v.upload_id!==state.upload?.id||WORKSPACE_RUNTIME.day!==scoreAsOf()||WORKSPACE_RUNTIME.decisionsDirty){
      await loadLive();
    }
  } catch(e){showError('Could not check the latest data: '+e.message);}
}
function notifyWorkspaceDecisionChange() {
  if(WORKSPACE_RUNTIME.sandbox)return;
  WORKSPACE_RUNTIME.decisionsDirty=true;
  // Queue after the existing decision handler finishes; do not turn edits into rewards.
  if(workspaceVisible())queueMicrotask(()=>loadLive().catch(()=>{}));
}
function supplierTaskRows(task){
  const supplier=String(task?.target||'').trim(),maxShortageValue=Math.max(0,...state.rows.map(averageShortageValue));
  return state.rows
    .filter(r=>{
      if(!supplier||r.supplier!==supplier||isScoreExcluded(r.product_code))return false;
      const zero=C.finite(r.stock_qty)&&Math.abs(Number(r.stock_qty))<1e-12;
      return shortageNeedsOrder(r)||Boolean(r.needs_review)||zero;
    })
    .map(r=>({...r,shortage_value:averageShortageValue(r),priority_score:priorityScore(r,maxShortageValue)}))
    .sort((a,b)=>(b.priority_score||0)-(a.priority_score||0)||(b.shortage_value||0)-(a.shortage_value||0)||(C.finite(a.stock_ratio)?a.stock_ratio:Infinity)-(C.finite(b.stock_ratio)?b.stock_ratio:Infinity)||a.product_name.localeCompare(b.product_name));
}
function supplierTaskPrint(rows,supplier){
  if(!rows.length)return;
  const w=window.open('','_blank','width=900,height=760');
  if(!w){toast('Please allow pop-ups to open the print preview.');return;}
  const today=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const body=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.product_name)}</td><td>${esc(r.purchase_unit||'—')}</td><td>${esc(fmt(r.min_order_qty,4))}</td><td>${esc(fmt(r.max_order_qty,4))}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(supplier)} Purchase Request</title><style>@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#17264e;margin:0}h1{font-size:16pt;margin:0 0 2mm}.meta{font-size:8.5pt;color:#64748b;margin-bottom:5mm;display:flex;justify-content:space-between;gap:8mm}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:2.3mm 2mm;border-bottom:.25mm solid #dfe4ec;vertical-align:middle}th{background:#f4f6fa;font-size:7.5pt;text-transform:uppercase;color:#52627d;text-align:right}th:nth-child(1),td:nth-child(1){width:8%;text-align:center}th:nth-child(2),td:nth-child(2){width:46%;text-align:left}th:nth-child(3),td:nth-child(3){width:16%;text-align:left}th:nth-child(4),td:nth-child(4),th:nth-child(5),td:nth-child(5){width:15%;text-align:right;font-weight:700}.foot{margin-top:4mm;font-size:8.5pt;color:#59677f;text-align:right}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h1>${esc(supplier)}</h1><div class="meta"><span>Purchase Request</span><span>${today}</span></div><table><thead><tr><th>#</th><th>Product</th><th>Unit</th><th>Min Order</th><th>Max Order</th></tr></thead><tbody>${body}</tbody></table><div class="foot">${rows.length} selected product${rows.length===1?'':'s'}</div><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}
function renderSupplierTaskPopup(task,selectedCodes){
  const rows=supplierTaskRows(task),supplier=String(task?.target||task?.title||'Supplier').trim(),total=rows.reduce((sum,r)=>sum+Number(r.shortage_value||0),0);
  const selected=selectedCodes instanceof Set?new Set([...selectedCodes].filter(code=>rows.some(r=>r.product_code===code))):new Set(rows.filter(shortageNeedsOrder).map(r=>r.product_code));
  let d=$('supplierTaskDialog');
  if(!d){d=document.createElement('dialog');d.id='supplierTaskDialog';d.className='supplier-task-dialog';document.body.append(d);}
  const body=rows.map((r,i)=>`<tr class="${r.needs_review?'supplier-task-review-row':''}"><td class="supplier-task-select"><input type="checkbox" class="supplier-task-check" data-code="${esc(r.product_code)}" aria-label="Select ${esc(r.product_name)}" ${selected.has(r.product_code)?'checked':''}></td><td class="supplier-task-rank">${i+1}</td><td><div class="product-cell"><span class="product-button-wrap"><span class="supplier-task-product" title="${esc(r.product_name)}">${esc(r.product_name)}</span>${reviewIndicator(r)}</span></div></td><td class="unit">${esc(r.purchase_unit||'—')}</td><td>${stockHtml(r)}</td><td>${pill(r.stock_ratio)}</td><td>${ratingHtml(r.profitability_class)}</td><td class="money">${fmt(r.purchase_price,1)}</td><td class="order">${fmt(r.min_order_qty,4)}</td><td class="order">${fmt(r.max_order_qty,4)}</td><td class="money">${fmt(r.shortage_value,0)}</td><td class="supplier" title="${esc(r.supplier||'Not assigned')}">${esc(r.supplier||'Not assigned')}</td></tr>`).join('');
  d.innerHTML=`<div class="supplier-task-shell"><header class="supplier-task-head"><div><span class="supplier-task-eyebrow">Supplier Priority</span><h2 dir="auto">${esc(supplier)}</h2><p>All current supplier actions: purchase shortages, zero stock and data review. Ordered by the approved BO product priority.</p></div><button class="supplier-task-x" id="supplierTaskCloseX" type="button" aria-label="Close">&times;</button></header><div class="supplier-task-table-wrap"><table class="supplier-task-table"><thead><tr><th class="supplier-task-select"><input type="checkbox" id="supplierTaskSelectAll" aria-label="Select all"></th><th>#</th><th>Product</th><th>Unit</th><th>Stock / Reorder</th><th>Stock %</th><th>Rating</th><th>Price</th><th>Min Order</th><th>Max Order</th><th>Shortage Value</th><th>Supplier</th></tr></thead><tbody>${body||'<tr><td colspan="12" class="supplier-task-empty">No current supplier action products.</td></tr>'}</tbody></table></div><footer class="supplier-task-footer"><div class="supplier-task-totals"><span><b>${fmt(rows.length,0)}</b> Products</span><span><b>SAR ${fmt(total,0)}</b> Total Shortage Value</span><span class="supplier-task-selected"><b id="supplierTaskSelectedCount">0</b> Selected</span></div><div class="supplier-task-actions"><button class="btn" id="supplierTaskPrint" type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"></path></svg> Print Selected</button><button class="btn primary" id="supplierTaskBack" type="button">Back to Tasks</button></div></footer></div>`;
  const checks=()=>[...d.querySelectorAll('.supplier-task-check')],selectedRows=()=>{const set=new Set(checks().filter(x=>x.checked).map(x=>x.dataset.code));return rows.filter(r=>set.has(r.product_code));};
  const updateSelection=()=>{const cs=checks(),n=cs.filter(x=>x.checked).length,all=cs.length>0&&n===cs.length,master=$('supplierTaskSelectAll');if(master){master.checked=all;master.indeterminate=n>0&&!all;}const count=$('supplierTaskSelectedCount');if(count)count.textContent=fmt(n,0);const print=$('supplierTaskPrint');if(print)print.disabled=n===0;};
  checks().forEach(x=>x.onchange=updateSelection);
  const all=$('supplierTaskSelectAll');if(all)all.onchange=()=>{checks().forEach(x=>x.checked=all.checked);updateSelection();};
  $('supplierTaskCloseX').onclick=()=>d.close();
  $('supplierTaskBack').onclick=()=>d.close();
  $('supplierTaskPrint').onclick=()=>supplierTaskPrint(selectedRows(),supplier);
  d.onclick=e=>{if(e.target===d)d.close();};
  updateSelection();
  if(!d.open)d.showModal();
  return{dialog:d,selected:new Set(checks().filter(x=>x.checked).map(x=>x.dataset.code))};
}
function openSupplierTaskPopup(task){
  return renderSupplierTaskPopup(task);
}
async function refreshSupplierTaskPopup(taskKey,selectedCodes){
  if(state.mode!=='live')return;
  try{
    const v=await rpc('purchasing_workspace_revision_v47');
    if(v.master_revision!==state.revision||v.upload_id!==state.upload?.id||WORKSPACE_RUNTIME.day!==scoreAsOf()||WORKSPACE_RUNTIME.decisionsDirty)await loadLive();
    const d=$('supplierTaskDialog');if(!d?.open)return;
    const current=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===taskKey&&t.status==='open');
    if(!current){d.close();toast('This supplier task changed after a data update.');return;}
    renderSupplierTaskPopup(current,selectedCodes);
  }catch(e){/* Keep the already-open current workspace; background refresh can retry later. */}
}
async function ta16OpenTask(task) {
  try {
    const current=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open')||task;
    if(current.focus==='suppliers'){
      const view=openSupplierTaskPopup(current);
      void refreshSupplierTaskPopup(current.task_key,view?.selected);
      return;
    }
    if(state.mode==='live')await loadLive();
    const refreshed=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open');
    if(!refreshed){toast('This task changed after a data update. Use the current task list.');return;}
    ta16OpenCodes(refreshed.codes||[]);state.dailyFocus.task_key=refreshed.task_key;
  } catch(e){toast('Task data could not be refreshed. Please try again.');}
}
window.addEventListener('focus',()=>{pollWorkspaceRevision();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollWorkspaceRevision();});
setInterval(pollWorkspaceRevision,60000);
