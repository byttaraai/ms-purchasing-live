/* Build 87: move open-task visibility into the Tasks Assistant top navigation tab. UI only. */
(function(){
  'use strict';
  let initialized=false;
  const byId=id=>document.getElementById(id);

  function ensureTaskNavBadge(){
    const tab=document.querySelector('.topbar nav [data-tab="tasks-assistant"]');
    if(!tab)return null;
    let badge=byId('ta87TaskCount');
    if(!badge){
      badge=document.createElement('b');
      badge.id='ta87TaskCount';
      badge.className='ta87-task-count hidden';
      badge.setAttribute('aria-hidden','true');
      tab.append(badge);
    }
    return badge;
  }

  function taskCountFromDom(){
    const raw=String(byId('tasksOpenCount')?.textContent||'').trim();
    const n=Number(raw.replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)&&n>=0?Math.floor(n):0;
  }

  function updateTaskNavBadge(tasks){
    const badge=ensureTaskNavBadge(),tab=document.querySelector('.topbar nav [data-tab="tasks-assistant"]');
    if(!badge||!tab)return;
    const count=Array.isArray(tasks)?tasks.filter(t=>t?.status==='open').length:taskCountFromDom();
    badge.textContent=count>99?'99+':String(count);
    badge.classList.toggle('hidden',count===0);
    tab.title=count?count+' open task'+(count===1?'':'s'):'No open tasks';
    tab.setAttribute('aria-label',count?'Tasks Assistant, '+count+' open task'+(count===1?'':'s'):'Tasks Assistant, no open tasks');
  }

  function preserveOpenCountSource(){
    const jump=byId('tasksOpenJump');
    const achievements=document.querySelector('.tasks-overview-strip.v3 .ta15-achievements .ta15-card-head');
    if(jump&&achievements&&jump.parentElement!==achievements)achievements.append(jump);
    if(jump){
      jump.classList.add('ta87-source-counter');
      jump.setAttribute('aria-hidden','true');
      jump.tabIndex=-1;
    }
  }

  function removePageHeading(){
    preserveOpenCountSource();
    byId('ta86TasksHead')?.remove();
  }

  function arrange(){
    ensureTaskNavBadge();
    removePageHeading();
    updateTaskNavBadge();
  }

  function wrapRender(){
    if(typeof window.renderTasksAssistant==='function'&&!window.renderTasksAssistant.__ta87){
      const base=window.renderTasksAssistant;
      const wrapped=function(data,model){
        const result=base.apply(this,arguments);
        requestAnimationFrame(()=>{
          removePageHeading();
          updateTaskNavBadge(Array.isArray(data?.tasks)?data.tasks:null);
        });
        return result;
      };
      wrapped.__ta87=true;
      window.renderTasksAssistant=wrapped;
    }
  }

  function init(){
    if(initialized)return;
    initialized=true;
    wrapRender();
    arrange();
  }

  addEventListener('load',init);
  setTimeout(()=>{if(document.readyState==='complete'&&typeof window.go==='function')init();},0);
})();