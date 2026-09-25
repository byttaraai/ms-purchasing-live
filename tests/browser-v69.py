"""Extend the existing offline browser smoke test; no real API traffic or data writes."""
from pathlib import Path
import runpy
runpy.run_path('tests/browser-v47.py')
s=Path('smoke.html').read_text()
anchor="else throw Error('Unexpected network URL in test');"
replacement="""else if(String(url).endsWith('purchasing_save_master_v5')){
  for(const patch of p){const master=browserFixture.master.find(r=>r.product_code===patch.product_code),row=browserFixture.rows.find(r=>r.product_code===patch.product_code);Object.assign(master,patch);Object.assign(row,patch);}
  browserFixture.master_revision++;value={ok:true};
 }else throw Error('Unexpected network URL in test');"""
assert s.count(anchor)==1;s=s.replace(anchor,replacement)
anchor="  if(browserErrors.length)throw Error(browserErrors.join('; '));"
checks=r"""
  const check=(ok,message)=>{if(!ok)throw Error(message)};
  const make=(code,ratio,profit='Low',price=10,rp=100,supplier='Risk Supplier')=>({product_code:code,product_name:code,supplier,stock_qty:ratio==null?20:ratio*rp/100,reorder_point:rp,stock_ratio:ratio,purchase_price:price,min_order_qty:0,max_order_qty:0,needs_review:price==null||rp==null,review_reason:price==null?'Price missing':rp==null?'RP missing':null,profitability_class:profit,purchase_unit:'Piece',option_unit:null,factor:1,order_multiple:1,reorder_point_unit:rp==null?null:'Piece',raw_unit:'Piece',raw_quantity:ratio==null?20:ratio*rp/100,total_value:price==null?null:(ratio==null?20:ratio*rp/100)*price,stock_origin:'reported',conversion_role:'purchase',blocking_review:false});
  const extra=[make('Risk large',6400,'Loss',212,1),make('Risk stable',400,'High'),make('Risk unpriced',600,'Low',null),make('Risk no RP',null,'Low',10,null)];
  for(let i=0;i<28;i++)extra.push(make('Risk scroll '+i,600+i*20,'Low',10,100,i%2?'Second supplier':'Risk Supplier'));
  browserFixture.rows.push(...extra);browserFixture.master.push(...extra.map(r=>({...r})));browserFixture.master_revision++;
  await msAudit.loadLive();go('recommendations');
  const before=overstockRiskScope();
  check(before.reviewCount===1,'Unpriced row not excluded from valuation');
  const pos=before.rows.filter(r=>r.risk_status==='positive');
  check(Math.abs(pos.reduce((s,r)=>s+r.risk_share_pct,0)-100)<1e-8,'Positive shares do not sum to 100');
  check(Math.abs(before.netImpact-before.rows.reduce((s,r)=>s+(r.risk_impact||0),0))<1e-8,'Card does not roll up product impacts');
  openOverstockRiskPopup();
  let d=document.getElementById('overstockRiskDialog'),wrap=d.querySelector('.overstock-risk-table-wrap');
  check(d.querySelectorAll('thead th').length===12,'Risk column missing');
  check(d.querySelector('.overstock-risk-cell.stable strong').textContent==='Stable','Stable label missing');
  check(d.querySelector('.overstock-risk-cell.stable small').textContent.startsWith('+SAR'),'Stable amount should display as positive offset');
  check(!d.querySelector('.overstock-risk-cell.positive strong').textContent.includes('+'),'Percentage must not have a plus sign');
  check(d.querySelector('.overstock-risk-cell.positive small').textContent.startsWith('\u2212SAR'.replace('\\u2212','\u2212')),'Risk amount should display with a minus sign');
  check(d.querySelector('.overstock-risk-cell.review strong').textContent==='Review','Unpriced row displayed as Stable');
  check(d.querySelector('.overstock-risk-heading .overstock-risk-info'),'Risk information icon missing');
  const riskHeading=d.querySelector('.overstock-risk-heading');check(getComputedStyle(riskHeading).display==='table-cell','Risk header broke table-cell layout');check(getComputedStyle(riskHeading).whiteSpace==='nowrap','Risk header can wrap vertically');
  check(riskHeading.textContent.includes('Risk Share'),'Risk Share header label missing');
  check(getComputedStyle(d.querySelector('.overstock-risk-cell')).flexDirection==='row','Risk cell is not single-line');
  check(wrap.scrollWidth<=wrap.clientWidth+1,'Popup horizontal overflow');
  check(d.getBoundingClientRect().left>8,'Popup side margin missing');
  wrap.scrollTop=180;const oldScroll=wrap.scrollTop;
  d.querySelector('[data-overstock-select]').click();
  check(wrap.scrollTop===oldScroll,'Selection reset scroll');
  document.getElementById('overstockSelectAll').click();
  check(!document.getElementById('overstockPrintSelected').disabled,'Print button not enabled');
  const baseDenom=overstockRiskScope().positiveImpact;
  const supplier=document.getElementById('overstockSupplierFilter');supplier.value='Second supplier';supplier.dispatchEvent(new Event('change',{bubbles:true}));
  check(overstockRiskScope().positiveImpact===baseDenom,'Popup filter silently changed denominator');
  const rows=overstockRiskVisibleRows(overstockRiskSourceRows());check(rows.every(r=>r.supplier==='Second supplier'),'Supplier filter failed');
  overstockRiskView.supplier='';overstockRiskView.sort='risk_desc';openOverstockRiskPopup();
  const rp=document.getElementById('overstockRpFilter');
  check(![...rp.options].some(o=>o.value==='no_reorder'),'No-Reorder filter should not exist in Overstock');
  check(!overstockRiskScope().rows.some(r=>r.product_code==='Risk no RP'),'No-RP product leaked into Overstock population');
  check(![...d.querySelectorAll('[data-code]')].some(x=>x.dataset.code==='Risk no RP'),'No-RP product leaked into Overstock popup');
  rp.value='under10';rp.dispatchEvent(new Event('change',{bubbles:true}));
  check(overstockRiskVisibleRows(overstockRiskSourceRows()).every(r=>Number(r.reorder_point)>0&&Number(r.reorder_point)<10),'RP under-10 filter failed');
  overstockRiskView.rpFilter='all';overstockRiskView.supplier='';openOverstockRiskPopup();
  const valueFrom=document.getElementById('overstockValueFrom'),valueTo=document.getElementById('overstockValueTo');
  valueFrom.value='1000';valueTo.value='12932';valueFrom.dispatchEvent(new Event('change',{bubbles:true}));
  let ranged=overstockRiskVisibleRows(overstockRiskSourceRows());
  check(ranged.length>0&&ranged.every(r=>r.excess_value>=1000&&r.excess_value<=12932),'Excess Value From/To range failed');
  check(ranged.some(r=>r.excess_value===1000)&&ranged.some(r=>r.excess_value===12932),'Excess Value range boundaries must be inclusive');
  overstockRiskView.minExcessValue='';overstockRiskView.maxExcessValue='';openOverstockRiskPopup();
  const top=overstockRiskScope().rows.find(r=>r.product_code==='Risk large');
  const printed=overstockPrintDocument([top],'Risk Supplier','All Overstock >300%',overstockRiskScope());
  check(printed.includes(overstockRiskCell(top))&&printed.includes('<th>Risk Share</th>'),'Print uses another risk calculation');
  check(!printed.includes('<th>Inventory Value</th>'),'Removed print column returned');
  d.querySelector('[data-code="Risk large"]').click();
  check(document.getElementById('detailDialog').open&&d.open,'Product detail must stack above popup');
  document.getElementById('editProfitability').value='High';document.getElementById('editProfitability').dispatchEvent(new Event('change',{bubbles:true}));
  await saveProductEdit();
  const changed=overstockRiskScope();check(changed.netImpact<before.netImpact,'Saved profitability did not propagate');
  check(changed.rows.find(r=>r.product_code==='Risk large').risk_impact<top.risk_impact,'Product risk did not update');
  check(document.getElementById('kpiOverstockRating').textContent.includes(changed.rating.label),'Card did not update');
  document.getElementById('closeDetail').click();check(d.open,'Closing product lost parent popup');
  check(document.getElementById('tasksBadgeTotal').textContent==='0','Risk edit awarded an unverified badge');
  window.overstockSmokeSummary={rows:changed.productCount,positiveShareTotal:changed.rows.reduce((s,r)=>s+(r.risk_share_pct||0),0),riskPct:changed.cardRiskPct};
"""
# Use the actual minus character through a JavaScript escape, avoiding transcription ambiguity.
checks=checks.replace("'\\u2212SAR'.replace('\\\\u2212','\\u2212')", "'\\u2212SAR'")
assert s.count(anchor)==1;s=s.replace(anchor,checks+'\n'+anchor)
s=s.replace('PASS: rendered workspace, supplier move, review repair and no false badge','PASS: workspace plus overstock-only risk population, horizontal Risk header, single-line risk display, selection, print, live master edit and preserved badges')
Path('smoke.html').write_text(s)
