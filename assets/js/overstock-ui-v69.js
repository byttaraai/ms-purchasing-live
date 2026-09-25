/* Build 71: overstock-only popup; missing/zero Reorder Point rows are outside this view. */
'use strict';
const overstockRiskView={supplier:'',sort:'inventory_value_desc',rpFilter:'all',minExcessValue:'',maxExcessValue:'',selected:new Set()};
function overstockRiskScope(){return OverstockRisk.evaluate(state.filtered,C.profitLabel);}
function overstockInventoryValue(r){return OverstockRisk.inventoryValue(r);}
function overstockRiskRows(){return overstockRiskScope().rows;}
function overstockRiskSourceRows(scope=overstockRiskScope()){
 const riskRows=scope.rows;
 if(overstockRiskView.rpFilter==='under10')return riskRows.filter(r=>C.finite(r.reorder_point)&&Number(r.reorder_point)>0&&Number(r.reorder_point)<10);
 return riskRows;
}
function overstockRpModeLabel(){
 if(overstockRiskView.rpFilter==='under10')return'Reorder Point < 10';
 return'All Overstock >300%';
}
function overstockRpModeNote(){
 if(overstockRiskView.rpFilter==='under10')return'Only actual >300% overstock rows with a confirmed Reorder Point greater than 0 and below 10.';
 return'Risk Share shows each product\'s share of positive risk impact in the current BO scope. Products without a valid Reorder Point are outside this Overstock view.';
}
function overstockRiskVisibleRows(baseRows){
 const supplier=overstockRiskView.supplier;
 const minValue=String(overstockRiskView.minExcessValue||'').trim()===''?null:Number(overstockRiskView.minExcessValue);
 const maxValue=String(overstockRiskView.maxExcessValue||'').trim()===''?null:Number(overstockRiskView.maxExcessValue);
 const filtered=baseRows.filter(r=>{
  if(supplier&&(supplier==='__none__'?!!r.supplier:r.supplier!==supplier))return false;
  if((Number.isFinite(minValue)||Number.isFinite(maxValue))&&!C.finite(r.excess_value))return false;
  if(Number.isFinite(minValue)&&Number(r.excess_value)<minValue)return false;
  if(Number.isFinite(maxValue)&&Number(r.excess_value)>maxValue)return false;
  return true;
 });
 const n=v=>C.finite(v)?Number(v):0;
 const byRisk=(a,b)=>(a.risk_status==='review')-(b.risk_status==='review')||n(b.risk_impact)-n(a.risk_impact)||n(b.excess_value)-n(a.excess_value)||n(b.excess_qty)-n(a.excess_qty)||n(b.stock_ratio)-n(a.stock_ratio)||String(a.product_name||'').localeCompare(String(b.product_name||''));
 const sorters={
  inventory_value_desc:(a,b)=>n(b.inventory_value)-n(a.inventory_value)||byRisk(a,b),
  risk_desc:byRisk,
  excess_value_desc:(a,b)=>n(b.excess_value)-n(a.excess_value)||byRisk(a,b)
 };
 return filtered.sort(sorters[overstockRiskView.sort]||sorters.inventory_value_desc);
}
function overstockAmount(v){
 if(!Number.isFinite(v))return'\u2014';
 const a=Math.abs(v),sign=v>0?'+':v<0?'\u2212':'';
 const value=a>=1000000?fmt(a/1000000,1)+'M':a>=1000?fmt(a/1000,1)+'K':fmt(a,a<1&&a>0?2:0);
 return sign+'SAR '+value;
}
function overstockVisualSar(r){
 if(!r||r.risk_status==='review'||!Number.isFinite(r.excess_value)||!Number.isFinite(r.risk_factor))return null;
 if(r.risk_status==='positive'&&r.risk_factor>1)return-r.excess_value*(1-1/r.risk_factor);
 if(r.risk_status==='stable')return Math.abs(Number(r.risk_impact)||0);
 return 0;
}
function overstockRiskCell(r){
 const review=r.risk_status==='review',stable=r.risk_status==='stable';
 const label=review?'Review':stable?'Stable':r.risk_share_pct<.005?'&lt;0.01%':fmt(r.risk_share_pct,2)+'%';
 const tone=review?'review':stable?'stable':'positive',visualSar=overstockVisualSar(r);
 const exact=Number.isFinite(visualSar)?(visualSar>0?'+':visualSar<0?'\u2212':'')+'SAR '+fmt(Math.abs(visualSar),2):'Not valued';
 const explanation=review?r.risk_reason:stable?'Stable offset shown as a positive visual SAR amount; card risk math is unchanged.':'Risk share is unchanged; the SAR amount is a visual inverse share of this product excess value and does not change card calculations.';
 return`<span class="overstock-risk-cell ${tone}" title="${esc(explanation+' '+exact)}"><strong>${label}</strong><small>${esc(overstockAmount(visualSar))}</small></span>`;
}
function overstockPrintDocument(rows,supplier,mode,scope){
 const metric=(v,d=0)=>C.finite(v)?esc(fmt(v,d)):'\u2014';
 const totalValue=rows.reduce((n,r)=>n+(C.finite(r.excess_value)?r.excess_value:0),0);
 const body=rows.map(r=>`<tr><td>${esc(r.product_name)}</td><td>${overstockRiskCell(r)}</td><td>${esc(r.purchase_unit||'\u2014')}</td><td class="num">${metric(r.stock_qty,4)} / ${metric(r.reorder_point,4)}</td><td class="num">${metric(r.stock_ratio,1)}${C.finite(r.stock_ratio)?'%':''}</td><td class="num">${metric(r.excess_qty,4)}</td><td class="num">${metric(r.excess_value,0)}</td><td>${esc(r.supplier||'Not assigned')}</td></tr>`).join('');
 return`<!doctype html><html><head><meta charset="utf-8"><title>Overstock Review</title><style>
 @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#17284a;margin:0;font-size:9pt}header{display:flex;justify-content:space-between;gap:15px;border-bottom:2px solid #5b34fc;padding-bottom:8px;margin-bottom:10px}h1{font-size:17pt;margin:0 0 3px}.sub,.footer{color:#68758e}.summary{margin:8px 0}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th{background:#eef2f8;text-align:left;font-size:8pt;padding:6px;border-bottom:1px solid #cbd4e3}td{padding:6px;border-bottom:1px solid #e2e7ef;vertical-align:middle;overflow-wrap:anywhere}th:nth-child(1){width:23%}th:nth-child(2){width:14%}th:nth-child(3){width:7%}th:nth-child(4){width:13%}th:nth-child(5){width:8%}th:nth-child(6){width:10%}th:nth-child(7){width:11%}th:nth-child(8){width:14%}.num{text-align:right;font-variant-numeric:tabular-nums}.overstock-risk-cell{display:inline-flex;align-items:baseline;justify-content:center;line-height:1.3;gap:5px;white-space:nowrap}.overstock-risk-cell strong{font-size:9pt}.overstock-risk-cell small{font-size:8pt}.positive{color:#b82d43}.stable{color:#967016}.review{color:#738199}.footer{margin-top:8px;font-size:8pt}.no-print{margin-bottom:9px}@media print{.no-print{display:none}}
 </style></head><body><div class="no-print">Print this page or choose Save as PDF.</div><header><div><h1>Overstock Review</h1><div class="sub">${esc(supplier)} \u00b7 ${esc(mode)}</div></div><div>${rows.length} selected products<br>${esc(new Date().toLocaleDateString('en-GB'))}</div></header><div class="summary">Known Excess Value: <b>SAR ${fmt(totalValue,0)}</b></div><table><thead><tr><th>Product</th><th>Risk Share</th><th>Unit</th><th>Stock / Reorder</th><th>Stock %</th><th>Excess Qty</th><th>Excess Value</th><th>Supplier</th></tr></thead><tbody>${body}</tbody></table><div class="footer">MS Purchasing \u00b7 Risk shares use the full current BO scope (${scope.productCount} products), not just printed rows. Unvalued rows are marked Review.</div></body></html>`;
}
function overstockPrintSelected(){
 const scope=overstockRiskScope();
 const rows=overstockRiskVisibleRows(overstockRiskSourceRows(scope)).filter(r=>overstockRiskView.selected.has(r.product_code));
 if(!rows.length){toast('Select at least one overstock product to print.');return;}
 const supplier=overstockRiskView.supplier==='__none__'?'Not assigned':overstockRiskView.supplier||'All Suppliers';
 const valueMode=String(overstockRiskView.minExcessValue||'').trim()===''?'':` \u00b7 Excess Value > SAR ${fmt(Number(overstockRiskView.minExcessValue),0)}`;
 const w=window.open('','_blank','width=1200,height=820');
 if(!w){toast('Please allow pop-ups to open the print preview.');return;}
 w.document.open();w.document.write(overstockPrintDocument(rows,supplier,overstockRpModeLabel()+valueMode,scope));w.document.close();
 w.addEventListener('afterprint',()=>w.close(),{once:true});
 setTimeout(()=>{if(!w.closed){w.focus();w.print();}},200);
}
function openOverstockRiskPopup(options={}){
 const existing=$('overstockRiskDialog');
 const scrollTop=options.resetScroll?0:(existing?.querySelector('.overstock-risk-table-wrap')?.scrollTop||0);
 const scope=overstockRiskScope(),baseRows=overstockRiskSourceRows(scope);
 const validCodes=new Set(baseRows.map(r=>r.product_code));
 overstockRiskView.selected=new Set([...overstockRiskView.selected].filter(code=>validCodes.has(code)));
 const suppliers=[...new Set(baseRows.map(r=>r.supplier).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 if(overstockRiskView.supplier&&overstockRiskView.supplier!=='__none__'&&!suppliers.includes(overstockRiskView.supplier))overstockRiskView.supplier='';
 const rows=overstockRiskVisibleRows(baseRows);
 const visibleCodes=rows.map(r=>r.product_code),selectedVisible=visibleCodes.filter(code=>overstockRiskView.selected.has(code));
 const allVisible=rows.length>0&&selectedVisible.length===rows.length,someVisible=selectedVisible.length>0;
 const totalQty=rows.reduce((n,r)=>n+(C.finite(r.excess_qty)?Number(r.excess_qty):0),0);
 const totalExcessValue=rows.reduce((n,r)=>n+(C.finite(r.excess_value)?Number(r.excess_value):0),0);
 const totalInventoryValue=rows.reduce((n,r)=>n+(C.finite(r.inventory_value)?Number(r.inventory_value):0),0);
 let d=$('overstockRiskDialog');
 if(!d){d=document.createElement('dialog');d.id='overstockRiskDialog';d.className='overstock-risk-dialog';document.body.append(d);}
 const supplierOptions=['<option value="">All Suppliers</option>',...suppliers.map(s=>`<option value="${esc(s)}" ${overstockRiskView.supplier===s?'selected':''}>${esc(s)}</option>`),`<option value="__none__" ${overstockRiskView.supplier==='__none__'?'selected':''}>Not assigned</option>`].join('');
 const rpOptions=`<option value="all" ${overstockRiskView.rpFilter==='all'?'selected':''}>All Overstock &gt;300%</option><option value="under10" ${overstockRiskView.rpFilter==='under10'?'selected':''}>Reorder Point &lt; 10</option>`;
 const sortOptions=`<option value="inventory_value_desc" ${overstockRiskView.sort==='inventory_value_desc'?'selected':''}>Inventory Value ↓</option><option value="risk_desc" ${overstockRiskView.sort==='risk_desc'?'selected':''}>Risk Share \u2193</option><option value="excess_value_desc" ${overstockRiskView.sort==='excess_value_desc'?'selected':''}>Excess Value ↓</option>`;
 const metric=(v,digits=0)=>C.finite(v)?fmt(v,digits):'—';
 const riskInfo="Risk Share % is this product's share of total positive risk contribution. The SAR amount is visual only: Risk rows show a minus inverse share of the product Excess Value; Stable rows keep their current offset as plus. Card risk calculations are unchanged.";
 const body=rows.map((r,i)=>`<tr><td class="overstock-risk-select"><input type="checkbox" data-overstock-select="${esc(r.product_code)}" aria-label="Select ${esc(r.product_name)} for printing" ${overstockRiskView.selected.has(r.product_code)?'checked':''}></td><td class="overstock-risk-rank">${i+1}</td><td><div class="product-cell">${productButton(r)}</div></td><td class="overstock-risk-share">${overstockRiskCell(r)}</td><td class="unit" title="${esc(r.purchase_unit||'')}"><span class="overstock-cell-clamp">${esc(r.purchase_unit||'—')}</span></td><td>${stockHtml(r)}</td><td>${pill(r.stock_ratio)}</td><td>${ratingHtml(r.profitability_class)}</td><td class="money">${fmt(r.purchase_price,1)}</td><td class="order">${metric(r.excess_qty,4)}</td><td class="money overstock-excess-value">${metric(r.excess_value,0)}</td><td class="supplier" title="${esc(r.supplier||'Not assigned')}"><span class="overstock-cell-clamp">${esc(r.supplier||'Not assigned')}</span></td></tr>`).join('');
 const emptyText='No matching overstock products in the current Reorder Point filter.';
 const footerExcess=`<span><b>${fmt(totalQty,0)}</b> Excess Qty</span><span><b>SAR ${fmt(totalExcessValue,0)}</b> Excess Value</span>`;
 d.innerHTML=`<div class="overstock-risk-shell"><header class="overstock-risk-head"><div><span class="overstock-risk-eyebrow">OVERSTOCK RISK REVIEW</span><h2>Stock Above 300%</h2><p>${esc(overstockRpModeNote())}</p></div><button class="overstock-risk-x" id="overstockRiskClose" type="button" aria-label="Close">&times;</button></header><div class="overstock-risk-controls"><label><span>Supplier</span><select id="overstockSupplierFilter">${supplierOptions}</select></label><label><span>Reorder Point</span><select id="overstockRpFilter">${rpOptions}</select></label><label class="overstock-value-filter"><span>Excess Value Range</span><div class="overstock-value-range"><input id="overstockValueFrom" type="number" min="0" step="1" inputmode="decimal" placeholder="From" aria-label="Excess Value From" value="${esc(overstockRiskView.minExcessValue)}"><input id="overstockValueTo" type="number" min="0" step="1" inputmode="decimal" placeholder="To" aria-label="Excess Value To" value="${esc(overstockRiskView.maxExcessValue)}"></div></label><label><span>Sort by</span><select id="overstockSortSelect">${sortOptions}</select></label><button class="overstock-print-btn" id="overstockPrintSelected" type="button" ${selectedVisible.length?'':'disabled'}>Print Selected <span>(${selectedVisible.length})</span></button><div class="overstock-risk-count">${fmt(rows.length,0)} of ${fmt(baseRows.length,0)} products</div></div><div class="overstock-risk-table-wrap"><table class="overstock-risk-table"><thead><tr><th class="overstock-risk-select"><input id="overstockSelectAll" type="checkbox" aria-label="Select all visible overstock products" ${allVisible?'checked':''}></th><th>#</th><th>Product</th><th class="overstock-risk-heading"><span>Risk Share</span><span class="overstock-risk-info" tabindex="0" aria-label="${esc(riskInfo)}" title="${esc(riskInfo)}">i</span></th><th>Unit</th><th>Stock / Reorder</th><th>Stock %</th><th>Rating</th><th>Price</th><th>Excess Qty</th><th>Excess Value</th><th>Supplier</th></tr></thead><tbody>${body||`<tr><td colspan="12" class="overstock-risk-empty">${esc(emptyText)}</td></tr>`}</tbody></table></div><footer class="overstock-risk-footer"><span><b>${fmt(rows.length,0)}</b> Products</span><span><b>SAR ${fmt(totalInventoryValue,0)}</b> Inventory Value</span>${footerExcess}</footer></div>`;
 function updateOverstockSelection(){
  const count=visibleCodes.filter(code=>overstockRiskView.selected.has(code)).length;
  for(const cb of d.querySelectorAll('[data-overstock-select]'))cb.checked=overstockRiskView.selected.has(cb.dataset.overstockSelect);
  const all=$('overstockSelectAll');all.checked=rows.length>0&&count===rows.length;all.indeterminate=count>0&&count<rows.length;
  $('overstockPrintSelected').disabled=!count;$('overstockPrintSelected').innerHTML='Print Selected <span>('+count+')</span>';
 }
 const master=$('overstockSelectAll');if(master){master.indeterminate=!allVisible&&someVisible;master.onchange=e=>{for(const code of visibleCodes){if(e.target.checked)overstockRiskView.selected.add(code);else overstockRiskView.selected.delete(code);}updateOverstockSelection();};}
 $('overstockRiskClose').onclick=()=>d.close();
 $('overstockPrintSelected').onclick=overstockPrintSelected;
 $('overstockSupplierFilter').onchange=e=>{overstockRiskView.supplier=e.target.value;overstockRiskView.selected.clear();d.dataset.returnScroll='0';openOverstockRiskPopup({resetScroll:true});};
 $('overstockRpFilter').onchange=e=>{overstockRiskView.rpFilter=e.target.value;overstockRiskView.supplier='';overstockRiskView.selected.clear();d.dataset.returnScroll='0';openOverstockRiskPopup({resetScroll:true});};
 const valueFrom=$('overstockValueFrom'),valueTo=$('overstockValueTo');
 const cleanRangeValue=input=>{const raw=input.value.trim();return raw===''?'':String(Math.max(0,Number(raw)||0));};
 const applyValueFilter=()=>{overstockRiskView.minExcessValue=cleanRangeValue(valueFrom);overstockRiskView.maxExcessValue=cleanRangeValue(valueTo);overstockRiskView.selected.clear();d.dataset.returnScroll='0';openOverstockRiskPopup({resetScroll:true});};
 for(const input of[valueFrom,valueTo]){input.onchange=applyValueFilter;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyValueFilter();}};}
 $('overstockSortSelect').onchange=e=>{overstockRiskView.sort=e.target.value;d.dataset.returnScroll='0';openOverstockRiskPopup({resetScroll:true});};
 d.onchange=e=>{const cb=e.target.closest('[data-overstock-select]');if(!cb)return;if(cb.checked)overstockRiskView.selected.add(cb.dataset.overstockSelect);else overstockRiskView.selected.delete(cb.dataset.overstockSelect);updateOverstockSelection();};
 d.onclick=e=>{if(e.target===d){d.close();return;}const b=e.target.closest('[data-code]');if(b){const wrap=d.querySelector('.overstock-risk-table-wrap');d.dataset.returnScroll=String(wrap?.scrollTop||0);detail(b.dataset.code);}};
 if(!d.open)d.showModal();
 const wrap=d.querySelector('.overstock-risk-table-wrap');if(wrap)wrap.scrollTop=scrollTop;
}
function refreshOverstockRiskPopup(){
 const d=$('overstockRiskDialog');if(d?.open)openOverstockRiskPopup();
}
function renderOverstockKpi(totalInventory){
 const model=overstockRiskScope(),rating=model.rating;
 $('kpiOverstockSuppliers').textContent=fmt(model.supplierCount,0);
 $('kpiOverstockProducts').textContent=fmt(model.productCount,0);
 $('kpiOverstockValue').textContent=model.valuedCount||!model.productCount?fmt(model.rawExcess,0):'\u2014';
 const rawPct=totalInventory>0&&(model.valuedCount||!model.productCount)?model.rawExcess/totalInventory*100:null;
 $('kpiOverstockPct').textContent='Overstock: '+(rawPct===null?'\u2014':fmt(rawPct,1)+'%');
 const badge=$('kpiOverstockRating');
 badge.textContent=rating.label+(model.cardRiskPct>0?' \u00b7 '+fmt(model.cardRiskPct,2)+'%':'');
 badge.className='kpi-overstock-rating '+rating.cls;
 badge.title='Net model impact / known excess value. Not an expected loss. '+model.valuedCount+' priced products; '+model.reviewCount+' need review.';
 const note=$('kpiOverstockBasis');if(note)note.textContent='Excess above 300% only'+(model.reviewCount?' \u00b7 '+model.reviewCount+' Review':'');
 const coverage=$('kpiOverstockCoverage');if(coverage){coverage.textContent=model.reviewCount?model.reviewCount+' Review':'';coverage.title=model.reviewCount+' rows are excluded from financial risk until their data is valid.';}
 const card=$('overstockKpiCard');if(card){for(const c of ['stable','low','medium','high','critical','review','empty'])card.classList.remove('overstock-tone-'+c);card.classList.add('overstock-tone-'+rating.cls);}
 return model;
}

