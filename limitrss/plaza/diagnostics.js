// A bounded, exportable diagnostic buffer; never store URLs, inputs or account data.
const entries=[];
export function diagnose(event,fields={}) {
 const entry={time:new Date().toISOString(),module:'plaza',event};
 for(const key of ['status','count','durationMs','page','code'])if(['string','number'].includes(typeof fields[key]))entry[key]=fields[key];
 entries.push(entry);if(entries.length>200)entries.shift();
}
export function exportDiagnostics(){const url=URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:1,entries},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='LimitRSS-Plaza-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
