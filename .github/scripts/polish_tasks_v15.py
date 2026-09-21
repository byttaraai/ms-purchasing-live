"""Apply the approved Tasks overview presentation; never modify business data."""
from pathlib import Path
import hashlib
import re
import subprocess
import sys

EXPECTED = '2cc8381ab1fa6d343dd3bb88ebd0c9799a442beb'

STYLE = r'''
/* Tasks overview v15: isolated typography and layout, no business-rule changes. */
.account-identity{display:flex;flex-direction:column;min-width:0;line-height:1.2}
.account-identity strong{font-size:12px;color:#243556;max-width:155px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.account-identity .account{display:block;font-size:10px;max-width:155px;margin-top:3px}
main.page.tasks-view{padding-top:14px}
.tasks-overview-strip.v3{display:grid;grid-template-columns:minmax(300px,30fr) minmax(390px,48fr) minmax(230px,22fr);gap:12px;align-items:stretch}
.tasks-overview-strip.v3 .ta15-card{height:136px;min-width:0;padding:13px 16px;background:#fff;border:1px solid #e3e8f2;border-radius:16px;box-shadow:0 3px 14px #25377104}
.ta15-eyebrow{font-size:10px;font-weight:800;letter-spacing:.08em;color:#64738e;line-height:1.3;text-transform:uppercase}
.ta15-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:19px}
.ta15-info{display:grid;place-items:center;width:24px;height:24px;padding:0;border:1px solid #e3e8f2;border-radius:50%;background:#fff;color:#77849b;font-size:12px;line-height:1;flex:0 0 auto}
.ta15-info:hover,.ta15-info:focus-visible{background:#f0edff;color:#5b34fc;border-color:#cabdff}
.ta15-performance{display:grid;grid-template-columns:76px minmax(0,1fr);gap:14px;align-items:center}
.ta15-gauge{--score:0;position:relative;width:76px;height:76px;display:grid;place-items:center;border-radius:50%;background:conic-gradient(#6138fc calc(var(--score)*1%),#eaeef6 0)}
.ta15-gauge:before{content:'';position:absolute;inset:7px;border-radius:50%;background:#fff}
.ta15-gauge-value{z-index:1;display:flex;flex-direction:column;align-items:center;line-height:1}
.ta15-gauge-value strong{font-size:29px;letter-spacing:-1px;color:#17294e;font-variant-numeric:tabular-nums}
.ta15-gauge-value small{font-size:10px;color:#74829b;margin-top:3px}
.ta15-performance-copy{min-width:0}
.ta15-performance-copy .ta15-card-head{margin-bottom:4px}
.ta15-level{display:flex;align-items:center;gap:9px}
.ta15-shield{display:grid;place-items:center;width:34px;height:38px;clip-path:polygon(0 0,100% 0,100% 68%,50% 100%,0 68%);background:#efeaff;color:#5b34fc;font-size:23px;font-weight:850;line-height:1;flex:0 0 auto;padding-bottom:4px}
.ta15-level-name{display:flex;flex-direction:column;gap:1px;min-width:0}
.ta15-level-name b{font-size:15px;color:#213352;line-height:1.2;white-space:nowrap}
.ta15-level-name span{font-size:10px;color:#74829b;line-height:1.2}
.ta15-progress-track{height:5px;border-radius:99px;background:#eceff6;margin-top:7px;overflow:hidden}
.ta15-progress-track span{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#8a69ff,#5b34fc);transition:width .3s ease}
.ta15-progress-caption{display:flex;justify-content:space-between;gap:8px;margin-top:5px;font-size:10px;line-height:1.2;color:#6a7891}
.ta15-progress-caption strong{font-weight:750;color:#654dd2;white-space:nowrap}
.ta15-achievements{display:flex;flex-direction:column;justify-content:space-between}
.ta15-counter{display:flex;align-items:center;gap:7px;border:1px solid #e6dfff;border-radius:9px;background:#f4f1ff;padding:5px 9px;color:#5b34fc;line-height:1}
.ta15-counter b{font-size:18px;font-variant-numeric:tabular-nums}
.ta15-counter span{font-size:10px;font-weight:700}
.ta15-counter:hover{background:#eae4ff;border-color:#cfbeff}
.ta15-badge-shelf{display:flex;align-items:center;justify-content:space-between;gap:9px;min-height:55px}
.ta15-medal{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;flex:1 1 0;min-width:0;max-width:80px;padding:0;border:0;background:transparent;color:#65748b;text-align:center}
.ta15-medal-face{position:relative;display:grid;place-items:center;width:34px;height:34px;border:1px solid #d8dfea;border-radius:11px;background:#f5f7fb;color:#7d8ba2;box-sizing:border-box}
.ta15-medal-face>svg{display:block;width:20px;height:20px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}
.ta15-medal-state{position:absolute;right:-4px;bottom:-3px;display:grid;place-items:center;width:14px;height:14px;border-radius:50%;background:#e8edf5;border:2px solid #fff;color:#66758d}
.ta15-medal-state svg{display:block;width:9px;height:9px;stroke:currentColor;stroke-width:2;fill:none}
.ta15-medal-label{font-size:10px;font-weight:650;line-height:1.1;white-space:normal}
.ta15-medal.earned .ta15-medal-face{background:var(--medal-color,#6138fc);border-color:var(--medal-color,#6138fc);color:#fff;box-shadow:0 3px 7px #24335316}
.ta15-medal.earned .ta15-medal-label{color:#31415e}
.ta15-medal.earned .ta15-medal-state{background:#e6f7ed;color:#157d4e}
.ta15-medal:hover .ta15-medal-face,.ta15-medal:focus-visible .ta15-medal-face{outline:2px solid #cfbfff;outline-offset:2px}
.ta15-achievements-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:10px;color:#74829b;line-height:1.2}
.ta15-achievements-foot b{color:#27395a}
.ta15-achievements-foot .ta15-key{display:flex;align-items:center;gap:4px;white-space:nowrap;font-size:9px}
.ta15-key svg{width:10px;height:10px;stroke:currentColor;fill:none;stroke-width:2}
.ta15-rank{display:flex;flex-direction:column;justify-content:space-between}
.ta15-rank-head{display:flex;align-items:center;justify-content:space-between;gap:5px}
.ta15-rank-status{font-size:9px;color:#727f97;white-space:nowrap}
.ta15-reel{position:relative;height:83px;overflow:hidden;border-radius:10px;background:linear-gradient(180deg,#fafbfe,#fff 25%,#fff 75%,#fafbfe)}
.ta15-reel:before,.ta15-reel:after{content:'';position:absolute;left:0;right:0;height:5px;z-index:2;pointer-events:none}
.ta15-reel:before{top:0;background:linear-gradient(#fff,transparent)}
.ta15-reel:after{bottom:0;background:linear-gradient(transparent,#fff)}
.ta15-reel-line{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;padding:0 9px}
.ta15-reel-line small{font-size:9px;font-weight:600;line-height:1;text-transform:uppercase;letter-spacing:.03em;color:#78869c}
.ta15-reel-line b{font-size:12px;color:#78869c;font-weight:650;line-height:1.2}
.ta15-reel-line.next,.ta15-reel-line.previous{height:23px}
.ta15-reel-line.current{height:36px;background:#f1edff;border:1px solid #ddd2ff;border-radius:8px}
.ta15-reel-line.current small{color:#7154d3;font-size:9px}
.ta15-reel-line.current strong{color:#36226f;font-size:23px;line-height:1;letter-spacing:-.4px}
.ta15-rank-footer{align-self:flex-end;padding:0;border:0;background:transparent;color:#6c7790;font-size:9px;line-height:1.2;text-decoration:underline;text-underline-offset:2px}
.tasks-freshness-compact{padding:11px 16px!important;margin:0;min-height:53px}
.tasks-freshness-compact .freshness-copy{gap:2px}
.tasks-freshness-compact .freshness-copy strong{font-size:12px}
.tasks-freshness-compact .freshness-copy span{font-size:11px}
.ta15-dialog{padding:0;max-width:580px;max-height:85vh;border:1px solid #e0e6f0;border-radius:16px;overflow:auto}
.ta15-dialog header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid #edf0f7}
.ta15-dialog h2{font-size:18px;line-height:1.3;margin:0;color:#1d3155}
.ta15-dialog .ta15-dialog-body{padding:18px 20px;color:#51627e;font-size:13px;line-height:1.65}
.ta15-dialog p{margin:0 0 12px}
.ta15-dialog .ta15-facts{display:grid;grid-template-columns:1fr auto;gap:8px 12px;padding:12px;background:#f7f9fc;border-radius:10px;margin-bottom:12px}
.ta15-dialog .ta15-facts strong{color:#243956}
.ta15-dialog .ta15-ranks{display:flex;gap:5px;flex-wrap:wrap;margin:12px 0}
.ta15-ranks span{padding:5px 8px;background:#f2f4f9;border-radius:6px;font-size:12px}
.ta15-ranks span.current{background:#ede7ff;color:#5b34fc;font-weight:750}
.ta15-dialog .ta15-task-title{padding:8px 10px;border-left:2px solid #c6b5ff;background:#faf9ff;margin-bottom:6px;overflow-wrap:anywhere}
.ta15-dialog .btn{margin-top:10px}
@media(min-width:1001px) and (max-width:1260px){.tasks-overview-strip.v3{grid-template-columns:minmax(260px,30fr) minmax(350px,48fr) minmax(205px,22fr);gap:10px}.tasks-overview-strip.v3 .ta15-card{padding:12px}.ta15-performance{grid-template-columns:65px minmax(0,1fr);gap:9px}.ta15-gauge{width:65px;height:65px}.ta15-gauge-value strong{font-size:26px}.ta15-badge-shelf{gap:5px}.ta15-medal{min-width:0}.ta15-eyebrow{font-size:9px}.ta15-rank-status{font-size:8px}}
@media(max-width:1000px){.tasks-overview-strip.v3{grid-template-columns:minmax(0,1fr) minmax(0,1.5fr)}.tasks-overview-strip.v3 .ta15-rank{grid-column:1/-1;height:132px}.ta15-reel{max-width:440px;width:100%;align-self:center}.account-identity{display:none}}
@media(max-width:640px){.tasks-overview-strip.v3{grid-template-columns:minmax(0,1fr)}.tasks-overview-strip.v3 .ta15-rank{grid-column:auto}.tasks-overview-strip.v3 .ta15-card{height:auto;min-height:136px}.ta15-badge-shelf{flex-wrap:wrap;gap:10px 6px;margin:9px 0}.ta15-medal{flex:1 0 45px;min-width:40px}.ta15-medal-label{font-size:10px}.ta15-achievements-foot{flex-wrap:wrap}.ta15-rank-head{margin-bottom:5px}.ta15-reel{height:83px;min-height:83px}.tasks-freshness-compact{flex-wrap:wrap;gap:8px}}
@media(prefers-reduced-motion:reduce){.ta15-progress-track span{transition:none}}
'''

OVERVIEW = r'''<div class="tasks-overview-strip v3" aria-label="Tasks Assistant overview" data-ui-build="15">
      <div class="ta15-card ta15-performance">
        <div class="ta15-gauge" id="tasksScoreRing" role="img" aria-label="BO score">
          <div class="ta15-gauge-value"><strong id="tasksScore">-</strong><small>/100</small></div>
        </div>
        <div class="ta15-performance-copy">
          <div class="ta15-card-head"><span class="ta15-eyebrow" id="tasksScoreTitle">BO Score &amp; Level</span><button class="ta15-info" type="button" data-ta15-info="score" aria-label="How the BO score and levels work" aria-haspopup="dialog">i</button></div>
          <div class="ta15-level"><span class="ta15-shield" id="tasksLevelNumber" aria-label="BO level">-</span><div class="ta15-level-name"><b id="tasksLevelName">-</b><span id="tasksLevelRange">Score-based level</span></div></div>
          <div class="ta15-progress-track" role="progressbar" aria-label="Progress to the next BO level" id="tasksLevelProgressTrack" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="tasksLevelProgress"></span></div>
          <div class="ta15-progress-caption"><span id="tasksNextLevelText">Next level</span><strong id="tasksNextLevelGap">-</strong></div>
          <span class="screen-reader" id="tasksScoreText"></span>
        </div>
      </div>
      <div class="ta15-card ta15-achievements">
        <div class="ta15-card-head"><span class="ta15-eyebrow">Task Achievements</span><button class="ta15-counter" id="tasksOpenJump" type="button" title="Go to priority tasks"><b id="tasksOpenCount">-</b><span>Open tasks</span></button></div>
        <div class="ta15-badge-shelf" id="tasksRecentBadges" aria-label="Earned and available badges"></div>
        <div class="ta15-achievements-foot"><span><b id="tasksBadgeTotal">-</b> badges earned</span><span class="ta15-key">Check = earned &nbsp; / &nbsp; Lock = available</span></div>
      </div>
      <div class="ta15-card ta15-rank">
        <div class="ta15-rank-head"><span class="ta15-eyebrow">Professional Rank</span><span class="ta15-rank-status" id="tasksRankHint">Building history</span></div>
        <div class="ta15-reel" id="tasksRankReel" aria-label="Professional rank progression">
          <div class="ta15-reel-line next"><small id="tasksRankNextState">Next &uarr;</small><b id="tasksRankNext">Controller</b></div>
          <div class="ta15-reel-line current"><small>Current</small><strong id="tasksProfessionalRank">Builder</strong></div>
          <div class="ta15-reel-line previous"><small id="tasksRankPrevState">Start</small><b id="tasksRankPrev">Starting rank</b></div>
        </div>
        <button class="ta15-rank-footer" type="button" data-ta15-info="rank" aria-haspopup="dialog">Performance details &nearr;</button>
      </div>
    </div>

    '''

HELPERS = r'''
/* Tasks overview presentation only. Existing score/rank/award calculations stay unchanged. */
const TA15_RANKS=['Builder','Controller','Optimizer','Strategist','Vanguard'];
const TA15_BADGES={
 'Supplier Closer':{short:'Suppliers',color:'#6653d8',icon:'supplier'},
 'Profit Protector':{short:'Profit',color:'#16816c',icon:'profit'},
 'Recovery Specialist':{short:'Recovery',color:'#387dcc',icon:'recovery'},
 'Crisis Reviewer':{short:'Critical',color:'#bc731b',icon:'critical'},
 'Crisis Resolver':{short:'Critical',color:'#bc731b',icon:'critical'},
 'Data Cleaner':{short:'Data',color:'#5767ac',icon:'data'},
 'Cycle Breaker':{short:'Aging',color:'#9d6090',icon:'aging'},
 'Order Controller':{short:'Orders',color:'#4d7692',icon:'orders'}
};
const TA15_PATHS={
 supplier:'<path d="m2 9 4-4 4 1 3-1 3 1 6 5-5 6-4 2-6-3-5-4zm6-2 3 3 3-3m-6 7 4 3m-2-6 5 4M1 8l3-4m16 3 3 3"/>',
 profit:'<path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5zm-5 12 4-4 3 3 3-5m-3 0h3v3"/>',
 recovery:'<path d="M4 9a8 8 0 1 1 0 6m0-6V3m0 6h6m-1 4 3 3 5-6"/>',
 critical:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M10 6v4m0 3h.01"/>',
 data:'<ellipse cx="10" cy="5" rx="7" ry="3"/><path d="M3 5v12c0 3 7 4 11 2M17 5v5M3 11c0 3 10 4 14 1m-2 4 3 3 5-6"/>',
 aging:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
 orders:'<path d="M8 4H4v18h16V4h-4M8 2h8v4H8zm-1 12 3 3 7-7"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 check:'<path d="m4 12 5 5L20 6"/>'
};
const ta15Ui={data:null,model:null,tasks:[],badges:[],rank:null,owner:null};
function ta15Icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(TA15_PATHS[name]||TA15_PATHS.orders)+'</svg>';}
function ta15ShowInfo(kind,index){
 let dialog=$('tasksInsightsDialog');
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='tasksInsightsDialog';dialog.className='ta15-dialog';dialog.setAttribute('aria-labelledby','tasksInsightsTitle');document.body.append(dialog);
  dialog.addEventListener('click',ev=>{if(ev.target===dialog){const r=dialog.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)dialog.close();}});
 }
 let title='',body='';
 if(kind==='score'){
  title='BO score & levels';
  body='<p>The score describes current purchasing health. BO Level is the visual translation of that same score, not the employee\'s professional rank.</p><div class="ta15-facts"><span>Stock shortage health</span><strong>55%</strong><span>Products needing orders</span><strong>25%</strong><span>Supplier backlog</span><strong>15%</strong><span>Master-data quality</span><strong>5%</strong></div><p>Level 1 starts at 40. Each additional 5 score points unlocks another level, up to Level 12 at 95. Below 40 is the recovery stage. The progress bar shows the distance to the next level; it does not represent points or badges.</p>';
 }else if(kind==='rank'){
  title='Professional rank';
  const d=ta15Ui.data||{},m=d.rank_metrics||{},n=Number(m.history_count||0),rank=d.professional_rank||'Builder';
  body='<p>Your rank follows recorded performance over the last 90 days, separately from task counts and badges. It can move up or down as performance changes.</p><div class="ta15-ranks">'+TA15_RANKS.map(r=>'<span class="'+(r===rank?'current':'')+'">'+esc(r)+'</span>').join('')+'</div><div class="ta15-facts"><span>Recorded snapshots</span><strong>'+n+'</strong><span>Current rank</span><strong>'+esc(rank)+'</strong>'+(n>=3?'<span>Recorded net score change</span><strong>'+esc(m.net_change??'-')+'</strong><span>Recorded retention</span><strong>'+esc(m.retention_rate??'-')+'%</strong>':'')+'</div><p>'+(n<5?'Preliminary: more recorded stock history is needed for a meaningful trend.':'The current assessment uses the history available to the system.')+' Adjacent names show the rank sequence, not a certification that a rank was previously earned.</p>';
 }else{
  const badge=ta15Ui.badges[index];if(!badge)return;
  title=badge.label;
  const matching=ta15Ui.tasks.filter(t=>t.status==='open'&&t.badge_label===badge.label);
  body='<p><strong>'+(badge.earned?'Earned badge':'Available from an open task')+'</strong></p><p>'+(badge.earned?'This badge remains colored when new tasks offering the same badge appear.':'The lock indicates an unearned badge. The related tasks are available to work on now.')+'</p><div class="ta15-facts"><span>Matching open tasks</span><strong>'+matching.length+'</strong></div>'+matching.map(t=>'<div class="ta15-task-title" dir="auto">'+esc(t.title)+'</div>').join('')+(matching.length?'<button class="btn outline" id="tasksBadgeJump" type="button">Go to matching tasks</button>':'<p>No matching task is currently open.</p>');
 }
 dialog.innerHTML='<header><h2 id="tasksInsightsTitle">'+esc(title)+'</h2><button class="ta15-info" type="button" id="tasksInsightsClose" aria-label="Close details">&times;</button></header><div class="ta15-dialog-body">'+body+'</div>';
 $('tasksInsightsClose').onclick=()=>dialog.close();
 const jump=$('tasksBadgeJump');
 if(jump)jump.onclick=()=>{dialog.close();const badge=ta15Ui.badges[index];const task=ta15Ui.tasks.find(t=>t.status==='open'&&t.badge_label===badge.label);const btn=[...document.querySelectorAll('.tasks-open-task')].find(b=>b.dataset.taskId===task?.id);const dest=btn?.closest('article')||$('tasksPriorityList');dest?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});btn?.focus({preventScroll:true});};
 if(!dialog.open)dialog.showModal();
}
function renderOverviewV15(data,model,tasks){
 ta15Ui.data=data;ta15Ui.model=model;ta15Ui.tasks=tasks;
 const score=Math.round(model.score),lv=scoreLevelForScore(score);
 $('tasksScore').textContent=score;$('tasksScoreRing').style.setProperty('--score',score);$('tasksScoreRing').setAttribute('aria-label','BO score '+score+' out of 100');
 $('tasksScoreTitle').textContent='BO Score & Level';
 $('tasksScoreText').textContent='Business health based on stock coverage, order backlog, supplier backlog and master-data quality.';
 $('tasksLevelNumber').textContent=lv.n;$('tasksLevelNumber').setAttribute('aria-label','BO Level '+lv.n);
 $('tasksLevelName').textContent=lv.name;$('tasksLevelRange').textContent='Level '+lv.n+' / 12';
 const low=lv.n<=0?0:40+(lv.n-1)*5,next=lv.n>=12?100:lv.n<=0?40:40+lv.n*5;
 const progress=lv.n>=12?100:Math.max(0,Math.min(100,100*(score-low)/Math.max(1,next-low)));
 $('tasksLevelProgress').style.width=progress+'%';$('tasksLevelProgressTrack').setAttribute('aria-valuenow',String(Math.round(progress)));
 $('tasksNextLevelText').textContent=lv.n>=12?'Highest BO level':'Next: L'+(lv.n+1)+' at '+next;
 $('tasksNextLevelGap').textContent=lv.n>=12?'Maintain it':Math.max(0,next-score)+' to go';
 $('tasksOpenCount').textContent=tasks.filter(t=>t.status==='open').length;
 $('tasksBadgeTotal').textContent=data?.badge_total??0;
 const recent=Array.isArray(data?.recent_badges)?data.recent_badges:[];
 const earned=new Set([...recent.map(b=>b.badge_label),...tasks.filter(t=>t.status==='completed').map(t=>t.badge_label)].filter(Boolean));
 const pending=tasks.filter(t=>t.status==='open').map(t=>t.badge_label).filter(Boolean);
 ta15Ui.badges=[...new Set([...earned,...pending])].map(label=>({label,earned:earned.has(label)}));
 $('tasksRecentBadges').innerHTML=ta15Ui.badges.length?ta15Ui.badges.map((b,i)=>{
  const c=TA15_BADGES[b.label]||{short:b.label,color:'#6653d8',icon:'orders'};
  return '<button type="button" class="ta15-medal '+(b.earned?'earned':'pending')+'" data-ta15-info="badge" data-badge-index="'+i+'" style="--medal-color:'+c.color+'" aria-haspopup="dialog" aria-label="'+esc(b.label)+(b.earned?' - earned':' - available from open tasks')+'" title="'+esc(b.label)+'"><span class="ta15-medal-face">'+ta15Icon(c.icon)+'<span class="ta15-medal-state">'+ta15Icon(b.earned?'check':'lock')+'</span></span><span class="ta15-medal-label">'+esc(c.short)+'</span></button>';
 }).join(''):'<span style="font-size:11px;color:#74829b">No task badges available yet.</span>';
 const rank=data?.professional_rank||'Builder',idx=Math.max(0,TA15_RANKS.indexOf(rank)),owner=state.session?.user?.id||'local';
 $('tasksProfessionalRank').textContent=rank;
 $('tasksRankNext').textContent=idx===4?'Vanguard':TA15_RANKS[idx+1];$('tasksRankNextState').textContent=idx===4?'Top tier':'Next \u2191';
 $('tasksRankPrev').textContent=idx===0?'Starting rank':TA15_RANKS[idx-1];$('tasksRankPrevState').textContent=idx===0?'Start':'Previous';
 const count=Number(data?.rank_metrics?.history_count||0);$('tasksRankHint').textContent=count<5?'Preliminary':'90-day view';
 $('tasksRankHint').title=count+' recorded stock snapshots';
 if(ta15Ui.owner===owner&&ta15Ui.rank!==null&&ta15Ui.rank!==rank&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const up=idx>TA15_RANKS.indexOf(ta15Ui.rank),reel=$('tasksRankReel');
  reel.animate([{transform:'translateY('+(up?'-8':'8')+'px)',opacity:.65},{transform:'translateY(0)',opacity:1}],{duration:280,easing:'ease-out'});
 }
 ta15Ui.rank=rank;ta15Ui.owner=owner;
 const strip=document.querySelector('.tasks-overview-strip.v3');
 if(!strip.dataset.infoBound){strip.dataset.infoBound='true';strip.addEventListener('click',event=>{const b=event.target.closest('[data-ta15-info]');if(b)ta15ShowInfo(b.dataset.ta15Info,Number(b.dataset.badgeIndex));});}
}
'''

def patch(s: str) -> str:
    assert 'data-ui-build="15"' not in s, 'Build 15 already present'
    css_start = s.index('\n.account-identity{')
    css_end = s.index('</style></head>', css_start)
    s = s[:css_start] + STYLE + s[css_end:]
    section = s.index('<section class="hidden" data-panel="tasks-assistant">')
    start = s.index('    <div class="tasks-header">', section)
    end = s.index('<div class="tasks-overview-strip v2">', start)
    s = s[:start] + '    <h2 class="screen-reader">Tasks Assistant</h2>\n    ' + s[end:]
    start = s.index('<div class="tasks-overview-strip v2">', section)
    end = s.index('<div class="dashboard-freshness-card tasks-freshness-compact">', start)
    s = s[:start] + OVERVIEW + s[end:]
    start = s.index('function renderTasksAssistant(data,model){')
    end = s.index(' const cycle=data?.cycle;', start)
    prefix = "function renderTasksAssistant(data,model){\n const freshness=renderTasksInventoryFreshness();\n const tasks=Array.isArray(data?.tasks)?data.tasks:[];\n renderOverviewV15(data,model,tasks);\n"
    s = s[:start] + HELPERS + '\n' + prefix + s[end:]
    needle = "function go(tab){document.querySelectorAll('[data-panel]')"
    assert s.count(needle) == 1
    s = s.replace(needle,"function go(tab){document.querySelector('main.page')?.classList.toggle('tasks-view',tab==='tasks-assistant');document.querySelectorAll('[data-panel]')",1)
    s = s.replace('Current stock refresh. A new task cycle starts with every new full inventory upload.','Each full upload starts a new task cycle. Refresh stock within 48 hours.')
    assert s.count('Live Build 14') == 1
    s = s.replace('Live Build 14','Live Build 15')
    s = s.replace('<span class="build-tag">MS Purchasing LIVE |','<span class="build-tag">MS Purchasing LIVE - Build 15 |',1)
    return s

def validate(s: str) -> None:
    scripts = re.findall(r'<script(?:\s[^>]*)?>([\s\S]*?)</script>',s, re.I)
    assert len(scripts)==4, 'Unexpected script count'
    for i,script in enumerate(scripts):
        result = subprocess.run(['node','--check'],input=script,text=True,capture_output=True)
        if result.returncode:
            raise RuntimeError(f'Script {i+1}: {result.stderr}')
    static = re.sub(r'<script(?:\s[^>]*)?>[\s\S]*?</script>','',s, flags=re.I)
    ids = re.findall(r'\bid="([^"]+)"',static)
    assert len(ids)==len(set(ids)), 'Duplicate static HTML IDs'
    for name in ['tasksScore','tasksLevelNumber','tasksOpenCount','tasksBadgeTotal','tasksProfessionalRank','tasksRankReel','tasksRecentBadges']:
        assert ids.count(name)==1, f'Missing/duplicate {name}'
    assert 'class="tasks-header"' not in static, 'Large page heading remains'
    assert 'badge-medal.pending .badge-medal-icon:after' not in s, 'Old dot icon remains'
    assert 'rank-prev strong:before' not in s, 'False passed-rank check remains'
    assert 'function taskStillOpenfunction' not in s
    print('Validated 4 scripts, unique IDs, badge/rank layout, and unchanged API access.')

if __name__ == '__main__':
    path = Path(sys.argv[1] if len(sys.argv)>1 else 'index.html')
    target = Path(sys.argv[2]) if len(sys.argv)>2 else path
    raw = path.read_bytes()
    blob = hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    assert blob==EXPECTED, f'Source has changed: {blob}. Review before patching.'
    output = patch(raw.decode('utf-8'))
    validate(output)
    target.write_text(output,encoding='utf-8')
    print('Wrote verified Tasks UI Build 15:',target)
