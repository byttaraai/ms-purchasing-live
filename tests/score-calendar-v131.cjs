'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const {restore131Index,restore131Workspace}=require('../maintenance/patch131.cjs');
const html=fs.readFileSync('index.html','utf8'),workspace=fs.readFileSync('assets/js/workspace-v47.js','utf8');
const source=fs.readFileSync('tests/workspace-v47.cjs','utf8').split('(async()=>')[0];
const hash=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
function harness(instant='2026-11-11T21:30:00Z'){
 const clock={now:Date.parse(instant)};
 class ClockDate extends Date {constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}}
 const h=vm.runInNewContext(source+'\n({run,derive,row,base,context});',{URL,TextDecoder,TextEncoder,structuredClone,AbortController,Blob,queueMicrotask,Date:ClockDate,require:createRequire(__filename),process:{argv:['node','qa','.']},console:{log(){},error:console.error}});
 const d=structuredClone(h.base);d.rows=[{...h.row('qa-age','QA',20),blocking_review:false}];d.master=d.rows.map(r=>({...r,option_unit:null,order_multiple:1,reorder_point_unit:'Piece'}));
 d.upload.uploaded_at=new ClockDate().toISOString();d.upload.snapshot_date='2026-11-12';
 h.context.fixture=d;h.context.serverCycles={'qa-age':{cycleId:'qa',active:true,startDate:'2026-10-23',lastSeen:'2026-11-12',history:[],justification:null}};
 h.run("state.mode='live';state.session={user:{id:'synthetic'}};state.shortageStoreLoaded=true;state.shortageCycles=structuredClone(serverCycles);WORKSPACE_RUNTIME.serverShortageReady=true;WORKSPACE_RUNTIME.authority={evaluated_on:'2026-11-12'};");
 h.clock=clock;h.fixture=d;return h;
}
module.exports={harness};
test('exact inverses preserve the whole prior application and workspace sources',()=>{
 assert.equal(hash(restore131Index(html)),'6625e18599f4abf4579e1999513185c27b6ee3be');
 assert.equal(hash(restore131Workspace(workspace)),'479823da0a805b1e15a3e28ad29213d284796534');
 assert(html.includes('workspace-v47.js?v=131'));
});
test('the server date determines score, age, payload and tasks across host time zones',()=>{
 const old=process.env.TZ;let expected;
 try{for(const zone of ['UTC','Asia/Riyadh','Africa/Cairo','America/Los_Angeles','Asia/Tokyo','Australia/Sydney']){
  process.env.TZ=zone;const h=harness(),a=h.derive(h.fixture);
  assert.equal(a.day,'2026-11-12');assert.equal(a.payload.evaluated_on,'2026-11-12');
  assert.equal(h.run("shortageAge('qa-age')"),20);
  const digest=JSON.stringify({score:a.model.score,tasks:a.tasks});expected??=digest;assert.equal(digest,expected,zone);
 }}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
test('the former local-date implementation reproduces a score disagreement',()=>{
 const old=process.env.TZ;process.env.TZ='UTC';
 try{const h=harness(),fixed=h.derive(h.fixture);h.run('scoreAsOf=()=>localDateString()');const prior=h.derive(h.fixture);assert.equal(prior.day,'2026-11-11');assert.notEqual(Math.round(prior.model.score),Math.round(fixed.model.score));}
 finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
test('date-only aging ignores spring DST and includes leap days correctly',()=>{
 const old=process.env.TZ;
 try{for(const zone of ['America/New_York','Europe/Berlin','Australia/Sydney','Africa/Cairo']){
  process.env.TZ=zone;const h=harness();
  assert.equal(h.run("daysBetween('2026-03-07','2026-03-09')"),2,zone);
  assert.equal(h.run("daysBetween('2026-10-03','2026-10-05')"),2,zone);
  assert.equal(h.run("daysBetween('2024-02-28','2024-03-01')"),2,zone);
  assert.equal(h.run("daysBetween('2026-11-13','2026-11-12')"),0,zone);
 }}finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old;}
});
test('a skewed device calendar cannot override the server or cause a refresh loop',()=>{
 const h=harness('2026-11-10T10:00:00Z');
 h.run("WORKSPACE_RUNTIME.day='2026-11-12';WORKSPACE_RUNTIME.clockDay=workspaceBusinessDay()");
 assert.equal(h.run('scoreAsOf()'),'2026-11-12');assert.equal(h.run('workspaceDayChanged()'),false);
 h.clock.now+=86400000;assert.equal(h.run('workspaceDayChanged()'),true);
});
test('offline dates stay local and malformed server dates fail closed',()=>{
 const h=harness();h.run("state.mode='local'");assert.equal(h.run('scoreAsOf()'),h.run('localDateString()'));
 h.run("state.mode='live';WORKSPACE_RUNTIME.authority={evaluated_on:'2026-02-31'}");assert.throws(()=>h.run('scoreAsOf()'),/Invalid server evaluation date/);
});
test('same-day wrong score and wrong task impact remain rejected',()=>{
 const h=harness(),result=h.derive(h.fixture);h.context.result=result;
 h.context.data={authority:{authority_version:'server_v58',evaluated_on:result.day,score:Math.round(result.model.score)+1},tasks:[]};
 assert.throws(()=>h.run('verifyServerAuthority(result,data)'),/SERVER_SCORE_MISMATCH/);
 h.context.data.authority.score=Math.round(result.model.score);h.context.data.tasks=result.tasks.map(t=>({...t,status:'open',score_impact:Number(t.score_impact)+1}));
 assert.throws(()=>h.run('verifyServerAuthority(result,data)'),/SERVER_SCORE_IMPACT_MISMATCH/);
 h.context.data.authority.evaluated_on='2026-11-13';assert.throws(()=>h.run('verifyServerAuthority(result,data)'),/SOURCE_DAY_CHANGED/);
});
function installRPC(h,mode){
 h.context.testMode=mode;
 h.run(`globalThis.reads=0;globalThis.syncs=0;globalThis.commits=[];
 function authorityFor(day){const old=WORKSPACE_RUNTIME.authority;WORKSPACE_RUNTIME.authority={evaluated_on:day};const a=deriveWorkspace(fixture);WORKSPACE_RUNTIME.authority=old;return{cycles:structuredClone(serverCycles),score:Math.round(a.model.score),evaluated_on:day,authority_version:'server_v58',source:{master_revision:fixture.master_revision,upload_id:fixture.upload.id}};}
 http=async(path,{body}={})=>{
  if(path.endsWith('purchasing_dashboard_v5')){reads++;return structuredClone(fixture);}
  if(path.endsWith('purchasing_workspace_state_v58'))return authorityFor(reads===1?'2026-11-11':'2026-11-12');
  if(path.endsWith('purchasing_workspace_sync_v58')){syncs++;const a=authorityFor(testMode==='always-day-change'?'2026-11-13':'2026-11-12');if(testMode==='wrong-score'){a.evaluated_on=body.payload.evaluated_on;a.score=body.payload.score+1;}return{authority:a,source:a.source,cycles:structuredClone(serverCycles),tasks:body.payload.tasks.map(t=>({...t,status:'open'}))};}
  throw Error('Unexpected test request '+path);
 };
 commitWorkspace=(r,d)=>{commits.push({day:r.day,score:r.payload.score});Object.assign(state,r.dataset);WORKSPACE_RUNTIME.day=r.day;};`);
}
test('cross-midnight sync retries the whole chain instead of bypassing score validation',async()=>{
 const h=harness();installRPC(h,'midnight');await h.run('loadLive()');assert.equal(h.context.reads,2);assert.equal(h.context.syncs,2);assert.equal(h.context.commits.length,1);assert.equal(h.context.commits[0].day,'2026-11-12');
});
test('day-change retries are bounded, and true arithmetic mismatches are not retried',async()=>{
 const h=harness();installRPC(h,'always-day-change');await assert.rejects(h.run('loadLive()'),/SOURCE_DAY_CHANGED/);assert.equal(h.context.reads,4);assert.equal(h.context.commits.length,0);
 const b=harness();installRPC(b,'wrong-score');await assert.rejects(b.run('loadLive()'),/SERVER_SCORE_MISMATCH/);assert.equal(b.context.reads,1);assert.equal(b.context.commits.length,0);
});
test('inventory validation checks the same server day and still rejects future dates',()=>{
 assert(html.includes("if(date>scoreAsOf())throw Error('Inventory as-of date cannot be in the future.');"));
 assert(html.includes('if(v.master_revision===state.revision&&!workspaceDayChanged())return false;'));
 const h=harness();assert.equal(h.run("'2026-11-12'>scoreAsOf()"),false);assert.equal(h.run("'2026-11-13'>scoreAsOf()"),true);
});
