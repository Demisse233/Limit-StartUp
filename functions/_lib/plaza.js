import {XMLParser, XMLValidator} from 'fast-xml-parser';
export const schema = `
CREATE TABLE IF NOT EXISTS plaza_feeds (
 id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, icon TEXT,
 category TEXT NOT NULL DEFAULT 'other', status TEXT NOT NULL DEFAULT 'pending',
 published INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
 checked_at INTEGER, next_check INTEGER NOT NULL DEFAULT 0,
 failures INTEGER NOT NULL DEFAULT 0, reason TEXT, latency INTEGER,
 reports INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS plaza_due ON plaza_feeds(next_check);
CREATE INDEX IF NOT EXISTS plaza_public ON plaza_feeds(published,category,status);
CREATE TABLE IF NOT EXISTS plaza_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
`;
export const categories = ['technology','development','news','gaming','culture','life','other'];
export function classify(title, description = '') {
 const text = `${title} ${description}`.toLowerCase();
 const rules = [ ['gaming',/游戏|原神|崩坏|明日方舟|game|gaming|steam/], ['development',/开发|编程|程序|github|javascript|python|coding|developer|programming/], ['technology',/科技|数码|人工智能|apple|tech|android|macrumors|\bai\b/], ['news',/新闻|时事|日报|news|bbc|reuters/], ['culture',/文化|电影|音乐|艺术|书评|movie|music|culture/], ['life',/生活|旅行|美食|摄影|travel|food|life/]];
 return rules.find(([,pattern])=>pattern.test(text))?.[0] ?? 'other';
}
export function publicUrl(raw) {
 if (typeof raw !== 'string' || raw.length > 2048) throw new Error('invalid_url');
 const url = new URL(raw.trim());
 if (!['https:','http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port))) throw new Error('private_url');
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 if (!host.includes('.') || host.includes(':') || /^\d+[.\d]*$/.test(host) || /\.(localhost|local|internal|lan|home|test|invalid)$/.test(host)) throw new Error('private_url');
 for (const [key] of url.searchParams) if (/token|secret|password|api.?key|auth|signature|access.?key/i.test(key)) throw new Error('private_url');
 url.hostname=host; url.hash=''; return url.href;
}
export function feedUrl(raw) {
 if(typeof raw !== 'string' || !raw.toLowerCase().startsWith('rsshub://')) return publicUrl(raw);
 if(raw.length>2048)throw new Error('invalid_url');
 const route=new URL(raw.trim());
 if(route.username || route.password || route.port || !/^[a-z0-9_-]+$/i.test(route.hostname))throw new Error('private_url');
 // Verify query credentials using the same policy as ordinary feeds.
 publicUrl(`https://rsshub.rssforever.com/${route.hostname}${route.pathname}${route.search}`);
 route.hash='';return route.href;
}
export function publicAddress(ip) {
 if (ip.includes(':')) return false; // IPv6-only origins are conservatively excluded in v1.
 const a=ip.split('.').map(Number);
 return a.length===4 && a.every(n=>Number.isInteger(n)&&n>=0&&n<=255) && a[0]!==0 && a[0]!==10 && a[0]!==127 && a[0]<224 && !(a[0]===169&&a[1]===254) && !(a[0]===172&&a[1]>=16&&a[1]<=31) && !(a[0]===192&&(a[1]===168||a[1]===0)) && !(a[0]===100&&a[1]>=64&&a[1]<=127) && !(a[0]===198&&(a[1]===18||a[1]===19)) && !(a[0]===192&&a[1]===0&&a[2]===2) && !(a[0]===198&&a[1]===51&&a[2]===100) && !(a[0]===203&&a[1]===0&&a[2]===113);
}
async function bounded(response, limit) {
 const reader=response.body?.getReader(); if (!reader) throw new Error('empty_body');
 const chunks=[]; let size=0;
 try { for (;;) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>limit)throw new Error('too_large'); chunks.push(value); } }
 finally { await reader.cancel().catch(()=>{}); }
 const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(all);
}
async function safeFetch(raw, transport=fetch) {
 const canonical=feedUrl(raw);
 let address=canonical.startsWith('rsshub://')?publicUrl(canonical.replace('rsshub://','https://rsshub.rssforever.com/')):canonical;const signal=AbortSignal.timeout(12000);
 for(let hop=0;hop<4;hop++) {
  const host=new URL(address).hostname;
  const dns=await transport(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`,{headers:{Accept:'application/dns-json'},signal});
  if(!dns.ok)throw new Error('dns_error');
  const records=(await dns.json()).Answer?.filter(row=>row.type===1) ?? [];
  if(!records.length || !records.every(row=>publicAddress(row.data))) throw new Error('unsafe_origin');
  const response=await transport(address,{redirect:'manual',signal,headers:{'User-Agent':'LimitRSS-Plaza/1.0 (+https://www.demisse.cn/limitrss/plaza/)','Accept':'application/rss+xml, application/atom+xml, application/xml, text/xml'}});
  if([301,302,303,307,308].includes(response.status)) {
   const location=response.headers.get('location');await response.body?.cancel();
   if(!location)throw new Error('bad_redirect');address=publicUrl(new URL(location,address).href);continue;
  }
  if(!response.ok) {await response.body?.cancel();throw new Error(`http_${response.status}`);}
  return bounded(response,1024*1024);
 }
 throw new Error('redirect_limit');
}
export function parseFeed(xml) {
 if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml)!==true) throw new Error('invalid_feed');
 const value=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(xml);
 const feed=value.rss?.channel ?? value.feed ?? value['rdf:RDF']?.channel;
 if(!feed || typeof feed!=='object') throw new Error('invalid_feed');
 const text=v=> typeof v==='string'?v:typeof v?.['#text']==='string'?v['#text']:'';
 const title=text(feed.title).trim().slice(0,200);
 if(!title)throw new Error('invalid_feed');
 return {title,category:classify(title,text(feed.description ?? feed.subtitle))};
}
export async function checkFeed(row, env, transport=fetch) {
 const start=Date.now();let status='healthy',reason=null,failures=0,published=1,category=row.category;
 try {const parsed=parseFeed(await safeFetch(row.url,transport));category=parsed.category;}
 catch(error) {failures=row.failures+1;status=failures>=3?'failed':'degraded';reason=/^(http_\d{3}|[a-z_]+)$/.test(error.message)?error.message:'network_error';published=row.published;}
 const now=Date.now();
 await env.DB.prepare('UPDATE plaza_feeds SET status=?,reason=?,failures=?,published=?,category=?,checked_at=?,next_check=?,latency=? WHERE id=?').bind(status,reason,failures,published,category,now,now+(status==='healthy'?12*3600000:Math.min(12,failures)*3600000),now-start,row.id).run();
 console.log(JSON.stringify({module:'plaza',event:'feed_checked',id:row.id,status,reason,durationMs:now-start}));
}
export function respond(data,status=200) {
 return Response.json(data,{status,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':status===200?'public, max-age=60':'no-store'}});
}
export function publicFeed(row) {
 return {id:row.id,title:row.title,url:row.url,icon:row.icon,category:row.category,status:row.status,checkedAt:row.checked_at,latencyMs:row.latency};
}
export async function quota(request,env,kind,maxMinute,maxDay) {
 const ip=request.headers.get('CF-Connecting-IP') || 'local';
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
 const key=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
 const now=Date.now();
 for(const [span,max] of [[60000,maxMinute],[86400000,maxDay]]) {
  const window=Math.floor(now/span);
  const row=await env.DB.prepare('INSERT INTO plaza_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(`${kind}:${key}:${span}:${window}`,(window+1)*span).first();
  if(row.count>max) return false;
 }
 return true;
}
export async function readSmallJson(request) {
 try {return JSON.parse(await bounded(request,65536));}catch{return null;}
}
