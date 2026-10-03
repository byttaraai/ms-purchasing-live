from pathlib import Path
import hashlib
import subprocess

def blob(text):
    b=text.encode();return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def once(text,old,new):
    assert text.count(old)==1,(old,text.count(old))
    return text.replace(old,new)
base=Path('assets/js/task-assistant-v97.js').read_text()
assert blob(base)=='e05959ee65c5673bbff1e5df16117f61f033c70f'
addition=Path('tests/negative-stock-v99.cjs').read_text().split('const addition=`',1)[1].split('`;',1)[0]
anchor="    const defs=isNew?issueDefs.filter(d=>['master','supplier','price','reorder','rating'].includes(d.key)):issueDefs.filter(d=>d.match(row));\n"
js=once(base,anchor,anchor+addition)
js=once(js,base.split('\n')[0],'/* Build 99: show negative raw inventory for new products; rendering only. */')
Path('assets/js/task-assistant-v99.js').write_text(js)
p=Path('index.html');html=p.read_text()
assert blob(html)=='0b3b3e305fce9d1a0539d36d62ace911bba5a587'
html=once(html,'Live Build 98</span>','Live Build 99</span>')
html=once(html,'task-assistant-v97.js?v=97','task-assistant-v99.js?v=99')
p.write_text(html)
for name in ['numeric-data01.cjs','popup-drafts-v95.cjs','units-v96.cjs','freshness-v97.cjs','task-assistant-v93.cjs','status-colors-v98.cjs']:
    p=Path('tests')/name
    p.write_text(once(p.read_text(),"read('index.html')","require('./release-negative-v99.cjs')(read('index.html'))"))
p=Path('tests/admin-guard-fix1.cjs')
p.write_text(once(p.read_text(),"data.toString('utf8')","require('./release-negative-v99.cjs')(data.toString('utf8'))"))
subprocess.run(['node','--check','assets/js/task-assistant-v99.js'],check=True)
subprocess.run(['node','--test']+['tests/'+n for n in ['negative-stock-v99.cjs','numeric-data01.cjs','popup-drafts-v95.cjs','units-v96.cjs','freshness-v97.cjs','task-assistant-v93.cjs','status-colors-v98.cjs','admin-guard-fix1.cjs','overstock-v69.cjs','supplier-quest-v81.cjs']],check=True)
subprocess.run(['node','tests/workspace-v47.cjs','.'],check=True)
print('PASS: renderer-only patch and strict entrypoint inverse. No database access.')
