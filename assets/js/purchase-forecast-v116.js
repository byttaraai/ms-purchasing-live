/* Build 116: isolated annual forecast presentation. No database writes or estimates. */
(function(){
'use strict';
const anchor=document.getElementById('ropGenerator');if(!anchor||typeof anchor.insertAdjacentElement!=='function')return;
const root=document.createElement('section');root.id='purchaseForecast116';root.setAttribute('aria-label','Purchase Forecast Generator');
anchor.insertAdjacentElement('afterend',root);
root.innerHTML=`
  <div class="pf-toolbar" data-ui-build="119">
    <div class="pf-head"><div><h3>Purchase Forecast <small id="pfYear" class="pf-muted"></small></h3><span id="pfSourceStatus" class="pf-muted" role="status">Loading sales reports…</span></div></div>
    <div class="pf-controls" role="group" aria-label="Purchase forecast controls">
      <button id="pfSettings" class="pf-btn pf126-settings" type="button" aria-haspopup="dialog" title="Profitability settings"><span aria-hidden="true">&#9881;</span> Settings</button>
      <label>Monthly Sales <button id="pfMonthUpload" class="pf-btn" type="button">Update Month ▴</button></label>
      <label class="pf-growth-control">Annual Growth % <span class="pf-growth-field"><input id="pfGrowth" type="number" min="-100" max="100" step=".1" value="0" aria-label="Annual growth percentage" aria-describedby="pfGrowthStatus"><span class="pf-muted" id="pfGrowthStatus" role="status" title="Draft percentage; not saved or applied">Draft · 0%</span></span></label>
      <label>Forecast <button id="pfGenerate" class="pf-btn pf-btn-primary" type="button" disabled title="Requires approved monthly history, mapping rules and a validated annual model">Generate Forecast</button></label>
    </div>
  </div>
  <div id="pfUploadHelp" class="pf-note" hidden>Monthly update workflow will become available after the secured upload and review endpoint is implemented. All 12 history batches are staged, not approved. No upload or save is performed from this preview.</div>
  <div class="pf-table-card">
    <div class="pf-header pf120-header" data-ui-build="120">
      <div class="pf120-heading"><strong id="pfTableTitle">Forecast Overview</strong><button id="pfInfo" class="pf120-info" type="button" aria-label="About forecast data" aria-haspopup="dialog" title="About these figures">i</button></div>
      <label class="pf-filter-label"><input id="pfSearch" placeholder="Search sales product" aria-label="Search forecast products" title="Original product name in the sales reports"></label>
      <label class="pf-filter-label"><select id="pfSupplier" aria-label="Filter by supplier" disabled title="Supplier details are a later step; sales do not depend on Master"><option value="">All suppliers</option></select></label>
      <label class="pf-filter-label"><select id="pfProfit" aria-label="Filter by profitability" title="Annual recorded-profit rating"><option value="">All ratings</option><option value="super">Super</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="loss">Loss</option><option value="review">Needs review</option></select></label>
      <label class="pf-filter-label"><select id="pfMonth" aria-label="Forecast month" title="Recorded sales period, not a forecast month"><option value="annual">Full Year</option></select></label>
      <button type="button" id="pfReset" class="pf-btn" title="Clear filters">Clear</button>
      <button type="button" id="pfRefresh" class="pf-btn pf120-refresh" aria-label="Refresh sales history" title="Refresh sales history"><span aria-hidden="true">&#8635;</span></button>
    </div>
    <div class="pf-scroll"><table aria-label="Historical sales and pending forecast table"><thead><tr><th scope="col">Product</th><th scope="col" class="pf126-rating-col" title="Profitability from recorded annual profit">Rating</th><th scope="col">Historical Sales<span class="pf120-col-note">Actuals &middot; under review</span></th><th scope="col">Trend<span class="pf120-col-note">Last 3M vs First 3M</span></th><th scope="col">Confidence</th><th scope="col">Final Forecast<span class="pf120-col-note">Base + Growth</span></th></tr></thead><tbody id="pfTableBody"></tbody></table><div id="pfEmpty" class="pf-empty" hidden>No matching products.</div></div>
    <div class="pf-footer"><span class="pf-muted" id="pfCount">0 products</span><span class="pf-muted" id="pfScopeNote">Recorded sales · original selling units</span><div class="pf-footer-actions"><button type="button" class="pf-btn" id="pfPrev">Previous</button><button type="button" class="pf-btn" id="pfNext">Next</button></div></div>
  </div>
  <dialog id="pfProfitDialog" aria-labelledby="pfProfitTitle">
    <form id="pfProfitForm" novalidate>
      <div class="pf120-dialog-head"><h4 id="pfProfitTitle">Profitability Settings</h4><button id="pfProfitClose" class="pf-btn" type="button" aria-label="Close profitability settings">Close</button></div>
      <p class="pf126-explainer">Annual recorded profit per product, in SAR. The benchmark is the mean of positive product profits, not the profit-margin percentage.</p>
      <div class="pf126-benchmark"><strong id="pfProfitMean">Unavailable</strong><span id="pfProfitPopulation"></span></div>
      <div class="pf126-setting-grid">
        <label>Super multiplier<input id="pfProfitSuper" type="number" min="0.000001" max="1000" step="any" required aria-describedby="pfProfitError"><small id="pfThresholdSuper"></small></label>
        <label>High multiplier<input id="pfProfitHigh" type="number" min="0.000001" max="1000" step="any" required aria-describedby="pfProfitError"><small id="pfThresholdHigh"></small></label>
        <label>Medium multiplier<input id="pfProfitMedium" type="number" min="0.000001" max="1000" step="any" required aria-describedby="pfProfitError"><small id="pfThresholdMedium"></small></label>
      </div>
      <p class="pf126-explainer">Low: positive profit below Medium. Loss: zero or negative profit, matching the Reorder Generator rule. Search and month filters do not change the annual benchmark.</p>
      <p id="pfProfitError" class="pf126-error" role="alert"></p>
      <p id="pfProfitPersistence" class="pf-muted">Settings are saved in this browser for your account only. They do not update the BO Assistant or Reorder Generator.</p>
      <div class="pf126-dialog-actions"><button id="pfProfitDefaults" class="pf-btn" type="button">Reset defaults</button><button id="pfProfitCancel" class="pf-btn" type="button">Cancel</button><button id="pfProfitApply" class="pf-btn pf-btn-primary" type="submit">Apply</button></div>
    </form>
  </dialog>
  <dialog id="pfInfoDialog" aria-labelledby="pfInfoTitle"><div class="pf120-dialog-head"><h4 id="pfInfoTitle">About these figures</h4><button id="pfInfoClose" class="pf-btn" type="button" aria-label="Close forecast information">Close</button></div><div id="pfInfoContent"></div></dialog>`;
const q=id=>root.querySelector('#'+id);
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=n=>new Intl.NumberFormat('en-US').format(n);
const view={rows:[],page:0,size:60,history:new Map(),loading:false,serial:0,periods:[],firstMonth:null,lastMonth:null,sourceRows:0,error:null,controller:null};
const year=q('pfYear'),month=q('pfMonth'),search=q('pfSearch'),supplier=q('pfSupplier'),profit=q('pfProfit'),growth=q('pfGrowth');
// Build125: identities and monthly quantities come only from the existing sales tables.
function getForecastSession(){return window.msAudit?.getState?.()?.session||null;}
function hasQuantity(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));}
// Build126: private preview preferences; only multipliers are kept in browser storage.
const profitModel=window.ForecastProfit126;
let profitMultipliers={...profitModel.defaults},profitSummary=profitModel.summarize([]),profitIdentity=null;
function profitStorageKey(){const id=getForecastSession()?.user?.id;return id?'msp_forecast_profit_v126:'+id:null;}
function restoreProfitSettings(){
 const identity=getForecastSession()?.user?.id||'';
 if(identity===profitIdentity)return;
 profitIdentity=identity;profitMultipliers={...profitModel.defaults};
 try{const value=JSON.parse(localStorage.getItem(profitStorageKey())||'null');if(value?.version===126)profitMultipliers=profitModel.validate(value.multipliers);}catch(_){}
 if(q('pfProfitDialog').open)q('pfProfitDialog').close();
 q('pfProfitMean').textContent='Unavailable';q('pfProfitPopulation').textContent='';
}
function refreshProfitSummary(){profitSummary=profitModel.summarize([...view.history.values()]);}
function ratingFor(h){return profitModel.classify(h,profitSummary,profitMultipliers);}
function profitMoney(value){return profitModel.finite(value)?Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' SAR':'Unavailable';}
function ratingDescription(h){
 const label=ratingFor(h),p=profitModel.annualProfit(h);
 if(p===null)return 'Profit data is missing or invalid; sales quantities remain available.';
 return label+' | Recorded annual profit: '+profitMoney(p)+' | Positive-profit mean: '+profitMoney(profitSummary.mean)+' | '+monthLabel(view.firstMonth)+' - '+monthLabel(view.lastMonth)+(h.months_covered<12?' | '+h.months_covered+'/12 months reported; no missing profit estimated.':'');
}
function profitDraft(){return {super:q('pfProfitSuper').value,high:q('pfProfitHigh').value,medium:q('pfProfitMedium').value};}
function fillProfitInputs(m){for(const k of ['super','high','medium'])q('pfProfit'+k[0].toUpperCase()+k.slice(1)).value=String(m[k]);}
function profitSettingsPreview(){
 q('pfProfitMean').textContent=profitMoney(profitSummary.mean);
 q('pfProfitPopulation').textContent=profitSummary.positiveCount+' positive-profit products / '+profitSummary.total+' sales products'+(profitSummary.missing?' | '+profitSummary.missing+' need profit review':'');
 try{const m=profitModel.validate(profitDraft());q('pfProfitError').textContent='';q('pfProfitApply').disabled=false;
  for(const k of ['super','high','medium'])q('pfThreshold'+k[0].toUpperCase()+k.slice(1)).textContent=profitSummary.mean===null?'No positive-profit benchmark':'At least '+profitMoney(profitSummary.mean*m[k]);
 }catch(error){q('pfProfitError').textContent=error.message;q('pfProfitApply').disabled=true;for(const k of ['Super','High','Medium'])q('pfThreshold'+k).textContent='';}
}
q('pfSettings').addEventListener('click',()=>{restoreProfitSettings();fillProfitInputs(profitMultipliers);profitSettingsPreview();q('pfProfitPersistence').textContent='Settings are saved in this browser for your account only. They do not update the BO Assistant or Reorder Generator.';q('pfProfitDialog').showModal();});
for(const id of ['pfProfitClose','pfProfitCancel'])q(id).addEventListener('click',()=>q('pfProfitDialog').close());
q('pfProfitDialog').addEventListener('close',()=>q('pfSettings').focus({preventScroll:true}));
for(const id of ['pfProfitSuper','pfProfitHigh','pfProfitMedium'])q(id).addEventListener('input',profitSettingsPreview);
q('pfProfitDefaults').addEventListener('click',()=>{fillProfitInputs(profitModel.defaults);profitSettingsPreview();});
q('pfProfitForm').addEventListener('submit',event=>{
 event.preventDefault();let m;try{m=profitModel.validate(profitDraft());}catch(error){q('pfProfitError').textContent=error.message;return;}
 profitMultipliers=m;let saved=false;
 try{const key=profitStorageKey();if(key){localStorage.setItem(key,JSON.stringify({version:126,multipliers:m}));saved=true;}}catch(_){}
 view.page=0;render();q('pfSettings').title=saved?'Profitability settings saved in this browser':'Profitability settings applied for this session only';
 if(saved)q('pfProfitDialog').close();else q('pfProfitPersistence').textContent='Applied for this session only. Browser storage is unavailable; these preferences may reset on reload.';
});
function monthLabel(value){
 if(!/^\d{4}-\d{2}$/.test(String(value)))return String(value||'');
 const [y,m]=value.split('-').map(Number);
 return new Date(Date.UTC(y,m-1,1)).toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'});
}
async function load(){
 const session=getForecastSession(),request=++view.serial;
 view.controller?.abort();view.controller=null;
 view.rows=[];view.history.clear();view.page=0;view.error=null;
 restoreProfitSettings();refreshProfitSummary();
 view.periods=[];view.firstMonth=null;view.lastMonth=null;view.sourceRows=0;
 if(!session?.access_token){view.loading=false;months();render();q('pfSourceStatus').textContent='Sign in to load sales reports';return;}
 view.controller=new AbortController();const controller=view.controller;
 view.loading=true;q('pfRefresh').disabled=true;
 q('pfSourceStatus').textContent='Loading recorded sales...';months();render();
 const timeout=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch('https://mpxpbbpqnvoinyjmuuvf.supabase.co/rest/v1/rpc/purchasing_forecast_history_preview_v121',{
   method:'POST',headers:{'apikey':'sb_publishable_4shFOVEi5Ib0I8KRZYzsMA_Sahkf8PB','Authorization':'Bearer '+session.access_token,'Content-Type':'application/json'},
   body:JSON.stringify({p_codes:[]}),signal:controller.signal
  });
  if(!response.ok)throw Error('Sales source unavailable ('+response.status+')');
  const data=await response.json();
  if(request!==view.serial)return;
  if(data.source_mode!=='sales_reports'||!Array.isArray(data.rows)||!Array.isArray(data.periods))throw Error('Unexpected sales-source response');
  const identities=new Set();
  for(const h of data.rows){
   if(!h.source_id||typeof h.source_name!=='string'||!h.source_name||!Array.isArray(h.monthly)||identities.has(h.source_id))throw Error('Invalid or duplicate sales identity');
   identities.add(h.source_id);
  }
  view.rows=data.rows.map(h=>({code:h.source_id,name:h.source_name}));
  for(const h of data.rows)view.history.set(h.source_id,h);
  refreshProfitSummary();
  view.periods=data.periods;view.firstMonth=data.first_month;view.lastMonth=data.last_month;view.sourceRows=Number(data.source_rows)||0;
  months();q('pfSourceStatus').textContent=nf(view.rows.length)+' sales products \u00b7 '+monthLabel(view.firstMonth)+' - '+monthLabel(view.lastMonth);
 }catch(error){
  if(request!==view.serial)return;
  view.rows=[];view.history.clear();view.error=error.name==='AbortError'?'Sales request timed out. Use Refresh to retry.':String(error.message||error);
  refreshProfitSummary();q('pfSourceStatus').textContent=view.error;
 }finally{
  clearTimeout(timeout);
  if(request===view.serial){view.loading=false;view.controller=null;q('pfRefresh').disabled=false;render();}
 }
}
function filtered(){
 const term=search.value.trim().toLocaleLowerCase(),period=month.value;
 return view.rows.filter(r=>(!term||r.name.toLocaleLowerCase().includes(term))&&(!profit.value||ratingFor(view.history.get(r.code)).toLowerCase()===profit.value)&&(period==='annual'||view.history.get(r.code)?.monthly.some(m=>m.month===period)));
}
function render(){
 const rows=filtered(),total=Math.max(1,Math.ceil(rows.length/view.size));view.page=Math.min(view.page,total-1);
 const filteredRows=rows.slice(view.page*view.size,(view.page+1)*view.size);
 q('pfTableBody').innerHTML=filteredRows.map(r=>{
   const h=view.history.get(r.code),valid=h&&h.source_rows>0&&h.unit_count===1&&h.invalid_rows===0&&hasQuantity(h.historical_12m);
   const n=x=>Number(x).toLocaleString('en-US',{maximumFractionDigits:6});
   const selected=month.value==='annual'?null:h?.monthly.find(m=>m.month===month.value);
   const quantity=selected?selected.qty:h?.historical_12m;
   const quantityValid=selected?selected.unit_count===1&&selected.invalid_rows===0&&hasQuantity(selected.qty):valid;
   const unit=selected?selected.unit:h?.selling_unit;
   const total=quantityValid?'<strong class="pf120-quantity" title="'+html(String(quantity))+'">'+n(quantity)+'</strong><div class="pf-muted" title="Recorded net sales in the original selling unit">'+html(unit)+' &middot; '+(selected?html(monthLabel(selected.month)):n(h.months_covered||0)+'/12 mo.')+'</div>':'<span class="pf-pending">Check source quantities / units</span>';
   const covered=valid&&h.first_3m_months===3&&h.last_3m_months===3&&h.first_3m_errors===0&&h.last_3m_errors===0;
   const baseline=covered?Number(h.first_3m):NaN,latest=covered?Number(h.last_3m):NaN;
   const trend=Number.isFinite(baseline)&&baseline>0&&Number.isFinite(latest)?((latest-baseline)/baseline*100):null;
   const state=trend===null?'':trend>5?'pf-trend-up':trend< -5?'pf-trend-down':'pf-trend-stable';
   const direction=trend===null?'Insufficient Data':trend>5?'↑ +'+n(trend)+'%':trend< -5?'↓ '+n(trend)+'%':'→ '+(trend>0?'+':'')+n(trend)+'%';
   const trendCell=valid?'<span class="pf-trend '+state+'">'+html(direction)+'</span><div class="pf-muted" title="Last 3 months vs first 3 months of the trailing 12 months; historical, not a prediction">'+(trend===null?'Missing or non-comparable baseline':'Last 3M vs First 3M')+'</div>':'<span class="pf-pending">—</span>';
   const rating=ratingFor(h),ratingCell='<span class="pf126-rating pf126-'+rating.toLowerCase()+'" title="'+html(ratingDescription(h))+'">'+html(rating)+'</span>';
   const codeinfo=''; // Purchase-mapping reviews never suppress original sales.
   return '<tr><td><div class="pf-product"><div class="pf120-product-line"><span dir="auto" title="'+html(r.name)+'">'+html(r.name)+'</span><button type="button" class="pf120-info" data-pf-info-code="'+html(r.code)+'" aria-label="Sales details for '+html(r.name)+'" aria-haspopup="dialog" title="Sales details">i</button></div><small>Original sales name</small>'+codeinfo+'</div></td><td class="pf126-rating-cell">'+ratingCell+'</td><td>'+total+'</td><td>'+trendCell+'</td><td><span class="pf-trend">Not assessed</span></td><td><span class="pf-pending">Pending model</span></td></tr>';
 }).join('');
 // The loaded sales catalog is complete; pagination does not query Master codes.
 q('pfEmpty').hidden=rows.length>0;
 q('pfEmpty').textContent=view.loading?'Loading recorded sales...':view.error?'Sales unavailable. Use Refresh to retry.':'No reported products for this selection.';
 q('pfCount').textContent=nf(rows.length)+' products · '+nf(view.page+1)+' / '+nf(total);
 q('pfPrev').disabled=view.page===0;
 q('pfNext').disabled=view.page>=total-1;
 const m=month.value; q('pfTableTitle').textContent=m==='annual'?'Forecast Overview':'Sales · '+monthLabel(m);
 q('pfScopeNote').textContent=m==='annual'?'Recorded sales · '+nf(view.sourceRows)+' source rows':'Recorded sales · '+monthLabel(m);
 const g=Number(growth.value);
 q('pfGrowthStatus').textContent=growth.value!==''&&Number.isFinite(g)&&g>=-100&&g<=100?'Draft · '+g.toLocaleString('en-US')+'%':'Enter annual growth between -100% and +100%';
}
function months(){
 const previous=month.value||'annual';
 month.innerHTML='<option value="annual">Full Year</option>'+view.periods.map(p=>'<option value="'+html(p)+'">'+html(monthLabel(p))+'</option>').join('');
 month.value=view.periods.includes(previous)?previous:'annual';
 year.textContent=view.firstMonth&&view.lastMonth?view.firstMonth.slice(0,4)+'\u2013'+view.lastMonth.slice(0,4):'';
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
  add('Original sales name: '+(product?.name||'Unavailable'));
  if(h){
   add('Historical actuals (staged). Selling unit: '+(h.selling_unit||'Unresolved')+'. Reported months: '+(h.months_covered||0)+'/12. Source rows: '+h.source_rows+'.');
   add(ratingDescription(h));
   add('These quantities are read directly from the existing monthly sales reports. No purchase-unit conversion is applied. A missing month means not reported, not zero sales.');
   add('First 3 months: '+(h.first_3m??'Unavailable')+' ('+(h.first_3m_months||0)+'/3). Last 3 months: '+(h.last_3m??'Unavailable')+' ('+(h.last_3m_months||0)+'/3).');
   const heading=document.createElement('h4');heading.textContent='Monthly net sales';content.appendChild(heading);
   for(const period of view.periods){
    const entry=h.monthly.find(m=>m.month===period),line=document.createElement('p');
    line.dataset.salesMonth=period;
    line.textContent=monthLabel(period)+': '+(entry&&hasQuantity(entry.qty)?Number(entry.qty).toLocaleString('en-US',{maximumFractionDigits:6})+' '+entry.unit:entry?'Check source units':'Not reported');
    if(entry?.source)line.title=entry.source.map(s=>s.file+' | row '+s.row).join('\n');
    content.appendChild(line);
   }
  }else add('Sales details are not loaded yet. Use Refresh and try again.');
 }else{
  q('pfInfoTitle').textContent='About these figures';
  add('Historical Sales displays recorded net sales, not a Base Forecast. The source reports are staged and under review; quantities remain in the original selling unit.');
  add('All source products are included, regardless of any purchase-name or unit-mapping review. Product names and monthly net quantities come from the existing sales database, not the BO Assistant Master.');
  add('Trend compares the latest three months with the first three months of the trailing 12-month history. Green means growth above +5%, amber means decline below -5%, grey means stable within ±5%. Missing/uncertain periods or a zero/negative baseline show Insufficient Data. This is historical change, not a forecast.');
  add('Confidence and Final Forecast are pending the forecasting model and approvals. Annual Growth is a draft and is not applied to historical quantities.');
  add('Select a reporting month to see its recorded sales, or open product details for all monthly quantities. Profitability uses recorded annual profit; supplier and purchasing enrichment are deferred. Master and Reorder Point Generator are unchanged.');
 }
 if(!dialog.open)dialog.showModal();
}
q('pfInfo').addEventListener('click',e=>showForecastInfo(null,e.currentTarget));
q('pfTableBody').addEventListener('click',e=>{const b=e.target.closest('[data-pf-info-code]');if(b)showForecastInfo(b.dataset.pfInfoCode,b);});
q('pfInfoClose').addEventListener('click',()=>q('pfInfoDialog').close());
q('pfInfoDialog').addEventListener('close',()=>{const target=pfInfoReturnFocus?.isConnected?pfInfoReturnFocus:q('pfInfo');target.focus({preventScroll:true});});
months();load();
// Watch only authentication, never Master rows or revisions. Clear history on logout.
let lastIdentity=getForecastSession()?.user?.id||'';
setInterval(()=>{const identity=getForecastSession()?.user?.id||'';if(identity!==lastIdentity){lastIdentity=identity;void load();}},1500);
})();
