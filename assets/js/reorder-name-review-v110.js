/* Build 110: product name matching requires an explicit Admin approval. */
(function(global){
'use strict';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=v=>String(v??'').normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('en');
const loose=v=>key(v).replace(/[^\p{L}\p{N}]+/gu,'');
function trigrams(value){const m=new Map(),s='  '+loose(value)+' ';for(let i=0;i<s.length-2;i++){const t=s.slice(i,i+3);m.set(t,(m.get(t)||0)+1);}return m;}
function similarity(a,b){let totalA=0,totalB=0,common=0;for(const [v,n] of a){totalA+=n;common+=Math.min(n,b.get(v)||0);}for(const n of b.values())totalB+=n;return 2*common/(totalA+totalB||1);}
function mount(root,options){
 if(!root||root.dataset.salesName110==='ready')return;
 root.dataset.salesName110='ready';
 const version=root.querySelector('.ropg-version');if(version)version.textContent='v110';
 const review=root.querySelector('#ropgReviewDialog');
 const style=document.createElement('style');
 style.textContent='#ropGenerator .nm110-form{display:grid;gap:10px;margin-top:16px;padding:14px;border:1px solid #d8e1f2;border-radius:12px;background:#f8faff;color:#142344}#ropGenerator .nm110-form h4{margin:0;font-size:15px}#ropGenerator .nm110-form label{font-size:12px;font-weight:700;color:#435475}#ropGenerator .nm110-form select,#ropGenerator .nm110-form input{box-sizing:border-box;width:100%;padding:10px;font:inherit;border:1px solid #c4cfe2;border-radius:8px;color:#152444;background:#fff}#ropGenerator .nm110-form select{min-height:42px}#ropGenerator .nm110-form .btn{justify-self:start}#ropGenerator .nm110-error{font-size:12px;color:#a52626;margin:0}#ropGenerator .nm110-hint{font-size:12px;color:#596c8a}';
 root.appendChild(style);
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-review-index]');
  if(!button||!root.contains(button)||!review?.open)return;
  const reason=review.querySelector('.ux107-review-reason')?.textContent||'';
  if(!/unmatched|name mismatch|product code missing/i.test(reason))return;
  const tr=button.closest('tr');
  const reportName=tr?.querySelector('.ux107-product-name')?.textContent?.trim();
  if(!reportName)return;
  const body=review.querySelector('.ux107-dialog-body');
  if(!options.canEdit()){
   body.insertAdjacentHTML('beforeend','<p class="ux107-muted">An Admin with a server-verified preview can approve a product name match.</p>');
   return;
  }
  const master=options.getMaster().filter(p=>p.product_code&&p.product_name);
  if(!master.length)return;
  body.insertAdjacentHTML('beforeend',
   '<form class="nm110-form" id="nm110MatchForm"><h4>Match report name to Master</h4>'
   +'<p class="ux107-muted">Report: <b>'+escape(reportName)+'</b>. Compare the code, product name and package before confirming. Suggestions are not automatic matches.</p>'
   +'<label for="nm110Search">Find Master product by name or code</label><input id="nm110Search" type="search" placeholder="Search name or item code" autocomplete="off">'
   +'<label for="nm110Choice">Select a verified Master product</label>'
   +'<select id="nm110Choice" required><option value="">Choose a product</option></select>'
   +'<p class="nm110-hint" id="nm110Hints"></p>'
   +'<p class="ux107-muted">The report name is saved as an approved alias of the selected code. The original Master name remains unchanged. No reorder point is saved here.</p>'
   +'<p class="nm110-error" hidden role="alert"></p>'
   +'<button type="submit" class="btn primary">Confirm match &amp; recalculate</button></form>');
  const form=body.querySelector('#nm110MatchForm'),search=form.querySelector('#nm110Search'),select=form.querySelector('#nm110Choice');
  const hint=form.querySelector('#nm110Hints');
  const ranked=master.map(p=>({...p,_gram:trigrams(p.product_name)}));
  const target=trigrams(reportName);
  function fill(q){
   const needle=key(q),visible=needle
    ? ranked.filter(p=>key(p.product_name).includes(needle)||key(p.product_code).includes(needle))
      .sort((a,b)=>Number(key(a.product_code)===needle)*-1+Number(key(b.product_code)===needle))
      .slice(0,40)
    : ranked.map(p=>({p,score:similarity(target,p._gram)}))
      .sort((a,b)=>b.score-a.score).slice(0,8).map(x=>x.p);
   select.replaceChildren(new Option('Choose a verified product',''));
   for(const p of visible){
    const label=p.product_code+'  |  '+p.product_name+'  |  '+(p.purchase_unit||'unit unavailable');
    select.add(new Option(label,p.product_code));
   }
   select.value='';
   hint.textContent=needle?(visible.length+' results · only explicit confirmation creates a match')
    :'Top 8 suggestions by name similarity. Similarity does not prove product identity.';
  }
  fill('');
  search.addEventListener('input',()=>fill(search.value));
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   const code=select.value,error=form.querySelector('.nm110-error'),button=form.querySelector('button[type=submit]');
   const chosen=master.find(p=>p.product_code===code);
   if(!chosen){error.hidden=false;error.textContent='Select a Master product first.';return;}
   if(!global.confirm('Approve name match?\nReport: '+reportName+'\nMaster: '+chosen.product_name+'\nCode: '+code+'\nPurchase unit: '+(chosen.purchase_unit||'Not set')+'\nThis will not update a reorder point.'))return;
   button.disabled=true;button.textContent='Saving match...';error.hidden=true;
   try{
    await options.save({reportName,productCode:code});
    if(review.open)review.close('saved');
   }catch(e){error.hidden=false;error.textContent=e?.message||String(e);}
   finally{if(form.isConnected){button.disabled=false;button.textContent='Confirm match & recalculate';}}
  });
 });
}
global.ROPGeneratorNameMatch110=Object.freeze({mount});
})(window);
