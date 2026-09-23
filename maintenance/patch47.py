from pathlib import Path
import hashlib,re,sys
p=Path(sys.argv[1] if len(sys.argv)>1 else 'index.html')
s=p.read_text()
if 'Live Build 47' in s:
    print('Build 47 already applied');sys.exit(0)
b=s.encode();assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()=='1f936555d257721973374322753aa2aafc4af3d8','Source changed; manual review required'
def once(old,new):
    global s
    assert s.count(old)==1,(old[:120],s.count(old));s=s.replace(old,new)
def replace_between(start,end,new):
    global s
    a=s.index(start);z=s.index(end,a);s=s[:a]+new+s[z:]
once('Dashboard + BOs + Tasks Assistant - Live Build 46','Dashboard + BOs + Tasks Assistant - Live Build 47')
once('</script><script>\'use strict\';','</script><script src="assets/js/workspace-v47.js"></script><script>\'use strict\';')
replace_between('async function loadLive(){','function openLocal(){','')
replace_between('function ta16OpenTask(task){','function go(tab){','')
once('function tasksEventFromSelected(tasks){','function tasksEventFromSelected(tasks,model=boHealthModel()){')
once('const totalImpact=tasks.reduce((a,t)=>a+Number(t.score_impact||0),0);','const totalImpact=combinedTaskImpact(model,tasks);')
once('const rows=model.tenTo50Rows.slice().sort','const rows=model.tenTo50Rows.filter(r=>!r.needs_review).sort')
once("function saveShortageStore(){try{localStorage.setItem(shortageStoreKey(),JSON.stringify(state.shortageCycles));}catch{}}", "function saveShortageStore(){if(WORKSPACE_RUNTIME.sandbox)return;try{localStorage.setItem(shortageStoreKey(),JSON.stringify(state.shortageCycles));}catch{}}")
# Paused/invalid stock is not evidence of recovery; keep the age record.
once("}else if(c?.active){archiveCycle(c,today,'stock_recovered_or_no_order_needed');changed=true;}","}else if(c?.active&&!r.needs_review){archiveCycle(c,today,'stock_recovered_or_no_order_needed');changed=true;}")
once("saveShortageStore();$('shortageJustificationDialog').close();", "saveShortageStore();notifyWorkspaceDecisionChange();$('shortageJustificationDialog').close();")
once("saveShortageStore();renderDailyTasks();renderExternalDialog();toast('Product re-entered", "saveShortageStore();notifyWorkspaceDecisionChange();renderDailyTasks();renderExternalDialog();toast('Product re-entered")
# Reconciliation supplies actual award status; disappearance is not completion.
once("tasks.filter(t=>t.status==='completed').map(t=>t.badge_label)","tasks.filter(t=>t.status==='completed'&&t.badge_awarded!==false).map(t=>t.badge_label)")
once("(done?' - earned':'')", "(done?(t.badge_awarded===false?' - outcome already credited':' - earned'):'')")
once("The product targets are saved with this task cycle. Viewing this task does not complete it or award a badge.","Open targets follow the latest saved data in this inventory cycle. Previous assignments are retained in the change log. Viewing or reassignment does not complete a task or award a badge.")
once("Top 5 suppliers in the current cycle.","Top 5 suppliers from the current saved data.")
once("Each task opens only its saved product targets.","Each task opens its current product targets.")
once("if(tab==='tasks-assistant')syncTasksAssistant();", "if(tab==='tasks-assistant')syncTasksAssistant().catch(()=>{});")
# Save conflicts are checked against the revision the editor actually opened.
once("activeEditCode=code;activeEditOriginal=structuredClone(m);", "activeEditCode=code;state.editorRevision=state.revision;activeEditOriginal=structuredClone(m);")
once("expected_revision:state.revision,request_id:uuid()});", "expected_revision:state.editorRevision??state.revision,request_id:uuid()});")
once("await loadLive();activeEditOriginal=structuredClone(state.master.find", "await loadLive();state.editorRevision=state.revision;activeEditOriginal=structuredClone(state.master.find")
once('window.msAudit={getState:()=>state,','window.msAudit={deriveWorkspace,combinedTaskImpact,buildPriorityTasks,loadLive,getState:()=>state,')
p.write_text(s)
print('Applied coherent workspace patch; score weights/formula unchanged')
