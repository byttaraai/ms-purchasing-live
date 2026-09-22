"""Presentation-only task workspace update; no database writes or task generation."""
from pathlib import Path
import hashlib, re, subprocess, tempfile, sys

SOURCE_SHA = '7c1a51241927e8ce26992e93114a1bc6de4f7ede'
path = Path(sys.argv[1] if len(sys.argv)>1 else 'index.html')
src = path.read_text(encoding='utf-8')
raw = path.read_bytes()
assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest() == SOURCE_SHA, 'Source changed; stop rather than overwrite newer work.'
s = src

def replace_once(old, new):
    global s
    assert s.count(old)==1, 'Expected unique replacement: '+old[:90]
    s=s.replace(old,new,1)

def replace_function(start, end, code):
    global s
    a=s.index(start); b=s.index(end,a+len(start))
    s=s[:a]+code.rstrip()+'\n'+s[b:]

start = s.index('    <div class="dashboard-freshness-card tasks-freshness-compact">')
end = s.index('  </div>\n</section>',start)
s=s[:start]+'''    <div class="ta16-inventory" id="tasksInventoryBar" role="region" aria-label="Inventory freshness">
      <div class="ta16-inventory-title"><span class="ta16-dot" aria-hidden="true"></span><strong>Inventory Snapshot</strong></div>
      <span class="fresh-chip neutral" id="tasksInventoryFreshnessStatus">Checking</span>
      <span class="ta16-inventory-age" id="tasksInventoryFreshnessAge">Checking refresh time</span>
      <span class="ta16-inventory-due" id="tasksInventoryRemaining">Refresh within 48 hours</span>
      <span class="screen-reader" id="tasksInventoryFreshnessText"></span>
      <button class="ta15-info" id="tasksInventoryInfo" type="button" aria-label="Inventory file and refresh details" aria-haspopup="dialog">i</button>
    </div>
    <div class="ta16-board" id="tasksPriorityList" role="region" aria-label="Purchasing task workspace" data-ui-build="16">
      <div class="task-empty" role="status">Loading task workspace...</div>
    </div>
'''+s[end:]

CSS = r'''
/* Tasks workspace v16: isolated presentation. No KPI or purchasing-rule overrides. */
.ta16-inventory{display:flex;align-items:center;gap:16px;min-height:52px;padding:9px 15px;background:#fff;border:1px solid var(--line);border-radius:13px;font-size:12px;min-width:0}
.ta16-inventory-title{display:flex;align-items:center;gap:9px;color:#233455;white-space:nowrap}
.ta16-dot{height:8px;width:8px;border-radius:50%;background:#9aa6b8;flex:none}
.ta16-inventory.current .ta16-dot{background:#099573}
.ta16-inventory.warning .ta16-dot,.ta16-inventory.stale .ta16-dot{background:#ca8317}
.ta16-inventory .fresh-chip{font-size:11px;padding:4px 9px;white-space:nowrap}
.ta16-inventory-age{color:#697992;border-left:1px solid #e8ecf4;padding-left:16px;white-space:nowrap}
.ta16-inventory-due{color:#60718e;margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums}
.ta16-inventory.warning .ta16-inventory-due,.ta16-inventory.stale .ta16-inventory-due{color:#a56712;font-weight:700}
.ta16-inventory .ta15-info{flex:none;width:28px;height:28px;font-size:12px}
.ta16-board{display:grid;grid-template-columns:minmax(0,35fr) minmax(0,40fr) minmax(0,25fr);align-items:start;gap:14px;scroll-margin-top:18px}
.ta16-column{background:#fff;border:1px solid var(--line);border-radius:15px;overflow:hidden;min-width:0;box-shadow:0 3px 16px #25377104}
.ta16-column-head{padding:16px 16px 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.ta16-column-head h3{margin:0;color:#18294f;font-size:16px;line-height:1.25}
.ta16-column-head p{margin:5px 0 0;color:#78869f;font-size:11px;line-height:1.45}
.ta16-open-count{flex:none;font-size:10px;font-weight:800;color:#6545d8;background:#f1edff;border-radius:999px;padding:5px 8px;white-space:nowrap}
.ta16-body{padding:0 13px 14px}
.ta16-event{margin:0 13px 12px;background:#f8f6ff;border:1px solid #e9e3ff;border-radius:11px;padding:11px 12px}
.ta16-eyebrow{display:block;color:#7e69ba;font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px}
.ta16-event h4{margin:0;color:#39266a;font-size:13px;line-height:1.4}
.ta16-event p{font-size:10px;line-height:1.4;color:#7c6b9f;margin:5px 0 0}
.ta16-event-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 10px;margin-top:10px}
.ta16-event-stats>span{font-size:10px;color:#76648f;display:flex;align-items:baseline;gap:5px;white-space:nowrap}
.ta16-event-stats b{font-size:15px;color:#463270;font-variant-numeric:tabular-nums}
.ta16-task-list{display:grid;gap:8px}
.ta16-task{background:#fff;border:1px solid #e6eaf3;border-radius:10px;padding:10px 11px;min-width:0;scroll-margin-top:20px}
.ta16-task.completed{background:#f6fbf8;border-color:#dceee4}
.ta16-task-line{display:flex;align-items:flex-start;justify-content:space-between;gap:9px}
.ta16-task-heading{display:flex;align-items:flex-start;gap:7px;min-width:0}
.ta16-task-heading h4{margin:0;min-width:0;font-size:12px;font-weight:700;line-height:1.45;color:#243455}
.ta16-task-title{font:inherit;color:inherit;text-align:start;background:none;border:0;padding:0;overflow-wrap:anywhere;cursor:pointer}
.ta16-task-title:hover{color:#5b34fc;text-decoration:underline;text-underline-offset:3px}
.ta16-sequence{background:#f2efff;color:#7256c9;border-radius:6px;padding:2px 5px;font-size:9px;font-weight:800;flex:none;line-height:1.6}
.ta16-task .tasks-open-task{font-size:11px;padding:5px 8px;min-height:30px;border-radius:8px;flex:none}
.ta16-task-meta{display:flex;align-items:center;flex-wrap:wrap;gap:5px 9px;font-size:10px;color:#76839a;margin-top:6px;line-height:1.5}
.ta16-impact{color:#9a671e;background:#fff5e8;border-radius:5px;padding:1px 5px;white-space:nowrap;font-size:9px}
.ta16-badge{display:flex;align-items:center;gap:5px;font-size:10px;color:#7c6c9d;margin-top:6px;line-height:1.4}
.ta16-badge svg{height:12px;width:12px;flex:none;color:#9383b0}
.ta16-task.completed .ta16-badge{color:#26815a}
.ta16-section{margin-bottom:12px}.ta16-section:last-child{margin-bottom:0}
.ta16-section-label{display:flex;align-items:center;justify-content:space-between;gap:7px;border-bottom:1px solid #edf0f6;margin:0 0 8px;padding:3px 0 7px;font-size:10px;font-weight:800;letter-spacing:.03em;color:#7a8c98;text-transform:uppercase}
.ta16-review-label{color:#a38153;margin-top:15px}
.ta16-subhead{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:#34445e;font-weight:650;margin:10px 0 7px}
.ta16-subhead small{font-size:10px;font-weight:400;color:#8792a5}
.ta16-empty{padding:10px 11px;font-size:11px;line-height:1.5;color:#7b869c;background:#fafbfe;border:1px dashed #e0e5ee;border-radius:9px}
.ta16-notice{margin:0 13px 12px;padding:12px;background:#fffaf0;border:1px solid #f1e5ca;border-radius:11px}
.ta16-notice.clear{background:#f5fbf8;border-color:#dceee5}
.ta16-notice strong{display:block;font-size:12px;color:#69542d;line-height:1.5}
.ta16-notice strong b{font-size:20px;font-variant-numeric:tabular-nums;margin-right:4px}
.ta16-notice p{color:#8a7c63;font-size:11px;line-height:1.5;margin:6px 0 10px}
.ta16-notice .btn{font-size:11px;min-height:31px;padding:5px 10px;background:#fff}
.ta16-master-caption{display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#7b87a0;margin-bottom:9px;padding:0 2px;gap:5px}
.ta16-master-help{font-size:11px;color:#8490a4;line-height:1.6;margin:12px 2px 0}
.ta16-due-link{background:none;border:0;padding:0;color:#5b34fc;font-size:11px;text-decoration:underline;margin-top:7px;cursor:pointer}
@media(max-width:1180px){.topbar .account-identity{display:none}}
@media(max-width:900px){.topbar{flex-wrap:wrap;gap:10px}.topbar>nav{order:3;flex-basis:100%;min-width:0}.topbar>.actions{margin-left:auto}.topbar .label{display:none}}
@media(max-width:1100px){.ta16-board{grid-template-columns:repeat(2,minmax(0,1fr))}.ta16-master{grid-column:1/-1}.ta16-inventory{gap:10px}.ta16-inventory-age{padding-left:10px}}
@media(max-width:760px){.ta16-board{grid-template-columns:minmax(0,1fr)}.ta16-master{grid-column:auto}.ta16-inventory{display:grid;grid-template-columns:1fr auto auto;gap:7px 9px}.ta16-inventory-title{font-size:12px}.ta16-inventory .ta15-info{grid-row:1;grid-column:3}.ta16-inventory-age{grid-column:1;border:0;padding:0;font-size:11px}.ta16-inventory-due{grid-row:2;grid-column:2/4;font-size:11px}.ta16-column-head h3{font-size:16px}}
'''
replace_once('</style></head><body>\n<div class="auth"',CSS+'\n</style></head><body>\n<div class="auth"')

FRESH = r'''function renderTasksInventoryFreshness(){
 const f=inventoryFreshness(),status=$('tasksInventoryFreshnessStatus'),age=$('tasksInventoryFreshnessAge'),txt=$('tasksInventoryFreshnessText'),bar=$('tasksInventoryBar'),remaining=$('tasksInventoryRemaining');
 if(!status)return f;
 const dated=Number.isFinite(f.ageHours),left=dated?Math.max(0,48*60-Math.floor(f.ageHours*60)):0;
 const duration=mins=>{const h=Math.floor(mins/60),m=mins%60;return h?(h+'h'+(m?' '+m+'m':'')):m+'m';};
 status.className='fresh-chip '+(f.fresh?'good':'warn');
 status.textContent=f.fresh?'Current':f.status==='stale'?'Refresh due':f.status==='missing'?'No inventory':'Full refresh required';
 age.className='ta16-inventory-age';
 age.textContent=dated?'Updated '+(f.ageHours<1?Math.floor(f.ageHours*60)+'m':Math.floor(f.ageHours)+'h')+' ago':'No valid refresh time';
 if(remaining)remaining.textContent=f.fresh?'Refresh within '+duration(left):f.status==='stale'?'48h limit reached':'Upload a full snapshot';
 if(bar)bar.className='ta16-inventory '+(!f.fresh?'stale':left<=360?'warning':'current');
 txt.textContent=f.fresh?'Each full upload starts a new task cycle. Refresh inventory before the 48-hour deadline.':'A new full inventory upload is required to unlock the workspace.';
 const info=$('tasksInventoryInfo');if(info)info.onclick=()=>ta16ShowDetails('Inventory snapshot',ta16InventoryDetails());
 return f;
}
function ta16InventoryDetails(){
 const u=state.upload||{},f=inventoryFreshness(),t=u.uploaded_at?Date.parse(u.uploaded_at):NaN;
 const date=ms=>Number.isFinite(ms)?new Date(ms).toLocaleString('en-GB'):'Not recorded';
 const facts=[['File',u.file_name||'No file loaded'],['Uploaded',date(t)],['Inventory as-of date',u.snapshot_date||'Not declared'],['Refresh deadline',date(t+48*3600000)],['Scope',u.scope_key||'Not recorded'],['Status',f.label]];
 return '<div class="ta15-facts">'+facts.map(([k,v])=>'<span>'+esc(k)+'</span><strong dir="auto">'+esc(v)+'</strong>').join('')+'</div><p>Each successful full inventory upload starts a new task cycle. The 48-hour refresh limit is counted from the upload time. The as-of date describes the report itself; uploading an older report does not make its contents newer. No file is changed from this view.</p>';
}
function ta16ShowDetails(title,body){
 let d=$('tasksWorkspaceDetails');
 if(!d){d=document.createElement('dialog');d.id='tasksWorkspaceDetails';d.className='ta15-dialog';d.setAttribute('aria-labelledby','tasksWorkspaceDetailsTitle');document.body.append(d);}
 d.innerHTML='<header><h2 id="tasksWorkspaceDetailsTitle">'+esc(title)+'</h2><button class="ta15-info" id="tasksWorkspaceDetailsClose" type="button" aria-label="Close details">&times;</button></header><div class="ta15-dialog-body">'+body+'</div>';
 $('tasksWorkspaceDetailsClose').onclick=()=>d.close();if(!d.open)d.showModal();
}'''
replace_function('function renderTasksInventoryFreshness(){','function tasksRequestItems(',FRESH)

RENDER = r'''function renderTasksAssistant(data,model){
 const freshness=renderTasksInventoryFreshness(),tasks=Array.isArray(data?.tasks)?data.tasks:[];
 renderOverviewV15(data,model,tasks);
 const board=$('tasksPriorityList'),rows=Array.isArray(state.rows)?state.rows:[],rowByCode=new Map(rows.map(r=>[r.product_code,r]));
 const supplier=tasks.filter(t=>t.focus==='suppliers'),profit=tasks.filter(t=>t.focus==='profit_recovery'),recovery=tasks.filter(t=>t.focus==='shortage_mid'),critical=tasks.filter(t=>t.focus==='shortage_low'),aged=tasks.filter(t=>t.focus==='aging30'),master=tasks.filter(t=>t.focus==='data');
 const known=new Set([...supplier,...profit,...recovery,...critical,...aged,...master].map(t=>t.id)),other=tasks.filter(t=>!known.has(t.id));
 const open=items=>items.filter(t=>t.status==='open').length;
 const codes=items=>[...new Set(items.flatMap(t=>Array.isArray(t.codes)?t.codes:[]))];
 const empty=text=>'<div class="ta16-empty">'+esc(text)+'</div>';
 const head=(name,desc,items)=>'<div class="ta16-column-head"><div><h3>'+esc(name)+'</h3><p>'+esc(desc)+'</p></div><span class="ta16-open-count">'+open(items)+' open</span></div>';
 const card=(t,index)=>{
  const done=t.status==='completed',n=codes([t]).length,impact=Number(t.score_impact),value=Number.isFinite(impact)?impact.toFixed(1):null;
  return '<article class="ta16-task '+(done?'completed':'')+'" data-task-card="'+esc(t.id)+'"><div class="ta16-task-line"><div class="ta16-task-heading">'+(t.focus==='suppliers'?'<span class="ta16-sequence">'+(index+1)+'</span>':'')+'<h4><button type="button" class="ta16-task-title" data-ta16-detail="'+esc(t.id)+'" aria-haspopup="dialog" title="View task details"><bdi dir="auto">'+esc(t.title)+'</bdi></button></h4></div>'+(done?'<span class="ta16-open-count">Verified</span>':'<button class="btn outline tasks-open-task" data-task-id="'+esc(t.id)+'" type="button" aria-label="Open '+esc(t.title)+'">Open</button>')+'</div><div class="ta16-task-meta"><span>'+n+' targeted product'+(n===1?'':'s')+'</span>'+(value?'<span class="ta16-impact" title="Task-level estimate. Overlapping product effects are not added across columns.">Est. +'+value+' score</span>':'')+'</div><div class="ta16-badge">'+ta15Icon(done?'check':'lock')+'<span>'+esc(t.badge_label||'Task badge')+(done?' - earned':'')+'</span></div></article>';
 };
 const cards=items=>'<div class="ta16-task-list">'+items.map(card).join('')+'</div>';
 const group=(title,items,absent)=>'<div class="ta16-section"><div class="ta16-subhead">'+esc(title)+'</div>'+(items.length?cards(items):empty(absent))+'</div>';
 // Count each targeted supplier product once, from the current snapshot. Never sum overlapping score effects.
 const targetCodes=codes(supplier),targetRows=targetCodes.map(c=>rowByCode.get(c)).filter(Boolean),completeStats=targetRows.length===targetCodes.length;
 const orderRows=targetRows.filter(shortageNeedsOrder),stats=[['suppliers',supplier.length],['order lines',completeStats?orderRows.length:'\u2014'],['critical <10%',completeStats?orderRows.filter(r=>C.finite(r.stock_ratio)&&r.stock_ratio<10).length:'\u2014'],['Super / High',completeStats?orderRows.filter(r=>['super','high'].includes(profitabilityKey(r.profitability_class))).length:'\u2014']];
 const eventTitle=supplier.length?(data?.cycle?.event_focus==='suppliers'&&data.cycle.event_title?data.cycle.event_title:supplier.length>1?'Priority Supplier Sprint':'Supplier Focus'):'No supplier action due';
 const supplierSummary='<div class="ta16-event"><span class="ta16-eyebrow">Cycle focus</span><h4 id="tasksEventTitle">'+esc(eventTitle)+'</h4><div class="ta16-event-stats">'+stats.map(([label,n])=>'<span title="Unique targets from the supplier tasks in this cycle"><b>'+esc(n)+'</b>'+esc(label)+'</span>').join('')+'</div><p id="tasksEventText">Listed supplier targets only. Profitability, severity &amp; aging determine order.</p></div>';
 const supplierColumn='<section class="ta16-column ta16-suppliers" aria-label="Supplier priorities">'+head('Supplier Priorities','Top 5 suppliers in the current cycle.',supplier)+supplierSummary+'<div class="ta16-body">'+(supplier.length?cards(supplier):empty(freshness.fresh?'No supplier task in this cycle.':'Refresh stock to review supplier priorities.'))+'</div></section>';
 const agedCount=Number(model?.counts?.action30||0),productItems=[...profit,...recovery,...critical,...aged,...other];
 const agedContent=aged.length?cards(aged):empty(agedCount>0?agedCount+' tracked cases require a decision. No 30-day task is stored in this cycle yet.':'No cases due in the tracked 30+ day history.')+(agedCount>0?'<button type="button" class="ta16-due-link" id="tasksViewAged">View due products</button>':'');
 const productColumn='<section class="ta16-column ta16-products" aria-label="Product recovery and reviews">'+head('Product Recovery & Reviews','Recover priority stock. Review decisions separately.',productItems)+'<div class="ta16-body"><div class="ta16-section-label">Recovery</div>'+group('Profit Recovery - Super / High <80%',profit,'No profitability recovery task in this cycle.')+group('Stock Recovery - 10\u201350%',recovery,'No stock recovery task in this cycle.')+'<div class="ta16-section-label ta16-review-label">Review &amp; Decisions</div>'+group('Critical Review - below 10%',critical,'No below-10% review task in this cycle.')+'<div class="ta16-subhead"><span>30+ Day Decisions</span><small>'+esc(agedCount)+' cases due</small></div>'+agedContent+(other.length?'<div class="ta16-subhead">Other product actions</div>'+cards(other):'')+'</div></section>';
 const allReview=rows.filter(r=>r.needs_review).length,selected=codes(master).length;
 const notice='<div class="ta16-notice '+(allReview?'':'clear')+'"><span class="ta16-eyebrow">Needs attention</span><strong><b>'+fmt(allReview,0)+'</b> products need review</strong><p>'+selected+' selected in this cycle. The total includes all current master-data blockers.</p><button class="btn outline" id="tasksMasterViewAll" type="button" '+(allReview?'':'disabled')+'>View All Products \u2192</button></div>';
 const masterColumn='<section class="ta16-column ta16-master" aria-label="Master data review">'+head('Master Data Review','Resolve the data blocking reliable recommendations.',master)+notice+'<div class="ta16-body"><div class="ta16-master-caption"><strong>Selected actions</strong><span>'+selected+' products</span></div>'+(master.length?cards(master):empty('No selected master-data task in this cycle.'))+'<p class="ta16-master-help">View All opens the full review list. Each task opens only its saved product targets.</p></div></section>';
 board.innerHTML=supplierColumn+productColumn+masterColumn;
 board.querySelectorAll('.tasks-open-task').forEach(b=>b.onclick=()=>{const t=tasks.find(x=>x.id===b.dataset.taskId);if(t)ta16OpenTask(t);});
 board.querySelectorAll('[data-ta16-detail]').forEach(b=>b.onclick=()=>{
  const t=tasks.find(x=>x.id===b.dataset.ta16Detail);if(!t)return;
  ta16ShowDetails(t.task_type||'Task details','<p dir="auto"><strong>'+esc(t.title)+'</strong></p><p>'+esc(t.description||'')+'</p><div class="ta15-facts"><span>Target products</span><strong>'+codes([t]).length+'</strong><span>Status</span><strong>'+esc(t.status)+'</strong><span>Badge</span><strong>'+esc(t.badge_label)+'</strong></div><p>The product targets are saved with this task cycle. Viewing this task does not complete it or award a badge.</p>');
 });
 $('tasksMasterViewAll').onclick=()=>startDailyFocus('data');
 const viewAged=$('tasksViewAged');if(viewAged)viewAged.onclick=()=>ta16OpenCodes((model.action30||[]).map(([code])=>code));
}
function ta16OpenCodes(codes){
 if(purchaseActionsLocked()){toast('Refresh inventory before opening task products.');return;}
 clearAllFilters();state.dailyFocus={kind:'task_selection',codes:[...new Set(codes)]};$('showZeroStock').checked=true;
 applyFilters();go('recommendations');setTimeout(()=>document.querySelector('.filter-card')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}),40);
}
function ta16OpenTask(task){
 ta16OpenCodes(Array.isArray(task.codes)?task.codes:[]);
}'''
replace_function('function renderTasksAssistant(data,model){','async function syncTasksAssistant()',RENDER)
replace_once("let rows=C.filterRows(state.rows,filters());", "let rows=C.filterRows(state.rows,filters());if(state.dailyFocus?.kind==='task_selection'){const chosen=new Set(state.dailyFocus.codes||[]);rows=rows.filter(r=>chosen.has(r.product_code));}")
replace_once('setInterval(updateInventoryLock,60000);', "setInterval(()=>{updateInventoryLock();const panel=document.querySelector('[data-panel=\"tasks-assistant\"]');if(panel&&!panel.classList.contains('hidden'))renderTasksInventoryFreshness();},60000);")
replace_once('Dashboard + BOs + Tasks Assistant - Live Build 15','Dashboard + BOs + Tasks Assistant - Live Build 16')
replace_once('MS Purchasing LIVE - Build 15 |','MS Purchasing LIVE - Build 16 |')

for begin,end in [('function buildPriorityTasks(model){','function taskStillOpen'),('async function syncTasksAssistant()','function go(tab)'),('function inventoryFreshness','function purchaseActionsLocked'),('function renderOverviewV15','function renderTasksAssistant')]:
    def block(text):
        a=text.index(begin);b=text.index(end,a+len(begin));return text[a:b]
    assert block(src)==block(s), 'Unapproved logic change: '+begin
for i,script in enumerate(re.findall(r'<script(?:\s[^>]*)?>([\s\S]*?)</script>',s,re.I)):
    with tempfile.NamedTemporaryFile(mode='w',suffix='.js',encoding='utf-8') as f:
        f.write(script);f.flush();subprocess.run(['node','--check',f.name],check=True,capture_output=True)
assert 'id="tasksInventoryInfo"' in s and 'ta16-board' in s
path.write_text(s,encoding='utf-8')
print('Verified UI Build 16:',len(s.encode()),'bytes; generation, score, sync and top overview unchanged.')
