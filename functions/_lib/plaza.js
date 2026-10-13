import {XMLParser, XMLValidator} from 'fast-xml-parser';
import {classifyEvidence, classificationVersion} from './plaza-classification.js';
export {classify} from './plaza-classification.js';
export const schema = `
CREATE TABLE IF NOT EXISTS plaza_feed_controls (
 feed_id TEXT PRIMARY KEY,
 hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),
 deleted_at INTEGER,
 language_locked INTEGER NOT NULL DEFAULT 0 CHECK(language_locked IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0,
 last_operation TEXT,
 updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS plaza_admin_audit (
 id TEXT PRIMARY KEY, feed_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plaza_audit_time ON plaza_admin_audit(created_at);

CREATE TABLE IF NOT EXISTS plaza_classification (
 feed_id TEXT PRIMARY KEY,
 override_category TEXT CHECK(override_category IN ('technology','development','news','gaming','culture','life','other')),
 version INTEGER NOT NULL DEFAULT 0,
 source TEXT,
 updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS plaza_feed_stats (
 feed_id TEXT PRIMARY KEY,
 language TEXT,
 copy_count INTEGER NOT NULL DEFAULT 0 CHECK(copy_count >= 0),
 import_count INTEGER NOT NULL DEFAULT 0 CHECK(import_count >= 0)
);

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
export function isRssHubFeed(url) { return typeof url==='string' && /^rsshub:\/\//i.test(url); }
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
export function parseFeed(xml, url = '') {
 if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml)!==true) throw new Error('invalid_feed');
 const value=new XMLParser({ignoreAttributes:false,processEntities:false}).parse(xml);
 const feed=value.rss?.channel ?? value.feed ?? value['rdf:RDF']?.channel;
 if(!feed || typeof feed!=='object') throw new Error('invalid_feed');
 const text=v=> typeof v==='string'?v:typeof v?.['#text']==='string'?v['#text']:'';
 const title=text(feed.title).trim().slice(0,200);
 if(!title)throw new Error('invalid_feed');
 const declared=text(feed.language) || feed['@_xml:lang'] || value.rss?.['@_xml:lang'];
 const language=typeof declared==='string' && /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(declared.trim())
  ? declared.trim().replaceAll('_','-').toLowerCase() : null;
 const items=feed.item ?? feed.entry ?? value['rdf:RDF']?.item ?? [];
 const entries=(Array.isArray(items)?items:[items]).slice(0,8).map(item=>[text(item.title),text(item.description ?? item.summary ?? item.content ?? item['content:encoded'])].join(' ').slice(0,4000));
 const classification=classifyEvidence(title,text(feed.description ?? feed.subtitle),url,entries);
 return {title,language,category:classification.category,classification};
}
// A checker result may only write back to the same address and manager revision.
export async function checkFeed(row, env, transport=fetch) {
 const initial=await env.DB.prepare('SELECT f.*,COALESCE(c.revision,0) AS revision FROM plaza_feeds f LEFT JOIN plaza_feed_controls c ON c.feed_id=f.id WHERE f.id=? AND NOT EXISTS (SELECT 1 FROM plaza_feed_controls x WHERE x.feed_id=f.id AND (x.hidden=1 OR x.deleted_at IS NOT NULL))').bind(row.id).first();
 if(!initial || initial.url!==row.url)return;
 row=initial;
 const start=Date.now(),rsshub=isRssHubFeed(row.url);
 let status=rsshub?'unknown':'healthy',reason=null,failures=0,published=1,language=null;
 let evidence=classifyEvidence(row.title,'',row.url);
 if(!rsshub) {
  try {const parsed=parseFeed(await safeFetch(row.url,transport),row.url);evidence=parsed.classification;language=parsed.language;}
  catch(error) {failures=row.failures+1;status=failures>=3?'failed':'degraded';reason=/^(http_\d{3}|[a-z_]+)$/.test(error.message)?error.message:'network_error';published=row.published;}
  const previous=await env.DB.prepare('SELECT version FROM plaza_classification WHERE feed_id=?').bind(row.id).first();
  if(status!=='healthy' && previous?.version===classificationVersion && evidence.source==='uncertain')evidence={category:row.category,source:'retained_after_failure'};
 }
 const now=Date.now();
 const guard='id=? AND url=? AND COALESCE((SELECT revision FROM plaza_feed_controls WHERE feed_id=plaza_feeds.id),0)=? AND NOT EXISTS (SELECT 1 FROM plaza_feed_controls WHERE feed_id=plaza_feeds.id AND (hidden=1 OR deleted_at IS NOT NULL))';
 const args=[row.id,row.url,row.revision];
 const writes=[
  env.DB.prepare(`INSERT INTO plaza_classification (feed_id,version,source,updated_at) SELECT id,?,?,? FROM plaza_feeds WHERE ${guard} ON CONFLICT(feed_id) DO UPDATE SET version=excluded.version,source=excluded.source,updated_at=excluded.updated_at`).bind(classificationVersion,evidence.source,now,...args),
  env.DB.prepare(`UPDATE plaza_feeds SET category=COALESCE((SELECT override_category FROM plaza_classification WHERE feed_id=?),?),status=?,reason=?,failures=?,published=?,checked_at=?,next_check=?,latency=? WHERE ${guard}`).bind(row.id,evidence.category,status,reason,failures,published,rsshub?null:now,rsshub?0:now+(status==='healthy'?12*3600000:Math.min(12,failures)*3600000),rsshub?null:now-start,...args),
 ];
 if(!rsshub && status==='healthy')writes.push(env.DB.prepare(`INSERT INTO plaza_feed_stats (feed_id,language) SELECT id,? FROM plaza_feeds WHERE ${guard} AND NOT EXISTS (SELECT 1 FROM plaza_feed_controls WHERE feed_id=plaza_feeds.id AND language_locked=1) ON CONFLICT(feed_id) DO UPDATE SET language=excluded.language`).bind(language,...args));
 const results=await env.DB.batch(writes);
 if(!results[1].meta.changes){console.log(JSON.stringify({module:'plaza',event:'feed_check_discarded',id:row.id,durationMs:now-start}));return;}
 const actual=await env.DB.prepare('SELECT f.category,c.override_category FROM plaza_feeds f JOIN plaza_classification c ON c.feed_id=f.id WHERE f.id=?').bind(row.id).first();
 console.log(JSON.stringify({module:'plaza',event:'feed_classified',id:row.id,category:actual.category,source:actual.override_category?'manual':evidence.source,version:classificationVersion}));
 console.log(JSON.stringify({module:'plaza',event:rsshub?'feed_check_skipped':'feed_checked',id:row.id,status,reason,durationMs:now-start}));
}
export function respond(data,status=200) {
 return Response.json(data,{status,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store'}});
}
export function publicFeed(row) {
 const rsshub=isRssHubFeed(row.url);
 return {sourceType:rsshub?'rsshub':'rss',id:row.id,title:row.title,url:row.url,icon:row.icon,category:row.category,status:rsshub?'unknown':row.status,checkedAt:rsshub?null:row.checked_at,latencyMs:rsshub?null:row.latency,language:row.language??null,copyCount:row.copy_count??0,importCount:row.import_count??0,popularity:(row.copy_count??0)+(row.import_count??0),createdAt:row.created_at};
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
