/* Build 116: isolated annual forecast presentation. No database writes or estimates. */
(function(){
'use strict';
const anchor=document.getElementById('ropGenerator');if(!anchor||typeof anchor.insertAdjacentElement!=='function')return;
const root=document.createElement('section');root.id='purchaseForecast116';root.setAttribute('aria-label','Purchase Forecast Generator');
anchor.insertAdjacentElement('afterend',root);
root.innerHTML=`
  <div class="pf-toolbar" data-ui-build="119">
    <div class="pf-head"><div><h3>Purchase Forecast <small id="pfYear" class="pf-muted"></small></h3><span id="pfSourceStatus" class="pf-muted" role="status">Loading product master…</span></div></div>
    <div class="pf-controls" role="group" aria-label="Purchase forecast controls">
      <label>Monthly Sales <button id="pfMonthUpload" class="pf-btn" type="button">Update Month ▴</button></label>
      <label class="pf-growth-control">Annual Growth % <span class="pf-growth-field"><input id="pfGrowth" type="number" min="-100" max="100" step=".1" value="0" aria-label="Annual growth percentage" aria-describedby="pfGrowthStatus"><span class="pf-muted" id="pfGrowthStatus" role="status" title="Draft percentage; not saved or applied">Draft · 0%</span></span></label>
      <label>Forecast <button id="pfGenerate" class="pf-btn pf-btn-primary" type="button" disabled title="Requires approved monthly history, mapping rules and a validated annual model">Generate Forecast</button></label>
    </div>
  </div>
  <div id="pfUploadHelp" class="pf-note" hidden>Monthly update workflow will become available after the secured upload and review endpoint is implemented. All 12 history batches are staged, not approved. No upload or save is performed from this preview.</div>
  <div class="pf-table-card">
    <div class="pf-header pf120-header" data-ui-build="120">
      <div class="pf120-heading"><strong id="pfTableTitle">Forecast Overview</strong><button id="pfInfo" class="pf120-info" type="button" aria-label="About forecast data" aria-haspopup="dialog" title="About these figures">i</button></div>
      <label class="pf-filter-label"><input id="pfSearch" placeholder="Search product or code" aria-label="Search forecast products" title="Search product or code"></label>
      <label class="pf-filter-label"><select id="pfSupplier" aria-label="Filter by supplier" title="Supplier"><option value="">All suppliers</option></select></label>
      <label class="pf-filter-label"><select id="pfProfit" aria-label="Filter by profitability" title="Profitability"><option value="">All ratings</option><option value="super">Super</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="loss">Loss</option><option value="unclassified">Unclassified</option></select></label>
      <label class="pf-filter-label"><select id="pfMonth" aria-label="Forecast month" title="Period"><option value="annual">Full Year</option></select></label>
      <button type="button" id="pfReset" class="pf-btn" title="Clear filters">Clear</button>
      <button type="button" id="pfRefresh" class="pf-btn pf120-refresh" aria-label="Refresh sales history" title="Refresh sales history"><span aria-hidden="true">&#8635;</span></button>
    </div>
    <div class="pf-scroll"><table aria-label="Historical sales and pending forecast table"><thead><tr><th scope="col">Product</th><th scope="col">Historical Sales<span class="pf120-col-note">Actuals &middot; under review</span></th><th scope="col">Trend<span class="pf120-col-note">3M vs prior 3M</span></th><th scope="col">Confidence</th><th scope="col">Final Forecast<span class="pf120-col-note">Base + Growth</span></th></tr></thead><tbody id="pfTableBody"></tbody></table><div id="pfEmpty" class="pf-empty" hidden>No matching products.</div></div>
    <div class="pf-footer"><span class="pf-muted" id="pfCount">0 products</span><span class="pf-muted" id="pfScopeNote">Annual overview · 12 future months</span><div class="pf-footer-actions"><button type="button" class="pf-btn" id="pfPrev">Previous</button><button type="button" class="pf-btn" id="pfNext">Next</button></div></div>
  </div>
  <dialog id="pfInfoDialog" aria-labelledby="pfInfoTitle"><div class="pf120-dialog-head"><h4 id="pfInfoTitle">About these figures</h4><button id="pfInfoClose" class="pf-btn" type="button" aria-label="Close forecast information">Close</button></div><div id="pfInfoContent"></div></dialog>`;
const q=id=>root.querySelector('#'+id);
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=n=>new Intl.NumberFormat('en-US').format(n);
const view={rows:[],page:0,size:60,history:new Map(),loading:false,serial:0};
const year=q('pfYear'),month=q('pfMonth'),search=q('pfSearch'),supplier=q('pfSupplier'),profit=q('pfProfit'),growth=q('pfGrowth');
function load(){
 const st=window.msAudit&&typeof window.msAudit.getState==='function'?window.msAudit.getState():null;
 const raw=st&&Array.isArray(st.master)?st.master:[];
 view.history.clear();
 view.rows=raw.map(x=>({code:String(x.product_code||''),name:String(x.product_name||''),supplier:String(x.supplier||''),profit:String(x.profitability_class||'Unclassified')}));
 const suppliers=[...new Set(view.rows.map(x=>x.supplier).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const before=supplier.value;
 supplier.innerHTML='<option value="">All suppliers</option>'+suppliers.map(s=>'<option value="'+html(s)+'">'+html(s)+'</option>').join('');
 if(suppliers.includes(before))supplier.value=before;
 q('pfSourceStatus').textContent=view.rows.length?nf(view.rows.length)+' products · Loading sales history':'Waiting for product Master to load';
 view.page=0;render();
}
function filtered(){const term=search.value.trim().toLocaleLowerCase();return view.rows.filter(r=>(!term||(r.name+' '+r.code).toLocaleLowerCase().includes(term))&&(!supplier.value||r.supplier===supplier.value)&&(!profit.value||r.profit.toLocaleLowerCase()===profit.value));}
function render(){
 const rows=filtered(),total=Math.max(1,Math.ceil(rows.length/view.size));view.page=Math.min(view.page,total-1);
 const filteredRows=rows.slice(view.page*view.size,(view.page+1)*view.size);
 q('pfTableBody').innerHTML=filteredRows.map(r=>{
   const h=view.history.get(r.code),loaded=h!==undefined,valid=h&&h.matched_rows>0&&h.unit_count===1;
   const n=x=>Number(x).toLocaleString('en-US',{maximumFractionDigits:2});
   const total=valid?'<strong class="pf120-quantity">'+n(h.historical_12m)+'</strong><div class="pf-muted" title="Historical actuals (staged); months with matched sales">'+html(h.selling_unit)+' &middot; '+n(h.months_covered||0)+'/12 mo.</div>':loaded?'<span class="pf-pending">No matched sales</span>':'<span class="pf-pending">Loading history…</span>';
   const trend=valid&&h.last_3m!==null&&h.previous_3m!==null&&Number(h.previous_3m)!==0?((Number(h.last_3m)-Number(h.previous_3m))/Math.abs(Number(h.previous_3m))*100):null;
   const direction=trend===null?'—':trend>3?'↑ '+n(trend)+'%':trend< -3?'↓ '+n(trend)+'%':'→ '+n(trend)+'%';
   const trendCell=valid?'<span class="pf-trend">'+html(direction)+'</span><div class="pf-muted" title="Last 3M vs previous 3M; historical, not a prediction">Observed change</div>':'<span class="pf-pending">—</span>';
   const codeinfo=h&&h.review_rows?'<div class="pf-muted">'+n(h.review_rows)+' rows need review</div>':'';
   return '<tr><td><div class="pf-product"><div class="pf120-product-line"><span dir="auto" title="'+html(r.name)+'">'+html(r.name)+'</span><button type="button" class="pf120-info" data-pf-info-code="'+html(r.code)+'" aria-label="Sales details for '+html(r.name)+'" aria-haspopup="dialog" title="Sales details">i</button></div><small title="'+html(r.code+' · '+(r.supplier||'Supplier not assigned'))+'">'+html(r.code)+' · '+html(r.supplier||'Supplier not assigned')+'</small>'+codeinfo+'</div></td><td>'+total+'</td><td>'+trendCell+'</td><td><span class="pf-trend">Not assessed</span></td><td><span class="pf-pending">Pending model</span></td></tr>';
 }).join('');
 void loadHistory(filteredRows.map(r=>r.code));
 q('pfEmpty').hidden=rows.length>0;
 q('pfCount').textContent=nf(rows.length)+' products · '+nf(view.page+1)+' / '+nf(total);
 q('pfPrev').disabled=view.page===0;
 q('pfNext').disabled=view.page>=total-1;
 const m=month.value; q('pfTableTitle').textContent=m==='annual'?'Forecast Overview':'Forecast view · '+month.options[month.selectedIndex].text;
 q('pfScopeNote').textContent=m==='annual'?'Annual overview · 12 future months':'Selected month layout reserved · monthly purchase logic comes in next stage';
 const g=Number(growth.value);
 q('pfGrowthStatus').textContent=growth.value!==''&&Number.isFinite(g)&&g>=-100&&g<=100?'Draft · '+g.toLocaleString('en-US')+'%':'Enter annual growth between -100% and +100%';
}
async function loadHistory(codes){
 if(!codes.length||view.loading)return;
 const missing=codes.filter(code=>!view.history.has(code));
 if(!missing.length)return;
 const token=++view.serial;
 view.loading=true;
 try{
  if(window.LOCAL_FIXTURE){for(const code of missing)view.history.set(code,{matched_rows:0,review_rows:0});return;}
  const audit=window.msAudit,st=audit&&audit.getState&&audit.getState();
  const session=st&&st.session;
  if(!session||!session.access_token)return;
  const response=await fetch('https://mpxpbbpqnvoinyjmuuvf.supabase.co/rest/v1/rpc/purchasing_forecast_history_preview_v118',{
   method:'POST',headers:{'apikey':'sb_publishable_4shFOVEi5Ib0I8KRZYzsMA_Sahkf8PB','Authorization':'Bearer '+session.access_token,'Content-Type':'application/json'},
   body:JSON.stringify({p_codes:missing})
  });
  if(!response.ok)throw Error('Sales history preview unavailable ('+response.status+')');
  const data=await response.json();
  if(token!==view.serial)return;
  for(const item of (data.rows||[]))view.history.set(item.code,item);
  const visibleMonth=String(data.last_month||'');
  q('pfSourceStatus').textContent=view.rows.length.toLocaleString('en-US')+' products · Sales through '+visibleMonth;
 }catch(err){
  q('pfSourceStatus').textContent='Historical data could not be read · '+String(err.message||err);
 }finally{
  view.loading=false;
  if(token===view.serial)requestAnimationFrame(()=>{const current=filtered().slice(view.page*view.size,(view.page+1)*view.size);if(current.some(r=>view.history.has(r.code)))render();});
 }
}
function months(){
 const d=new Date();const today=new Date(d.getFullYear(),d.getMonth(),1);
 // Forecast starts after the last fully closed month; never treat current month as complete.
 let options='<option value="annual">Full Year</option>';
 for(let i=1;i<=12;i++){const m=new Date(today.getFullYear(),today.getMonth()+i,1),value=m.getFullYear()+'-'+String(m.getMonth()+1).padStart(2,'0');options+='<option value="'+value+'">'+m.toLocaleString('en-US',{month:'long',year:'numeric'})+'</option>';}
 month.innerHTML=options;year.textContent=String(today.getFullYear())+'–'+String(today.getFullYear()+1);
}
for(const c of [month,search,supplier,profit,growth])c.addEventListener(c===search||c===growth?'input':'change',()=>{view.page=0;render();});
q('pfPrev').addEventListener('click',()=>{view.page--;render()});q('pfNext').addEventListener('click',()=>{view.page++;render()});
q('pfRefresh').addEventListener('click',load);
q('pfReset').addEventListener('click',()=>{search.value='';supplier.value='';profit.value='';month.value='annual';growth.value='0';view.page=0;render()});
q('pfMonthUpload').addEventListener('click',()=>q('pfUploadHelp').hidden=!q('pfUploadHelp').hidden);
// Build 120: on-demand information only; no new data requests or calculations.
let pfInfoReturnFocus=null;
function showForecastInfo(code,trigger){
 const dialog=q('pfInfoDialog'),content=q('pfInfoContent');
 content.replaceChildren();pfInfoReturnFocus=trigger;
 const add=text=>{const p=document.createElement('p');p.textContent=text;content.appendChild(p);};
 if(code!==null){
  const product=view.rows.find(r=>r.code===code),h=view.history.get(code);
  q('pfInfoTitle').textContent=product?product.name:'Sales details';
  add('Product code: '+code+' | Supplier: '+(product?.supplier||'Not assigned'));
  if(h){
   add('Historical actuals (staged). Selling unit: '+(h.selling_unit||'Unresolved')+'. Matched months: '+(h.months_covered||0)+'/12. Rows requiring review: '+(h.review_rows||0)+'.');
   add('Original report quantities are retained. No purchase-unit conversion is performed in this preview. Missing months are not assumed to be zero.');
   add('Latest 3-month total: '+(h.last_3m??'Unavailable')+'. Previous 3-month total: '+(h.previous_3m??'Unavailable')+'. Partial periods can affect this historical comparison.');
  }else add('Sales details are not loaded yet. Use Refresh and try again.');
 }else{
  q('pfInfoTitle').textContent='About these figures';
  add('Historical Sales displays recorded net sales, not a Base Forecast. The source reports are staged and under review; quantities remain in the original selling unit.');
  add('Only matched rows are shown. The month count indicates available matched history; missing months are not assumed to be zero. Open a product info button for its coverage and review details.');
  add('Trend compares the latest three months with the previous three months. It is an observed change, not a forecast. A partially covered period can affect this comparison.');
  add('Confidence and Final Forecast are pending the forecasting model and approvals. Annual Growth is a draft and is not applied to historical quantities.');
  add('Month selection currently reserves the future monthly view; it does not recalculate historical totals. The original Master and Reorder Point Generator are unchanged.');
 }
 if(!dialog.open)dialog.showModal();
}
q('pfInfo').addEventListener('click',e=>showForecastInfo(null,e.currentTarget));
q('pfTableBody').addEventListener('click',e=>{const b=e.target.closest('[data-pf-info-code]');if(b)showForecastInfo(b.dataset.pfInfoCode,b);});
q('pfInfoClose').addEventListener('click',()=>q('pfInfoDialog').close());
q('pfInfoDialog').addEventListener('close',()=>{const target=pfInfoReturnFocus?.isConnected?pfInfoReturnFocus:q('pfInfo');target.focus({preventScroll:true});});
months();load();
let last=-1;setInterval(()=>{if(!document.getElementById('app')?.classList.contains('hidden')){const count=window.msAudit?.getState?.()?.master?.length||0;if(count!==last){last=count;if(count!==view.rows.length)load();}}},3500);
})();
