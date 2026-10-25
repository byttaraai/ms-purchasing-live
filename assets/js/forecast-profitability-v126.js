/* Build126: annual recorded-profit rating, independent of Master/ROP state. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ForecastProfit126=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const defaults=Object.freeze({super:3,high:1.5,medium:0.5});
function finite(value){return (typeof value==='number'||(typeof value==='string'&&value.trim()!==''))&&Number.isFinite(Number(value));}
function validate(value){
 if(!value||!['super','high','medium'].every(k=>finite(value[k])))throw Error('Enter a number for each multiplier.');
 const m={super:Number(value.super),high:Number(value.high),medium:Number(value.medium)};
 if(!(m.super>m.high&&m.high>m.medium&&m.medium>0&&m.super<=1000))throw Error('Multipliers must satisfy: Super > High > Medium > 0, maximum 1000.');
 return m;
}
function annualProfit(row){
 return row&&row.source_rows>0&&row.profit_invalid_rows===0&&finite(row.annual_profit_sar)?Number(row.annual_profit_sar):null;
}
function summarize(rows){
 let positiveTotal=0,compensation=0,positiveCount=0,missing=0;
 for(const row of rows){const p=annualProfit(row);if(p===null){missing++;continue;}if(p>0){const y=p-compensation,t=positiveTotal+y;compensation=(t-positiveTotal)-y;positiveTotal=t;positiveCount++;}}
 return {mean:positiveCount?positiveTotal/positiveCount:null,positiveCount,missing,total:rows.length};
}
function classify(row,summary,multipliers=defaults){
 const m=validate(multipliers),p=annualProfit(row);
 if(p===null)return 'Review';
 if(p<=0)return 'Loss';
 if(!summary||!finite(summary.mean)||summary.mean<=0)return 'Review';
 return p>=summary.mean*m.super?'Super':p>=summary.mean*m.high?'High':p>=summary.mean*m.medium?'Medium':'Low';
}
return Object.freeze({defaults,finite,validate,annualProfit,summarize,classify});
});
