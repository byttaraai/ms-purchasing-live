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
async function ta16OpenTask(task) {
  try {
    if(state.mode==='live')await loadLive();
    const current=(state.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open');
    if(!current){toast('This task changed after a data update. Use the current task list.');return;}
    ta16OpenCodes(current.codes||[]);state.dailyFocus.task_key=current.task_key;
  } catch(e){toast('Task data could not be refreshed. Please try again.');}
}
window.addEventListener('focus',()=>{pollWorkspaceRevision();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollWorkspaceRevision();});
setInterval(pollWorkspaceRevision,60000);
