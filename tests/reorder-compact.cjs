'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/css/reorder-generator-v108.css','utf8');
const ui=fs.readFileSync('assets/js/reorder-ux-v108.js','utf8');
const {as102}=require('./reorder-preview-v103.cjs');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function sourceFunction(text,name){
 const m=new RegExp('(?:async )?function '+name+'\\(').exec(text);assert(m,name);
 const tail=text.slice(m.index+m[0].length),end=/\n(?:async )?function |\nconst liveHost=/.exec(tail);assert(end,name);
 return text.slice(m.index,m.index+m[0].length+end.index).trim();
}
test('removing generator restores frozen pre-generator app byte-for-byte',()=>{
 const old=Buffer.from(as102(html));
 assert.equal(crypto.createHash('sha1').update('blob '+old.length+'\0').update(old).digest('hex'),'d32029f93ea63f9f8537d342de59cabaef89649e');
});
test('Build106 parser, maths, units, matching and report dates remain exact',()=>{
 const expected=JSON.parse(fs.readFileSync('tests/reorder-ux107-business-hashes.json','utf8'));
 for(const [name,hash] of Object.entries(expected))assert.equal(sha(sourceFunction(html,name)),hash,name);
 assert(html.includes("const liveHost=()=>location.hostname==='byttaraai.github.io';"));
 assert(html.includes("state.role==='admin'&&d.eligible_rows>0&&d.changed_rows>0"));
 assert(html.includes("const out=await rpc('purchasing_sales_generator_v110',{...lastBody,p_request:req,p_approve:true});"));
 assert(html.includes('p_revision:state.revision,p_request:null,p_approve:false'));
});
test('presentation cannot make requests or recalculate product decisions',()=>{
 assert(!/\bfetch\s*\(|\brpc\s*\(|Math\.ceil|localPreview\s*\(|p_approve\s*:/i.test(ui.replace('Math.ceil(filtered.length/size)','PAGE_COUNT')));
 assert(html.includes('if(!await ux.confirm(d,approvedBody))return;'));
 assert(html.includes('previewSerial!==approvedSerial||serverPreview!==d||lastBody!==approvedBody'));
 assert(html.includes('<details class="ropg-details" id="ropgProducts">'));
 assert(html.includes('id="ropgApprove" disabled'));
 assert(ui.includes('thead.hidden=!rows.length'));
 assert(ui.includes('filtered.slice(offset,offset+size)'));
 assert(ui.includes('stateMaster()'));
});
test('scoped CSS fixes sticky header and independent toolbar without global overrides',()=>{
 assert(css.includes('#ropGenerator .ux107-table th{position:sticky;top:0;'));
 assert(css.includes('#ropGenerator .ropg-toolbar{grid-column:2;grid-row:1;'));
 assert(css.includes('#ropGenerator .ux107-product-name'));
 assert(css.includes('#ropGenerator .ux107-dialog::backdrop'));
 assert(!/!important|@import|url\(/i.test(css));
 assert(html.includes('assets/css/reorder-generator-v108.css?v=108'));
 assert(html.includes('assets/js/reorder-ux-v108.js?v=108'));
});

test('Build108 final polish remains presentation only',()=>{
 assert(css.includes('.ux107-table td{padding-top:6px;padding-bottom:6px}'));
 assert(css.includes('prefers-reduced-motion:reduce'));
 assert(ui.includes("dialog('ropgReportDialog','Report details')"));
 assert(ui.includes('Preview verified \\u00b7 Not saved'));
 assert(ui.includes('minimumFractionDigits:trim?0:precision'));
 assert(ui.includes('number(r.monthly_sales,3,true)'));
 assert(ui.includes('approve.classList.toggle(\'primary\',primaryApprove)'));
 assert(ui.includes('aria-busy'));
 assert(html.includes('ux.report({file:filename,start:period.start,end:period.end})'));
 assert(html.includes('ux.calculating(true)'));
 assert(html.includes('ux.calculating(false)'));
});

test('Build109 uses verified aliases while preserving explicit review decisions',()=>{
 const addon=fs.readFileSync('assets/js/reorder-unit-review-v109.js','utf8');
 assert(html.includes('assets/js/reorder-unit-review-v109.js?v=109'));
 assert(html.includes("rpc('purchasing_sales_generator_v110'"));
 assert(html.includes("rpc('purchasing_sales_unit_rule_v109'"));
 assert(html.includes('p_expected_revision:state.revision'));
 assert(addon.includes('global.ROPGeneratorUnitReview109'));
 assert(addon.includes('Save unit decision &amp; recalculate'));
 assert(addon.includes("canEdit()"));
 assert(addon.includes('equals how many'));
 assert(html.includes('saved=await rpc'));
 assert(html.includes('await generatePreview();'));
});

test('Build110 match-to-Master requires an explicit authorized selection',()=>{
 const addon=fs.readFileSync('assets/js/reorder-name-review-v110.js','utf8');
 assert(html.includes('assets/js/reorder-name-review-v110.js?v=110'));
 assert(html.includes("rpc('purchasing_sales_name_match_v110'"));
 assert(html.includes("rpc('purchasing_sales_generator_v110'"));
 assert(html.includes('p_expected_revision:state.revision'));
 assert(addon.includes('ROPGeneratorNameMatch110'));
 assert(addon.includes('Confirm match &amp; recalculate'));
 assert(addon.includes('Find Master product by name or code'));
 assert(addon.includes('Suggestions are not automatic matches.'));
 assert(addon.includes('new Option('));
 assert(!addon.includes('fetch(') && !addon.includes('rpc('));
});
