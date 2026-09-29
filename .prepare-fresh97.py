from pathlib import Path
import hashlib
ROOT=Path(__file__).resolve().parent
base=(ROOT/'assets/js/task-assistant-v96.js').read_text()
def gh(s):
 b=s.encode();return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
assert gh(base)=='32abe03c7d99cf09982983d3968f352950603224'
s=base
def once(old,new):
 global s
 assert s.count(old)==1,old
 s=s.replace(old,new)
once('/* Build 96: explicit new-product unit rules and purchase-unit labels in Master Review only. */','/* Build 97: enforce existing inventory freshness for Master Review saves; retain drafts. */')
once('  let reviewSession=null;','  let reviewSession=null;\n  let freshnessTimer=null;')
once('award a badge.</p></div>', 'award a badge.</p><p id="mr97Freshness" role="status" hidden><span>Inventory refresh required before saving. Your entries are kept in this page.</span> <button class="btn outline" id="mr97Pause" type="button">Pause &amp; Refresh Inventory</button></p></div>')
once("    dialog.querySelector('#mr93Cancel').onclick=()=>requestClose(dialog);", "    dialog.querySelector('#mr93Cancel').onclick=()=>requestClose(dialog);\n    dialog.querySelector('#mr97Pause').onclick=()=>pauseForInventory(dialog);")
once("    dialog.addEventListener('close',()=>{if(!dialog.open)activeDialog=null;});", "    dialog.addEventListener('close',()=>{if(!dialog.open){activeDialog=null;clearTimeout(freshnessTimer);}});")
helpers='''  function inventorySourceKey(){
    const u=state?.upload;
    return JSON.stringify(u?[u.id,u.uploaded_at,u.snapshot_date,u.status,u.is_complete,u.excludes_zero]:null);
  }
  function inventorySaveAllowed(s){
    // Reuse the existing policy. The server remains authoritative for its clock/source.
    if(s?.freshnessRejected===inventorySourceKey())return false;
    try{return typeof inventoryFreshnessFor==='function'&&inventoryFreshnessFor(state.upload).fresh===true;}
    catch{return false;}
  }
  function updateFreshnessUI(dialog,s){
    const locked=state?.mode==='live'&&!inventorySaveAllowed(s);
    dialog.querySelector('#mr97Freshness').hidden=!locked;
    dialog.querySelector('#mr97Pause').disabled=s.busy;
    // Retry Refresh acknowledges an already committed save; it is not a new write.
    if(locked&&!s.pending)dialog.querySelector('#mr93Save').disabled=true;
    clearTimeout(freshnessTimer);
    freshnessTimer=setTimeout(()=>{if(reviewSession&&dialog.open)updateReady(dialog);},1000);
  }
  function pauseForInventory(dialog){
    if(!reviewSession||reviewSession.busy||!sameOwner(reviewSession))return;
    // Suspend, do not discard or rebase the original task's input nodes.
    if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
    activeDialog=null;clearTimeout(freshnessTimer);
    if(typeof updateInventoryLock==='function')updateInventoryLock();
    document.getElementById('inventoryLockUpload')?.click();
  }

'''
once('  function numericValue(input,allowZero){',helpers+'  function numericValue(input,allowZero){')
once("    dialog.setAttribute('aria-busy',String(s.busy));\n    return ready;", "    dialog.setAttribute('aria-busy',String(s.busy));\n    updateFreshnessUI(dialog,s);\n    return ready;")
once("    if(s.pending){await refreshSaved(dialog,s);return;}\n    const feedback", "    if(s.pending){await refreshSaved(dialog,s);return;}\n    if(!inventorySaveAllowed(s)){updateReady(dialog);return;}\n    const feedback")
once("      feedback.textContent='Save could not be confirmed. Your entries are kept. '+(e?.message||'Please try again.');", "      if(/INVENTORY_REFRESH_REQUIRED/.test(e?.message||''))s.freshnessRejected=inventorySourceKey();\n      feedback.textContent='Save could not be confirmed. Your entries are kept. '+(e?.message||'Please try again.');")
once('  function finishClose(dialog){\n    reviewSession=null;activeDialog=null;', '  function finishClose(dialog){\n    clearTimeout(freshnessTimer);\n    reviewSession=null;activeDialog=null;')
once("    initialized=true;\n    addEventListener('beforeunload'", "    initialized=true;\n    const recheck=()=>{if(reviewSession&&activeDialog?.open)updateReady(activeDialog);};\n    addEventListener('focus',recheck);\n    document.addEventListener('visibilitychange',recheck);\n    addEventListener('beforeunload'")
(ROOT/'assets/js/task-assistant-v97.js').write_text(s)
assert gh(s)=='e05959ee65c5673bbff1e5df16117f61f033c70f'
def patch_file(name,pairs,expected=None):
 p=ROOT/name;v=p.read_text()
 if expected:assert gh(v)==expected,name
 for a,b in pairs:
  assert a in v,(name,a);v=v.replace(a,b)
 p.write_text(v)
patch_file('index.html',[('Live Build 96</span>','Live Build 97</span>'),('task-assistant-v96.js?v=96','task-assistant-v97.js?v=97')],'34b1c80b1bcaabaa5648c2f24029f2d84a3fe12b')
for name in ['tests/admin-guard-fix1.cjs','tests/numeric-data01.cjs','tests/popup-drafts-v95.cjs','tests/units-v96.cjs']:
 patch_file(name,[('Live Build 96</span>','Live Build 97</span>'),('task-assistant-v96.js?v=96','task-assistant-v97.js?v=97')])
patch_file('tests/task-assistant-v93.cjs',[('Live Build 96','Live Build 97'),('task-assistant-v96.js','task-assistant-v97.js'),('?v=96','?v=97')])
print('Exact tested v97 blob generated; only release references changed in protected entrypoint/tests.')
