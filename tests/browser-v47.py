from pathlib import Path
import json,datetime
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
def row(code,supplier,stock,review=False):
    return dict(product_code=code,product_name=code,supplier=supplier,stock_qty=stock,reorder_point=100,stock_ratio=stock,purchase_price=20,min_order_qty=max(0,120-stock),max_order_qty=max(0,200-stock),needs_review=review,review_reason='Purchase price missing' if review else None,profitability_class='Super',purchase_unit='Piece',option_unit=None,factor=1,order_multiple=1,reorder_point_unit='Piece',raw_unit='Piece',raw_quantity=stock,total_value=20*stock,stock_origin='reported',conversion_role='purchase')
rows=[row('Browser A','Supplier A',20),row('Browser B','Supplier B',30),row('Browser Review','Supplier B',40,True)]
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
 else if(String(url).endsWith('purchasing_workspace_state_v58')){const a=deriveWorkspace(browserFixture);value={cycles:a.cycles,score:Math.round(a.model.score),authority_version:'server_v58',source:{master_revision:browserFixture.master_revision,upload_id:browserFixture.upload.id}};}\n else if(String(url).endsWith('purchasing_workspace_sync_v58'))value={ok:true,cycle:{id:'test-cycle',upload_id:browserFixture.upload.id},tasks:p.tasks.map(t=>({...t,id:t.task_key,status:'open',badge_awarded:false})),cycles:structuredClone(state.shortageCycles||{}),authority:{score:p.score,authority_version:'server_v58'},badge_total:0,recent_badges:[],professional_rank:'Builder',rank_metrics:{history_count:1},source:{master_revision:p.master_revision,upload_id:p.upload_id}};
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
  browserFixture.rows[2].needs_review=false;browserFixture.rows[2].review_reason=null;browserFixture.master_revision++;
  await msAudit.loadLive();
  if(msAudit.getState().taskAssistant.tasks.some(t=>t.focus==='data'))throw Error('Stale master review');
  if(document.getElementById('tasksBadgeTotal').textContent!=='0')throw Error('False badge');
  if(browserErrors.length)throw Error(browserErrors.join('; '));
  report.textContent='PASS: rendered workspace, supplier move, review repair and no false badge';
 }catch(e){report.textContent='FAIL: '+e.message;}
});
'''
s=Path('index.html').read_text().replace('</head>','<script>'+script+'</script></head>',1)
Path('smoke.html').write_text(s)
