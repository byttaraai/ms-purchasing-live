/* Build 116: isolated annual forecast presentation. No database writes or estimates. */
(function(){
'use strict';
const anchor=document.getElementById('ropGenerator');if(!anchor||typeof anchor.insertAdjacentElement!=='function')return;
const root=document.createElement('section');root.id='purchaseForecast116';root.setAttribute('aria-label','Purchase Forecast Generator');
anchor.insertAdjacentElement('afterend',root);
root.innerHTML=`
  <div class="pf-head"><div><span class="pf-kicker">PURCHASE PLANNING · ANNUAL FORECAST</span><h3>Purchase Forecast Generator <small id="pfYear" class="pf-muted"></small></h3><span id="pfSourceStatus" class="pf-muted" role="status">Loading product master…</span></div><span class="pf-state">UI Preview · No forecast approved</span></div>
  <div class="pf-controls">
    <label>Monthly Sales Upload <button id="pfMonthUpload" class="pf-btn" type="button">Update Month ▴</button></label>
    <label>Annual Growth % <input id="pfGrowth" type="number" min="-100" max="100" step=".1" value="0" aria-label="Annual growth percentage"></label>
    <label>Forecast <button id="pfGenerate" class="pf-btn pf-btn-primary" type="button" disabled title="Requires approved monthly history, mapping rules and a validated annual model">Generate Forecast</button></label>
    <div class="pf-muted" id="pfGrowthStatus" role="status">Growth draft: 0% · not saved</div>
  </div>
  <div id="pfUploadHelp" class="pf-note" hidden>Monthly update workflow will become available after the secured upload and review endpoint is implemented. All 12 history batches are staged, not approved. No upload or save is performed from this preview.</div>
  <div class="pf-note">Historical sales are isolated and staged (12 months). Forecast numbers remain unavailable until monthly reports, product matching, unit rules and forecast model are approved. Master and Reorder Point Generator remain untouched.</div>
  <div class="pf-summary"><span><strong>Annual Base</strong> · pending</span><span><strong>3M Trend</strong> · pending</span><span><strong>Annual Trend</strong> · pending</span><span><strong>Confidence</strong> · pending</span></div>
  <div class="pf-table-card">
    <div class="pf-header">
      <strong id="pfTableTitle" style="font-size:13px">Annual Forecast Overview</strong>
      <label class="pf-filter-label">Product <input id="pfSearch" placeholder="Search by name or code" aria-label="Search forecast products"></label>
      <label class="pf-filter-label">Supplier <select id="pfSupplier"><option value="">All suppliers</option></select></label>
      <label class="pf-filter-label">Profitability <select id="pfProfit"><option value="">All ratings</option><option value="super">Super</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="loss">Loss</option><option value="unclassified">Unclassified</option></select></label>
      <label class="pf-filter-label">Month <select id="pfMonth" aria-label="Forecast month"><option value="annual">Full year</option></select></label>
      <button type="button" id="pfReset" class="pf-btn">Clear</button>
      <button type="button" id="pfRefresh" class="pf-btn">Refresh</button>
    </div>
    <div class="pf-scroll"><table aria-label="Annual product forecast table"><thead><tr><th style="min-width:230px">Product</th><th>Annual Base Forecast</th><th>Trend (3M / Annual)</th><th>Confidence</th><th>Base + Growth (Final)</th></tr></thead><tbody id="pfTableBody"></tbody></table><div id="pfEmpty" class="pf-empty" hidden>No matching products.</div></div>
    <div class="pf-footer"><span class="pf-muted" id="pfCount">0 products</span><span class="pf-muted" id="pfScopeNote">Annual overview · 12 future months</span><div class="pf-footer-actions"><button type="button" class="pf-btn" id="pfPrev">Previous</button><button type="button" class="pf-btn" id="pfNext">Next</button></div></div>
  </div>`;
const q=id=>root.querySelector('#'+id);
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=n=>new Intl.NumberFormat('en-US').format(n);
const view={rows:[],page:0,size:60};
const year=q('pfYear'),month=q('pfMonth'),search=q('pfSearch'),supplier=q('pfSupplier'),profit=q('pfProfit'),growth=q('pfGrowth');
function load(){
 const st=window.msAudit&&typeof window.msAudit.getState==='function'?window.msAudit.getState():null;
 const raw=st&&Array.isArray(st.master)?st.master:[];
 view.rows=raw.map(x=>({code:String(x.product_code||''),name:String(x.product_name||''),supplier:String(x.supplier||''),profit:String(x.profitability_class||'Unclassified')}));
 const suppliers=[...new Set(view.rows.map(x=>x.supplier).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const before=supplier.value;
 supplier.innerHTML='<option value="">All suppliers</option>'+suppliers.map(s=>'<option value="'+html(s)+'">'+html(s)+'</option>').join('');
 if(suppliers.includes(before))supplier.value=before;
 q('pfSourceStatus').textContent=view.rows.length?nf(view.rows.length)+' Master products · sales history staged / not approved':'Waiting for product Master to load';
 view.page=0;render();
}
function filtered(){const term=search.value.trim().toLocaleLowerCase();return view.rows.filter(r=>(!term||(r.name+' '+r.code).toLocaleLowerCase().includes(term))&&(!supplier.value||r.supplier===supplier.value)&&(!profit.value||r.profit.toLocaleLowerCase()===profit.value));}
function render(){
 const rows=filtered(),total=Math.max(1,Math.ceil(rows.length/view.size));view.page=Math.min(view.page,total-1);
 const filteredRows=rows.slice(view.page*view.size,(view.page+1)*view.size);
 q('pfTableBody').innerHTML=filteredRows.map(r=>'<tr><td><div class="pf-product">'+html(r.name)+'<small>'+html(r.code)+' · '+html(r.supplier||'Supplier not assigned')+'</small></div></td><td><span class="pf-pending">Awaiting approval</span></td><td><span class="pf-trend">— / —</span><div class="pf-muted">3M / overall</div></td><td><span class="pf-trend">Pending</span></td><td><span class="pf-pending">—</span><div class="pf-muted">Base + annual growth</div></td></tr>').join('');
 q('pfEmpty').hidden=rows.length>0;
 q('pfCount').textContent=nf(rows.length)+' products · '+nf(view.page+1)+' / '+nf(total);
 q('pfPrev').disabled=view.page===0;
 q('pfNext').disabled=view.page>=total-1;
 const m=month.value; q('pfTableTitle').textContent=m==='annual'?'Annual Forecast Overview':'Forecast view · '+month.options[month.selectedIndex].text;
 q('pfScopeNote').textContent=m==='annual'?'Annual overview · 12 future months':'Selected month layout reserved · monthly purchase logic comes in next stage';
 const g=Number(growth.value);
 q('pfGrowthStatus').textContent=growth.value!==''&&Number.isFinite(g)&&g>=-100&&g<=100?'Growth draft: '+g.toLocaleString('en-US')+'% · not saved':'Enter annual growth between -100% and +100%';
}
function months(){
 const d=new Date();const today=new Date(d.getFullYear(),d.getMonth(),1);
 // Forecast starts after the last fully closed month; never treat current month as complete.
 let options='<option value="annual">Full year · Annual overview</option>';
 for(let i=1;i<=12;i++){const m=new Date(today.getFullYear(),today.getMonth()+i,1),value=m.getFullYear()+'-'+String(m.getMonth()+1).padStart(2,'0');options+='<option value="'+value+'">'+m.toLocaleString('en-US',{month:'long',year:'numeric'})+'</option>';}
 month.innerHTML=options;year.textContent=String(today.getFullYear())+'–'+String(today.getFullYear()+1);
}
for(const c of [month,search,supplier,profit,growth])c.addEventListener(c===search||c===growth?'input':'change',()=>{view.page=0;render();});
q('pfPrev').addEventListener('click',()=>{view.page--;render()});q('pfNext').addEventListener('click',()=>{view.page++;render()});
q('pfRefresh').addEventListener('click',load);
q('pfReset').addEventListener('click',()=>{search.value='';supplier.value='';profit.value='';month.value='annual';growth.value='0';view.page=0;render()});
q('pfMonthUpload').addEventListener('click',()=>q('pfUploadHelp').hidden=!q('pfUploadHelp').hidden);
months();load();
let last=-1;setInterval(()=>{if(!document.getElementById('app')?.classList.contains('hidden')){const count=window.msAudit?.getState?.()?.master?.length||0;if(count!==last){last=count;if(count!==view.rows.length)load();}}},3500);
})();
