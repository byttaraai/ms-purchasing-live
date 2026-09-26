/* Build 86: Task Assistant focus layout. Presentation/navigation only. No purchasing logic changes. */
(function(){
  'use strict';
  let initialized=false;
  let showAllSuppliers=false;
  const byId=id=>document.getElementById(id);

  function outputItemCount(o){
    try{
      if(typeof window.supplierQuestOutputItems==='function')return window.supplierQuestOutputItems(o).length;
      if(o?.output_type==='supplier_bo')return (o?.payload?.batches||[]).reduce((n,b)=>n+(b?.items||[]).length,0);
      return (o?.payload?.items||[]).length;
    }catch(_){return 0;}
  }

  function ensureOutputNav(){
    const nav=document.querySelector('.topbar nav');if(!nav)return null;
    let btn=nav.querySelector('[data-tab="output-lists"]');
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';btn.dataset.tab='output-lists';btn.className='ta86-output-nav';
      btn.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"></path></svg><span>Output Lists</span><b id="ta86OutputCount" class="ta86-output-count hidden">0</b>';
      nav.append(btn);
      btn.onclick=()=>{if(typeof window.go==='function')window.go('output-lists');moveOutputs();if(typeof window.supplierQuestLoadOutputs==='function')void window.supplierQuestLoadOutputs();};
    }
    return btn;
  }

  function ensureOutputPage(){
    let section=document.querySelector('[data-panel="output-lists"]');
    if(!section){
      const tasks=document.querySelector('[data-panel="tasks-assistant"]');
      if(!tasks)return null;
      section=document.createElement('section');
      section.className='hidden';section.dataset.panel='output-lists';
      section.innerHTML='<div class="ta86-output-page"><div class="ta86-output-page-head"><div><span>SUPPLIER REVIEW OUTPUTS</span><h2>Output Lists</h2><p>Prepared Supplier BOs and follow-up lists by department. These are worklists, not sent orders or verified task completions.</p></div></div><div id="ta86OutputMount"></div></div>';
      tasks.insertAdjacentElement('afterend',section);
    }
    return section;
  }

  function moveOutputs(){
    const section=ensureOutputPage();if(!section)return;
    const mount=byId('ta86OutputMount');if(!mount)return;
    const panel=byId('supplierQuestOutputs');
    if(panel&&panel.parentElement!==mount)mount.append(panel);
    if(panel)panel.classList.remove('hidden');
    const tabs=byId('supplierQuestPageTabs');
    if(tabs)tabs.classList.add('hidden');
    const board=byId('tasksPriorityList');if(board)board.classList.remove('hidden');
    relabelOutputs();
  }

  function relabelOutputs(){
    const panel=byId('supplierQuestOutputs');if(!panel)return;
    const h=panel.querySelector('.sq-output-header h3');if(h)h.textContent='Output Lists';
    const eye=panel.querySelector('.sq-output-header .sq-eyebrow');if(eye)eye.textContent='PREPARED WORKLISTS';
  }

  function updateOutputBadge(outputs){
    const count=(outputs||[]).filter(o=>outputItemCount(o)>0).length;
    const badge=byId('ta86OutputCount');if(!badge)return;
    badge.textContent=String(count);badge.classList.toggle('hidden',count===0);
  }

  function ensurePageHead(){
    const page=document.querySelector('[data-panel="tasks-assistant"] .tasks-assistant-page');if(!page)return;
    page.classList.add('ta86-focus');
    let head=byId('ta86TasksHead');
    if(!head){
      head=document.createElement('div');head.id='ta86TasksHead';head.className='ta86-page-head';
      head.innerHTML='<div><h2>Tasks Assistant</h2><p>Complete the highest-impact purchasing tasks from the current inventory cycle.</p></div><div class="ta86-head-actions"></div>';
      page.prepend(head);
    }
    const jump=byId('tasksOpenJump'),actions=head.querySelector('.ta86-head-actions');
    if(jump&&actions&&jump.parentElement!==actions){jump.title='Go to priority tasks';actions.append(jump);}
  }

  function arrangeOverview(){
    const strip=document.querySelector('.tasks-overview-strip.v3');if(!strip)return;
    strip.classList.add('ta86-rail');
    const score=strip.querySelector('.ta15-performance'),rank=strip.querySelector('.ta15-rank'),ach=strip.querySelector('.ta15-achievements');
    if(score)score.style.order='1';
    if(rank)rank.style.order='2';
    if(ach)ach.style.order='3';
    if(ach){
      const head=ach.querySelector('.ta15-card-head');
      if(head&&!head.querySelector('.ta86-badge-view')){
        const label=document.createElement('span');label.className='ta86-badge-summary ta86-badge-view';label.textContent='Badges';head.append(label);
      }
    }
  }

  function decorateSupplierCards(){
    const column=document.querySelector('.ta16-suppliers');if(!column)return;
    const list=column.querySelector('.ta16-task-list'),cards=list?[...list.children].filter(x=>x.classList.contains('ta16-task')):[];
    if(!cards.length)return;
    const head=column.querySelector('.ta16-column-head'),desc=head?.querySelector('p');
    if(desc)desc.textContent='Highest-impact suppliers in the current saved cycle.';
    let actions=head?.querySelector('.ta86-supplier-head-actions');
    if(head&&!actions){
      const count=head.querySelector('.ta16-open-count');
      actions=document.createElement('div');actions.className='ta86-supplier-head-actions';
      if(count)actions.append(count);
      const toggle=document.createElement('button');toggle.type='button';toggle.id='ta86SupplierToggle';toggle.className='btn outline ta86-view-all';
      actions.append(toggle);head.append(actions);
    }
    const toggle=byId('ta86SupplierToggle');
    cards.forEach((card,i)=>card.classList.toggle('ta86-supplier-hidden',!showAllSuppliers&&i>=5));
    if(toggle){
      toggle.textContent=showAllSuppliers?'Show Top 5':'View All '+cards.length+' →';
      toggle.classList.toggle('hidden',cards.length<=5);
      toggle.onclick=()=>{showAllSuppliers=!showAllSuppliers;decorateSupplierCards();};
    }
    cards.forEach(card=>{
      const b=card.querySelector('.tasks-open-task');if(!b)return;
      const resume=/Resume Review|View Review/i.test(b.textContent||'');
      let chip=card.querySelector('.ta86-task-state');
      if(resume&&!chip){chip=document.createElement('span');chip.className='ta86-task-state';chip.textContent=/View Review/i.test(b.textContent)?'Reviewed':'In progress';card.querySelector('.ta16-task-meta')?.append(chip);}
      if(!resume&&chip)chip.remove();
    });
  }

  function arrangeBoard(){
    const board=byId('tasksPriorityList');if(!board)return;
    board.classList.add('ta86-board');
    decorateSupplierCards();
    const master=board.querySelector('.ta16-master');
    if(master){
      master.classList.add('ta86-master-compact');
      const help=master.querySelector('.ta16-master-help');if(help)help.classList.add('hidden');
    }
  }

  function arrangeTasks(){
    ensurePageHead();arrangeOverview();arrangeBoard();moveOutputs();
  }

  function wrapRenderers(){
    if(typeof window.renderTasksAssistant==='function'&&!window.renderTasksAssistant.__ta86){
      const base=window.renderTasksAssistant;
      const wrapped=function(...args){const out=base.apply(this,args);requestAnimationFrame(arrangeTasks);return out;};
      wrapped.__ta86=true;window.renderTasksAssistant=wrapped;
    }
    if(typeof window.sqPaintPageTabs==='function'){
      window.sqPaintPageTabs=function(){
        byId('tasksPriorityList')?.classList.remove('hidden');
        byId('supplierQuestOutputs')?.classList.remove('hidden');
        byId('supplierQuestPageTabs')?.classList.add('hidden');
      };
    }
    if(typeof window.supplierQuestRenderOutputs==='function'&&!window.supplierQuestRenderOutputs.__ta86){
      const base=window.supplierQuestRenderOutputs;
      const wrapped=function(outputs){const out=base.apply(this,arguments);moveOutputs();updateOutputBadge(outputs);return out;};
      wrapped.__ta86=true;window.supplierQuestRenderOutputs=wrapped;
    }
  }

  function init(){
    if(initialized)return;initialized=true;
    ensureOutputNav();ensureOutputPage();wrapRenderers();arrangeTasks();
    if(window.SupplierQuestUI?.outputs)updateOutputBadge(window.SupplierQuestUI.outputs);
  }

  addEventListener('load',init);
  setTimeout(()=>{if(document.readyState==='complete'&&typeof window.go==='function')init();},0);
})();