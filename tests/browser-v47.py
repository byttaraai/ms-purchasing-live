from pathlib import Path
import json,datetime
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
def row(code,supplier,stock,review=False):
    return dict(product_code=code,product_name=code,supplier=supplier,stock_qty=stock,reorder_point=100,stock_ratio=stock,purchase_price=20,min_order_qty=max(0,120-stock),max_order_qty=max(0,200-stock),needs_review=review,review_reason='Purchase price missing' if review else None,profitability_class='Super',purchase_unit='Piece',option_unit=None,factor=1,order_multiple=1,reorder_point_unit='Piece',raw_unit='Piece',raw_quantity=stock,total_value=20*stock,stock_origin='reported',conversion_role='purchase')
rows=[row('Browser A','Supplier A',5),row('Browser B','Supplier B',30),row('Browser Review','Supplier B',40,True)]
fixture=dict(schema_version=5,seed_applied=True,rows=rows,master=[dict(r) for r in rows],aliases=[],master_revision=1,role='admin',upload=dict(id='11111111-1111-4111-8111-111111111111',snapshot_date=now[:10],uploaded_at=now,status='completed',is_complete=True,excludes_zero=True))
script='window.browserFixture='+json.dumps(fixture)+';\n'+r'''
window.browserErrors=[];
addEventListener('error',e=>browserErrors.push(e.message));
sessionStorage.setItem('msp_v5_session',JSON.stringify({user:{id:'browser-test',email:'test@example.invalid'},access_token:'fixture-not-a-credential'}));
window.fetch=async(url,options)=>{
 const p=options&&options.body?JSON.parse(options.body).payload:null;
 let value;
 if(String(url).endsWith('purchasing_dashboard_v5'))value=browserFixture;
 else if(String(url).endsWith('purchasing_workspace_revision_v47'))value={master_revision:browserFixture.master_revision,upload_id:browserFixture.upload.id};
 else if(String(url).endsWith('purchasing_workspace_state_v58')){const a=deriveWorkspace(browserFixture);value={cycles:a.cycles,score:Math.round(a.model.score),authority_version:'server_v58',source:{master_revision:browserFixture.master_revision,upload_id:browserFixture.upload.id}};}
 else if(String(url).endsWith('purchasing_workspace_sync_v58'))value={ok:true,cycle:{id:'test-cycle',upload_id:browserFixture.upload.id},tasks:p.tasks.map(t=>({...t,id:t.task_key,status:'open',badge_awarded:false})),cycles:structuredClone(state.shortageCycles||{}),authority:{score:p.score,authority_version:'server_v58'},badge_total:0,recent_badges:[],professional_rank:'Builder',rank_metrics:{history_count:1},source:{master_revision:p.master_revision,upload_id:p.upload_id}};
 else if(String(url).endsWith('purchasing_supplier_quest_v79')){
   if(!window.browserQuest)window.browserQuest={id:1,task_id:p.task_id,upload_id:browserFixture.upload.id,supplier:'Supplier B',current_stage:'data',status:'in_progress',stage_data:{_initial_data_codes:['Browser Review']},finished_at:null};
   if(p?.action==='save_stage'){
     window.browserQuest.stage_data[p.stage]=p.stage==='gt300'?{decisions:p.decisions||{},saved_at:new Date().toISOString()}:{codes:p.codes||[],saved_at:new Date().toISOString()};
     const next={data:'lt10',lt10:'10_50','10_50':'50_100','50_100':'100_150','100_150':'150_200','150_200':'200_300','200_300':'gt300',gt300:'summary'};
     window.browserQuest.current_stage=next[p.stage]||'summary';
   }else if(p?.action==='finish')window.browserQuest.status='submitted';
   value={quest:structuredClone(window.browserQuest)};
 }
 else throw Error('Unexpected network URL in test');
 return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
};
addEventListener('load',async()=>{
 const report=document.createElement('p');report.id='workspace-smoke-result';document.body.append(report);
 try{
  await msAudit.loadLive();
  document.querySelector('nav [data-tab="tasks-assistant"]').click();
  await msAudit.loadLive();
  if(!document.querySelector('.ta16-task'))throw Error('Tasks did not render');
  if(document.getElementById('tasksScore').textContent==='-')throw Error('Score did not render');
  browserFixture.rows[0].supplier='Supplier B';browserFixture.master[0].supplier='Supplier B';browserFixture.master_revision++;
  await msAudit.loadLive();
  const tasks=msAudit.getState().taskAssistant.tasks;
  if(tasks.some(t=>t.target==='Supplier A'))throw Error('Stale supplier task');
  if(!tasks.find(t=>t.target==='Supplier B').codes.includes('Browser A'))throw Error('New supplier missing product');
  if(document.getElementById('tasksBadgeTotal').textContent!=='0')throw Error('False badge');
  const supplierTask=msAudit.getState().taskAssistant.tasks.find(t=>t.focus==='suppliers'&&t.target==='Supplier B');
  if(!supplierTask)throw Error('Supplier task missing for UI test');
  await ta16OpenTask(supplierTask);
  const sd=document.getElementById('supplierTaskDialog');
  if(!sd?.open)throw Error('Supplier Quest popup did not open');
  if(!sd.querySelector('.supplier-quest-stepper')||!sd.textContent.includes('Data Review'))throw Error('Supplier Quest data stage missing');
  if(!document.querySelector('.quest-open-product'))throw Error('Data review product action missing');
  if(!document.getElementById('supplierQuestPrimary')?.disabled)throw Error('Data stage should require at least one fix');
  browserFixture.rows[2].needs_review=false;browserFixture.rows[2].review_reason=null;browserFixture.master[2].needs_review=false;browserFixture.master[2].review_reason=null;browserFixture.master_revision++;
  await refreshSupplierQuest(supplierTask.task_key);
  if(document.getElementById('supplierQuestPrimary')?.disabled)throw Error('Data stage did not unlock after a real data fix');
  await document.getElementById('supplierQuestPrimary').onclick();
  if(SupplierQuestUI.quest.current_stage!=='lt10')throw Error('Data stage did not advance');
  const first=document.querySelector('[data-quest-select="Browser A"]');
  if(!first)throw Error('Below-10 purchase stage did not show the supplier product');
  first.checked=true;first.dispatchEvent(new Event('change',{bubbles:true}));
  if(document.getElementById('supplierQuestPrimary').disabled)throw Error('Purchase stage did not enable after selection');
  await document.getElementById('supplierQuestPrimary').onclick();
  if(SupplierQuestUI.quest.current_stage!=='10_50')throw Error('Single confirm action did not advance purchase stage');
  if(msAudit.getState().taskAssistant.tasks.find(t=>t.task_key===supplierTask.task_key)?.status!=='open')throw Error('Supplier Quest completed the task');
  if(document.getElementById('tasksBadgeTotal').textContent!=='0')throw Error('Supplier Quest awarded an unverified badge');
  sd.close();
  if(browserErrors.length)throw Error(browserErrors.join('; '));
  report.textContent='PASS: rendered staged Supplier Quest, data fix gate, single-action purchase advance, supplier move and no false badge';
 }catch(e){report.textContent='FAIL: '+e.message;}
});
'''
s=Path('index.html').read_text().replace('</head>','<script>'+script+'</script></head>',1)
Path('smoke.html').write_text(s)
