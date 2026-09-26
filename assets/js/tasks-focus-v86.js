/* Build 86: task-focused Tasks Assistant layout and top-level Output Lists. Presentation only. */
'use strict';
(function(){
  const ui={supplierExpanded:false,installed:false};

  function outputHost(){return document.getElementById('outputListsHost');}
  function outputBadge(){return document.getElementById('outputListsNavCount');}
  function outputItems(o){
    if(typeof supplierQuestOutputItems==='function')return supplierQuestOutputItems(o);
    return o?.output_type==='supplier_bo'
      ?(o?.payload?.batches||[]).flatMap(b=>b.items||[])
      :(o?.payload?.items||[]);
  }
  function outputCount(outputs){
    return (outputs||[]).filter(o=>outputItems(o).length>0).length;
  }
  function updateOutputBadge(outputs){
    const b=outputBadge();if(!b)return;
    const n=outputCount(outputs);
    b.textContent=String(n);
    b.hidden=n===0;
    b.setAttribute('aria-label',n===1?'1 prepared output list':n+' prepared output lists');
  }
  function moveOutputsPanel(){
    const host=outputHost();const panel=document.getElementById('supplierQuestOutputs');
    if(host&&panel&&panel.parentElement!==host)host.append(panel);
    document.getElementById('supplierQuestPageTabs')?.remove();
    document.getElementById('tasksPriorityList')?.classList.remove('hidden');
    if(panel)panel.classList.remove('hidden');
    return panel;
  }
  function patchOutputHeader(){
    const panel=moveOutputsPanel();if(!panel)return;
    const eyebrow=panel.querySelector('.sq-output-header .sq-eyebrow');
    const title=panel.querySelector('.sq-output-header h3');
    const copy=panel.querySelector('.sq-output-header p');
    if(eyebrow)eyebrow.textContent='PREPARED WORKLISTS';
    if(title)title.textContent='Output Lists';
    if(copy)copy.textContent='Prepared supplier-review lists by department. Preparing a list does not mean it has been sent or completed.';
  }
  function installOutputLists(){
    if(typeof supplierQuestEnsureOutputsPanel==='function'){
      window.supplierQuestEnsureOutputsPanel=function(){
        let panel=document.getElementById('supplierQuestOutputs');
        const host=outputHost();
        if(!panel&&host){panel=document.createElement('section');panel.id='supplierQuestOutputs';panel.className='sq82-outputs';host.append(panel);}
        else if(panel&&host&&panel.parentElement!==host)host.append(panel);
        document.getElementById('supplierQuestPageTabs')?.remove();
        document.getElementById('tasksPriorityList')?.classList.remove('hidden');
        panel?.classList.remove('hidden');
        return panel;
      };
    }
    if(typeof sqPaintPageTabs==='function')window.sqPaintPageTabs=function(){
      document.getElementById('supplierQuestPageTabs')?.remove();
      document.getElementById('tasksPriorityList')?.classList.remove('hidden');
      document.getElementById('supplierQuestOutputs')?.classList.remove('hidden');
    };
    if(typeof supplierQuestRenderOutputs==='function'&&!supplierQuestRenderOutputs.__taskFocus86){
      const base=supplierQuestRenderOutputs;
      const wrapped=function(outputs){
        const result=base.apply(this,arguments);
        moveOutputsPanel();patchOutputHeader();updateOutputBadge(outputs);
        return result;
      };
      wrapped.__taskFocus86=true;window.supplierQuestRenderOutputs=wrapped;
    }
    const nav=document.querySelector('nav [data-tab="output-lists"]');
    if(nav&&!nav.dataset.ta86Bound){
      nav.dataset.ta86Bound='true';
      nav.addEventListener('click',()=>{moveOutputsPanel();if(typeof supplierQuestLoadOutputs==='function')void supplierQuestLoadOutputs();});
    }
    moveOutputsPanel();
    updateOutputBadge(typeof SupplierQuestUI!=='undefined'?(SupplierQuestUI.outputs||[]):[]);
  }

  function ensureHeading(page){
    let h=document.getElementById('ta86PageHeading');
    if(!h){
      h=document.createElement('div');h.id='ta86PageHeading';h.className='ta86-page-heading';
      h.innerHTML='<div><span class="ta86-eyebrow">CURRENT WORK QUEUE</span><h2>Tasks Assistant</h2><p>Complete the highest-impact purchasing work from the latest inventory cycle.</p></div><div class="ta86-heading-actions" id="ta86HeadingActions"></div>';
      page.prepend(h);
    }
    const actions=document.getElementById('ta86HeadingActions');
    const open=document.getElementById('tasksOpenJump');
    if(actions&&open&&open.parentElement!==actions)actions.append(open);
    return h;
  }

  function budgetMetrics(){
    const rows=typeof state!=='undefined'&&Array.isArray(state.rows)?state.rows:[];
    let shortage=0,inventory=0;
    for(const r of rows){
      if(typeof averageShortageValue==='function')shortage+=Number(averageShortageValue(r)||0);
      if(typeof C!=='undefined'&&C.finite(r.total_value)&&Number(r.total_value)>0)inventory+=Number(r.total_value);
    }
    const pct=inventory>0?shortage/inventory*100:null;
    return{shortage,inventory,pct};
  }
  function ensureBudgetCard(rail){
    let card=document.getElementById('ta86Budget');
    if(!card){
      card=document.createElement('section');card.id='ta86Budget';card.className='ta86-budget-card';
      card.innerHTML='<div class="ta86-budget-head"><div><span class="ta15-eyebrow">Budget Performance</span><small>Current inventory</small></div><button class="ta15-info" type="button" id="ta86BudgetInfo" aria-label="Budget performance details">i</button></div><strong id="ta86BudgetValue">SAR —</strong><div class="ta86-budget-meta"><span>Total Shortage Value</span><b id="ta86BudgetPct">—</b></div><div class="ta86-budget-track" aria-hidden="true"><span id="ta86BudgetFill"></span></div><small id="ta86BudgetInventory">Inventory value: —</small>';
      card.querySelector('#ta86BudgetInfo').onclick=()=>{
        if(typeof ta16ShowDetails==='function')ta16ShowDetails('Budget Performance','<p>This card reuses the approved Total Shortage Value and current inventory value. It does not introduce a new budget, purchasing, score or risk calculation.</p>');
      };
    }
    const m=budgetMetrics(),value=document.getElementById('ta86BudgetValue'),pct=document.getElementById('ta86BudgetPct'),fill=document.getElementById('ta86BudgetFill'),inv=document.getElementById('ta86BudgetInventory');
    if(value)value.textContent='SAR '+(typeof fmt==='function'?fmt(m.shortage,0):Math.round(m.shortage).toLocaleString());
    if(pct)pct.textContent=m.pct===null?'—':(typeof fmt==='function'?fmt(m.pct,1):m.pct.toFixed(1))+'% of inventory';
    if(fill)fill.style.width=(m.pct===null?0:Math.max(0,Math.min(100,m.pct)))+'%';
    if(inv)inv.textContent='Inventory value: SAR '+(typeof fmt==='function'?fmt(m.inventory,0):Math.round(m.inventory).toLocaleString());
    if(rail&&card.parentElement!==rail)rail.append(card);
    return card;
  }

  function ensureWorkspace(page){
    let layout=document.getElementById('ta86Workspace');
    if(!layout){
      layout=document.createElement('div');layout.id='ta86Workspace';layout.className='ta86-workspace';
      const board=document.getElementById('tasksPriorityList');
      board?.insertAdjacentElement('beforebegin',layout);
      if(board)layout.append(board);
      const rail=document.createElement('aside');rail.id='ta86RightRail';rail.className='ta86-right-rail';rail.setAttribute('aria-label','Performance summary');layout.append(rail);
    }
    return layout;
  }

  function arrangeOverview(page){
    const layout=ensureWorkspace(page),rail=document.getElementById('ta86RightRail');if(!layout||!rail)return;
    const perf=document.querySelector('.tasks-overview-strip.v3 .ta15-performance, #ta86RightRail .ta15-performance');
    const rank=document.querySelector('.tasks-overview-strip.v3 .ta15-rank, #ta86RightRail .ta15-rank');
    const achievements=document.querySelector('.tasks-overview-strip.v3 .ta15-achievements, #ta86RightRail .ta15-achievements');
    if(perf&&perf.parentElement!==rail)rail.append(perf);
    ensureBudgetCard(rail);
    if(rank&&rank.parentElement!==rail)rail.append(rank);
    if(achievements&&achievements.parentElement!==rail)rail.append(achievements);
    document.querySelector('.tasks-overview-strip.v3')?.classList.add('ta86-retired-strip');
  }

  function supplierCards(){
    return [...document.querySelectorAll('#tasksPriorityList .ta16-suppliers .ta16-task-list>.ta16-task')];
  }
  function applySupplierLimit(){
    const cards=supplierCards(),column=document.querySelector('#tasksPriorityList .ta16-suppliers');if(!column)return;
    const total=cards.length,limit=5;
    cards.forEach((card,i)=>{card.hidden=!ui.supplierExpanded&&i>=limit;});
    let controls=column.querySelector('.ta86-supplier-controls');
    if(!controls){
      controls=document.createElement('div');controls.className='ta86-supplier-controls';
      const head=column.querySelector('.ta16-column-head');head?.append(controls);
    }
    if(total>limit){
      controls.innerHTML='<span>'+(ui.supplierExpanded?total:Math.min(limit,total))+' shown</span><button type="button" class="btn outline" id="ta86SupplierToggle">'+(ui.supplierExpanded?'Show Top 5':'View All '+total)+' →</button>';
      document.getElementById('ta86SupplierToggle').onclick=()=>{ui.supplierExpanded=!ui.supplierExpanded;applySupplierLimit();};
    }else controls.innerHTML='<span>'+total+' shown</span>';
  }

  function markSupplierStates(){
    for(const card of supplierCards()){
      card.querySelector('.ta86-task-state')?.remove();
      const btn=card.querySelector('.tasks-open-task');if(!btn)continue;
      const label=(btn.textContent||'').trim();
      let stateLabel='';
      if(/Resume Review/i.test(label))stateLabel='In progress';
      else if(/View Review/i.test(label))stateLabel='Reviewed';
      if(stateLabel){
        const state=document.createElement('span');state.className='ta86-task-state '+(stateLabel==='Reviewed'?'done':'progress');state.textContent=stateLabel;
        btn.parentElement?.insertBefore(state,btn);
      }
    }
  }

  function compactMaster(){
    const master=document.querySelector('#tasksPriorityList .ta16-master');if(!master)return;
    master.classList.add('ta86-master-compact');
    const notice=master.querySelector('.ta16-notice p');if(notice)notice.classList.add('ta86-master-copy');
  }

  function arrangeTaskPage(){
    const page=document.querySelector('[data-panel="tasks-assistant"] .tasks-assistant-page');if(!page)return;
    ensureHeading(page);arrangeOverview(page);applySupplierLimit();markSupplierStates();compactMaster();
    document.getElementById('supplierQuestPageTabs')?.remove();
    moveOutputsPanel();
  }

  function installRenderHooks(){
    if(typeof renderTasksAssistant==='function'&&!renderTasksAssistant.__taskFocus86){
      const base=renderTasksAssistant;
      const wrapped=function(){
        const result=base.apply(this,arguments);
        arrangeTaskPage();
        return result;
      };
      wrapped.__taskFocus86=true;window.renderTasksAssistant=wrapped;
    }
    if(typeof sqUpdateTaskButtons==='function'&&!sqUpdateTaskButtons.__taskFocus86){
      const base=sqUpdateTaskButtons;
      const wrapped=function(){const r=base.apply(this,arguments);markSupplierStates();return r;};
      wrapped.__taskFocus86=true;window.sqUpdateTaskButtons=wrapped;
    }
  }

  addEventListener('load',()=>{
    if(ui.installed)return;ui.installed=true;
    installOutputLists();installRenderHooks();arrangeTaskPage();
    const nav=document.querySelector('nav [data-tab="tasks-assistant"]');
    nav?.addEventListener('click',()=>requestAnimationFrame(arrangeTaskPage));
  });

  window.TasksFocus86={arrangeTaskPage,moveOutputsPanel,applySupplierLimit,updateOutputBadge};
})();