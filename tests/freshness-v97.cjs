'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const read=p=>fs.readFileSync(p,'utf8');
const old=read('assets/js/task-assistant-v96.js'),js=read('assets/js/task-assistant-v97.js'),html=require('./release-colors-v98.cjs')(read('index.html'));
const hash=s=>{const b=Buffer.from(s);return crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');};
const span=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b));
test('immutable baseline and all product/unit/payload definitions preserved',()=>{
 assert.equal(hash(old),'32abe03c7d99cf09982983d3968f352950603224');
 for(const [a,b] of [['  const issueDefs=','  function ensureDialog('],['  function numericValue(','  function updateReady('],['  function sameOwner(','  function finishClose('],['  function requestClose(','  function wrapOpenTask('],['  function wrapOpenTask(','  function init(']])assert.equal(span(js,a,b),span(old,a,b));
});
test('imperative freshness check is before the only write, but after retry refresh',()=>{
 const save=span(js,'  async function save(','  function open(');
 assert(save.indexOf('if(s.pending)')<save.indexOf('if(!inventorySaveAllowed(s))'));
 assert(save.indexOf('if(!inventorySaveAllowed(s))')<save.indexOf('await rpc('));
 assert.equal((js.match(/await rpc\(/g)||[]).length,1);
 assert(js.includes("inventoryFreshnessFor(state.upload).fresh===true"));
 assert(js.includes('s.freshnessRejected=inventorySourceKey()'));
});
test('only release marker and asset reference differ from the verified entrypoint',()=>{
 const reversed=html.replace('Live Build 97</span>','Live Build 96</span>').replace('task-assistant-v97.js?v=97','task-assistant-v96.js?v=96');
 assert.equal(hash(reversed),'34b1c80b1bcaabaa5648c2f24029f2d84a3fe12b');
 assert.equal(hash(read('assets/js/workspace-v47.js')),'479823da0a805b1e15a3e28ad29213d284796534');
 assert.equal(hash(read('assets/js/overstock-risk-v69.js')),'48a2fd77f638ab13f28ce6b781982d181479d7f6');
});
test('expiry and pause never persist, clear or re-scope drafts',()=>{
 assert(!/localStorage|sessionStorage|indexedDB|badge_awarded|masterReviewSeverity|estimateScoreGain/.test(js));
 const pause=span(js,'  function pauseForInventory(','  function numericValue(');
 assert(!/finishClose|replaceChildren|innerHTML|reviewSession=null/.test(pause));
 assert(pause.includes("document.getElementById('inventoryLockUpload')?.click()"));
 assert(js.includes("document.addEventListener('visibilitychange',recheck)"));
 assert(js.includes("addEventListener('focus',recheck)"));
});
test('existing freshness policy keeps exact 48-hour and legacy-source boundaries',()=>{
 const policy=html.split('\n').find(l=>l.startsWith('function inventoryFreshnessFor('));assert(policy);
 const ctx={};vm.createContext(ctx);vm.runInContext(policy+';this.check=inventoryFreshnessFor',ctx);
 const now=Date.parse('2026-09-29T12:00:00Z'),u={uploaded_at:new Date(now).toISOString(),status:'completed',is_complete:true,excludes_zero:true};
 for(const [ms,fresh] of [[0,true],[48*3600000-1,true],[48*3600000,false],[48*3600000+1,false]])assert.equal(ctx.check(u,now+ms).fresh,fresh);
 for(const bad of [null,{...u,is_complete:false},{...u,excludes_zero:false},{...u,status:'failed'},{...u,uploaded_at:'invalid'}])assert.equal(ctx.check(bad,now).fresh,false);
 assert.equal(ctx.check({...u,uploaded_at:null,snapshot_date:'2026-09-29'},now).fresh,true);
});
test('database patch is fail-closed, clock-current and atomic with identical ACLs',()=>{
 const file=fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('_master_review_freshness_v97.sql'));assert.equal(file.length,1);
 const sql=read('supabase/migrations/'+file[0]);
 for(const token of ['b7d86b254435bef3f2f3d6bd6bd4bc6a','for update','clock_timestamp()','INVENTORY_REFRESH_REQUIRED','return fresh97_result;','acl_before'])assert(sql.includes(token));
 assert(!/\b(GRANT|REVOKE|DROP|TRUNCATE|DELETE)\b/.test(sql));
});
