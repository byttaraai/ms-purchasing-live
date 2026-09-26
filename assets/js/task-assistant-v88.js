/* Build 88: compact Supplier Priorities cards and Cycle Focus. UI only. */
(function(){
  'use strict';
  let initialized=false;
  const byId=id=>document.getElementById(id);

  function closeInfo(except){
    document.querySelectorAll('.ta88-cycle-info[aria-expanded="true"]').forEach(btn=>{
      if(btn===except)return;
      btn.setAttribute('aria-expanded','false');
      btn.closest('.ta88-cycle-label')?.classList.remove('open');
    });
  }

  function compactCycleFocus(){
    const event=document.querySelector('[data-panel="tasks-assistant"] .ta16-suppliers .ta16-event');
    if(!event)return;
    event.classList.add('ta88-cycle-compact');
    const eyebrow=event.querySelector('.ta16-eyebrow');
    const note=event.querySelector('#tasksEventText');
    if(!eyebrow||!note)return;
    const text=(note.textContent||'').trim();
    let label=event.querySelector('.ta88-cycle-label');
    if(!label){
      label=document.createElement('div');
      label.className='ta88-cycle-label';
      eyebrow.parentNode.insertBefore(label,eyebrow);
      label.append(eyebrow);
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='ta88-cycle-info';
      btn.setAttribute('aria-label','Cycle Focus information');
      btn.setAttribute('aria-expanded','false');
      btn.textContent='i';
      const pop=document.createElement('div');
      pop.className='ta88-cycle-popover';
      pop.setAttribute('role','tooltip');
      label.append(btn,pop);
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        const open=btn.getAttribute('aria-expanded')==='true';
        closeInfo(btn);
        btn.setAttribute('aria-expanded',String(!open));
        label.classList.toggle('open',!open);
      });
      btn.addEventListener('keydown',e=>{
        if(e.key==='Escape'){btn.setAttribute('aria-expanded','false');label.classList.remove('open');btn.blur();}
      });
    }
    const pop=label.querySelector('.ta88-cycle-popover');
    if(pop)pop.textContent=text;
    note.classList.add('ta88-cycle-note-source');
  }

  function compactSupplierCards(){
    document.querySelectorAll('[data-panel="tasks-assistant"] .ta16-suppliers .ta16-task').forEach(card=>{
      card.classList.add('ta88-supplier-card');
      const meta=card.querySelector('.ta16-task-meta');
      const badge=card.querySelector(':scope > .ta16-badge');
      if(meta&&badge){
        badge.classList.add('ta88-inline-badge');
        meta.append(badge);
      }
    });
  }

  function apply(){
    compactCycleFocus();
    compactSupplierCards();
  }

  function wrapRender(){
    if(typeof window.renderTasksAssistant==='function'&&!window.renderTasksAssistant.__ta88){
      const base=window.renderTasksAssistant;
      const wrapped=function(){
        const result=base.apply(this,arguments);
        requestAnimationFrame(apply);
        return result;
      };
      wrapped.__ta88=true;
      window.renderTasksAssistant=wrapped;
    }
  }

  function init(){
    if(initialized)return;
    initialized=true;
    wrapRender();
    apply();
    document.addEventListener('click',()=>closeInfo());
  }

  addEventListener('load',init);
  setTimeout(()=>{if(document.readyState==='complete'&&typeof window.go==='function')init();},0);
})();