/* Build 94: DATA-01 numeric validation. All Build 93 task and save semantics retained. */
(function(){
  'use strict';
  let initialized=false;
  let activeDialog=null;

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
      '<header class="mr93-head"><div><span class="mr93-eyebrow">CURRENT TASK</span><h2>Master Data Review</h2><p>Fix the current priority products directly. Saved master data recalculates the workspace; saving does not complete the task or award a badge.</p></div><button class="mr93-close" type="button" aria-label="Close Master Data Review">×</button></header>'+
      '<div class="mr93-progress"><strong id="mr93Count">0 products</strong><span id="mr93Ready">0 ready to save</span></div>'+
      '<div class="mr93-list" id="mr93List"></div>'+
      '<footer class="mr93-foot"><span id="mr93Feedback" role="status"></span><div><button class="btn outline" id="mr93Cancel" type="button">Cancel</button><button class="btn primary" id="mr93Save" type="button" disabled>Save &amp; Recalculate</button></div></footer>'+
    '</div>';
    document.body.append(dialog);
    dialog.querySelector('.mr93-close').onclick=()=>dialog.close();
    dialog.querySelector('#mr93Cancel').onclick=()=>dialog.close();
    dialog.addEventListener('cancel',()=>{});
    dialog.addEventListener('close',()=>{activeDialog=null;});
    return dialog;
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
      if(key==='purchase_price'){
        const v=numericValue(input,false); if(v===undefined)invalid=true; else if(v!==null){patch[key]=v;changed=true;}
      }else if(key==='reorder_point'){
        const v=numericValue(input,true); if(v===undefined)invalid=true; else if(v!==null){patch[key]=v;changed=true;}
      }else{
        const v=String(input.value||'').trim(); if(v){patch[key]=v;changed=true;}
      }
    });
    if(isNew&&!patch.purchase_unit)return {patch:null,invalid,reason:changed?'Purchase Unit is required before a new product can be added.':'Select a Purchase Unit to add this new product.'};
    if(invalid)return {patch:null,invalid:true,reason:'Check numeric values; maximum is 1,000,000,000,000.'};
    if(!changed)return {patch:null,invalid:false,reason:'No values entered yet.'};
    return {patch,invalid:false,reason:''};
  }

  function updateReady(dialog){
    let ready=0;
    dialog.querySelectorAll('.mr93-product').forEach(card=>{
      const result=patchForCard(card),stateEl=card.querySelector('.mr93-row-state');
      card.classList.toggle('ready',!!result.patch);
      card.classList.toggle('invalid',!!result.invalid);
      if(result.patch){ready++;stateEl.textContent='Ready to save';}
      else stateEl.textContent=result.reason||'';
    });
    dialog.querySelector('#mr93Ready').textContent=ready+' ready to save';
    dialog.querySelector('#mr93Save').disabled=ready===0||state?.mode!=='live';
    return ready;
  }

  async function save(dialog){
    const payload=[];
    dialog.querySelectorAll('.mr93-product').forEach(card=>{const r=patchForCard(card);if(r.patch)payload.push(r.patch);});
    if(!payload.length)return;
    const saveBtn=dialog.querySelector('#mr93Save'),feedback=dialog.querySelector('#mr93Feedback');
    saveBtn.disabled=true;
    dialog.querySelectorAll('input,select,button').forEach(el=>{if(el!==dialog.querySelector('.mr93-close'))el.disabled=true;});
    feedback.textContent='Saving '+payload.length+' product'+(payload.length===1?'':'s')+'...';
    try{
      await rpc('purchasing_master_review_save_v93',{payload,expected_revision:state.revision,request_id:uuid()});
      feedback.textContent='Saved. Refreshing calculations...';
      await loadLive();
      dialog.close();
      toast('Master data saved. Workspace recalculated.');
    }catch(e){
      feedback.textContent=e?.message||'Master data could not be saved.';
      dialog.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);
      updateReady(dialog);
    }
  }

  function open(task){
    const current=currentTask(task),codes=(current.codes||[]).slice(0,20),dialog=ensureDialog();
    activeDialog=dialog;
    dialog.querySelector('#mr93List').innerHTML=codes.map(productRow).join('')||'<div class="mr93-empty">No current Master Data products.</div>';
    dialog.querySelector('#mr93Count').textContent=codes.length+' priority product'+(codes.length===1?'':'s');
    dialog.querySelector('#mr93Feedback').textContent=state?.mode==='live'?'':'Live sign-in is required to save.';
    dialog.querySelectorAll('input,select').forEach(el=>{
      el.addEventListener('input',()=>updateReady(dialog));
      el.addEventListener('change',()=>updateReady(dialog));
    });
    dialog.querySelector('#mr93Save').onclick=()=>save(dialog);
    updateReady(dialog);
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
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
    wrapOpenTask();
    const render=window.renderTasksAssistant;
    if(typeof render==='function'&&!render.__mr93){
      const wrapped=function(){
        const result=render.apply(this,arguments);
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