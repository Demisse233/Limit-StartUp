(()=>{
function readToken(){try{return localStorage.getItem('ls_auth_token')||'';}catch{return '';}}
function clearSession(){try{localStorage.removeItem('ls_auth_token');localStorage.removeItem('ls_auth_user');}catch{}}
function saveSession(result){try{localStorage.setItem('ls_auth_token',result.token);localStorage.setItem('ls_auth_user',JSON.stringify(result.user));}catch{throw Error('storage_unavailable');}}
async function authRequest(path,options={}){
 const started=Date.now();const registration=path==='/api/auth/register';
 let response;try{const token=readToken();response=await fetch(path,{...options,cache:'no-store',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...options.headers}});}catch{if(registration)globalThis.LimitRSSAuthDiagnostics?.record('network',0,Date.now()-started);throw Error('network');}
 let result;try{result=await response.json();}catch{if(registration)globalThis.LimitRSSAuthDiagnostics?.record('unavailable',response.status,Date.now()-started);throw Error('unavailable');}
 if(registration)globalThis.LimitRSSAuthDiagnostics?.record(response.ok?'ok':result.error,response.status,Date.now()-started);
 if(!response.ok){if(response.status===401 && result.error==='unauthorized')clearSession();throw Error(result.error||'unavailable');}
 return result;
}
function returnPath(value){return ['/limitrss/plaza/','/limitrss/plaza-manager/','/limitrss/my-shares/'].includes(value)?value:'/limitrss/plaza/';}

globalThis.LimitRSSSession={readToken,clearSession,saveSession,authRequest,returnPath};
})();
