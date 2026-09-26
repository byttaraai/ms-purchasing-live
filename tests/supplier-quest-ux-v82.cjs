const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/js/supplier-task-v82.js'),'utf8');
const ctx={console,Map,Set,JSON,Object,Number,String,Date,Array,structuredClone,addEventListener(){},setTimeout(){},
 state:{mode:'live',session:{user:{id:'test'}},upload:{id:'upload'},rows:[]},
 SupplierQuestModel:require('../assets/js/supplier-quest-model-v81.js'),
 esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
 fmt:(n)=>String(n),C:{profitLabel:x=>x},$:()=>null,purchaseActionsLocked:()=>false};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
const run=s=>vm.runInContext(s,ctx);
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const protectedFiles=JSON.parse(fs.readFileSync(path.join(__dirname,'protected-ui82.json'),'utf8'));
test('business/risk assets are byte-for-byte unchanged',()=>{
 for(const [file,expected] of Object.entries(protectedFiles.assets))assert.equal(hash(file),expected,file);
});
test('index changes are limited to UI assets and build labels',()=>{
 let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 html=html.replace('\n<link rel="stylesheet" href="assets/css/task-assistant-v88.css?v=88">','').replace('<script src="assets/js/task-assistant-v88.js?v=88"></script>','').replaceAll('Live Build 88','Live Build 87').replaceAll('Build 88 |','Build 87 |');
 html=html.replace('\n<link rel="stylesheet" href="assets/css/task-assistant-v87.css?v=87">','').replace('<script src="assets/js/task-assistant-v87.js?v=87"></script>','').replaceAll('Live Build 87','Live Build 86').replaceAll('Build 87 |','Build 86 |');
 html=html.replace('\n<link rel="stylesheet" href="assets/css/task-assistant-v86.css?v=86">','').replace('<script src="assets/js/task-assistant-v86.js?v=86"></script>','').replaceAll('Live Build 86','Live Build 85').replaceAll('Build 86 |','Build 85 |');
 html=html.replace('\n<link rel="stylesheet" href="assets/css/supplier-toolbar-v85.css?v=85">','').replace('<script src="assets/js/supplier-toolbar-v85.js?v=85"></script>','').replaceAll('Live Build 85','Live Build 84').replaceAll('Build 85 |','Build 84 |');
 html=html.replace('\n<link rel="stylesheet" href="assets/css/supplier-polish-v84.css?v=84">','').replace('<script src="assets/js/supplier-polish-v84.js?v=84"></script>','').replaceAll('Live Build 84','Live Build 83').replaceAll('Build 84 |','Build 83 |');
 html=html.replace('\n<link rel="stylesheet" href="assets/css/supplier-layout-v83.css?v=83">','').replace('<script src="assets/js/supplier-layout-v83.js?v=83"></script>','').replaceAll('Live Build 83','Live Build 82').replaceAll('Build 83 |','Build 82 |');
 html=html.replaceAll('supplier-task-v82.css?v=82','supplier-task-v80.css?v=80').replaceAll('supplier-task-v82.js?v=82','supplier-task-v81.js?v=81').replaceAll('Live Build 82','Live Build 81').replaceAll('Build 82 |','Build 81 |');
 assert.equal(crypto.createHash('sha256').update(html).digest('hex'),protectedFiles.index);
});
test('snapshot keeps null quantities unknown instead of changing them to zero',()=>{
 run("SupplierQuestUI.task={id:'t',task_key:'t',target:'S'};SupplierQuestUI.quest={current_stage:'summary',stage_data:{lt10:{codes:['p'],snapshot:[{product_code:'p',product_name:'Product',unit:'Piece',selected:true,min_order:null,max_order:null}]}}};state.rows=[];");
 const batches=run('supplierQuestBoRows(SupplierQuestUI.task)');
 assert.equal(batches.length,5);assert.equal(batches[0].rows[0].min_order_qty,null);
 assert.equal(run('sqNumber(null)'), '\u2014');
});
test('an empty snapshot never falls back to current product quantities',()=>{
 run("SupplierQuestUI.quest.stage_data.lt10={codes:['p'],snapshot:[]};state.rows=[{supplier:'S',product_code:'p',product_name:'changed',min_order_qty:999,max_order_qty:999}]");
 assert.equal(run('supplierQuestBoRows(SupplierQuestUI.task)[0].rows.length'),0);
});
test('final and saved-output BO use the same table and fields',()=>{
 run("SupplierQuestUI.quest.stage_data.lt10={codes:['p'],snapshot:[{product_code:'p',product_name:'P',unit:'Piece',selected:true,min_order:3,max_order:6}]};");
 const fromQuest=run('sqBoTable(supplierQuestBoRows(SupplierQuestUI.task))');
 const fromOutput=run("sqBoTable(sqOutputBatches({payload:{batches:SupplierQuestModel.PURCHASE_STAGE_KEYS.map((k,i)=>({batch:i+1,items:k==='lt10'?[{product_code:'p',product_name:'P',unit:'Piece',min_order:3,max_order:6}]:[]}))}}))");
 assert.equal(fromQuest,fromOutput);assert(fromQuest.includes('Min Order'));assert(fromQuest.includes('Max Order'));
 assert(!/Stock %|Price|SAR|10%|50%|150%|200%/.test(fromQuest));
});
test('explicit no-purchase is a single button and not an extra checkbox',()=>{
 run("SupplierQuestUI.quest.status='in_progress';SupplierQuestUI.busy=false;SupplierQuestUI.selected.clear()");
 assert.equal(run("supplierQuestPrimaryLabel({kind:'purchase'},[])"),'No Purchase Required & Continue');
 assert(!source.includes('id="supplierQuestNoAction"'));
 assert(source.includes('no_action:codes.length===0'));
});
test('data attention does not become a new blocker',()=>{
 run("state.rows=[{supplier:'S',product_code:'a',needs_review:true,blocking_review:false}]");
 assert.equal(run("supplierQuestCanContinue(SupplierQuestUI.task,{kind:'data'},state.rows)"),true);
 run('state.rows[0].blocking_review=true');
 assert.equal(run("supplierQuestCanContinue(SupplierQuestUI.task,{kind:'data'},state.rows)"),false);
});
test('saved-stage staleness comes only from the v81 server',()=>{
 run("supplierQuestApplyServer(SupplierQuestUI.task,{quest:SupplierQuestUI.quest,master_revision:900,stale_stages:['lt10']})");
 assert.deepEqual([...run('SupplierQuestUI.staleStages')],['lt10']);
 assert(source.includes("rpc('purchasing_supplier_quest_v81'"));
 assert(!/purchasing_tasks_sync_v5|purchasing_badges_v5|status\s*=\s*['"]completed/.test(source));
});
test('print and text escape product markup',()=>{
 const html=run("sqProduct({product_name:'<img src=x onerror=alert(1)>',product_code:'p',unit:'Piece'})");
 assert(!html.includes('<img'));assert(html.includes('&lt;img'));
});
test('layout isolates the stepper from global responsive nav ordering',()=>{
 const css=fs.readFileSync(path.join(root,'assets/css/supplier-task-v82.css'),'utf8');
 assert(css.includes('nav.sq-steps{order:0}'));assert(css.includes('body.sq-modal-open{overflow:hidden}'));
});
