'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const helpers=`// Build131: one server evaluation day; host dates only trigger refreshes.
function workspaceBusinessDay(d=new Date()) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const fields=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return fields.year+'-'+fields.month+'-'+fields.day;
}
function workspaceScoreDay() {
  if(state.mode!=='live')return localDateString();
  const day=WORKSPACE_RUNTIME.authority?.evaluated_on;
  // Old/offline fixtures have no authority date. Production supplies evaluated_on.
  if(day==null)return workspaceBusinessDay();
  const date=new Date(day+'T00:00:00Z');
  if(typeof day!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(day)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day)throw Error('Invalid server evaluation date');
  return day;
}
function workspaceDayChanged() {
  // Pin calculations to the server, but do not pin the midnight refresh detector.
  return WORKSPACE_RUNTIME.day!==scoreAsOf()||WORKSPACE_RUNTIME.clockDay!==workspaceBusinessDay();
}
`;
const indexChanges=[
 ["function daysBetween(a,b){const x=new Date(a+'T12:00:00'),y=new Date(b+'T12:00:00');return Math.max(0,Math.floor((y-x)/86400000));}","function daysBetween(a,b){const x=new Date(a+'T12:00:00Z'),y=new Date(b+'T12:00:00Z');return Math.max(0,Math.floor((y-x)/86400000));}"],
 ["function scoreAsOf(){return localDateString();}","function scoreAsOf(){return workspaceScoreDay();}"],
 ['workspace-v47.js?v=59','workspace-v47.js?v=131'],
 ["if(date>localDateString())throw Error('Inventory as-of date cannot be in the future.');","if(date>scoreAsOf())throw Error('Inventory as-of date cannot be in the future.');"],
 ["if(v.master_revision===state.revision)return false;","if(v.master_revision===state.revision&&!workspaceDayChanged())return false;"],
 ["if(!$('inventoryDate').value){const d=new Date(),local=new Date(d.getTime()-d.getTimezoneOffset()*60000);$('inventoryDate').value=local.toISOString().slice(0,10);}","if(!$('inventoryDate').value)$('inventoryDate').value=state.mode==='live'?workspaceBusinessDay():localDateString();"]
];
const workspaceChanges=[
 ['serverShortageReady: false, authority: null','serverShortageReady: false, authority: null, clockDay: null'],
 ['function workspaceDataset(d) {',helpers+'function workspaceDataset(d) {'],
 ["  const clientScore=Math.round(result.model.score),serverScore=Number(a.score);","  if(a.evaluated_on!=null&&a.evaluated_on!==result.day)throw Error('SOURCE_DAY_CHANGED');\n  const clientScore=Math.round(result.model.score),serverScore=Number(a.score);"],
 ['WORKSPACE_RUNTIME.authority=authority;saveShortageStore();','WORKSPACE_RUNTIME.authority=authority;WORKSPACE_RUNTIME.clockDay=workspaceBusinessDay();saveShortageStore();'],
 ['        verifyServerAuthority(result,data);',"        try {verifyServerAuthority(result,data);}\n        catch(e){\n          if(e.message==='SOURCE_DAY_CHANGED'&&conflicts++<3){WORKSPACE_RUNTIME.pending=true;continue;}\n          throw e;\n        }"],
 ['WORKSPACE_RUNTIME.day!==scoreAsOf()||WORKSPACE_RUNTIME.decisionsDirty','workspaceDayChanged()||WORKSPACE_RUNTIME.decisionsDirty',2]
];
function replace(s,changes,reverse=false){
 for(const [old,next,count=1] of (reverse?[...changes].reverse():changes)){
  const a=reverse?next:old,b=reverse?old:next;
  assert.equal(s.split(a).length-1,count,'Exact Build131 replacement: '+a.slice(0,90));
  s=s.split(a).join(b);
 }
 return s;
}
const hash=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
function restore131Index(s){return s.includes('function scoreAsOf(){return workspaceScoreDay();}')?replace(s,indexChanges,true):s;}
function restore131Workspace(s){return s.includes('// Build131: one server evaluation day;')?replace(s,workspaceChanges,true):s;}
module.exports={indexChanges,workspaceChanges,replace,restore131Index,restore131Workspace};
if(require.main===module){
 const original=fs.readFileSync('index.html','utf8'),workspace=fs.readFileSync('assets/js/workspace-v47.js','utf8');
 assert.equal(hash(original),'6625e18599f4abf4579e1999513185c27b6ee3be');
 assert.equal(hash(workspace),'479823da0a805b1e15a3e28ad29213d284796534');
 const updated=replace(original,indexChanges),updatedWorkspace=replace(workspace,workspaceChanges);
 assert.equal(restore131Index(updated),original);assert.equal(restore131Workspace(updatedWorkspace),workspace);
 fs.writeFileSync('index.html',updated);fs.writeFileSync('assets/js/workspace-v47.js',updatedWorkspace);
 const path='tests/aging-task-blocking-v130-inverse.cjs',text=fs.readFileSync(path,'utf8'),needle='function restore130Index(s){';
 assert.equal(text.split(needle).length-1,1);
 fs.writeFileSync(path,text.replace(needle,needle+"\n s=require('../maintenance/patch131.cjs').restore131Index(s);"));
 // Retain all historical expected hashes; invert only these exact approved edits.
 {
  const path='tests/admin-guard-fix1.cjs',s=fs.readFileSync(path,'utf8'),needle='let data=fs.readFileSync(name);';
  assert.equal(s.split(needle).length-1,1);
  fs.writeFileSync(path,s.replace(needle,needle+"\n    if(name==='assets/js/workspace-v47.js')data=Buffer.from(require('../maintenance/patch131.cjs').restore131Workspace(data.toString('utf8')));"));
 }
 for(const file of ['status-colors-v98.cjs','freshness-v97.cjs','negative-stock-v99.cjs','popup-drafts-v95.cjs','profit-range-task02.cjs']){
  const path='tests/'+file,s=fs.readFileSync(path,'utf8'),match=s.match(/const (hash|gitHash)=s=>\{/);
  assert(match,file);
  fs.writeFileSync(path,s.replace(match[0],match[0]+"s=require('../maintenance/patch131.cjs').restore131Workspace(s);"));
 }
 {
  const path='tests/overstock-v69.cjs',s=fs.readFileSync(path,'utf8'),needle="const bytes=fs.readFileSync('assets/js/workspace-v47.js');";
  assert.equal(s.split(needle).length-1,1);
  fs.writeFileSync(path,s.replace(needle,"const bytes=Buffer.from(require('../maintenance/patch131.cjs').restore131Workspace(fs.readFileSync('assets/js/workspace-v47.js','utf8')));"));
 }
 console.log('Build131 applied; both application sources have exact verified inverses.');
}
