import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getPlatformProxy} from 'wrangler';
import {schema,checkFeed} from '../functions/_lib/plaza.js';
import {SCHEMA_SQL} from '../functions/_lib/db.js';
import {signJwt} from '../functions/_lib/crypto.js';
import {listManaged,listAudit,mutateManaged,recheckManaged} from '../functions/_lib/plaza-manager.js';
import {onRequestPost as upload} from '../functions/api/limitrss/plaza/index.js';
import {onRequestGet as list} from '../functions/api/limitrss/plaza/index.js';
import {onRequestGet as detail} from '../functions/api/limitrss/plaza/[id].js';
import {onRequestPost as interaction} from '../functions/api/limitrss/plaza/[id]/interaction.js';
import checker from '../workers/plaza-checker/index.js';
import publicWorker from '../workers/plaza-api/index.js';
async function fixture(fn){
 const proxy=await getPlatformProxy({configPath:'wrangler.toml',persist:false});
 try {
  const DB=proxy.env.DB,env={DB,JWT_SECRET:'local-test-secret-for-plaza-manager'};
  for(const sql of (SCHEMA_SQL+schema).replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
  for(const [id,email]of [['admin','eric_demisse@163.com'],['reader','reader@example.com']])await DB.prepare('INSERT INTO users (id,email,password_salt,password_hash,created_at,updated_at) VALUES (?,?,?,?,0,0)').bind(id,email,'unused','unused').run();
  const tokens={};for(const id of ['admin','reader'])tokens[id]=await signJwt({sub:id,email:id==='admin'?'eric_demisse@163.com':'reader@example.com',tv:1},env.JWT_SECRET);
  const req=(method='GET',body=null,identity='admin',query='')=>new Request('https://site/api/limitrss/plaza-manager'+query,{method,headers:identity?{Authorization:'Bearer '+tokens[identity]}:{},...(body?{body:JSON.stringify(body)}:{})});
  const post=async feeds=>{const response=await upload({env,request:new Request('https://site/api/limitrss/plaza',{method:'POST',body:JSON.stringify({feeds})})});return response.json();};
  const mutate=(id,body,identity='admin')=>mutateManaged({env,params:{id},request:req('PATCH',body,identity)});
  const publicList=async()=>{const response=await list({env,request:new Request('https://site/api/limitrss/plaza')});assert.equal(response.headers.get('Cache-Control'),'no-store');return response.json();};
  await fn({DB,env,tokens,req,post,mutate,publicList});
 }finally{await proxy.dispose();}
}
const transport=async url=>url.includes('dns-query')?Response.json({Answer:[{type:1,data:'1.1.1.1'}]}):new Response('<rss><channel><title>Technology</title><language>en</language><description>Software</description></channel></rss>');

test('manager requires a live authorized account; submitted email cannot grant permissions',()=>fixture(async({DB,env,tokens,req})=>{
 assert.equal((await listManaged({env,request:req('GET',null,null)})).status,401);
 assert.equal((await listManaged({env,request:req('GET',null,'reader')})).status,403);
 const forged=await signJwt({sub:'reader',email:'eric_demisse@163.com',tv:1},env.JWT_SECRET);
 assert.equal((await listManaged({env,request:new Request('https://site',{headers:{Authorization:'Bearer '+forged}})})).status,403);
 assert.equal((await listManaged({env,request:req()})).status,200);
 await DB.prepare('UPDATE users SET token_version=2 WHERE id=?').bind('admin').run();
 assert.equal((await listManaged({env,request:req()})).status,401);
}));

test('confirmed upload metadata is validated, survives checks and is never overwritten by duplicates',()=>fixture(async({DB,env,post})=>{
 let result=await post([{url:'https://example.com/rss',title:'Shared',category:'culture',language:'zh-hans'},{url:'https://example.com/bad',title:'Bad',category:'invalid',language:'en'},{url:'https://example.com/other',title:'Bad language',category:'news',language:'anything<script>'}]);
 assert.deepEqual(result.results.map(x=>x.status),['created','rejected','rejected']);
 let row=await DB.prepare('SELECT * FROM plaza_feeds').first();await checkFeed(row,env,transport);
 const saved=await DB.prepare('SELECT f.category,s.language FROM plaza_feeds f JOIN plaza_feed_stats s ON s.feed_id=f.id').first();assert.deepEqual(saved,{category:'culture',language:'zh-hans'});
 result=await post([{url:'https://EXAMPLE.com/rss#anchor',title:'Overwrite',category:'gaming',language:'en'}]);assert.equal(result.results[0].status,'duplicate');
 assert.equal((await DB.prepare('SELECT title FROM plaza_feeds').first()).title,'Shared');
 assert.deepEqual(await DB.prepare('SELECT f.category,s.language FROM plaza_feeds f JOIN plaza_feed_stats s ON s.feed_id=f.id').first(),saved);
 await post([{url:'https://example.com/unknown',title:'Unspecified',category:'other',language:null}]);
 row=await DB.prepare("SELECT * FROM plaza_feeds WHERE title='Unspecified'").first();await checkFeed(row,env,transport);
 assert.equal((await DB.prepare('SELECT language FROM plaza_feed_stats WHERE feed_id=?').bind(row.id).first()).language,null);
}));

test('edits are immediate, validated, audited and conflict-safe; URL changes reset health',()=>fixture(async({DB,env,req,post,mutate,publicList})=>{
 await post([{url:'https://example.com/rss',title:'Before'}]);let row=await DB.prepare('SELECT * FROM plaza_feeds').first();await checkFeed(row,env,transport);
 const edit={action:'edit',revision:0,title:'After',url:row.url,icon:'',category:'life',language:'ja'};
 assert.equal((await mutate(row.id,edit,'reader')).status,403);
 assert.equal((await mutate(row.id,{...edit,url:'http://127.0.0.1/rss'})).status,400);
 assert.equal((await mutate(row.id,edit)).status,200);
 let visible=(await publicList()).feeds[0];assert.equal(visible.title,'After');assert.equal(visible.language,'ja');assert.equal(visible.category,'life');
 assert.equal((await mutate(row.id,{...edit,title:'Stale'})).status,409);
 row=await DB.prepare('SELECT * FROM plaza_feeds').first();await checkFeed(row,env,transport);
 assert.equal((await publicList()).feeds[0].language,'ja');
 await post([{url:'https://example.com/second',title:'Second'}]);
 assert.equal((await mutate(row.id,{...edit,revision:1,url:'https://example.com/second'})).status,409);
 assert.equal((await DB.prepare('SELECT revision FROM plaza_feed_controls WHERE feed_id=?').bind(row.id).first()).revision,1);
 const concurrent=await Promise.all([mutate(row.id,{action:'hide',revision:1}),mutate(row.id,{action:'delete',revision:1})]);assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,409]);
 let revision=(await DB.prepare('SELECT revision FROM plaza_feed_controls WHERE feed_id=?').bind(row.id).first()).revision;
 let controls=await DB.prepare('SELECT * FROM plaza_feed_controls WHERE feed_id=?').bind(row.id).first();
 if(controls.deleted_at){await mutate(row.id,{action:'restore',revision});revision++;}
 assert.equal((await mutate(row.id,{...edit,revision,url:'https://example.com/new',language:null})).status,200);
 const updated=await DB.prepare('SELECT * FROM plaza_feeds WHERE id=?').bind(row.id).first();assert.equal(updated.status,'pending');assert.equal(updated.published,0);assert.equal(updated.checked_at,null);
 const audit=await (await listAudit({env,request:req()})).json();assert.ok(audit.entries.length>=3);assert.equal(audit.entries[0].actor,'eric_demisse@163.com');assert.equal(JSON.parse(audit.entries[0].after_json).url,'https://example.com/new');
}));

test('hide/delete cover every public API and checker; restore stays hidden and duplicates stay duplicates',()=>fixture(async({DB,env,req,post,mutate,publicList})=>{
 await post([{url:'rsshub://github/trending',title:'Feed',category:'gaming',language:'en'}]);const row=await DB.prepare('SELECT * FROM plaza_feeds').first();
 assert.equal((await publicList()).total,1);await mutate(row.id,{action:'hide',revision:0});
 assert.equal((await publicList()).total,0);
 assert.equal((await detail({env,params:{id:row.id}})).status,404);
 assert.equal((await interaction({env,params:{id:row.id},request:new Request('https://site',{method:'POST',body:JSON.stringify({action:'copy'})})})).status,404);
 assert.equal((await publicWorker.fetch(new Request('https://api/api/limitrss/plaza/v1/feeds/'+row.id),env)).status,404);
 let pending;await checker.scheduled(null,env,{waitUntil:p=>pending=p});await pending;assert.equal((await publicList()).total,0);
 await mutate(row.id,{action:'delete',revision:1});
 assert.equal((await post([{url:row.url,title:'Duplicate',category:'news',language:'ja'}])).results[0].status,'duplicate');
 const managed=await (await listManaged({env,request:req('GET',null,'admin','?state=deleted')})).json();assert.equal(managed.total,1);
 await mutate(row.id,{action:'restore',revision:2});assert.equal((await publicList()).total,0);
 await mutate(row.id,{action:'show',revision:3});assert.equal((await publicList()).total,1);
}));

test('an in-flight checker cannot republish deleted feeds or overwrite a newly edited URL/language',()=>fixture(async({DB,env,post,mutate,publicList})=>{
 await post([{url:'https://example.com/rss',title:'Before'}]);let row=await DB.prepare('SELECT * FROM plaza_feeds').first();
 let edited=false;
 await checkFeed(row,env,async url=>{
  if(!url.includes('dns-query')&&!edited){edited=true;assert.equal((await mutate(row.id,{action:'edit',revision:0,title:'Edited',url:'https://example.com/new',icon:'',category:'news',language:'zh-hans'})).status,200);}
  return transport(url);
 });
 row=await DB.prepare('SELECT * FROM plaza_feeds').first();assert.equal(row.url,'https://example.com/new');assert.equal(row.status,'pending');assert.equal(row.category,'news');
 assert.equal((await DB.prepare('SELECT language FROM plaza_feed_stats WHERE feed_id=?').bind(row.id).first()).language,'zh-hans');
 await checkFeed(row,env,async url=>{
  if(!url.includes('dns-query'))assert.equal((await mutate(row.id,{action:'delete',revision:1})).status,200);
  return transport(url);
 });assert.equal((await publicList()).total,0);
 assert.equal((await DB.prepare('SELECT published FROM plaza_feeds WHERE id=?').bind(row.id).first()).published,0);
}));

test('language dropdown codes are the only accepted metadata values, without legacy aliases',async()=>{
 const {languageValue}=await import('../functions/_lib/plaza-metadata.js');
 const {feedLanguages,feedLanguageName}=await import('../limitrss/plaza/feed-languages.js');
 assert.equal(languageValue(null),null);assert.equal(languageValue(''),null);
 for(const [code,zh,en]of feedLanguages){assert.equal(languageValue(code),code);assert.equal(feedLanguageName(code,'zh'),zh);assert.equal(feedLanguageName(code,'en'),en);}
 for(const code of ['zh','zh-cn','zh-tw','zh_CN','en-US','other','invalid',123])assert.throws(()=>languageValue(code),/invalid_language/);
});


test('manual rechecks require admin access, return real health results and preserve hidden/manual metadata',()=>fixture(async({DB,env,req,post,mutate,publicList})=>{
 await post([{url:'https://example.com/manual',title:'Manual',category:'culture',language:'ja'}]);
 const row=await DB.prepare('SELECT * FROM plaza_feeds').first();
 let requests=0;const healthy=async(...args)=>{requests++;return transport(...args);};
 const retry=(revision=0,identity='admin',transportFn=healthy)=>recheckManaged({env,params:{id:row.id},request:req('POST',{revision},identity)},transportFn);
 assert.equal((await retry(0,null)).status,401);assert.equal((await retry(0,'reader')).status,403);assert.equal(requests,0);
 const success=await retry();assert.equal(success.status,200);assert.equal(success.headers.get('Cache-Control'),'no-store');assert.equal((await success.json()).status,'healthy');assert.equal(requests,2);
 let saved=await DB.prepare('SELECT * FROM plaza_feeds').first();assert.equal(saved.category,'culture');assert.ok(saved.checked_at);assert.equal((await DB.prepare('SELECT language FROM plaza_feed_stats').first()).language,'ja');
 const failing=async url=>url.includes('dns-query')?transport(url):new Response('',{status:503});
 const failed=await retry(0,'admin',failing);assert.equal(failed.status,200);assert.deepEqual(await failed.json(),{ok:true,status:'degraded',reason:'http_503'});
 assert.equal((await retry()).status,200);assert.equal((await DB.prepare('SELECT failures FROM plaza_feeds').first()).failures,0);
 await mutate(row.id,{action:'hide',revision:0});assert.equal((await retry()).status,409);
 assert.equal((await retry(1)).status,200);assert.equal((await publicList()).total,0);assert.equal((await DB.prepare('SELECT hidden FROM plaza_feed_controls').first()).hidden,1);
 const unsafe=await retry(1,'admin',async()=>Response.json({Answer:[{type:1,data:'127.0.0.1'}]}));assert.equal((await unsafe.json()).reason,'unsafe_origin');
 await mutate(row.id,{action:'delete',revision:1});const before=requests;assert.equal((await retry(2)).status,409);assert.equal(requests,before);
 await post([{url:'rsshub://github/trending',title:'Route'}]);const route=await DB.prepare("SELECT * FROM plaza_feeds WHERE url LIKE 'rsshub:%'").first();
 const skipped=await recheckManaged({env,params:{id:route.id},request:req('POST',{revision:0})},healthy);assert.equal(skipped.status,400);assert.equal((await skipped.json()).error,'unsupported_feed');assert.equal(requests,before);
}));

test('manual recheck discards results after an intervening manager edit',()=>fixture(async({DB,env,req,post,mutate})=>{
 await post([{url:'https://example.com/race',title:'Before'}]);const row=await DB.prepare('SELECT * FROM plaza_feeds').first();
 const response=await recheckManaged({env,params:{id:row.id},request:req('POST',{revision:0})},async url=>{
  if(!url.includes('dns-query'))await mutate(row.id,{action:'edit',revision:0,title:'Changed',url:'https://example.com/new',icon:'',category:'life',language:'en'});
  return transport(url);
 });
 assert.equal(response.status,409);const saved=await DB.prepare('SELECT * FROM plaza_feeds').first();assert.equal(saved.title,'Changed');assert.equal(saved.status,'pending');assert.equal(saved.checked_at,null);
}));
