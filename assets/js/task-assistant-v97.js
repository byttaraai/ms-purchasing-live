/* Build 97: enforce existing inventory freshness for Master Review saves; retain drafts. */
(function(){
  'use strict';
  let initialized=false;
  let activeDialog=null;
  let reviewSession=null;
  let freshnessTimer=null;

  const issueDefs=[
    {key:'supplier',label:'Supplier',match:r=>String(r.review_reason||'').includes('Supplier is not assigned')},
    {key:'price',label:'Price',match:r=>String(r.review_reason||'').includes('Master purchase price is missing or zero')},
    {key:'reorder',label:'Reorder',match:r=>String(r.review_reason||'').includes('Reorder point')},
    {key:'rating',label:'Rating',match:r=>String(r.review_reason||'').includes('Profitability classification is missing')},
    {key:'master',label:'New',match:r=>String(r.review_reason||'').includes('Product is not in the master')},
    {key:'negative',label:'Negative Stock',match:r=>String(r.review_reason||'').includes('Negative stock')}
  ];

  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const uniq=a=>[...new Set(a.filter(Boolean).map(v=>String(v).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));

  function currentTask(task){
    return (state?.taskAssistant?.tasks||[]).find(t=>t.task_key===task.task_key&&t.status==='open')||task;
  }
  function rowFor(code){return (state?.rows||[]).find(r=>r.product_code===code)||null;}
  function masterFor(code){return (state?.master||[]).find(r=>r.product_code===code)||null;}
  function reasonHas(row,text){return String(row?.review_reason||'').includes(text);}
  function suppliers(){return uniq((state?.master||[]).map(r=>r.supplier));}
  function purchaseUnits(){return uniq((state?.master||[]).map(r=>r.purchase_unit));}
  function optionUnits(row){
    return uniq([...(state?.master||[]).flatMap(m=>[m.purchase_unit,m.option_unit]),row?.raw_unit]);
  }
  function updateUnitLabels(card){
    const isNew=card.dataset.new==='1';
    const pu=isNew?card.querySelector('[data-key="purchase_unit"]')?.value:masterFor(card.dataset.code)?.purchase_unit;
    const unit=pu||'purchase unit';
    for(const [key,label] of [['purchase_price','Purchase Price (SAR / '+unit+')'],['reorder_point','Reorder Point ('+unit+')']]){
      const target=card.querySelector('[data-field="'+key+'"] > span');
      if(target)target.textContent=label;
    }
    if(isNew){
      const option=card.querySelector('[data-key="option_unit"]');
      const factor=card.querySelector('[data-key="factor"]');
      const wrapper=card.querySelector('[data-field="factor"]');
      if(wrapper&&factor){
        // Never clear typed values when a unit selection changes.
        wrapper.style.display=(option?.value||factor.value||factor.validity.badInput)?'':'none';
        factor.required=!!option?.value;
        factor.title='1 '+unit+' = Factor '+(option?.value||'Option Units');
      }
    }
  }
  function optionList(items,selected,placeholder){
    return '<option value="">'+esc(placeholder)+'</option>'+items.map(v=>'<option value="'+esc(v)+'" '+(String(v)===String(selected||'')?'selected':'')+'>'+esc(v)+'</option>').join('');
  }
  function field(label,html,key){
    return '<label class="mr93-field" data-field="'+esc(key)+'"><span>'+esc(label)+'</span>'+html+'</label>';
  }
  function issueChips(row,isNew){
    const defs=isNew?issueDefs.filter(d=>['master','supplier','price','reorder','rating'].includes(d.key)):issueDefs.filter(d=>d.match(row));
    return '<div class="mr93-chips">'+defs.map(d=>'<span class="mr93-chip mr93-'+d.key+'">'+esc(d.label)+'</span>').join('')+'</div>';
  }
  function productRow(code,index){
    const row=rowFor(code),master=masterFor(code),isNew=!master||reasonHas(row,'Product is not in the master');
    if(!row)return '';
    const fields=[];
    if(isNew){
      fields.push(field('Purchase Unit','<select data-key="purchase_unit">'+optionList(purchaseUnits(),'', 'Select unit')+'</select>','purchase_unit'));
      fields.push(field('Option Unit (conversion only)','<select data-key="option_unit">'+optionList(optionUnits(row),'','No alternative unit')+'</select>','option_unit'));
      fields.push(field('Factor (Option / Purchase)','<input data-key="factor" type="number" min="0.000001" max="1000000000000" step="any" inputmode="decimal" placeholder="Enter factor" value="">','factor'));
    }
    if(isNew||reasonHas(row,'Supplier is not assigned')){
      fields.push(field('Supplier','<select data-key="supplier">'+optionList(suppliers(),master?.supplier,'Select supplier')+'</select>','supplier'));
    }
    if(isNew||reasonHas(row,'Master purchase price is missing or zero')){
      fields.push(field('Purchase Price','<input data-key="purchase_price" type="number" min="0" max="1000000000000" step="any" inputmode="decimal" placeholder="0.00" value="'+esc(master?.purchase_price??'')+'">','purchase_price'));
    }
    if(isNew||reasonHas(row,'Reorder point')){
      fields.push(field('Reorder Point','<input data-key="reorder_point" type="number" min="0" max="1000000000000" step="any" inputmode="decimal" placeholder="0" value="'+esc(master?.reorder_point??'')+'">','reorder_point'));
    }
    if(isNew||reasonHas(row,'Profitability classification is missing')){
      const ratings=['Super','High','Medium','Low','Loss'];
      fields.push(field('Rating','<select data-key="profitability_class">'+optionList(ratings,master?.profitability_class,'Select rating')+'</select>','profitability_class'));
    }
    const editable=fields.length>0;
    const note=editable?'':'This issue is not an inline Master field. Review it from its source workflow.';
    return '<article class="mr93-product" data-code="'+esc(code)+'" data-new="'+(isNew?'1':'0')+'">'+
      '<div class="mr93-product-head"><span class="mr93-index">'+(index+1)+'</span><div class="mr93-product-id"><strong>'+esc(row.product_name||master?.product_name||code)+'</strong><small>'+esc(code)+'</small></div>'+issueChips(row,isNew)+'</div>'+
      (editable?'<div class="mr93-fields">'+fields.join('')+'</div>':'<div class="mr93-readonly-note">'+esc(note)+'</div>')+
      '<div class="mr93-row-state" aria-live="polite"></div>'+
    '</article>';
  }

  function ensureDialog(){
    let dialog=document.getElementById('masterReviewDialog93');
    if(dialog)return dialog;
    dialog=document.createElement('dialog');
    dialog.id='masterReviewDialog93';
    dialog.className='mr93-dialog';
    dialog.innerHTML='<div class="mr93-shell">'+
      '<header class="mr93-head"><div><span class="mr93-eyebrow">CURRENT TASK</span><h2>Master Data Review</h2><p>Fix the current priority products directly. Saved master data recalculates the workspace; saving does not complete the task or award a badge.</p><p id="mr97Freshness" role="status" hidden><span>Inventory refresh required before saving. Your entries are kept in this page.</span> <button class="btn outline" id="mr97Pause" type="button">Pause &amp; Refresh Inventory</button></p></div><button class="mr93-close" type="button" aria-label="Close Master Data Review">×</button></header>'+
      '<div class="mr93-progress"><strong id="mr93Count">0 products</strong><span id="mr93Ready">0 ready to save</span></div>'+
      '<div class="mr93-list" id="mr93List"></div>'+
      '<footer class="mr93-foot"><span id="mr93Feedback" role="status"></span><div><button class="btn outline" id="mr93Cancel" type="button">Cancel</button><button class="btn primary" id="mr93Save" type="button" disabled>Save &amp; Recalculate</button></div></footer>'+
    '</div>';
    document.body.append(dialog);
    dialog.querySelector('.mr93-close').onclick=()=>requestClose(dialog);
    dialog.querySelector('#mr93Cancel').onclick=()=>requestClose(dialog);
    dialog.querySelector('#mr97Pause').onclick=()=>pauseForInventory(dialog);
    dialog.addEventListener('cancel',event=>{event.preventDefault();requestClose(dialog);});
    // Unexpected programmatic closure retains the draft for the next Open.
    dialog.addEventListener('close',()=>{if(!dialog.open){activeDialog=null;clearTimeout(freshnessTimer);}});
    return dialog;
  }

  function inventorySourceKey(){
    const u=state?.upload;
    return JSON.stringify(u?[u.id,u.uploaded_at,u.snapshot_date,u.status,u.is_complete,u.excludes_zero]:null);
  }
  function inventorySaveAllowed(s){
    // Reuse the existing policy. The server remains authoritative for its clock/source.
    if(s?.freshnessRejected===inventorySourceKey())return false;
    try{return typeof inventoryFreshnessFor==='function'&&inventoryFreshnessFor(state.upload).fresh===true;}
    catch{return false;}
  }
  function updateFreshnessUI(dialog,s){
    const locked=state?.mode==='live'&&!inventorySaveAllowed(s);
    dialog.querySelector('#mr97Freshness').hidden=!locked;
    dialog.querySelector('#mr97Pause').disabled=s.busy;
    // Retry Refresh acknowledges an already committed save; it is not a new write.
    if(locked&&!s.pending)dialog.querySelector('#mr93Save').disabled=true;
    clearTimeout(freshnessTimer);
    freshnessTimer=setTimeout(()=>{if(reviewSession&&dialog.open)updateReady(dialog);},1000);
  }
  function pauseForInventory(dialog){
    if(!reviewSession||reviewSession.busy||!sameOwner(reviewSession))return;
    // Suspend, do not discard or rebase the original task's input nodes.
    if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
    activeDialog=null;clearTimeout(freshnessTimer);
    if(typeof updateInventoryLock==='function')updateInventoryLock();
    document.getElementById('inventoryLockUpload')?.click();
  }

  function numericValue(input,allowZero){
    // DATA-01: bad native number input is not an intentionally blank field.
    if(input?.validity?.badInput)return undefined;
    const raw=String(input?.value??'').trim();
    if(raw==='')return null;
    let n;
    try{n=C.number(raw,{nullable:false});}catch{return undefined;}
    if(n<0||(!allowZero&&n===0))return undefined;
    return n;
  }

  function patchForCard(card){
    const code=card.dataset.code,isNew=card.dataset.new==='1',patch={product_code:code};
    let changed=false,invalid=false;
    card.querySelectorAll('[data-key]').forEach(input=>{
      const key=input.dataset.key;
      if(key==='purchase_price'||key==='factor'){
        const v=numericValue(input,false); if(v===undefined)invalid=true; else if(v!==null){patch[key]=v;changed=true;}
      }else if(key==='reorder_point'){
        const v=numericValue(input,true); if(v===undefined)invalid=true; else if(v!==null){patch[key]=v;changed=true;}
      }else{
        const v=String(input.value||'').trim(); if(v){patch[key]=v;changed=true;}
      }
    });
    if(isNew&&!patch.purchase_unit)return {patch:null,invalid,reason:changed?'Purchase Unit is required before a new product can be added.':'Select a Purchase Unit to add this new product.'};
    if(invalid)return {patch:null,invalid:true,reason:'Check numeric values; maximum is 1,000,000,000,000.'};
    if(isNew){
      if(patch.option_unit&&patch.factor==null)return {patch:null,invalid:false,reason:'Enter the Factor: how many Option Units are in 1 Purchase Unit.'};
      const rule={product_code:code,purchase_unit:patch.purchase_unit,option_unit:patch.option_unit||null,factor:patch.factor??1};
      const issue=C.validateRule(rule);
      if(issue)return {patch:null,invalid:true,reason:issue};
      const rawUnit=String(rowFor(code)?.raw_unit||'').trim();
      if(rawUnit&&!C.roleFor(rawUnit,rule,state?.aliases||[]))return {patch:null,invalid:false,reason:'Define inventory unit "'+rawUnit+'" as the Purchase Unit or Option Unit.'};
      // Factor 1 is the existing identity rule only, never an inferred conversion.
      patch.option_unit=rule.option_unit;patch.factor=rule.factor;
    }
    if(!changed)return {patch:null,invalid:false,reason:'No values entered yet.'};
    return {patch,invalid:false,reason:''};
  }

  function updateReady(dialog){
    const s=reviewSession;
    if(!s)return 0;
    let ready=0;
    dialog.querySelectorAll('.mr93-product').forEach(card=>{
      updateUnitLabels(card);
      const result=cardResult(card,s),stateEl=card.querySelector('.mr93-row-state');
      card.classList.toggle('ready',!!result.patch);
      card.classList.toggle('invalid',!!result.invalid);
      if(result.patch){ready++;stateEl.textContent='Ready to save';}
      else stateEl.textContent=result.reason||'';
      card.querySelectorAll('input,select').forEach(el=>{el.disabled=s.busy||!!s.pending||card.dataset.saved95==='1';});
    });
    dialog.querySelector('#mr93Ready').textContent=ready+' ready to save';
    const button=dialog.querySelector('#mr93Save');
    button.textContent=s.pending?'Retry Refresh':'Save & Recalculate';
    button.disabled=s.busy||state?.mode!=='live'||!sameOwner(s)||(!s.pending&&(ready===0||state.revision!==s.revision));
    dialog.querySelector('#mr93Cancel').disabled=s.busy;
    dialog.querySelector('.mr93-close').disabled=s.busy;
    dialog.setAttribute('aria-busy',String(s.busy));
    updateFreshnessUI(dialog,s);
    return ready;
  }

  async function save(dialog){
    const s=reviewSession;
    if(!s||s.busy||state?.mode!=='live'||!sameOwner(s))return;
    if(s.pending){await refreshSaved(dialog,s);return;}
    if(!inventorySaveAllowed(s)){updateReady(dialog);return;}
    const feedback=dialog.querySelector('#mr93Feedback');
    if(state.revision!==s.revision){
      feedback.textContent='The workspace changed while this window was open. Your entries are kept. Review the latest data before saving.';
      updateReady(dialog);return;
    }
    const submitted=[];
    dialog.querySelectorAll('.mr93-product').forEach(card=>{
      const result=cardResult(card,s);
      if(result.patch)submitted.push({card,patch:result.patch});
    });
    if(!submitted.length)return;
    s.busy=true;updateReady(dialog);
    feedback.textContent='Saving '+submitted.length+' product'+(submitted.length===1?'':'s')+'...';
    try{
      const result=await rpc('purchasing_master_review_save_v93',{
        payload:submitted.map(entry=>entry.patch),expected_revision:s.revision,request_id:uuid()
      });
      if(s!==reviewSession)return;
      if(!sameOwner(s)){finishClose(dialog);return;}
      if(result?.ok!==true)throw Error('Save acknowledgement was not received.');
      s.pending={submitted,revision:Number(result.master_revision)};
      submitted.forEach(entry=>{entry.card.dataset.saved95='1';});
    }catch(e){
      if(s!==reviewSession)return;
      s.busy=false;
      if(/INVENTORY_REFRESH_REQUIRED/.test(e?.message||''))s.freshnessRejected=inventorySourceKey();
      feedback.textContent='Save could not be confirmed. Your entries are kept. '+(e?.message||'Please try again.');
      updateReady(dialog);return;
    }
    await refreshSaved(dialog,s);
  }

  function open(task){
    const dialog=ensureDialog();
    if(reviewSession&&!sameOwner(reviewSession))finishClose(dialog);
    // Repeated Open or a render must not overwrite an existing editable draft.
    if(reviewSession&&(dialog.open||reviewSession.busy||reviewSession.pending||hasUnsavedChanges(dialog))){
      activeDialog=dialog;
      if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}
      updateReady(dialog);return;
    }
    const current=currentTask(task),codes=(current.codes||[]).slice(0,20);
    reviewSession={owner:state?.session?.user?.id||null,taskKey:current.task_key,revision:state.revision,
      codes:codes.slice(),busy:false,pending:null,initial:new WeakMap(),sources:new Map()};
    activeDialog=dialog;
    dialog.querySelector('#mr93List').innerHTML=codes.map(productRow).join('')||'<div class="mr93-empty">No current Master Data products.</div>';
    dialog.querySelector('#mr93Count').textContent=codes.length+' priority product'+(codes.length===1?'':'s');
    dialog.querySelector('#mr93Feedback').textContent=state?.mode==='live'?'':'Live sign-in is required to save.';
    dialog.querySelectorAll('.mr93-product').forEach(card=>bindCard(dialog,card,reviewSession));
    dialog.querySelector('#mr93Save').onclick=()=>save(dialog);
    updateReady(dialog);
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  }

  function sameOwner(s){return s.owner===(state?.session?.user?.id||null);}
  function sourceKey(code){
    const m=masterFor(code),r=rowFor(code);
    // Ignore timestamps, but never silently rebase changed fields or unit rules.
    return JSON.stringify([!!m,r?.review_reason??null,r?.raw_quantity??null,r?.raw_unit??null,
      ...['product_name','purchase_unit','option_unit','factor','order_multiple','supplier','purchase_price','reorder_point','reorder_point_unit','profitability_class'].map(k=>m?.[k]??null)]);
  }
  function bindCard(dialog,card,s){
    s.sources.set(card.dataset.code,sourceKey(card.dataset.code));
    card.querySelectorAll('[data-key]').forEach(input=>{
      s.initial.set(input,String(input.value??''));
      input.addEventListener('input',()=>updateReady(dialog));
      input.addEventListener('change',()=>updateReady(dialog));
    });
    if(rowFor(card.dataset.code)?.needs_review===false){
      card.dataset.saved95='1';
      const note=card.querySelector('.mr93-readonly-note');
      if(note)note.textContent='No remaining Master Data review issues.';
    }
  }
  function cardResult(card,s){
    const code=card.dataset.code;
    if(card.dataset.saved95==='1')return {patch:null,reason:s.pending?'Saved. Refresh pending.':'Saved to Master Data.'};
    if(s.sources.get(code)!==sourceKey(code))return {patch:null,reason:'Product data changed. Your entries are kept; review the latest data before saving.'};
    const task=(state?.taskAssistant?.tasks||[]).find(t=>t.task_key===s.taskKey&&t.status==='open');
    if(!task||(task.codes||[]).indexOf(code)<0)return {patch:null,reason:'This product is no longer in the current task. Your entries are kept.'};
    return patchForCard(card);
  }
  function hasUnsavedChanges(dialog){
    const s=reviewSession;
    if(!s)return false;
    return [...dialog.querySelectorAll('.mr93-product')].some(card=>card.dataset.saved95!=='1'&&
      [...card.querySelectorAll('[data-key]')].some(input=>input.validity?.badInput||String(input.value??'')!==s.initial.get(input)));
  }
  function finishClose(dialog){
    clearTimeout(freshnessTimer);
    reviewSession=null;activeDialog=null;
    if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
    dialog.querySelector('#mr93List').replaceChildren();
  }
  function requestClose(dialog){
    if(reviewSession?.busy)return;
    if(hasUnsavedChanges(dialog)&&!window.confirm('Discard unsaved entries and close? Products already saved will stay saved.'))return;
    finishClose(dialog);
  }
  async function refreshSaved(dialog,s){
    if(s!==reviewSession||!s.pending||!sameOwner(s))return;
    s.busy=true;updateReady(dialog);
    const feedback=dialog.querySelector('#mr93Feedback');
    feedback.textContent='Saved. Refreshing calculations...';
    try{
      await loadLive();
      if(s!==reviewSession)return;
      if(!sameOwner(s)){finishClose(dialog);return;}
      if(!Number.isInteger(s.pending.revision)||!Number.isInteger(state.revision)||state.revision<s.pending.revision)
        throw Error('The refreshed master revision is not yet available.');
      const submitted=s.pending.submitted,list=dialog.querySelector('#mr93List'),scrollTop=list.scrollTop;
      for(const entry of submitted){
        const code=entry.patch.product_code,markup=productRow(code,s.codes.indexOf(code));
        if(!markup)throw Error('A saved product is missing from the refreshed workspace.');
        const template=document.createElement('template');template.innerHTML=markup;
        const replacement=template.content.firstElementChild;
        entry.card.replaceWith(replacement);entry.card=replacement;
        bindCard(dialog,replacement,s);
      }
      // Unsubmitted rows retain the exact DOM nodes, including native badInput text.
      list.scrollTop=scrollTop;
      s.revision=state.revision;s.pending=null;s.busy=false;
      updateReady(dialog);
      const remaining=s.codes.filter(code=>rowFor(code)?.needs_review!==false).length;
      if(remaining===0&&!hasUnsavedChanges(dialog)){
        finishClose(dialog);toast('Master data saved. Workspace recalculated.');
      }else{
        feedback.textContent='Saved '+submitted.length+' product'+(submitted.length===1?'':'s')+'. Remaining rows and unsaved entries are kept.';
      }
    }catch(e){
      if(s!==reviewSession)return;
      s.busy=false;
      feedback.textContent='Saved to Master Data, but refresh did not finish. Your remaining entries are kept. Use Retry Refresh. '+(e?.message||'');
      updateReady(dialog);
    }
  }

  function wrapOpenTask(){
    const base=window.ta16OpenTask;
    if(typeof base!=='function'||base.__mr93)return;
    const wrapped=async function(task){
      if(task?.focus==='data'){open(currentTask(task));return;}
      return base.apply(this,arguments);
    };
    wrapped.__mr93=true;
    wrapped.__base=base;
    window.ta16OpenTask=wrapped;
  }

  function init(){
    if(initialized)return;
    initialized=true;
    const recheck=()=>{if(reviewSession&&activeDialog?.open)updateReady(activeDialog);};
    addEventListener('focus',recheck);
    document.addEventListener('visibilitychange',recheck);
    addEventListener('beforeunload',event=>{
      const dialog=document.getElementById('masterReviewDialog93');
      if(dialog&&reviewSession&&(reviewSession.busy||hasUnsavedChanges(dialog))){event.preventDefault();event.returnValue='';}
    });
    wrapOpenTask();
    const render=window.renderTasksAssistant;
    if(typeof render==='function'&&!render.__mr93){
      const wrapped=function(){
        const result=render.apply(this,arguments);
        if(reviewSession&&!sameOwner(reviewSession))finishClose(ensureDialog());
        requestAnimationFrame(wrapOpenTask);
        return result;
      };
      wrapped.__mr93=true;
      window.renderTasksAssistant=wrapped;
    }
  }

  addEventListener('load',init);
  setTimeout(()=>{if(document.readyState==='complete')init();},0);
})();
