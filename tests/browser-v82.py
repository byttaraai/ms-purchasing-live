"""Build 82 employee journey, synthetic data only. No live requests or database writes."""
from pathlib import Path
import datetime, json
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
def row(code, stock, profit='High', price=20, review=False, blocking=False):
    return dict(product_code=code,product_name=f'{code} - sample product for supplier review',supplier='QA Supplier',stock_qty=stock,reorder_point=100,stock_ratio=stock,purchase_price=price,min_order_qty=max(0,120-stock),max_order_qty=max(0,200-stock),needs_review=review,blocking_review=blocking,review_reason='Reorder point requires review' if blocking else 'Master purchase price is missing or zero' if review else None,profitability_class=profit,purchase_unit='Piece',option_unit=None,factor=1,order_multiple=1,reorder_point_unit='Piece',raw_unit='Piece',raw_quantity=stock,total_value=None if price is None else price*stock,stock_origin='reported',conversion_role='purchase')
rows=[row('Critical A',5),row('Critical B',8),row('Purchase B',30),row('Purchase C',75),row('Purchase D',120),row('Purchase E',175),row('Transfer A',230),row('Transfer B',280),row('Risk High',400),row('Risk Medium',500,'Medium'),row('Risk Loss',600,'Loss'),row('Data Attention',40,price=None,review=True),row('Data Blocking',50,review=True,blocking=True)]
rows.extend(row(f'Extra critical {i:02d}',6) for i in range(24))
fixture=dict(schema_version=5,seed_applied=True,rows=rows,master=[dict(r) for r in rows],aliases=[],master_revision=1,role='admin',upload=dict(id='11111111-1111-4111-8111-111111111111',snapshot_date=now[:10],uploaded_at=now,status='completed',is_complete=True,excludes_zero=True))
mock=r'''
window.qaErrors=[];window.qaCalls=[];window.qaOutputs=[];window.qaPrints=[];window.qaQuest=null;window.qaFailSave=false;
addEventListener('error',e=>qaErrors.push(e.message));
sessionStorage.setItem('msp_v5_session',JSON.stringify({user:{id:'qa-user',email:'qa@example.invalid'},access_token:'synthetic-not-a-credential'}));
window.open=()=>({closed:false,document:{open(){},write(s){qaPrints.push(s)},close(){}},focus(){},print(){}});
function qaScope(stage){return qaFixture.rows.filter(r=>r.supplier==='QA Supplier'&&(stage==='data'?(r.needs_review||r.blocking_review):SupplierQuestModel.stageForRatio(r.stock_ratio)===stage));}
function qaSnapshot(stage,codes,decisions){return qaScope(stage).map(r=>({product_code:r.product_code,product_name:r.product_name,unit:r.purchase_unit,stock_pct:r.stock_ratio,rating:r.profitability_class,price:r.purchase_price,min_order:r.min_order_qty,max_order:r.max_order_qty,stock_value:r.total_value,needs_review:r.needs_review,blocking_review:r.blocking_review,review_reason:r.review_reason,selected:codes.includes(r.product_code),decision:decisions[r.product_code],master_revision:qaFixture.master_revision}));}
window.fetch=async(url,options)=>{
 const args=options?.body?JSON.parse(options.body):{},p=args.payload,path=String(url).split('/').pop();qaCalls.push({path,p:structuredClone(p||{})});
 let result;
 if(path==='purchasing_dashboard_v5')result=structuredClone(qaFixture);
 else if(path==='purchasing_workspace_revision_v47')result={master_revision:qaFixture.master_revision,upload_id:qaFixture.upload.id};
 else if(path==='purchasing_workspace_state_v58'){const a=deriveWorkspace(qaFixture);result={cycles:a.cycles,score:Math.round(a.model.score),authority_version:'server_v58',source:{master_revision:qaFixture.master_revision,upload_id:qaFixture.upload.id}};}
 else if(path==='purchasing_workspace_sync_v58')result={ok:true,cycle:{id:'qa-cycle',upload_id:qaFixture.upload.id},tasks:p.tasks.map(t=>({...t,id:t.task_key,status:'open',badge_awarded:false})),cycles:structuredClone(state.shortageCycles||{}),authority:{score:p.score,authority_version:'server_v58'},badge_total:0,recent_badges:[],professional_rank:'Builder',rank_metrics:{history_count:1},source:{master_revision:p.master_revision,upload_id:p.upload_id}};
 else if(path==='purchasing_save_master_v5'){
   for(const x of p){for(const list of [qaFixture.rows,qaFixture.master]){const r=list.find(r=>r.product_code===x.product_code);Object.assign(r,x);r.needs_review=false;r.blocking_review=false;r.review_reason=null;}}
   qaFixture.master_revision++;result={ok:true};
 }
 else if(path==='purchasing_supplier_quest_v81'){
   if(!qaQuest)qaQuest={id:1,task_id:p.task_id,upload_id:qaFixture.upload.id,supplier:'QA Supplier',current_stage:'data',status:'in_progress',stage_data:{_initial_blocking_codes:['Data Blocking'],_initial_attention_codes:['Data Attention']}};
   if(p.action==='save_stage'){
     if(qaFailSave){qaFailSave=false;return new Response(JSON.stringify({message:'QA simulated save failure'}),{status:400,headers:{'Content-Type':'application/json'}});}
     if(p.stage!==qaQuest.current_stage)throw Error('QA: wrong stage save');
     if(p.stage==='data'&&qaScope('data').some(r=>r.blocking_review))throw Error('QA: blocked data');
     if(['lt10','10_50','50_100','100_150','150_200','200_300'].includes(p.stage)&&!p.codes?.length&&!p.no_action)throw Error('QA: explicit no-action missing');
     qaQuest.stage_data[p.stage]={codes:p.codes||[],decisions:p.decisions||{},no_action:!!p.no_action,master_revision:qaFixture.master_revision,snapshot:qaSnapshot(p.stage,p.codes||[],p.decisions||{}),saved_at:new Date().toISOString()};
     qaQuest.current_stage=SupplierQuestModel.nextStage(p.stage);
   }else if(p.action==='goto_stage'){
     if(!SupplierQuestModel.canNavigate(qaQuest.stage_data,p.stage))throw Error('QA: locked stage navigation');qaQuest.current_stage=p.stage;
   }else if(p.action==='finish'){
     if(qaQuest.current_stage!=='summary')throw Error('QA: premature finish');
     qaQuest.status='submitted';qaQuest.finished_at=new Date().toISOString();
     const batches=SupplierQuestModel.PURCHASE_STAGE_KEYS.map((key,i)=>({batch:i+1,no_action:qaQuest.stage_data[key].no_action,items:qaQuest.stage_data[key].snapshot.filter(x=>x.selected)}));
     const decisions=qaQuest.stage_data.gt300.snapshot;
     qaOutputs=[{output_type:'supplier_bo',payload:{batches}},{output_type:'branch_reallocation',payload:{items:qaQuest.stage_data['200_300'].snapshot.filter(x=>x.selected)}},{output_type:'sales_promotion',payload:{items:decisions.filter(x=>x.decision==='sales_promotion')}},{output_type:'wholesale',payload:{items:decisions.filter(x=>x.decision==='wholesale_sale')}},{output_type:'supplier_followup',payload:{items:decisions.filter(x=>x.decision.startsWith('supplier_'))}}].map((x,i)=>({...x,id:i+1,task_id:qaQuest.task_id,quest_id:1,supplier:'QA Supplier',created_at:qaQuest.finished_at}));
   }
   result={quest:structuredClone(qaQuest),master_revision:qaFixture.master_revision,stale_stages:[]};
 }
 else if(path==='purchasing_supplier_quest_outputs_v80')result={outputs:structuredClone(qaOutputs)};
 else throw Error('QA unexpected network path: '+path);
 return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
};
'''
journey=r'''
addEventListener('load',async()=>{
 const report=document.createElement('p');report.id='quest-ux-result';document.body.append(report);
 const check=(ok,msg)=>{if(!ok)throw Error(msg);};
 const choose=(code,on=true)=>{const cb=[...document.querySelectorAll('[data-quest-select]')].find(x=>x.dataset.questSelect===code);check(cb,'Missing selection '+code);cb.checked=on;cb.dispatchEvent(new Event('change',{bubbles:true}));};
 const save=async()=>{const b=document.getElementById('supplierQuestPrimary');check(!b.disabled,'Primary unexpectedly disabled in '+supplierQuestStage());await b.onclick();};
 try{
  await msAudit.loadLive();go('tasks-assistant');await msAudit.loadLive();
  const task=state.taskAssistant.tasks.find(t=>t.focus==='suppliers'&&t.target==='QA Supplier');check(task,'Supplier task missing');
  await openSupplierTaskPopup(task);
  check(document.getElementById('supplierQuestPrimary').disabled,'Blocking data gate lost');
  check(document.getElementById('supplierQuestPrint').textContent==='Print Data Review','Data print label is incorrect');
  check(!document.getElementById('supplierQuestNoAction'),'Two-action checkbox returned');
  const edit=[...document.querySelectorAll('[data-edit]')].find(x=>x.dataset.edit==='Data Attention');edit.click();
  check(document.activeElement.id==='editPurchasePrice','Data action did not focus purchase price');
  document.getElementById('editPurchasePrice').value='25';updateEditPreview();await saveProductEdit();
  document.getElementById('closeDetail').click();
  await new Promise(r=>setTimeout(r,15));
  const blocking=qaFixture.rows.find(r=>r.product_code==='Data Blocking');blocking.blocking_review=false;blocking.needs_review=false;blocking.review_reason=null;Object.assign(qaFixture.master.find(r=>r.product_code==='Data Blocking'),blocking);qaFixture.master_revision++;
  await refreshSupplierQuest(task.task_key);check(!document.getElementById('supplierQuestPrimary').disabled,'Resolved blocking gate still locked');
  await save();check(supplierQuestStage()==='lt10','Did not reach first purchase band');
  const dialog=document.getElementById('supplierTaskDialog'),content=document.getElementById('supplierQuestContent');
  const bounds=dialog.getBoundingClientRect(),footer=dialog.querySelector('.sq-footer').getBoundingClientRect();
  check(bounds.left>=0&&bounds.right<=innerWidth+1,'Dialog outside viewport');
  check(footer.bottom<=innerHeight+1,'Footer outside viewport');
  check(dialog.querySelector('.sq-steps').getBoundingClientRect().top<dialog.querySelector('.sq-stage').getBoundingClientRect().top,'Responsive stepper moved below content');
  if(innerWidth>=1200)check(content.scrollWidth<=content.clientWidth+1,'Desktop horizontal overflow');
  content.scrollTop=130;const scroll=content.scrollTop;
  choose('Critical A');choose('Critical B');
  check(content.scrollTop===scroll,'Selection reset table scroll');
  const search=document.getElementById('supplierQuestSearch');search.value='Critical A';search.dispatchEvent(new Event('input',{bubbles:true}));
  const all=document.getElementById('supplierQuestSelectAll');all.checked=false;all.dispatchEvent(new Event('change',{bubbles:true}));
  check(!SupplierQuestUI.selected.has('Critical A')&&SupplierQuestUI.selected.has('Critical B'),'Select visible changed hidden selections');
  document.getElementById('supplierQuestPrint').click();check(qaPrints.at(-1).includes('Critical B')&&!qaPrints.at(-1).includes('Critical A'),'Purchase print ignored selection');
  search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));choose('Critical A');
  await sqNavigate('data');await sqNavigate('lt10');check(SupplierQuestUI.selected.size===2,'Unsaved selections lost on stage navigation');
  sqRequestClose();check(document.getElementById('supplierQuestLeaveWarning'),'Dirty-close warning missing');document.getElementById('supplierQuestLeave').click();
  await new Promise(r=>setTimeout(r,15));await openSupplierTaskPopup(task);
  check(SupplierQuestUI.selected.size===2,'Closing and reopening lost session draft');
  // Deterministically deliver a delayed close event from the previous opening during this save.
  // A native dialog close event can be queued until after the same element is reopened.
  qaFailSave=true;const pendingSave=save();dialog.dispatchEvent(new Event('close'));await pendingSave;
  check(document.body.classList.contains('sq-modal-open'),'Stale close unlocked the reopened modal background');
  check(!qaFailSave,'Simulated failure was not exercised');
  check(document.querySelector('#supplierTaskDialog [role="alert"]')?.textContent.includes('QA simulated'),'Save error not visible');
  check(!SupplierQuestUI.busy&&!document.getElementById('supplierQuestPrimary').disabled,'Failed save did not restore controls');
  check(SupplierQuestUI.selected.size===2,'Failed save lost selections');
  await save();check(supplierQuestStage()==='10_50','Did not advance after retry');
  choose('Purchase B');await save();
  choose('Purchase C');await save();
  choose('Purchase D');await save();
  choose('Purchase E');await save();
  check(supplierQuestStage()==='200_300','Fifth purchase band missing');
  check(!document.getElementById('supplierQuestPrimary').disabled&&document.getElementById('supplierQuestPrimary').textContent.includes('No Reallocation'),'Empty selection requires extra action');
  choose('Transfer A');document.getElementById('supplierQuestPrint').click();check(qaPrints.at(-1).includes('Transfer A')&&!qaPrints.at(-1).includes('Transfer B'),'Reallocation print includes unselected rows');
  await save();check(supplierQuestStage()==='gt300','Risk stage missing');
  check(document.getElementById('supplierQuestPrimary').disabled,'Incomplete decisions not gated');
  for(const [code,val] of [['Risk High','sales_promotion'],['Risk Medium','supplier_responsibility'],['Risk Loss','wholesale_sale']]){const sel=[...document.querySelectorAll('.sq-decision')].find(x=>x.dataset.code===code);sel.value=val;sel.dispatchEvent(new Event('change',{bubbles:true}));}
  await save();check(supplierQuestStage()==='summary','No final review');
  check(!document.getElementById('supplierQuestPrimary').disabled,'Finish stuck busy after successful save');
  check(document.querySelectorAll('.sq-batch').length===5,'BO not in five full-width batches');
  check(document.querySelectorAll('[data-summary-tab]').length===5,'Missing output review tabs');
  document.querySelector('[data-summary-tab="supplier_followup"]').click();check(document.getElementById('supplierQuestContent').textContent.includes('Supplier Responsibility'),'Supplier responsibility missing in follow-up');
  document.getElementById('supplierQuestPrintBo').click();const finalPrint=qaPrints.at(-1);
  check(finalPrint.includes('Min Order')&&finalPrint.includes('Max Order')&&!finalPrint.includes('Price (SAR)')&&!finalPrint.includes('Stock %'),'BO print fields incorrect');
  await save();check(qaQuest.status==='submitted','Review not submitted');
  check(document.getElementById('supplierQuestPrimary').disabled,'Submitted review can be resubmitted');
  check(state.taskAssistant.tasks.find(t=>t.task_key===task.task_key).status==='open','Review closed the supplier task');
  check(document.getElementById('tasksBadgeTotal').textContent==='0','Review awarded false badge');
  document.getElementById('supplierTaskCloseX').click();
  document.getElementById('sqReviewOutputs').click();await supplierQuestLoadOutputs();
  const view=document.querySelector('[data-view-output]');check(view,'Saved worklist cannot be opened');view.click();
  check(document.getElementById('supplierQuestOutputDialog').open,'Output list dialog missing');
  document.getElementById('sqOutputPrint').click();check(finalPrint===qaPrints.at(-1),'Final BO and saved-list BO printing diverged');
  document.getElementById('sqOutputClose').click();
  check(qaCalls.filter(x=>x.path==='purchasing_supplier_quest_v81'&&x.p.action==='finish').length===1,'Duplicate submission');
  check(!qaErrors.length,qaErrors.join('; '));
  report.textContent='PASS: Build 82 full supplier journey, draft recovery, selected printing, all 5 BO batches, decisions, output tabs, canonical BO print, no task closure or badge';
 }catch(e){report.textContent='FAIL: '+e.message;}
});
'''
base=Path('index.html').read_text()
script='window.qaFixture='+json.dumps(fixture)+';\n'+mock
Path('quest-qa.html').write_text(base.replace('</head>','<script>'+script+"addEventListener('load',()=>{void msAudit.loadLive();});"+'</script></head>',1))
Path('quest-smoke.html').write_text(base.replace('</head>','<script>'+script+journey+'</script></head>',1))
