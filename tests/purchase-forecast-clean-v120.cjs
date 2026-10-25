'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const replacements=[
 [
  "  <div class=\"pf-note\">Historical sales are isolated and staged (12 months). Forecast numbers remain unavailable until monthly reports, product matching, unit rules and forecast model are approved. Master and Reorder Point Generator remain untouched.</div>\n  <div class=\"pf-summary\"><span><strong>Annual Base</strong> \u00b7 pending</span><span><strong>3M Trend</strong> \u00b7 pending</span><span><strong>Annual Trend</strong> \u00b7 pending</span><span><strong>Confidence</strong> \u00b7 pending</span></div>\n  <div class=\"pf-table-card\">\n    <div class=\"pf-header\">\n      <strong id=\"pfTableTitle\" style=\"font-size:13px\">Annual Forecast Overview</strong>\n      <label class=\"pf-filter-label\">Product <input id=\"pfSearch\" placeholder=\"Search by name or code\" aria-label=\"Search forecast products\"></label>\n      <label class=\"pf-filter-label\">Supplier <select id=\"pfSupplier\"><option value=\"\">All suppliers</option></select></label>\n      <label class=\"pf-filter-label\">Profitability <select id=\"pfProfit\"><option value=\"\">All ratings</option><option value=\"super\">Super</option><option value=\"high\">High</option><option value=\"medium\">Medium</option><option value=\"low\">Low</option><option value=\"loss\">Loss</option><option value=\"unclassified\">Unclassified</option></select></label>\n      <label class=\"pf-filter-label\">Month <select id=\"pfMonth\" aria-label=\"Forecast month\"><option value=\"annual\">Full year</option></select></label>\n      <button type=\"button\" id=\"pfReset\" class=\"pf-btn\">Clear</button>\n      <button type=\"button\" id=\"pfRefresh\" class=\"pf-btn\">Refresh</button>\n    </div>\n",
  "  <div class=\"pf-table-card\">\n    <div class=\"pf-header pf120-header\" data-ui-build=\"120\">\n      <div class=\"pf120-heading\"><strong id=\"pfTableTitle\">Forecast Overview</strong><button id=\"pfInfo\" class=\"pf120-info\" type=\"button\" aria-label=\"About forecast data\" aria-haspopup=\"dialog\" title=\"About these figures\">i</button></div>\n      <label class=\"pf-filter-label\"><input id=\"pfSearch\" placeholder=\"Search product or code\" aria-label=\"Search forecast products\" title=\"Search product or code\"></label>\n      <label class=\"pf-filter-label\"><select id=\"pfSupplier\" aria-label=\"Filter by supplier\" title=\"Supplier\"><option value=\"\">All suppliers</option></select></label>\n      <label class=\"pf-filter-label\"><select id=\"pfProfit\" aria-label=\"Filter by profitability\" title=\"Profitability\"><option value=\"\">All ratings</option><option value=\"super\">Super</option><option value=\"high\">High</option><option value=\"medium\">Medium</option><option value=\"low\">Low</option><option value=\"loss\">Loss</option><option value=\"unclassified\">Unclassified</option></select></label>\n      <label class=\"pf-filter-label\"><select id=\"pfMonth\" aria-label=\"Forecast month\" title=\"Period\"><option value=\"annual\">Full Year</option></select></label>\n      <button type=\"button\" id=\"pfReset\" class=\"pf-btn\" title=\"Clear filters\">Clear</button>\n      <button type=\"button\" id=\"pfRefresh\" class=\"pf-btn pf120-refresh\" aria-label=\"Refresh sales history\" title=\"Refresh sales history\"><span aria-hidden=\"true\">&#8635;</span></button>\n    </div>\n"
 ],
 [
  "<table aria-label=\"Annual product forecast table\"><thead><tr><th style=\"min-width:230px\">Product</th><th>Annual Base Forecast</th><th>Trend (3M / Annual)</th><th>Confidence</th><th>Base + Growth (Final)</th></tr></thead>",
  "<table aria-label=\"Historical sales and pending forecast table\"><thead><tr><th scope=\"col\">Product</th><th scope=\"col\">Historical Sales<span class=\"pf120-col-note\">Actuals &middot; under review</span></th><th scope=\"col\">Trend<span class=\"pf120-col-note\">3M vs prior 3M</span></th><th scope=\"col\">Confidence</th><th scope=\"col\">Final Forecast<span class=\"pf120-col-note\">Base + Growth</span></th></tr></thead>"
 ],
 [
  "  </div>`;",
  "  </div>\n  <dialog id=\"pfInfoDialog\" aria-labelledby=\"pfInfoTitle\"><div class=\"pf120-dialog-head\"><h4 id=\"pfInfoTitle\">About these figures</h4><button id=\"pfInfoClose\" class=\"pf-btn\" type=\"button\" aria-label=\"Close forecast information\">Close</button></div><div id=\"pfInfoContent\"></div></dialog>`;"
 ],
 [
  "   const total=valid?'<strong>'+n(h.historical_12m)+'</strong><div class=\"pf-muted\">'+html(h.selling_unit)+' \u00b7 Historical actuals (staged) \u00b7 '+n(h.months_covered||0)+'/12 months with matched sales</div>':loaded?'<span class=\"pf-pending\">No matched sales</span>':'<span class=\"pf-pending\">Loading history\u2026</span>';",
  "   const total=valid?'<strong class=\"pf120-quantity\">'+n(h.historical_12m)+'</strong><div class=\"pf-muted\" title=\"Historical actuals (staged); months with matched sales\">'+html(h.selling_unit)+' &middot; '+n(h.months_covered||0)+'/12 mo.</div>':loaded?'<span class=\"pf-pending\">No matched sales</span>':'<span class=\"pf-pending\">Loading history\u2026</span>';"
 ],
 [
  "<div class=\"pf-muted\">Last 3M vs previous 3M \u00b7 historical</div>",
  "<div class=\"pf-muted\" title=\"Last 3M vs previous 3M; historical, not a prediction\">Observed change</div>"
 ],
 [
  "   return '<tr><td><div class=\"pf-product\">'+html(r.name)+'<small>'+html(r.code)+' \u00b7 '+html(r.supplier||'Supplier not assigned')+'</small>'+codeinfo+'</div></td><td>'+total+'</td><td>'+trendCell+'</td><td><span class=\"pf-trend\">Not assessed</span></td><td><span class=\"pf-pending\">Pending model</span><div class=\"pf-muted\">Base + annual growth</div></td></tr>';",
  "   return '<tr><td><div class=\"pf-product\"><div class=\"pf120-product-line\"><span dir=\"auto\" title=\"'+html(r.name)+'\">'+html(r.name)+'</span><button type=\"button\" class=\"pf120-info\" data-pf-info-code=\"'+html(r.code)+'\" aria-label=\"Sales details for '+html(r.name)+'\" aria-haspopup=\"dialog\" title=\"Sales details\">i</button></div><small title=\"'+html(r.code+' \u00b7 '+(r.supplier||'Supplier not assigned'))+'\">'+html(r.code)+' \u00b7 '+html(r.supplier||'Supplier not assigned')+'</small>'+codeinfo+'</div></td><td>'+total+'</td><td>'+trendCell+'</td><td><span class=\"pf-trend\">Not assessed</span></td><td><span class=\"pf-pending\">Pending model</span></td></tr>';"
 ],
 [
  "m==='annual'?'Annual Forecast Overview':'Forecast view \u00b7 '+month.options[month.selectedIndex].text",
  "m==='annual'?'Forecast Overview':'Forecast view \u00b7 '+month.options[month.selectedIndex].text"
 ],
 [
  "let options='<option value=\"annual\">Full year \u00b7 Annual overview</option>';",
  "let options='<option value=\"annual\">Full Year</option>';"
 ],
 [
  "months();load();",
  "// Build 120: on-demand information only; no new data requests or calculations.\nlet pfInfoReturnFocus=null;\nfunction showForecastInfo(code,trigger){\n const dialog=q('pfInfoDialog'),content=q('pfInfoContent');\n content.replaceChildren();pfInfoReturnFocus=trigger;\n const add=text=>{const p=document.createElement('p');p.textContent=text;content.appendChild(p);};\n if(code!==null){\n  const product=view.rows.find(r=>r.code===code),h=view.history.get(code);\n  q('pfInfoTitle').textContent=product?product.name:'Sales details';\n  add('Product code: '+code+' | Supplier: '+(product?.supplier||'Not assigned'));\n  if(h){\n   add('Historical actuals (staged). Selling unit: '+(h.selling_unit||'Unresolved')+'. Matched months: '+(h.months_covered||0)+'/12. Rows requiring review: '+(h.review_rows||0)+'.');\n   add('Original report quantities are retained. No purchase-unit conversion is performed in this preview. Missing months are not assumed to be zero.');\n   add('Latest 3-month total: '+(h.last_3m??'Unavailable')+'. Previous 3-month total: '+(h.previous_3m??'Unavailable')+'. Partial periods can affect this historical comparison.');\n  }else add('Sales details are not loaded yet. Use Refresh and try again.');\n }else{\n  q('pfInfoTitle').textContent='About these figures';\n  add('Historical Sales displays recorded net sales, not a Base Forecast. The source reports are staged and under review; quantities remain in the original selling unit.');\n  add('Only matched rows are shown. The month count indicates available matched history; missing months are not assumed to be zero. Open a product info button for its coverage and review details.');\n  add('Trend compares the latest three months with the previous three months. It is an observed change, not a forecast. A partially covered period can affect this comparison.');\n  add('Confidence and Final Forecast are pending the forecasting model and approvals. Annual Growth is a draft and is not applied to historical quantities.');\n  add('Month selection currently reserves the future monthly view; it does not recalculate historical totals. The original Master and Reorder Point Generator are unchanged.');\n }\n if(!dialog.open)dialog.showModal();\n}\nq('pfInfo').addEventListener('click',e=>showForecastInfo(null,e.currentTarget));\nq('pfTableBody').addEventListener('click',e=>{const b=e.target.closest('[data-pf-info-code]');if(b)showForecastInfo(b.dataset.pfInfoCode,b);});\nq('pfInfoClose').addEventListener('click',()=>q('pfInfoDialog').close());\nq('pfInfoDialog').addEventListener('close',()=>{const target=pfInfoReturnFocus?.isConnected?pfInfoReturnFocus:q('pfInfo');target.focus({preventScroll:true});});\nmonths();load();"
 ]
];
function restore120(source){
 for(const [before,after] of [...replacements].reverse()){
  assert.equal(source.split(after).length-1,1,'Unique approved presentation edit: '+after.slice(0,70));
  source=source.replace(after,before);
 }
 return source;
}
module.exports={restore120};
if(require.main===module){
 const source=require('./purchase-forecast-trend-v121.cjs').restore121(fs.readFileSync('assets/js/purchase-forecast-v116.js','utf8'));
 const css=fs.readFileSync('assets/css/purchase-forecast-v116.css','utf8').split('\n/* Build 121:')[0];
 const blob=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
 test('Build120 only changes approved display text, markup and info interaction',()=>assert.equal(blob(restore120(source)),'0f307eeac497767ea319a59544c859aecda578e8'));
 test('Previous CSS is untouched, new selectors stay within Forecast',()=>{
  assert.equal(blob(css.split('\n/* Build 120:')[0]),'d7188f25ff76aab7f8572b974a6254d1a89c8fce');
  const rules=css.split('/* Build 120:')[1];assert(rules);assert(!/!important|@import|url\(/.test(rules));
 });
 test('Filters keep accessible names without visible labels',()=>{
  for(const label of ['Filter by supplier','Filter by profitability','Forecast month','Search forecast products','Refresh sales history'])assert(source.includes('aria-label="'+label+'"'));
  assert(!/pf-filter-label">(?:Product|Supplier|Profitability|Month)/.test(source));
  assert(!source.includes('<div class="pf-summary">'));
  assert(source.includes('Historical Sales<span'));
  assert(source.includes('Actuals &middot; under review'));
  assert(source.includes('id="pfGenerate"')&&source.includes('disabled title="Requires approved'));
 });
}
