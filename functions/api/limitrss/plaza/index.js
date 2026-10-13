import {categoryValue,languageValue} from '../../../_lib/plaza-metadata.js';
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
    const category=Object.hasOwn(item,'category')?categoryValue(item.category):classify(title,'',url);
    const languageLocked=Object.hasOwn(item,'language');
    const language=languageLocked?languageValue(item.language):null;
    const id=crypto.randomUUID().replaceAll('-','');
    const rsshub=isRssHubFeed(url);
    const inserted=await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO plaza_feeds (id,url,title,icon,category,created_at,next_check,status,published) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,url,title,icon,category,Date.now(),rsshub?0:Date.now(),rsshub?'unknown':'pending',rsshub?1:0),
     env.DB.prepare('INSERT INTO plaza_feed_controls (feed_id,language_locked) SELECT id,? FROM plaza_feeds WHERE id=?').bind(languageLocked?1:0,id),
     env.DB.prepare('INSERT INTO plaza_feed_stats (feed_id,language) SELECT id,? FROM plaza_feeds WHERE id=?').bind(language,id),
     env.DB.prepare('INSERT INTO plaza_classification (feed_id,override_category,source,updated_at) SELECT id,?,?,? FROM plaza_feeds WHERE id=?').bind(Object.hasOwn(item,'category')?category:null,Object.hasOwn(item,'category')?'upload':'initial',Date.now(),id),
    ]);
    results.push({index:results.length,status:inserted[0].meta.changes?'created':'duplicate'});
   }catch{results.push({index:results.length,status:'rejected'});}
  }
  console.log(JSON.stringify({module:'plaza',event:'upload',counts:results.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})}));
  return respond({results},201);
 }catch{return respond({error:'unavailable'},503);}
}
