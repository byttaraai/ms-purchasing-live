'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const css=fs.readFileSync('assets/css/app-v57.css','utf8');
const html=fs.readFileSync('index.html','utf8');
function gitsha(s){const b=Buffer.from(s);return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');}
test('Dashboard Build122 adds only scoped CSS, preserves exact older stylesheet',()=>{
 const pieces=css.split('\n/* Build 122');
 assert.equal(pieces.length,2);
 assert.equal(gitsha(pieces[0]),'b88100bf5f310ba2db79bd993473d5e462ae6915');
 assert(!/!important|@import|url\(/.test(pieces[1]));
 const heads=[...pieces[1].matchAll(/([^{}]+)\{/g)].map(x=>x[1].trim());
 for(const s of heads){if(s.startsWith('@media'))continue;assert(s.startsWith('[data-panel="daily-tasks"]'),'CSS selector must stay within Dashboard: '+s);}
});
test('Dashboard markup and freshness/action identifiers are unchanged',()=>{
 assert.equal(gitsha(html),'9a003f56f6c41e164452fb93ad4de56266800072');
 for(const id of ['inventoryFreshnessCard','inventoryFreshnessText','inventoryFreshnessAge','inventoryFreshnessStatus','goBosFromDashboard','openInventoryModal'])assert(html.includes('id="'+id+'"'),id);
});
