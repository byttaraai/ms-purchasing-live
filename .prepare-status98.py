from pathlib import Path
import hashlib
import subprocess
import textwrap
import re

def blob_hash(text):
    b=text.encode('utf8')
    return hashlib.sha1(('blob '+str(len(b))+'\0').encode()+b).hexdigest()
def once(text,old,new):
    assert text.count(old)==1, (old,text.count(old))
    return text.replace(old,new)
p=Path('index.html');html=p.read_text()
assert blob_hash(html)=='2347d66d951abd23f5ccf30671fbfd3fda47703c','Build 97 entrypoint drift'
link='<link rel="stylesheet" href="assets/css/task-assistant-v98.css?v=98">'
html=once(html,'Live Build 97</span>','Live Build 98</span>')
html=once(html,'</head><body>',link+'</head><body>')
p.write_text(html)
for name in ['numeric-data01.cjs','popup-drafts-v95.cjs','units-v96.cjs','freshness-v97.cjs','task-assistant-v93.cjs']:
    p=Path('tests')/name;s=p.read_text()
    s=once(s,"read('index.html')","require('./release-colors-v98.cjs')(read('index.html'))")
    p.write_text(s)
p=Path('tests/admin-guard-fix1.cjs');s=p.read_text()
s=once(s,"let html=data.toString('utf8');","let html=require('./release-colors-v98.cjs')(data.toString('utf8'));")
p.write_text(s)
p=Path('.github/workflows/workspace-v47.yml');s=p.read_text()
s=once(s,'grep -q "Live Build 97" index.html','grep -q "Live Build 98" index.html')
s=once(s,'          node --test tests/freshness-v97.cjs\n','          node --test tests/freshness-v97.cjs\n          node --test tests/status-colors-v98.cjs\n')
s=once(s,'          python3 tests/run-freshness-v97.py\n','          python3 tests/run-freshness-v97.py\n          python3 tests/run-status-colors-v98.py\n')
p.write_text(s)
Path('docs/BUILD98_MASTER_REVIEW_STATUS_COLORS.md').write_text('''# Build 98 - Master Review status colors

Approved scope: presentation-only correction of misleading green status messages.

- Existing incomplete or changed-source rows use neutral gray.
- New products awaiting required unit/Factor input use amber.
- Existing Ready to save and confirmed Saved states use green. These states do not mean official task completion.
- Invalid numbers/unit rules retain red validation messages.
- An unconfirmed request in flight is neutral; a ready draft blocked by the existing 48-hour warning is amber, not success green.
- Confirmed saves remain distinguishable from unsaved rows when refresh is pending.

Implementation is one additive, popup-scoped stylesheet. Only color, background-color and border-color properties are allowed. No copy, sizes, positions, inputs, visibility or event handlers are changed. The active runtime remains the byte-identical task-assistant-v97.js. The only entrypoint edits are the Build 98 marker and the new stylesheet link.

No Supabase reads, writes, migrations or permissions changes are part of this repair. No task completion, badges, history, ranking, unit conversion, numeric bounds, score or purchase formulas are changed. SEC-03 legacy retirement remains OPEN (backup only); this change does not attempt deletion.

Verification: four Node contracts verify the exact Build 97 entrypoint after inverting only the two release edits, unchanged runtime/engines, scoped color-only CSS, and use of existing state markers. Historical tests retain their original assertions and baseline hashes via a strict test-only inverse helper. The browser suite checks 28 color/geometry/state scenarios and reuses 84 existing draft/freshness/unit scenarios against the active v97 runtime with the new stylesheet, at desktop and mobile sizes. All IO is synthetic and blocked from the network. CI results must be checked before release.

Rollback: revert this release's marker and stylesheet link (or this PR). No database rollback is required.
''')
# Run the exact static suite declared by the main workflow, without credentials.
block=re.search(r'      - name: Static and workspace regression tests\n        run: \|\n([\s\S]*?)(?=      - name:)',s)
assert block
subprocess.run(['bash','-e','-c',textwrap.dedent(block.group(1))],check=True)
subprocess.run(['node','--test','tests/admin-guard-fix1.cjs'],check=True)
subprocess.run(['git','diff','--exit-code','--','assets/js','supabase','assets/css/task-assistant-v93.css'],check=True)
print('PASS: color-only release prepared; exact prior runtime, protected entrypoint logic and database source preserved.')
