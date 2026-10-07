"""One-time source-only preparation. No database or business data is accessed."""
from pathlib import Path
import hashlib,json,os,subprocess,urllib.request

def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def once(s,a,b):
    assert s.count(a)==1,(a,s.count(a))
    return s.replace(a,b,1)
p=Path('index.html');assert blob(p.read_bytes())=='7d68537f289ed8e47be191265c4d5658cd2a48e4'
new=subprocess.check_output(['node','-e',"process.stdout.write(require('./tests/navigation-v102.cjs').next(require('fs').readFileSync('index.html','utf8')))"])
p.write_bytes(new)
p=Path('.github/workflows/workspace-v47.yml');s=p.read_text();s=once(s,'grep -q "Live Build 101"','grep -q "Live Build 102"');s=once(s,'          node --test tests/header-v101.cjs\n','          node --test tests/header-v101.cjs\n          node --test tests/navigation-v102.cjs\n');s=once(s,'          python3 tests/run-header-v101.py\n','          python3 tests/run-header-v101.py\n          python3 tests/run-navigation-v102.py\n');p.write_text(s)
p=Path('tests/ci-required-checks-sec04.cjs');s=p.read_text();s=once(s,"      // Build101 adds UI tests and advances only the visible build assertion.","      // Build102 only adds UI checks and its visible marker; prior workflow contract remains exact.\n      for(const extra of ['          node --test tests/navigation-v102.cjs\\n','          python3 tests/run-navigation-v102.py\\n']){assert.equal(s.split(extra).length-1,1);s=s.replace(extra,'');}\n      assert(s.includes('grep -q \"Live Build 102\"'));\n      s=s.replace('grep -q \"Live Build 102\"','grep -q \"Live Build 101\"');\n      // Build101 adds UI tests and advances only the visible build assertion.");p.write_text(s)
p=Path('tests/header-v101.cjs');s=p.read_text();s=once(s,'function restoreIndex(html){','function restoreIndex(html){\n  html=require(\'./navigation-v102.cjs\').as101(html);');s=once(s," const html=fs.readFileSync('index.html','utf8');"," const html=require('./navigation-v102.cjs').as101(fs.readFileSync('index.html','utf8'));");p.write_text(s)
p=Path('tests/legacy-retirement-contracts-sec03.cjs');s=p.read_text();s=once(s,"const html=fs.readFileSync('index.html','utf8');","const html=require('./navigation-v102.cjs').as101(fs.readFileSync('index.html','utf8')); // exact prior UI baseline");p.write_text(s)
p=Path('tests/release-task02-v100.cjs');s=p.read_text();s=once(s,"if(html.includes('Live Build 101</span>'))", "if(/Live Build 10[12]<\\/span>/.test(html))");p.write_text(s)
subprocess.run(['node','--test','tests/navigation-v102.cjs','tests/header-v101.cjs','tests/ci-required-checks-sec04.cjs','tests/legacy-retirement-contracts-sec03.cjs'],check=True)
paths=['index.html','.github/workflows/workspace-v47.yml','tests/ci-required-checks-sec04.cjs','tests/header-v101.cjs','tests/legacy-retirement-contracts-sec03.cjs','tests/release-task02-v100.cjs']
results=[]
for name in paths:
    content=Path(name).read_text()
    req=urllib.request.Request('https://api.github.com/repos/byttaraai/ms-purchasing-live/git/blobs',data=json.dumps({'content':content,'encoding':'utf-8'}).encode(),headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=30) as response:sha=json.load(response)['sha']
    assert sha==blob(content.encode())
    results.append({'path':name,'mode':'100644','type':'blob','sha':sha})
print('NAVIGATION_PREPARED_BLOBS='+json.dumps(results),flush=True)
