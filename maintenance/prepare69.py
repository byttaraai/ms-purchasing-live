"""One-time, hash-guarded Build 68 -> 69 migration of UI source (no database writes)."""
from pathlib import Path
import hashlib
import re

ROOT=Path(__file__).resolve().parents[1]

def git_hash(data):
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()

def replace_once(s, old, new):
    if s.count(old)!=1:
        raise RuntimeError('Expected one source anchor: '+old[:100])
    return s.replace(old,new,1)

p=ROOT/'index.html'
raw=p.read_bytes()
if git_hash(raw)!='0b990bc6bc26cccd0f6ffeb4efdb70dc6fb1a975':
    raise RuntimeError('Build 68 index changed; stop rather than overwrite concurrent work.')
s=raw.decode('utf-8')
s=s.replace('Live Build 68','Live Build 69').replace('MS Purchasing LIVE - Build 68','MS Purchasing LIVE - Build 69')
s=replace_once(s,'<link rel="stylesheet" href="assets/css/app-v57.css?v=68">','<link rel="stylesheet" href="assets/css/app-v57.css?v=68">\n<link rel="stylesheet" href="assets/css/overstock-risk-v69.css?v=69">')
s=replace_once(s,'<script src="assets/js/workspace-v47.js?v=59"></script>', '<script src="assets/js/overstock-risk-v69.js?v=69"></script><script src="assets/js/overstock-ui-v69.js?v=69"></script><script src="assets/js/workspace-v47.js?v=59"></script>')
s=replace_once(s, 'function profitabilityWeight(v,mode){const p=C.profitLabel(v);const shortage={Super:1.5,High:1.2,Medium:.8,Low:.6,Loss:.4},overstock={Super:.4,High:.6,Medium:.8,Low:1.2,Loss:1.5};return(mode===\'shortage\'?shortage:overstock)[p]??1;}', 'function shortageProfitabilityWeight(v){const p=C.profitLabel(v);const shortage={Super:1.5,High:1.2,Medium:.8,Low:.6,Loss:.4};return shortage[p]??1;}')
a=s.index('function overstockProfitRisk(')
b=s.index('\n\nfunction updateKpis()',a)
s=s[:a]+s[b:]
s=replace_once(s,"profitabilityWeight(r.profitability_class,'shortage')",'shortageProfitabilityWeight(r.profitability_class)')
a=s.index(' const overstockRows=state.filtered.filter',s.index('function updateKpis()'))
b=s.index('\n}\nfunction pill(',a)
s=s[:a]+' renderOverstockKpi(totalInventory);'+s[b:]
s=replace_once(s,'updateKpis();render();renderOperationsDashboard();}', 'updateKpis();render();renderOperationsDashboard();refreshOverstockRiskPopup();}')
s=replace_once(s,'<div class="sub">Excess above 300% only</div>', '<div class="sub" id="kpiOverstockBasis">Excess above 300% only</div>')
s=replace_once(s,'The percentage shown below is the raw overstock percentage. The risk rating also applies the approved profitability weights.', 'Overstock % compares raw excess with inventory. Risk uses net product impact divided by known excess value. Product shares use positive impact only. This is a model index, not an expected loss.')
for forbidden in ['overstockProfitRisk','adjustedOverstockPct','valueScore*.40+qtyScore*.35+profitRisk*.25',"profitabilityWeight(r.profitability_class,'overstock')"]:
    if forbidden in s: raise RuntimeError('Retired formula remains: '+forbidden)
s=replace_once(s,'This is a model index, not an expected loss.">i</span></h2>','This is a model index, not an expected loss.">i</span><span class="kpi-overstock-coverage" id="kpiOverstockCoverage"></span></h2>')
p.write_text(s)

p=ROOT/'tests/workspace-v47.cjs'; s=p.read_text()
a=s.index('for(let i=0;i<inline.length;i++)'); b=s.index('\nconst run=',a)
s=s[:a]+'''// Execute local scripts in document order, including the new shared risk modules.
for(const match of html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/g)){
 const src=match[1].match(/src="([^"]+)"/);
 vm.runInContext(src?fs.readFileSync(root+'/'+src[1].split('?')[0],'utf8'):match[2],context);
}'''+s[b:]
old=next(line for line in s.splitlines() if "test('build 68" in line)
new="""test('build 69 uses the canonical risk engine and preserves Above 300 quick filters',()=>{assert(html.includes('Content-Security-Policy'));assert(html.includes('overstock-risk-v69.js?v=69'));assert(html.includes('overstock-ui-v69.js?v=69'));assert(html.includes('<option value="gt200">Above 200%</option><option value="gt300">Above 300%</option>'));assert(html.includes("case'gt300':return v>300"));assert(html.includes('Stock Above 300%'));assert(html.includes('renderOverstockKpi(totalInventory)'));assert(!html.includes('overstockProfitRisk'));assert(!html.includes('adjustedOverstockPct'));assert(html.includes('Live Build 69'));});"""
s=replace_once(s,old,new);p.write_text(s)

print('Build 69 prepared; original purchasing/workspace/database implementations retained.')
