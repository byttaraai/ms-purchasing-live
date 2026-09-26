/* Build 91: compact Profit Recovery task cards to two visual rows. UI only. */
(function(){
  'use strict';
  let initialized=false;

  function compactProfitCards(){
    document.querySelectorAll('[data-panel="tasks-assistant"] .ta16-profit .ta16-task').forEach(card=>{
      card.classList.add('ta91-profit-card');
      const meta=card.querySelector('.ta16-task-meta');
      const badge=card.querySelector(':scope > .ta16-badge');
      if(meta&&badge){
        badge.classList.add('ta91-inline-badge');
        meta.append(badge);
      }
    });
  }

  function wrapRender(){
    if(typeof window.renderTasksAssistant==='function'&&!window.renderTasksAssistant.__ta91){
      const base=window.renderTasksAssistant;
      const wrapped=function(){
        const result=base.apply(this,arguments);
        requestAnimationFrame(compactProfitCards);
        return result;
      };
      wrapped.__ta91=true;
      window.renderTasksAssistant=wrapped;
    }
  }

  function init(){
    if(initialized)return;
    initialized=true;
    wrapRender();
    compactProfitCards();
  }

  addEventListener('load',init);
  setTimeout(()=>{if(document.readyState==='complete'&&typeof window.go==='function')init();},0);
})();