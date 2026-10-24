/* Build 116: isolated annual forecast presentation. No database writes or estimates. */
(function(){
'use strict';
const root=document.getElementById('purchaseForecast116');if(!root)return;
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
 for(let i=1;i<=12;i++){const m=new Date(today.getFullYear(),today.getMonth()+i,1),value=m.toISOString().slice(0,7);options+='<option value="'+value+'">'+m.toLocaleString('en-US',{month:'long',year:'numeric'})+'</option>';}
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
