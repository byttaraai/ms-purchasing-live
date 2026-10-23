"""One-off source assembly. Creates Git blobs only; never changes refs or production data."""
from pathlib import Path
import hashlib,re,json,os,subprocess,urllib.request
ROOT=Path(__file__).resolve().parents[1]
BASE=(ROOT/'index.html').read_text()
assert hashlib.sha1(b'blob '+str(len(BASE.encode())).encode()+b'\0'+BASE.encode()).hexdigest()=='1f2d195c7106b247d833979d132ad394c2644e4e'
s=BASE
oldlink='assets/css/reorder-generator-v106.css?v=106';newlink='assets/css/reorder-generator-v107.css?v=107'
assert s.count(oldlink)==1
s=s.replace(oldlink,newlink)
a=s.index('<style id="ropg-critical-v106">');b=s.index('</style>',a)+len('</style>');s=s[:a]+s[b:]
s=s.replace('data-ui-build="106"','data-ui-build="107"').replace('title="Generator UI build 106">v106','title="Generator UI build 107">v107')
anchor="<script>\n(function(){\n'use strict';\nconst root=document.getElementById('ropGenerator');"
assert s.count(anchor)==1
s=s.replace(anchor,'<script src="assets/js/reorder-ux-v107.js?v=107"></script>'+anchor)
needle="let records=null,filename='',period=null,serverPreview=null,lastBody=null,busy=false,previewSerial=0,debounceTimer=null;"
s=s.replace(needle,needle+"\nconst ux=window.ROPGeneratorUX107.mount(root);")
s=s.replace("function setStatus(s){status.hidden=false;status.textContent=s;status.setAttribute('aria-live','polite');resultInfo.textContent=s;}","function setStatus(s){ux.message(s);}")
s=s.replace("function invalidate(){previewSerial++;serverPreview=null;lastBody=null;approve.disabled=true;}","function invalidate(){previewSerial++;serverPreview=null;lastBody=null;approve.disabled=true;ux.invalidate();}")
a=s.index('function draw(rows){');b=s.index('function localPreview(',a)
s=s[:a]+'function draw(rows){ux.draw(rows);}\n'+s[b:]
a=s.index('function clearTable(){');b=s.index('async function generatePreview()',a)
s=s[:a]+'function clearTable(){ux.clear();}\n'+s[b:]
s=s.replace('  draw(local.rows);','  draw(local.rows);ux.summary(local,false);')
s=s.replace('lastBody=body;serverPreview=d;draw(d.rows);','lastBody=body;serverPreview=d;draw(d.rows);ux.summary(d,true);')
s=s.replace("    serverPreview=null;lastBody=null;approve.disabled=true;\n    setStatus(statusText(local,false)","    serverPreview=null;lastBody=null;approve.disabled=true;ux.summary(local,false);\n    setStatus(statusText(local,false)")
a=s.index(" const msg='Approve '+d.changed_rows+");b=s.index(' busy=true;approve.disabled=true;',a)
s=s[:a]+''' const approvedBody=lastBody,approvedSerial=previewSerial;
 if(!await ux.confirm(d,approvedBody))return;
 if(busy||previewSerial!==approvedSerial||serverPreview!==d||lastBody!==approvedBody||state?.role!=='admin'||!liveHost())return;
'''+s[b:]
s=s.replace(' busy=true;approve.disabled=true;generate.disabled=true;upload.disabled=true;',' busy=true;approve.disabled=true;generate.disabled=true;upload.disabled=true;ux.saving(true);')
s=s.replace("  serverPreview=null;lastBody=null;setStatus('Approved", "  serverPreview=null;lastBody=null;ux.saved(out);setStatus('Approved")
s=s.replace("  if(typeof loadLive==='function')await loadLive();\n }catch(e){setStatus('Approval blocked; no partial changes committed: '+(e?.message||String(e)));}","  if(typeof loadLive==='function'){try{await loadLive();}catch(refreshError){setStatus('Approved \\u00b7 '+out.changed_rows+' products saved. Dashboard refresh failed; refresh the page before another update.');}}\n }catch(e){setStatus('Approval not confirmed: '+(e?.message||String(e))+' \\u00b7 Refresh the workspace before retrying.');}")
s=s.replace(' finally{busy=false;upload.disabled=false;generate.disabled=!records;approve.disabled=true;}',' finally{busy=false;upload.disabled=false;generate.disabled=!records;approve.disabled=true;ux.saving(false);}')
(ROOT/'index.html').write_text(s)
g=(ROOT/'tests/reorder-preview-v103.cjs').read_text();g=g.replace(oldlink,newlink);(ROOT/'tests/reorder-preview-v103.cjs').write_text(g)
expected={
'index.html':'05b1a2e6a6e15dc2a5c566adcfd6cf700e9c5379',
'assets/js/reorder-ux-v107.js':'3474f9b732e1440eacb417d4494976165786a37d',
'assets/css/reorder-generator-v107.css':'2da77683cd40527307d4a1cd763637a62cba4376',
 'tests/reorder-preview-v103.cjs':'d1aeabb0c0a2c1e3db69ec287881083908e83d64',
 'tests/reorder-compact.cjs':'3cb08275c906616a03c366d7a5505afd1dcb3659',
 'tests/run-reorder-compact.py':'84c2fcb719c091579af4374526b5f63b6b7ce41f',
 'tests/reorder-ux107-business-hashes.json':'3b8c23c78d99ca2d034131203d0e60bffad88ffc'}
for name,wanted in expected.items():
 data=(ROOT/name).read_bytes();actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
 assert actual==wanted,(name,actual,wanted)
subprocess.run(['node','--test','tests/reorder-compact.cjs'],cwd=ROOT,check=True)
assert os.environ['GITHUB_REPOSITORY']=='byttaraai/ms-purchasing-live'
assert os.environ['GITHUB_REF']=='refs/heads/prepare/generator-ux107'
result=[]
for name,wanted in expected.items():
 data=json.dumps({'content':(ROOT/name).read_text(),'encoding':'utf-8'}).encode()
 request=urllib.request.Request('https://api.github.com/repos/byttaraai/ms-purchasing-live/git/blobs',data=data,method='POST',headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=30) as response:blob=json.load(response)
 assert blob['sha']==wanted,(name,blob['sha'],wanted)
 result.append({'path':name,'mode':'100644','type':'blob','sha':wanted})
print('UX107_PREPARED_BLOBS='+json.dumps(result),flush=True)
