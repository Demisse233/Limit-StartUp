import {respond,quota,readSmallJson} from '../../../../_lib/plaza.js';
export const onRequestOptions=()=>new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'}});
export async function onRequestPost({request,params,env}) {
 if(!/^[a-f0-9]{32}$/.test(params.id))return respond({error:'not_found'},404);
 try {
  const input=await readSmallJson(request);
  if(!['copy','import'].includes(input?.action))return respond({error:'invalid_action'},400);
  if(!await quota(request,env,'interaction',60,500))return respond({error:'rate_limited'},429);
  const column=input.action==='copy'?'copy_count':'import_count';
  const result=await env.DB.prepare(`INSERT INTO plaza_feed_stats (feed_id,${column}) SELECT id,1 FROM plaza_feeds WHERE id=? AND published=1 ON CONFLICT(feed_id) DO UPDATE SET ${column}=${column}+1 RETURNING copy_count,import_count`).bind(params.id).first();
  if(!result)return respond({error:'not_found'},404);
  console.log(JSON.stringify({module:'plaza',event:'interaction',id:params.id,action:input.action}));
  const response=respond({copyCount:result.copy_count,importCount:result.import_count,popularity:result.copy_count+result.import_count});
  response.headers.set('Cache-Control','no-store');return response;
 }catch{console.log(JSON.stringify({module:'plaza',event:'interaction_failed'}));return respond({error:'unavailable'},503);}
}
