import {respond,publicUrl,feedUrl,publicFeed,isRssHubFeed,classify,quota,readSmallJson,categories} from '../../../_lib/plaza.js';
export const onRequestOptions=()=>new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'}});
export {listPlazaFeeds as onRequestGet} from '../../../_lib/plaza-directory.js';
export async function onRequestPost({request,env}) {
 try {
  if(!await quota(request,env,'upload',30,300)) return respond({error:'rate_limited'},429);
  const input=await readSmallJson(request);
  if(!Array.isArray(input?.feeds)||!input.feeds.length||input.feeds.length>10)return respond({error:'invalid_batch'},400);
  const results=[];
  for(const item of input.feeds){
   try {
    const url=feedUrl(item.url);const title=typeof item.title==='string'?item.title.trim().slice(0,200):'';
    if(!title)throw new Error('invalid_title');
    let icon=null;try{if(item.icon)icon=publicUrl(item.icon);}catch{}
    const id=crypto.randomUUID().replaceAll('-','');
    const rsshub=isRssHubFeed(url);
    const inserted=await env.DB.prepare('INSERT OR IGNORE INTO plaza_feeds (id,url,title,icon,category,created_at,next_check,status,published) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,url,title,icon,classify(title),Date.now(),rsshub?0:Date.now(),rsshub?'unknown':'pending',rsshub?1:0).run();
    results.push({index:results.length,status:inserted.meta.changes?'created':'duplicate'});
   }catch{results.push({index:results.length,status:'rejected'});}
  }
  console.log(JSON.stringify({module:'plaza',event:'upload',counts:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})}));
  return respond({results},201);
 }catch{return respond({error:'unavailable'},503);}
}
