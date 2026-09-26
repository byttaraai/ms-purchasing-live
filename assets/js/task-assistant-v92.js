/* Build 92: compact Master Data Review summary and task card. UI only. */
(function(){
  'use strict';
  let initialized=false;

  const issueDefs=[
    {key:'supplier',label:'Supplier',match:r=>String(r.review_reason||'').includes('Supplier is not assigned')},
    {key:'price',label:'Price',match:r=>String(r.review_reason||'').includes('Master purchase price is missing or zero')},
    {key:'reorder',label:'Reorder',match:r=>String(r.review_reason||'').includes('Reorder point')},
    {key:'rating',label:'Rating',match:r=>String(r.review_reason||'').includes('Profitability classification is missing')},
    {key:'master',label:'Not in Master',match:r=>String(r.review_reason||'').includes('Product is not in the master')}
  ];

  function reviewRows(){
    return Array.isArray(state?.rows)?state.rows.filter(r=>r?.needs_review):[];
  }

  function issueCounts(rows){
    return issueDefs.map(d=>({...d,count:rows.filter(d.match).length}));
  }

  function closeInfo(except){
    document.querySelectorAll('.ta92-master-info[aria-expanded="true"]').forEach(btn=>{
      if(btn===except)return;
      btn.setAttribute('aria-expanded','false');
      btn.closest('.ta92-master-label')?.classList.remove('open');
    });
  }

  function decorateSummary(master,rows){
    const notice=master.querySelector('.ta16-notice');
    if(!notice)return;
    notice.classList.add('ta92-master-summary');

    const eyebrow=notice.querySelector('.ta16-eyebrow');
    const strong=notice.querySelector('strong');
    const paragraph=notice.querySelector('p');
    const viewAll=notice.querySelector('#tasksMasterViewAll');
    const total=rows.length;
    const selected=master.querySelector('.ta16-master-caption span')?.textContent?.match(/\d+/)?.[0]||'0';

    let label=notice.querySelector('.ta92-master-label');
    if(!label&&eyebrow){
      label=document.createElement('div');
      label.className='ta92-master-label';
      eyebrow.parentNode.insertBefore(label,eyebrow);
      label.append(eyebrow);

      const info=document.createElement('button');
      info.type='button';
      info.className='ta92-master-info';
      info.setAttribute('aria-label','Master Data Review information');
      info.setAttribute('aria-expanded','false');
      info.textContent='i';

      const pop=document.createElement('div');
      pop.className='ta92-master-popover';
      pop.setAttribute('role','tooltip');
      pop.textContent='The total includes blocking issues plus non-blocking price, supplier and profitability attention. Issue chips overlap because one product can require more than one fix.';

      label.append(info,pop);
      info.addEventListener('click',e=>{
        e.stopPropagation();
        const open=info.getAttribute('aria-expanded')==='true';
        closeInfo(info);
        info.setAttribute('aria-expanded',String(!open));
        label.classList.toggle('open',!open);
      });
      info.addEventListener('keydown',e=>{
        if(e.key==='Escape'){
          info.setAttribute('aria-expanded','false');
          label.classList.remove('open');
          info.blur();
        }
      });
    }

    if(strong){
      strong.classList.add('ta92-master-total');
      strong.innerHTML='<b>'+total.toLocaleString('en-US')+'</b> products need review';
    }

    if(paragraph){
      paragraph.classList.add('ta92-master-cycle-note');
      paragraph.textContent=selected+' selected for this cycle';
    }

    let chips=notice.querySelector('.ta92-master-chips');
    if(!chips){
      chips=document.createElement('div');
      chips.className='ta92-master-chips';
      if(viewAll)notice.insertBefore(chips,viewAll);else notice.append(chips);
    }
    chips.innerHTML=issueCounts(rows).map(d=>
      '<span class="ta92-master-chip ta92-'+d.key+'" title="Products with this review issue. Counts can overlap."><b>'+d.count.toLocaleString('en-US')+'</b> '+d.label+'</span>'
    ).join('');

    if(viewAll){
      viewAll.classList.add('ta92-master-view-all');
      viewAll.textContent='View All →';
    }
  }

  function compactTask(master,total){
    const caption=master.querySelector('.ta16-master-caption');
    if(caption){
      caption.classList.add('ta92-master-caption');
      const strong=caption.querySelector('strong');
      const span=caption.querySelector('span');
      const selected=span?.textContent?.match(/\d+/)?.[0]||'0';
      if(strong)strong.textContent='CURRENT TASK';
      if(span)span.textContent=selected+' selected / '+total.toLocaleString('en-US')+' review items';
    }

    master.querySelectorAll('.ta16-task').forEach(card=>{
      card.classList.add('ta92-master-task');
      const meta=card.querySelector('.ta16-task-meta');
      const badge=card.querySelector(':scope > .ta16-badge');
      if(meta&&badge){
        badge.classList.add('ta92-inline-badge');
        meta.append(badge);
      }
    });
  }

  function decorateMaster(){
    const master=document.querySelector('[data-panel="tasks-assistant"] .ta16-master');
    if(!master)return;
    master.classList.add('ta92-master-card');
    const rows=reviewRows();
    decorateSummary(master,rows);
    compactTask(master,rows.length);
  }

  function wrapRender(){
    if(typeof window.renderTasksAssistant==='function'&&!window.renderTasksAssistant.__ta92){
      const base=window.renderTasksAssistant;
      const wrapped=function(){
        const result=base.apply(this,arguments);
        requestAnimationFrame(decorateMaster);
        return result;
      };
      wrapped.__ta92=true;
      window.renderTasksAssistant=wrapped;
    }
  }

  function init(){
    if(initialized)return;
    initialized=true;
    wrapRender();
    decorateMaster();
    document.addEventListener('click',()=>closeInfo());
  }

  addEventListener('load',init);
  setTimeout(()=>{if(document.readyState==='complete'&&typeof window.go==='function')init();},0);
})();