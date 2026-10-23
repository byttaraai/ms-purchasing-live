/* Build 109 | Sales-unit review: isolated from the frozen purchasing dashboard. */
(function(global){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function mount(root,opts){
 if(!root||root.dataset.salesUnit109==='ready')return;
 root.dataset.salesUnit109='ready';
 root.querySelector('.ropg-version').textContent='v109';
 const dialog=root.querySelector('#ropgReviewDialog');
 const style=document.createElement('style');
 style.textContent='#ropGenerator .su109-form{display:grid;gap:9px;margin-top:16px;padding:14px;border:1px solid #d8e1f2;border-radius:12px;background:#f8faff}#ropGenerator .su109-form h4{margin:0;font-size:15px}#ropGenerator .su109-form label{font-size:12px;font-weight:700;color:#435475}#ropGenerator .su109-form select,#ropGenerator .su109-form input{width:100%;box-sizing:border-box;border:1px solid #c4cfe2;border-radius:8px;padding:10px;font:inherit;color:#1c2e50;background:#fff}#ropGenerator .su109-form input:disabled{background:#e8edf7}#ropGenerator .su109-form .btn{justify-self:start}#ropGenerator .su109-error{font-size:12px;color:#aa2929;margin:0}';
 root.appendChild(style);
 root.addEventListener('click',event=>{
  const button=event.target.closest('[data-review-index]');
  if(!button||!root.contains(button)||!dialog?.open)return;
  const reason=dialog.querySelector('.ux107-review-reason')?.textContent||'';
  if(!/unit|conversion/i.test(reason))return;
  const row=button.closest('tr');
  const code=row?.querySelector('.ux107-product-code')?.textContent?.trim();
  const reportUnit=row?.querySelector('td:nth-child(4) .ux107-unit')?.textContent?.trim();
  const master=global.msAudit?.getState?.()?.master?.find(x=>x.product_code===code);
  if(!code||!reportUnit||!master)return;
  const body=dialog.querySelector('.ux107-dialog-body');
  if(!opts.canEdit()){
   body.insertAdjacentHTML('beforeend','<p class="ux107-muted">Editing a unit conversion requires an Admin account and a server-verified preview.</p>');
   return;
  }
  body.insertAdjacentHTML('beforeend',
   '<form id="su109Form" class="su109-form"><h4>Resolve report unit</h4>'
   +'<p class="ux107-muted">1 <b>'+esc(reportUnit)+'</b> equals how many <b>'+esc(master.purchase_unit)+'</b> purchase units? This saves only a conversion decision, not a Master reorder point.</p>'
   +'<label for="su109Mode">Verified conversion</label>'
   +'<select id="su109Mode" required><option value="">Choose verified conversion</option><option value="same">Same pack — 1 to 1</option><option value="custom">Other ratio — enter purchase units per report unit</option></select>'
   +'<label for="su109Ratio">Purchase units for one report unit</label>'
   +'<input id="su109Ratio" type="number" min="0.000001" max="1000000" step="any" inputmode="decimal" required disabled placeholder="Enter verified ratio">'
   +'<p class="ux107-muted">Check package size first. A box of bottles is not automatically the same as one bottle.</p>'
   +'<p class="su109-error" role="alert" hidden></p>'
   +'<button type="submit" class="btn primary">Save unit decision &amp; recalculate</button></form>');
  const form=body.querySelector('#su109Form'),mode=form.querySelector('#su109Mode'),ratio=form.querySelector('#su109Ratio');
  mode.addEventListener('change',()=>{ratio.disabled=mode.value!=='custom';ratio.value=mode.value==='same'?'1':'';});
  form.addEventListener('submit',async e=>{
   e.preventDefault();
   const val=mode.value==='same'?1:Number(ratio.value),error=form.querySelector('.su109-error'),submit=form.querySelector('button[type="submit"]');
   if(!['same','custom'].includes(mode.value)||!Number.isFinite(val)||val<0.000001||val>1000000){
    error.hidden=false;error.textContent='Enter a verified ratio between 0.000001 and 1,000,000.';return;
   }
   if(!global.confirm('Save conversion for '+code+'?\n1 '+reportUnit+' = '+val+' '+master.purchase_unit+'\nThis does not approve or save any Master reorder point.'))return;
   submit.disabled=true;submit.textContent='Saving decision...';error.hidden=true;
   try{
    await opts.save({code,reportUnit,multiplier:val});
    if(dialog.open)dialog.close('saved');
   }catch(err){error.hidden=false;error.textContent=err?.message||String(err);}
   finally{if(form.isConnected){submit.disabled=false;submit.textContent='Save unit decision & recalculate';}}
  });
 });
}
global.ROPGeneratorUnitReview109=Object.freeze({mount});
})(window);
