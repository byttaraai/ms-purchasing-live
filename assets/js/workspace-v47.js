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
    .filter(r=>supplier&&r.supplier===supplier&&!isScoreExcluded(r.product_code)&&shortageNeedsOrder(r))
    .map(r=>({...r,shortage_value:averageShortageValue(r),priority_score:priorityScore(r,maxShortageValue)}))
    .sort((a,b)=>(b.priority_score||0)-(a.priority_score||0)||(b.shortage_value||0)-(a.shortage_value||0)||(C.finite(a.stock_ratio)?a.stock_ratio:Infinity)-(C.finite(b.stock_ratio)?b.stock_ratio:Infinity)||a.product_name.localeCompare(b.product_name));
}
function supplierTaskPrint(rows,supplier){
  if(!rows.length)return;
  const w=window.open('','_blank','width=1100,height=780');
  if(!w){toast('Please allow pop-ups to open the print preview.');return;}
  const total=rows.reduce((sum,r)=>sum+Number(r.shortage_value||0),0),today=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const body=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.product_name)}</td><td>${esc(r.purchase_unit||'—')}</td><td>${esc(fmt(r.stock_qty,4))}</td><td>${esc(fmt(r.reorder_point,4))}</td><td>${C.finite(r.stock_ratio)?esc(fmt(r.stock_ratio,1))+'%':'—'}</td><td>${esc(C.profitLabel(r.profitability_class)||'—')}</td><td>${esc(fmt(r.purchase_price,1))}</td><td>${esc(fmt(r.min_order_qty,4))}</td><td>${esc(fmt(r.max_order_qty,4))}</td><td>${esc(fmt(r.shortage_value,0))}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(supplier)} Purchase Request</title><style>body{font:12px Arial,sans-serif;color:#17264e;padding:24px}h1{font-size:20px;margin:0 0 4px}.meta{color:#64748b;margin-bottom:16px}table{width:100%;border-collapse:collapse}th,td{padding:8px 7px;border-bottom:1px solid #e5e7eb;text-align:right}th:nth-child(2),td:nth-child(2),th:nth-child(3),td:nth-child(3){text-align:left}th{background:#f5f7fb;font-size:10px;text-transform:uppercase;color:#52627d}.totals{display:flex;justify-content:flex-end;gap:24px;margin-top:16px;font-weight:700}@media print{body{padding:0}}</style></head><body><h1>${esc(supplier)}</h1><div class="meta">Supplier priority purchase request · ${today}</div><table><thead><tr><th>#</th><th>Product</th><th>Unit</th><th>Stock</th><th>Reorder</th><th>Stock %</th><th>Rating</th><th>Price</th><th>Min</th><th>Max</th><th>Shortage Value</th></tr></thead><tbody>${body}</tbody></table><div class="totals"><span>${rows.length} Products</span><span>Total Shortage Value: SAR ${fmt(total,0)}</span></div><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}
function openSupplierTaskPopup(task){
  const rows=supplierTaskRows(task),supplier=String(task?.target||task?.title||'Supplier').trim(),total=rows.reduce((sum,r)=>sum+Number(r.shortage_value||0),0);
  let d=$('supplierTaskDialog');
  if(!d){d=document.createElement('dialog');d.id='supplierTaskDialog';d.className='supplier-task-dialog';document.body.append(d);}
  const body=rows.map((r,i)=>`<tr><td class="supplier-task-rank">${i+1}</td><td><div class="product-cell"><span class="product-button-wrap"><span class="supplier-task-product" title="${esc(r.product_name)}">${esc(r.product_name)}</span></span></div></td><td class="unit">${esc(r.purchase_unit||'—')}</td><td>${stockHtml(r)}</td><td>${pill(r.stock_ratio)}</td><td>${ratingHtml(r.profitability_class)}</td><td class="money">${fmt(r.purchase_price,1)}</td><td class="order">${fmt(r.min_order_qty,4)}</td><td class="order">${fmt(r.max_order_qty,4)}</td><td class="money">${fmt(r.shortage_value,0)}</td><td class="supplier" title="${esc(r.supplier||'Not assigned')}">${esc(r.supplier||'Not assigned')}</td></tr>`).join('');
  d.innerHTML=`<div class="supplier-task-shell"><header class="supplier-task-head"><div><span class="supplier-task-eyebrow">Supplier Priority</span><h2 dir="auto">${esc(supplier)}</h2><p>Current purchase-priority products · ordered by the approved BO product priority.</p></div><button class="supplier-task-x" id="supplierTaskCloseX" type="button" aria-label="Close">&times;</button></header><div class="supplier-task-table-wrap"><table class="supplier-task-table"><thead><tr><th>#</th><th>Product</th><th>Unit</th><th>Stock / Reorder</th><th>Stock %</th><th>Rating</th><th>Price</th><th>Min Order</th><th>Max Order</th><th>Shortage Value</th><th>Supplier</th></tr></thead><tbody>${body||'<tr><td colspan="11" class="supplier-task-empty">No current purchase-priority products for this supplier.</td></tr>'}</tbody></table></div><footer class="supplier-task-footer"><div class="supplier-task-totals"><span><b>${fmt(rows.length,0)}</b> Products</span><span><b>SAR ${fmt(total,0)}</b> Total Shortage Value</span></div><div class="supplier-task-actions"><button class="btn" id="supplierTaskPrint" type="button" ${rows.length?'':'disabled'}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"></path></svg> Print</button><button class="btn primary" id="supplierTaskBack" type="button">Back to Tasks</button></div></footer></div>`;
  $('supplierTaskCloseX').onclick=()=>d.close();
  $('supplierTaskBack').onclick=()=>d.close();
  $('supplierTaskPrint').onclick=()=>supplierTaskPrint(rows,supplier);
  d.onclick=e=>{if(e.target===d)d.close();};
  if(!d.open)d.showModal();
}
async function ta16OpenTask(task) {
  try {
    if(state.mode==='live')await loadLive();
    const current=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open');
    if(!current){toast('This task changed after a data update. Use the current task list.');return;}
    if(current.focus==='suppliers'){openSupplierTaskPopup(current);return;}
    ta16OpenCodes(current.codes||[]);state.dailyFocus.task_key=current.task_key;
  } catch(e){toast('Task data could not be refreshed. Please try again.');}
}
window.addEventListener('focus',()=>{pollWorkspaceRevision();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollWorkspaceRevision();});
setInterval(pollWorkspaceRevision,60000);
