// Bounded registration diagnostics, shared with Plaza exports. Never retain input,
// email addresses, passwords, IP addresses, tokens or raw server messages.
(()=>{
const storageKey='limit-auth-diagnostics-v1';
const allowedCodes=new Set(['ok','invalid_email','disposable_email','invalid_email_domain','email_check_unavailable','email_already_used','weak_password','invalid_nickname','captcha_required','rate_limited','invalid_body','network','unavailable']);
function sanitize(entry){return entry && entry.module==='auth' && entry.event==='register_result' && allowedCodes.has(entry.code) && Number.isFinite(entry.durationMs) && Number.isFinite(entry.status) && typeof entry.time==='string' ? {time:entry.time,module:'auth',event:'register_result',code:entry.code,status:entry.status,durationMs:entry.durationMs} : null;}
let entries=[];try{const stored=JSON.parse(sessionStorage.getItem(storageKey)||'[]');if(Array.isArray(stored))entries=stored.map(sanitize).filter(Boolean).slice(-50);}catch{}
function record(code,status,durationMs){entries.push({time:new Date().toISOString(),module:'auth',event:'register_result',code:allowedCodes.has(code)?code:'unavailable',status,durationMs});entries=entries.slice(-50);try{sessionStorage.setItem(storageKey,JSON.stringify(entries));}catch{}}
function read(){return entries.map(entry=>({...entry}));}
function exportDiagnostics(){const url=URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:1,entries:read()},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='LimitRSS-auth-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
globalThis.LimitRSSAuthDiagnostics={record,read,exportDiagnostics};
})();
