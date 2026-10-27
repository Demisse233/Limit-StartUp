import {getAuthUser} from '../../../_lib/db.js';
import {respond,readSmallJson,quota,feedUrl,isRssHubFeed,safeFetch,parseFeed} from '../../../_lib/plaza.js';
import {uploadFeeds} from './index.js';
// Web sharing is authenticated. The original client upload route stays anonymous.
export async function onRequestPost({request,env}) {
 const started=Date.now();
 const finish=(data,status)=>{console.log(JSON.stringify({module:'plaza',event:'web_share_result',status,count:data.results?.length??0,durationMs:Date.now()-started}));return respond(data,status);};
 try {
  const user=await getAuthUser(request,env);
  if(!user || !await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(user.id).first())return finish({error:'unauthorized'},401);
  if(!await quota(request,env,'web_share_resolve',15,150))return finish({error:'rate_limited'},429);
  const input=await readSmallJson(request);
  if(!Array.isArray(input?.feeds)||!input.feeds.length||input.feeds.length>10)return finish({error:'invalid_batch'},400);
  const resolved=new Array(input.feeds.length);let next=0;
  await Promise.all(Array.from({length:Math.min(3,input.feeds.length)},async()=>{
   while(next<input.feeds.length){const index=next++;
    try {
     const item=input.feeds[index],url=feedUrl(item?.url);
     // A duplicate must never replace the original contributor or public metadata.
     const existing=await env.DB.prepare('SELECT id FROM plaza_feeds WHERE url=?').bind(url).first();
     if(existing){resolved[index]={status:'duplicate'};continue;}
     if(isRssHubFeed(url))resolved[index]={feed:{url,title:typeof item.title==='string'&&item.title.trim()?item.title.trim().slice(0,200):url}};
     else {const metadata=parseFeed(await safeFetch(url),url);resolved[index]={feed:{url,title:metadata.title,icon:new URL('/favicon.ico',url).href}};}
    }catch(error){const code=['invalid_url','private_url','invalid_feed','unsafe_origin','dns_error','too_large','redirect_limit'].includes(error?.message)?error.message:'network_error';console.log(JSON.stringify({module:'plaza',event:'web_share_item_failed',code,durationMs:Date.now()-started}));resolved[index]={status:'rejected'};}
   }
  }));
  const feeds=resolved.filter(row=>row.feed).map(row=>row.feed);
  let uploaded=[];
  if(feeds.length){
   const response=await uploadFeeds({env,request:new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({feeds})})},user.id);
   const data=await response.json();if(!response.ok)return finish(data,response.status);uploaded=data.results;
  }
  let index=0;return finish({results:resolved.map((row,i)=>({index:i,status:row.status??uploaded[index++].status}))},201);
 }catch{return finish({error:'unavailable'},503);}
}
