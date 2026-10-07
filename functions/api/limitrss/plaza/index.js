import {respond,publicUrl,feedUrl,publicFeed,classify,quota,readSmallJson,categories} from '../../../_lib/plaza.js';
export const onRequestOptions=()=>new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'}});
export async function onRequestGet({request,env}) {
 try {
  const query=new URL(request.url).searchParams;const q=(query.get('q')??'').slice(0,100);const category=query.get('category');const status=query.get('status');
  const page=Math.max(1,Math.min(10000,parseInt(query.get('page'))||1));const where=['published=1'];const args=[];
  if(q){where.push('(title LIKE ? ESCAPE \'\\\' OR url LIKE ? ESCAPE \'\\\')');const term=`%${q.replace(/[\\%_]/g,'\\$&')}%`;args.push(term,term);}
  if(categories.includes(category)){where.push('category=?');args.push(category);}
  if(['healthy','degraded','failed'].includes(status)){where.push('status=?');args.push(status);}
  const clause=where.join(' AND ');
  const total=await env.DB.prepare(`SELECT COUNT(*) AS total FROM plaza_feeds WHERE ${clause}`).bind(...args).first();
  const rows=await env.DB.prepare(`SELECT * FROM plaza_feeds WHERE ${clause} ORDER BY created_at DESC,id LIMIT 30 OFFSET ?`).bind(...args,(page-1)*30).all();
  return respond({schemaVersion:1,total:total.total,page,feeds:rows.results.map(publicFeed)});
 }catch{ return respond({error:'unavailable'},503); }
}
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
    const inserted=await env.DB.prepare('INSERT OR IGNORE INTO plaza_feeds (id,url,title,icon,category,created_at,next_check) VALUES (?,?,?,?,?,?,?)').bind(id,url,title,icon,classify(title),Date.now(),Date.now()).run();
    results.push({index:results.length,status:inserted.meta.changes?'created':'duplicate'});
   }catch{results.push({index:results.length,status:'rejected'});}
  }
  console.log(JSON.stringify({module:'plaza',event:'upload',counts:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})}));
  return respond({results},201);
 }catch{return respond({error:'unavailable'},503);}
}
