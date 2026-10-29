/* Build128: descriptive monthly medians only; no forecast or persistence. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ForecastSalesLevel128=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function finite(value){return (typeof value==='number'||(typeof value==='string'&&value.trim()!==''))&&Number.isFinite(Number(value));}
function median(values){
 if(!values.length||!values.every(finite))return null;
 const sorted=values.map(Number).sort((a,b)=>a-b),i=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[i]:sorted[i-1]/2+sorted[i]/2;
}
function monthIndex(value){
 if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))return null;
 const [year,month]=value.split('-').map(Number);return year*12+month-1;
}
function compare(value,baseline){
 if(!finite(value)||!finite(baseline)||Number(baseline)<=0)return {percent:null,state:'unavailable'};
 const percent=(Number(value)-Number(baseline))/Number(baseline)*100;
 if(!Number.isFinite(percent))return {percent:null,state:'unavailable'};
 return {percent,state:percent>5?'up':percent< -5?'down':'stable'};
}
function calculate(row,periods){
 const out={status:'insufficient',reason:'Twelve consecutive report months are required.',typical:null,first:null,last:null,
  firstComparison:compare(null,null),lastComparison:compare(null,null),reported:0,valid:0,negativeMonths:0,unit:null,periods:[]};
 if(!Array.isArray(periods)||periods.length!==12)return out;
 const indexes=periods.map(monthIndex);
 if(indexes.some((x,i)=>x===null||(i>0&&x!==indexes[i-1]+1)))return out;
 out.periods=[...periods];
 if(!row||!Array.isArray(row.monthly))return out;
 const matched=periods.map(period=>row.monthly.filter(m=>m&&m.month===period));
 out.reported=matched.filter(items=>items.length>0).length;
 if(matched.some(items=>items.length>1)){out.status='invalid';out.reason='Duplicate monthly entries require review.';return out;}
 const entries=matched.map(items=>items[0]||null);
 const valid=m=>m&&m.unit_count===1&&m.invalid_rows===0&&m.source_rows>0&&finite(m.qty)&&typeof m.unit==='string'&&m.unit.trim()!=='';
 out.valid=entries.filter(valid).length;
 if(out.reported<12){out.reason=out.reported+'/12 months reported. Missing months are not zero.';return out;}
 if(out.valid<12){out.status='invalid';out.reason='Monthly quantities or selling units require review.';return out;}
 const units=new Set(entries.map(m=>m.unit.trim().toLowerCase()));
 if(units.size!==1){out.status='invalid';out.reason='Selling units differ across months. No conversion is assumed.';return out;}
 out.unit=entries[0].unit;
 const quantities=entries.map(m=>Number(m.qty));
 out.negativeMonths=quantities.filter(q=>q<0).length;
 out.typical=median(quantities);out.first=median(quantities.slice(0,6));out.last=median(quantities.slice(6));
 out.firstComparison=compare(out.first,out.typical);out.lastComparison=compare(out.last,out.typical);
 out.status=out.typical>0?'ready':'nonpositive';
 out.reason=out.typical>0?'Each half is compared with the same annual monthly median. Not a growth forecast.':'The annual median is zero or negative; percentage comparison is unavailable.';
 return out;
}
return Object.freeze({finite,median,compare,calculate});
});
