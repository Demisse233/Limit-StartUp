import {err} from './db.js';
// Account mutation diagnostics intentionally exclude payloads, credentials and image data.
export function accountOperation(event,handler){return async context=>{
 const started=Date.now();
 try{const response=await handler(context);response.headers.set('Cache-Control','no-store');let code='ok';if(!response.ok){try{code=(await response.clone().json()).error||'unavailable';}catch{code='unavailable';}}
 console.log(JSON.stringify({module:'account',event,status:response.status,code,durationMs:Date.now()-started}));return response;
 }catch{console.log(JSON.stringify({module:'account',event,status:503,code:'unavailable',durationMs:Date.now()-started}));return err('unavailable','Service unavailable',503,context.env);}
};}
