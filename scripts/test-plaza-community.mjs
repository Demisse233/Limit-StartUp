import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getPlatformProxy} from 'wrangler';
import {SCHEMA_SQL} from '../functions/_lib/db.js';
import {schema} from '../functions/_lib/plaza.js';
import {signJwt} from '../functions/_lib/crypto.js';
import {onRequestPost as share} from '../functions/api/limitrss/plaza/share.js';
import {onRequestPost as upload,onRequestGet as list} from '../functions/api/limitrss/plaza/index.js';
import {onRequestGet as stats} from '../functions/api/limitrss/plaza/stats.js';
import {onRequestGet as avatar} from '../functions/api/limitrss/plaza/[id]/avatar.js';
import {onRequestPost as interact} from '../functions/api/limitrss/plaza/[id]/interaction.js';
import {listMyShares,deleteMyShare} from '../functions/_lib/plaza-my-shares.js';
import {onRequest as sharesRoute} from '../functions/api/limitrss/my-shares/index.js';
import {onRequest as shareRoute} from '../functions/api/limitrss/my-shares/[id].js';
import {pageNumbers} from '../limitrss/plaza/pagination.js';
async function fixture(fn){const proxy=await getPlatformProxy({configPath:'wrangler.toml',persist:false});try{const DB=proxy.env.DB,env={DB,JWT_SECRET:'test-community-secret-only'};for(const sql of (SCHEMA_SQL+schema).replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await DB.prepare(sql).run();const tokens={};for(const id of ['owner','reader']){await DB.prepare('INSERT INTO users (id,email,nickname,password_salt,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,0,0)').bind(id,id==='owner'?'eric_demisse@163.com':'reader@example.com',id==='owner'?'Demisse':'Reader','unused','unused').run();tokens[id]=await signJwt({sub:id,tv:1},env.JWT_SECRET);}const req=(feeds,identity='reader')=>new Request('https://site/api/limitrss/plaza/share',{method:'POST',headers:identity?{Authorization:'Bearer '+tokens[identity]}:{},body:JSON.stringify({feeds,user_id:'owner'})});await fn({DB,env,tokens,req});}finally{await proxy.dispose();}}

test('web sharing requires live auth, rejects spoofing and invalid feeds, keeps legacy uploads anonymous',()=>fixture(async({DB,env,req})=>{
 const feeds=[{url:'rsshub://github/trending',title:'Test'}];assert.equal((await share({env,request:req(feeds,null)})).status,401);
 let response=await share({env,request:req(feeds)});assert.equal(response.status,201);assert.equal((await response.json()).results[0].status,'created');
 assert.equal((await DB.prepare('SELECT user_id FROM plaza_contributions').first()).user_id,'reader');
 response=await share({env,request:req(feeds,'owner')});assert.equal((await response.json()).results[0].status,'duplicate');assert.equal((await DB.prepare('SELECT user_id FROM plaza_contributions').first()).user_id,'reader');
 response=await share({env,request:req([{url:'http://127.0.0.1/rss'},{url:'https://user:pass@example.com/rss'},{url:'https://example.com/rss?token=secret'}])});assert.deepEqual((await response.json()).results.map(row=>row.status),['rejected','rejected','rejected']);
 await DB.prepare("UPDATE users SET token_version=2 WHERE id='reader'").run();assert.equal((await share({env,request:req(feeds)})).status,401);
 response=await upload({env,request:new Request('https://site/api/limitrss/plaza',{method:'POST',body:JSON.stringify({feeds:[{url:'rsshub://legacy/test',title:'Legacy',user_id:'owner'}]})})});assert.equal(response.status,201);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM plaza_contributions').first()).n,1);
}));

test('web URL resolution uses original RSS title, rejects invalid XML, and leaves ordinary feeds pending',()=>fixture(async({DB,env,req})=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>String(url).includes('dns-query')?Response.json({Answer:[{type:1,data:'1.1.1.1'}]}):new Response(String(url).includes('/bad')?'<notrss/>':'<rss><channel><title>Original publisher</title></channel></rss>');
 try{const response=await share({env,request:req([{url:'https://example.com/rss',title:'Custom name'},{url:'https://example.com/bad'}])});assert.deepEqual((await response.json()).results.map(row=>row.status),['created','rejected']);const row=await DB.prepare('SELECT * FROM plaza_feeds').first();assert.equal(row.title,'Original publisher');assert.equal(row.published,0);assert.equal(row.status,'pending');assert.equal((await stats({env})).status,200);}finally{globalThis.fetch=original;}
}));

test('first contributor profile is public, follows profile changes, excludes credentials and hides avatar on removal',()=>fixture(async({DB,env,req})=>{
 await share({env,request:req([{url:'rsshub://github/trending'}])});let data=await (await list({env,request:new Request('https://site/api/limitrss/plaza')})).json();const id=data.feeds[0].id;
 assert.equal(data.feeds[0].sharer.nickname,'Reader');assert.equal(data.feeds[0].sharer.avatarUrl,null);assert.ok(!JSON.stringify(data).includes('reader@example.com'));
 await DB.prepare("UPDATE users SET nickname='Updated',avatar_b64='aGk=',avatar_content_type='image/png' WHERE id='reader'").run();
 data=await (await list({env,request:new Request('https://site/api/limitrss/plaza')})).json();assert.equal(data.feeds[0].sharer.nickname,'Updated');assert.equal(data.feeds[0].sharer.avatarUrl,`/api/limitrss/plaza/${id}/avatar`);
 let image=await avatar({env,params:{id}});assert.equal(image.status,200);assert.equal(await image.text(),'hi');assert.equal(image.headers.get('Cache-Control'),'no-store');
 await DB.prepare('INSERT INTO plaza_feed_controls (feed_id,hidden) VALUES (?,1) ON CONFLICT(feed_id) DO UPDATE SET hidden=1').bind(id).run();assert.equal((await avatar({env,params:{id}})).status,404);assert.equal((await (await list({env,request:new Request('https://site/api/limitrss/plaza')})).json()).total,0);
}));

test('community statistics count distinct accounts and both interaction types without resetting historical counters',()=>fixture(async({DB,env,req})=>{
 await share({env,request:req([{url:'rsshub://github/a'},{url:'rsshub://github/b'}])});await share({env,request:req([{url:'rsshub://github/c'}],'owner')});let summary=await (await stats({env})).json();assert.deepEqual(summary,{contributors:2,totalFeeds:3,totalUses:0});
 const {id}=await DB.prepare('SELECT id FROM plaza_feeds LIMIT 1').first();for(const action of ['copy','import','copy'])assert.equal((await interact({env,params:{id},request:new Request('https://site',{method:'POST',body:JSON.stringify({action})})})).status,200);
 assert.deepEqual(await (await stats({env})).json(),{contributors:2,totalFeeds:3,totalUses:3});
 await DB.prepare('DELETE FROM users WHERE id=?').bind('reader').run();assert.equal((await (await stats({env})).json()).contributors,1);
}));

test('pagination covers filtered results, clamped last pages and the unchanged app default',()=>fixture(async({DB,env})=>{
 for(let n=0;n<23;n++)await DB.prepare('INSERT INTO plaza_feeds (id,url,title,created_at,published) VALUES (?,?,?,?,1)').bind(n.toString(16).padStart(32,'0'),`https://example.com/${n}`,`Source ${n}`,n).run();
 const get=async query=>(await list({env,request:new Request('https://site/api/limitrss/plaza'+query)})).json();
 assert.equal((await get('')).pageSize,30);let data=await get('?page=2&pageSize=10');assert.equal(data.feeds.length,10);assert.equal(data.page,2);data=await get('?page=999&pageSize=10');assert.equal(data.page,3);assert.equal(data.feeds.length,3);assert.equal((await get('?q=nomatch&pageSize=10')).total,0);
 assert.deepEqual(pageNumbers(1,13),[1,2,3,'…',13]);assert.deepEqual(pageNumbers(7,13),[1,'…',6,7,8,'…',13]);assert.deepEqual(pageNumbers(1,1),[1]);
}));

test('legacy attribution migration assigns only historical unclaimed feeds to the owner and preserves counters',()=>fixture(async({DB,env,req})=>{
 await share({env,request:req([{url:'rsshub://github/reader'}])});const reader=await DB.prepare('SELECT feed_id FROM plaza_contributions').first();
 await DB.prepare('INSERT INTO plaza_feeds (id,url,title,created_at) VALUES (?,?,?,?)').bind('a'.repeat(32),'https://example.com/old','Old',1).run();await DB.prepare('INSERT INTO plaza_feeds (id,url,title,created_at) VALUES (?,?,?,?)').bind('b'.repeat(32),'https://example.com/future','Future',1793030400001).run();
 const migration=await readFile('migrations/20261026-plaza-contributions.sql','utf8');for(let repeat=0;repeat<2;repeat++)for(const sql of migration.replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 assert.equal((await DB.prepare('SELECT user_id FROM plaza_contributions WHERE feed_id=?').bind('a'.repeat(32)).first()).user_id,'owner');assert.equal(await DB.prepare('SELECT * FROM plaza_contributions WHERE feed_id=?').bind('b'.repeat(32)).first(),null);assert.equal((await DB.prepare('SELECT user_id FROM plaza_contributions WHERE feed_id=?').bind(reader.feed_id).first()).user_id,'reader');
}));

test('feed statistics exclude pending, hidden and deleted entries and ignore directory filters',()=>fixture(async({DB,env})=>{
 const id=n=>n.toString(16).padStart(32,'0');
 for(let n=1;n<=5;n++)await DB.prepare('INSERT INTO plaza_feeds (id,url,title,created_at,published) VALUES (?,?,?,?,?)').bind(id(n),`https://example.com/${n}`,'Feed',0,n===2?0:1).run();
 await DB.prepare('INSERT INTO plaza_feed_controls (feed_id,hidden) VALUES (?,1)').bind(id(3)).run();
 await DB.prepare('INSERT INTO plaza_feed_controls (feed_id,deleted_at) VALUES (?,1)').bind(id(4)).run();
 const data=await (await stats({env,request:new Request('https://site/api/limitrss/plaza/stats?q=nomatch&category=gaming')})).json();
 assert.equal(data.totalFeeds,2);
}));

test('uptime uses confirmed launch date, Shanghai midnight, nonnegative days and localized day units',async()=>{
 const {Script,createContext}=await import('node:vm');
 const source=await readFile('limitrss/plaza/community-uptime.js','utf8');
 let clock=Date.parse('2026-10-10T23:59:59+08:00'),scheduled;
 const node={textContent:'',append(...parts){this.textContent+=parts.map(part=>typeof part==='string'?part:part.textContent).join('');}},events=new Map();
 class Clock extends Date{static now(){return clock;}}
 const context=createContext({Date:Clock,navigator:{language:'zh-CN'},localStorage:{getItem:()=>null},document:{readyState:'complete',getElementById:()=>node,createElement:()=>({textContent:'',className:''}),addEventListener:(name,fn)=>events.set(name,fn),hidden:false},window:{addEventListener:(name,fn)=>events.set(name,fn)},setTimeout:(fn,delay)=>{scheduled={fn,delay};return 1;},clearTimeout:()=>{}});
 new Script(source).runInContext(context);
 assert.match(node.textContent,/服务 0 天$/);
 clock=Date.parse('2026-10-11T23:59:59+08:00');events.get('pageshow')();assert.match(node.textContent,/服务 0 天$/);assert.equal(scheduled.delay,1050);
 clock=Date.parse('2026-10-12T00:00:00+08:00');scheduled.fn();assert.match(node.textContent,/服务 1 天$/);
 events.get('limitrss-language-change')({detail:'en'});assert.match(node.textContent,/for 1 day\.$/);
 clock=Date.parse('2026-10-26T23:59:59+08:00');events.get('visibilitychange')();assert.match(node.textContent,/for 15 days\.$/);
 clock=Date.parse('2026-10-27T00:00:00+08:00');scheduled.fn();assert.match(node.textContent,/for 16 days\.$/);
});

test('classic localization covers directory, manager and account UI in both languages before modules load',async()=>{
 const {Script,createContext}=await import('node:vm');
 const runtime=await readFile('limitrss/plaza/localization.js','utf8');
 const context=createContext({navigator:{language:'zh-CN'},localStorage:{getItem:()=>null},document:{readyState:'loading',addEventListener:()=>{}}});
 new Script(runtime).runInContext(context);
 const resources=context.LimitRSSPlazaI18n;
 for(const name of ['copy','accountCopy','navCopy','managerCopy','sharesCopy']){
  assert.deepEqual(Object.keys(resources[name].zh).sort(),Object.keys(resources[name].en).sort(),name);
  for(const [key,value] of Object.entries(resources[name].en)){assert.ok(typeof value==='function'||typeof value==='string'&&value.trim(),`${name}.${key}`);assert.equal(typeof value,typeof resources[name].zh[key],`${name}.${key}`);}
 }
 for(const [file,name] of [['limitrss/plaza/index.html','copy'],['limitrss/plaza-manager/index.html','managerCopy'],['limitrss/my-shares/index.html','sharesCopy']]){
  const html=await readFile(file,'utf8');
  for(const [,key] of html.matchAll(/data-(?:t|label|placeholder)="([^"]+)"/g))assert.equal(typeof resources[name].en[key],'string',`${file}:${key}`);
  for(const [,key] of html.matchAll(/data-account-(?:t|label)="([^"]+)"/g))assert.equal(typeof resources.accountCopy.en[key],'string',`${file}:${key}`);
  const scripts=[...html.matchAll(/<script\b[^>]*>/g)].map(match=>match[0]);const locale=scripts.findIndex(tag=>tag.includes('localization.js'));const module=scripts.findIndex(tag=>tag.includes('type="module"'));
  assert.ok(locale>=0&&locale<module,'Static localization must load before business modules');assert.ok(scripts[locale].includes('defer')&&!scripts[locale].includes('type="module"'),'Local file previews require a classic script');
 }
});

test('personal management lists only the live account shares, supports filters and rejects other operations',()=>fixture(async({DB,env,tokens,req})=>{
 await share({env,request:req([{url:'rsshub://reader/first',title:'Reader first'},{url:'rsshub://reader/second',title:'Reader second'},{url:'rsshub://reader/third',title:'Reader third'}])});
 await share({env,request:req([{url:'rsshub://owner/first',title:'Owner first'}],'owner')});
 const request=(query='',identity='reader')=>new Request('https://site/api/limitrss/my-shares'+query,{headers:identity?{Authorization:'Bearer '+tokens[identity]}:{}});
 assert.equal((await listMyShares({env,request:request('',null)})).status,401);
 let data=await (await listMyShares({env,request:request('?user_id=owner')})).json();assert.equal(data.total,3);assert.ok(data.feeds.every(row=>row.title.startsWith('Reader')));
 const first=data.feeds.find(row=>row.title==='Reader first');assert.equal(first.visibility,'public');assert.equal(first.revision,0);
 await DB.prepare('UPDATE plaza_feed_controls SET hidden=1 WHERE feed_id=?').bind(first.id).run();
 data=await (await listMyShares({env,request:request('?state=hidden')})).json();assert.equal(data.total,1);assert.equal(data.feeds[0].id,first.id);
 data=await (await listMyShares({env,request:request('?q=second')})).json();assert.equal(data.total,1);assert.equal(data.feeds[0].title,'Reader second');
 data=await (await listMyShares({env,request:request('','owner')})).json();assert.equal(data.total,1);assert.equal(data.feeds[0].title,'Owner first');
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await sharesRoute({env,request:new Request('https://site/api/limitrss/my-shares',{method})})).status,405);
 for(const method of ['GET','POST','PATCH','PUT'])assert.equal((await shareRoute({env,params:{id:first.id},request:new Request('https://site/api/limitrss/my-shares/'+first.id,{method})})).status,405);
 await DB.prepare("UPDATE users SET token_version=2 WHERE id='reader'").run();assert.equal((await listMyShares({env,request:request()})).status,401);
}));

test('personal deletion checks ownership even for admins, removes public access, preserves counters and writes one audit',()=>fixture(async({DB,env,tokens,req})=>{
 await share({env,request:req([{url:'rsshub://reader/delete',title:'Reader feed'}])});await share({env,request:req([{url:'rsshub://owner/keep',title:'Owner feed'}],'owner')});
 const reader=await DB.prepare("SELECT * FROM plaza_feeds WHERE title='Reader feed'").first(),owner=await DB.prepare("SELECT * FROM plaza_feeds WHERE title='Owner feed'").first();
 const request=(id,identity='reader',body={revision:0})=>({env,params:{id},request:new Request('https://site/api/limitrss/my-shares/'+id,{method:'DELETE',headers:identity?{Authorization:'Bearer '+tokens[identity]}:{},body:JSON.stringify(body)})});
 assert.equal((await deleteMyShare(request(reader.id,null))).status,401);
 assert.equal((await deleteMyShare(request(owner.id))).status,404);
 assert.equal((await deleteMyShare(request(reader.id,'owner'))).status,404);
 assert.equal((await deleteMyShare(request(reader.id,'reader',{revision:0,action:'edit',title:'Overwrite'}))).status,400);
 await DB.prepare('UPDATE plaza_feed_stats SET copy_count=4,import_count=5 WHERE feed_id=?').bind(reader.id).run();
 await DB.prepare('INSERT INTO plaza_admin_audit (id,feed_id,actor_id,action,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,0)').bind('old-audit',reader.id,'owner','edit',JSON.stringify({url:reader.url,title:reader.title}),'{}').run();
 const response=await deleteMyShare(request(reader.id));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 for(const [table,column] of [['plaza_feeds','id'],['plaza_feed_controls','feed_id'],['plaza_feed_stats','feed_id'],['plaza_contributions','feed_id'],['plaza_classification','feed_id'],['plaza_admin_audit','feed_id']])assert.equal(await DB.prepare(`SELECT * FROM ${table} WHERE ${column}=?`).bind(reader.id).first(),null,table);
 const archived=await DB.prepare('SELECT * FROM plaza_usage_archive WHERE feed_id=?').bind(reader.id).first();assert.equal(archived.copy_count,4);assert.equal(archived.import_count,5);assert.equal(archived.user_id,'reader');assert.deepEqual(Object.keys(archived).sort(),['copy_count','deleted_at','feed_id','import_count','user_id']);
 const visible=await (await list({env,request:new Request('https://site/api/limitrss/plaza')})).json();assert.deepEqual(visible.feeds.map(row=>row.id),[owner.id]);
 const {onRequestGet:detail}=await import('../functions/api/limitrss/plaza/[id].js');assert.equal((await detail({env,params:{id:reader.id}})).status,404);
 assert.equal((await interact({env,params:{id:reader.id},request:new Request('https://site',{method:'POST',body:JSON.stringify({action:'copy'})})})).status,404);
 assert.equal((await (await stats({env})).json()).totalUses,9);
 const audit=await DB.prepare('SELECT * FROM plaza_share_audit').all();assert.equal(audit.results.length,1);assert.equal(audit.results[0].actor_id,'reader');assert.equal(audit.results[0].feed_id,reader.id);
 assert.equal((await deleteMyShare(request(reader.id))).status,404);
 const {checkFeed}=await import('../functions/_lib/plaza.js');assert.equal(await checkFeed(reader,env,()=>{assert.fail('deleted feeds must not be checked');}),false);
 assert.equal((await (await stats({env})).json()).contributors,2);
 const reshared=await share({env,request:req([{url:reader.url,title:'Shared again'}])});assert.equal((await reshared.json()).results[0].status,'created');
 const fresh=await DB.prepare('SELECT id FROM plaza_feeds WHERE url=?').bind(reader.url).first();assert.notEqual(fresh.id,reader.id);
 assert.equal((await (await stats({env})).json()).totalUses,9);
 await interact({env,params:{id:fresh.id},request:new Request('https://site',{method:'POST',body:JSON.stringify({action:'import'})})});assert.equal((await (await stats({env})).json()).totalUses,10);
}));

test('personal deletion rejects stale revisions and concurrent deletes cannot double-apply',()=>fixture(async({DB,env,tokens,req})=>{
 await share({env,request:req([{url:'rsshub://reader/race',title:'Race'}])});const {id}=await DB.prepare('SELECT id FROM plaza_feeds').first();
 const request=revision=>({env,params:{id},request:new Request('https://site/api/limitrss/my-shares/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+tokens.reader},body:JSON.stringify({revision})})});
 await DB.prepare('UPDATE plaza_feed_controls SET revision=1 WHERE feed_id=?').bind(id).run();assert.equal((await deleteMyShare(request(0))).status,409);
 const responses=await Promise.all([deleteMyShare(request(1)),deleteMyShare(request(1))]);const statuses=responses.map(response=>response.status);assert.equal(statuses.filter(status=>status===200).length,1);assert.ok(statuses.some(status=>[404,409].includes(status)));
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM plaza_share_audit').first()).n,1);assert.equal(await DB.prepare('SELECT * FROM plaza_feeds WHERE id=?').bind(id).first(),null);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM plaza_usage_archive').first()).n,1);
}));

test('personal list paginates only owned records and hides deleted shares',()=>fixture(async({DB,env,tokens})=>{
 for(let n=1;n<=25;n++){const id=n.toString(16).padStart(32,'0');await DB.prepare('INSERT INTO plaza_feeds (id,url,title,created_at) VALUES (?,?,?,0)').bind(id,`https://example.com/${n}`,`My feed ${n}`).run();await DB.prepare('INSERT INTO plaza_contributions VALUES (?,?,?)').bind(id,'reader',n).run();}
 const get=async query=>(await listMyShares({env,request:new Request('https://site/api/limitrss/my-shares'+query,{headers:{Authorization:'Bearer '+tokens.reader}})})).json();
 let data=await get('');assert.equal(data.total,25);assert.equal(data.feeds.length,20);assert.ok(data.feeds.every(row=>row.visibility==='pending'));
 data=await get('?page=99');assert.equal(data.page,2);assert.equal(data.feeds.length,5);
 await DB.prepare('INSERT INTO plaza_feed_controls (feed_id,deleted_at) VALUES (?,1)').bind(data.feeds[0].id).run();assert.equal((await get('')).total,24);assert.equal((await get('?q=nomatch')).total,0);
}));

test('personal login return path is allowed without permitting arbitrary redirects',async()=>{
 const {Script,createContext}=await import('node:vm');const source=await readFile('limitrss/plaza/session-runtime.js','utf8'),context=createContext({});new Script(source).runInContext(context);
 const redirect=context.LimitRSSSession.returnPath;assert.equal(redirect('/limitrss/my-shares/'),'/limitrss/my-shares/');for(const path of ['https://evil.example','//evil.example','/limitrss/my-shares/../../other','/unknown'])assert.equal(redirect(path),'/limitrss/plaza/');
});

test('failed historical counter archival rolls back the entire permanent deletion',()=>fixture(async({DB,env,tokens,req})=>{
 await share({env,request:req([{url:'rsshub://reader/rollback',title:'Keep on failure'}])});const {id}=await DB.prepare('SELECT id FROM plaza_feeds').first();
 await DB.prepare('UPDATE plaza_feed_stats SET copy_count=6 WHERE feed_id=?').bind(id).run();
 await DB.prepare("CREATE TRIGGER reject_usage_archive BEFORE INSERT ON plaza_usage_archive BEGIN SELECT RAISE(ABORT, 'archive_unavailable'); END").run();
 const response=await deleteMyShare({env,params:{id},request:new Request('https://site/api/limitrss/my-shares/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+tokens.reader},body:JSON.stringify({revision:0})})});assert.equal(response.status,503);
 assert.ok(await DB.prepare('SELECT id FROM plaza_feeds WHERE id=?').bind(id).first());assert.equal((await DB.prepare('SELECT revision FROM plaza_feed_controls WHERE feed_id=?').bind(id).first()).revision,0);assert.equal((await DB.prepare('SELECT copy_count FROM plaza_feed_stats WHERE feed_id=?').bind(id).first()).copy_count,6);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM plaza_share_audit').first()).n,0);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM plaza_usage_archive').first()).n,0);
}));
