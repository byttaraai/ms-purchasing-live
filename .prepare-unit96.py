from pathlib import Path
import hashlib
root=Path(__file__).resolve().parent
p=root/'assets/js/task-assistant-v95.js';b=p.read_bytes()
assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()=='8520851af1704270245abe028a99445fb6a4f268'
s=b.decode()
def once(old,new):
 global s
 assert s.count(old)==1,(old,s.count(old))
 s=s.replace(old,new)
once('/* Build 95: preserve Master Review drafts across partial saves and guard dismissal. */','/* Build 96: explicit new-product unit rules and purchase-unit labels in Master Review only. */')
once("  function optionList(items,selected,placeholder){", """  function optionUnits(row){
    return uniq([...(state?.master||[]).flatMap(m=>[m.purchase_unit,m.option_unit]),row?.raw_unit]);
  }
  function updateUnitLabels(card){
    const isNew=card.dataset.new==='1';
    const pu=isNew?card.querySelector('[data-key="purchase_unit"]')?.value:masterFor(card.dataset.code)?.purchase_unit;
    const unit=pu||'purchase unit';
    for(const [key,label] of [['purchase_price','Purchase Price (SAR / '+unit+')'],['reorder_point','Reorder Point ('+unit+')']]){
      const target=card.querySelector('[data-field="'+key+'"] > span');
      if(target)target.textContent=label;
    }
    if(isNew){
      const option=card.querySelector('[data-key="option_unit"]');
      const factor=card.querySelector('[data-key="factor"]');
      const wrapper=card.querySelector('[data-field="factor"]');
      if(wrapper&&factor){
        // Never clear typed values when a unit selection changes.
        wrapper.style.display=(option?.value||factor.value||factor.validity.badInput)?'':'none';
        factor.required=!!option?.value;
        factor.title='1 '+unit+' = Factor '+(option?.value||'Option Units');
      }
    }
  }
  function optionList(items,selected,placeholder){""")
once("      fields.push(field('Purchase Unit','<select data-key=\"purchase_unit\">'+optionList(purchaseUnits(),'', 'Select unit')+'</select>','purchase_unit'));", """      fields.push(field('Purchase Unit','<select data-key="purchase_unit">'+optionList(purchaseUnits(),'', 'Select unit')+'</select>','purchase_unit'));
      fields.push(field('Option Unit (conversion only)','<select data-key="option_unit">'+optionList(optionUnits(row),'','No alternative unit')+'</select>','option_unit'));
      fields.push(field('Factor (Option / Purchase)','<input data-key="factor" type="number" min="0.000001" max="1000000000000" step="any" inputmode="decimal" placeholder="Enter factor" value="">','factor'));""")
once("      if(key==='purchase_price'){", "      if(key==='purchase_price'||key==='factor'){")
once("    if(!changed)return {patch:null,invalid:false,reason:'No values entered yet.'};", """    if(isNew){
      if(patch.option_unit&&patch.factor==null)return {patch:null,invalid:false,reason:'Enter the Factor: how many Option Units are in 1 Purchase Unit.'};
      const rule={product_code:code,purchase_unit:patch.purchase_unit,option_unit:patch.option_unit||null,factor:patch.factor??1};
      const issue=C.validateRule(rule);
      if(issue)return {patch:null,invalid:true,reason:issue};
      const rawUnit=String(rowFor(code)?.raw_unit||'').trim();
      if(rawUnit&&!C.roleFor(rawUnit,rule,state?.aliases||[]))return {patch:null,invalid:false,reason:'Define inventory unit "'+rawUnit+'" as the Purchase Unit or Option Unit.'};
      // Factor 1 is the existing identity rule only, never an inferred conversion.
      patch.option_unit=rule.option_unit;patch.factor=rule.factor;
    }
    if(!changed)return {patch:null,invalid:false,reason:'No values entered yet.'};""")
once("      const result=cardResult(card,s),stateEl=card.querySelector('.mr93-row-state');", "      updateUnitLabels(card);\n      const result=cardResult(card,s),stateEl=card.querySelector('.mr93-row-state');")
(root/'assets/js/task-assistant-v96.js').write_text(s)
b=s.encode()
assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()=='32abe03c7d99cf09982983d3968f352950603224'
# Only ordinary files are committed by the preparation job. Workflow edits use the connector.
p=root/'index.html';b=p.read_bytes()
assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()=='078492deb993f6c57e09afe2d5dba2505eade6aa'
s=b.decode()
once('Live Build 95</span>','Live Build 96</span>')
once('task-assistant-v95.js?v=95','task-assistant-v96.js?v=96')
p.write_text(s)
for name in ['tests/admin-guard-fix1.cjs','tests/numeric-data01.cjs','tests/popup-drafts-v95.cjs','tests/task-assistant-v93.cjs']:
 p=root/name;s=p.read_text()
 s=s.replace('Live Build 95','Live Build 96').replace('task-assistant-v95.js?v=95','task-assistant-v96.js?v=96')
 if name.endswith('task-assistant-v93.cjs'):s=s.replace("read('assets/js/task-assistant-v95.js')","read('assets/js/task-assistant-v96.js')")
 p.write_text(s)
print('Build 96 asset hash verified; protected entrypoint has exactly two release edits.')
