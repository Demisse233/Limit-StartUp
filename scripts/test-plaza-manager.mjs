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


test('Plaza sign-in reuses StartUp passwords, session and server-side manager access',t=>fixture(async({DB,env,req})=>{
 const {hashPassword}=await import('../functions/_lib/crypto.js');
 const {onRequestPost:login}=await import('../functions/api/auth/login.js');
 const {onRequestGet:me}=await import('../functions/api/auth/me.js');
 const {onRequestPost:logout}=await import('../functions/api/auth/logout.js');
 const salt='11'.repeat(16),password='local-test-password';
 await DB.prepare('UPDATE users SET password_salt=?,password_hash=?').bind(salt,await hashPassword(password,salt)).run();
 t.mock.method(globalThis,'fetch',async url=>{assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');return Response.json({success:true});});
 const attempt=(email,secret=password,captcha='local-test-captcha')=>login({env,request:new Request('https://site/api/auth/login',{method:'POST',body:JSON.stringify({email,password:secret,turnstileToken:captcha})})});
 assert.equal((await attempt('reader@example.com',password,'')).status,403);
 assert.equal((await attempt('reader@example.com','incorrect')).status,401);
 const reader=await (await attempt('reader@example.com')).json();assert.ok(reader.token);assert.equal(reader.user.id,'reader');
 const authenticated=()=>new Request('https://site/api/auth/me',{headers:{Authorization:'Bearer '+reader.token}});
 let response=await me({env,request:authenticated()});assert.equal((await response.json()).user.plazaAdmin,false);
 const adminResult=await me({env,request:req()});assert.equal((await adminResult.json()).user.plazaAdmin,true);
 const changed=await me({env:{...env,PLAZA_ADMIN_EMAILS:'reader@example.com'},request:authenticated()});assert.equal((await changed.json()).user.plazaAdmin,true);
 assert.equal((await logout({env,request:authenticated()})).status,200);
 assert.equal((await me({env,request:authenticated()})).status,401);
}));

test('Plaza login return paths reject external URLs and unexpected local destinations',async()=>{
 const {returnPath}=await import('../limitrss/plaza/session.js');
 for(const url of ['https://evil.example','//evil.example','javascript:alert(1)','/api/auth/logout','/limitrss/plaza/?next=https://evil.example',null])assert.equal(returnPath(url),'/limitrss/plaza/');
 assert.equal(returnPath('/limitrss/plaza-manager/'),'/limitrss/plaza-manager/');
});


test('Plaza registration creates a StartUp account and enforces existing registration rules',t=>fixture(async({DB,env})=>{
 const {onRequestPost:register}=await import('../functions/api/auth/register.js');
 const {onRequestPost:login}=await import('../functions/api/auth/login.js');
 const {onRequestGet:me}=await import('../functions/api/auth/me.js');
 t.mock.method(globalThis,'fetch',async()=>Response.json({success:true}));
 const submit=(handler,body)=>handler({env,request:new Request('https://site/api/auth/register',{method:'POST',body:JSON.stringify(body)})});
 const body={email:'new-reader@example.com',nickname:'New reader',password:'local-password-123',turnstileToken:'test'};
 assert.equal((await submit(register,{...body,turnstileToken:''})).status,403);
 assert.equal((await submit(register,{...body,password:'short'})).status,400);
 const response=await submit(register,body);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');const result=await response.json();assert.ok(result.token);
 const account=await DB.prepare('SELECT nickname,password_hash FROM users WHERE email=?').bind(body.email).first();assert.equal(account.nickname,body.nickname);assert.notEqual(account.password_hash,body.password);
 assert.equal((await submit(register,body)).status,400);
 const signedIn=await submit(login,body);assert.equal(signedIn.status,200);
 const profile=await me({env,request:new Request('https://site/api/auth/me',{headers:{Authorization:'Bearer '+result.token}})});assert.equal((await profile.json()).user.plazaAdmin,false);
}));

test('Plaza account dialogs reuse nickname/avatar/password APIs and revoke sessions only after a successful password change',t=>fixture(async({DB,env,req})=>{
 const {onRequestPut:nickname}=await import('../functions/api/auth/nickname.js');
 const {onRequestPost:avatar,onRequestDelete:removeAvatar,onRequestGet:getAvatar}=await import('../functions/api/avatar/index.js');
 const {onRequestPost:reset}=await import('../functions/api/auth/reset.js');
 const {onRequestGet:me}=await import('../functions/api/auth/me.js');
 const {hashPassword}=await import('../functions/_lib/crypto.js');
 const logs=[];t.mock.method(console,'log',value=>logs.push(value));
 t.mock.method(globalThis,'fetch',async()=>Response.json({success:true}));
 assert.equal((await nickname({env,request:req('PUT',{nickname:'New reader'},null)})).status,401);
 assert.equal((await nickname({env,request:req('PUT',{nickname:'  '})})).status,400);
 const saved=await nickname({env,request:req('PUT',{nickname:'New reader'})});assert.equal(saved.status,200);assert.equal(saved.headers.get('Cache-Control'),'no-store');
 assert.equal((await DB.prepare("SELECT nickname FROM users WHERE id='admin'").first()).nickname,'New reader');
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
 assert.equal((await avatar({env,request:req('POST',{dataUrl:'data:text/plain;base64,aGk='})})).status,415);
 assert.equal((await avatar({env,request:req('POST',{dataUrl:image})})).status,200);
 const fetched=await getAvatar({env,request:req()});assert.equal(fetched.status,200);assert.equal(fetched.headers.get('Content-Type'),'image/png');assert.ok((await fetched.arrayBuffer()).byteLength>0);
 assert.equal((await removeAvatar({env,request:req('DELETE')})).status,200);assert.equal((await getAvatar({env,request:req()})).status,404);
 const oldPassword='local-old-password-123',newPassword='local-new-password-456',salt='12'.repeat(16);
 await DB.prepare("UPDATE users SET password_salt=?,password_hash=? WHERE id='admin'").bind(salt,await hashPassword(oldPassword,salt)).run();
 const attempt=body=>reset({env,request:req('POST',body)});
 assert.equal((await attempt({oldPassword:'incorrect',newPassword,turnstileToken:'test'})).status,401);
 assert.equal((await me({env,request:req()})).status,200);
 assert.equal((await attempt({oldPassword,newPassword,turnstileToken:''})).status,403);
 const changed=await attempt({oldPassword,newPassword,turnstileToken:'test'});assert.equal(changed.status,200);assert.equal(changed.headers.get('Cache-Control'),'no-store');
 assert.equal((await me({env,request:req()})).status,401);
 const accountLogs=logs.map(value=>JSON.parse(value)).filter(value=>value.module==='account');assert.ok(accountLogs.some(value=>value.event==='password_changed'&&value.status===200));assert.ok(accountLogs.some(value=>value.event==='password_changed'&&value.code==='invalid_old_password'));assert.ok(accountLogs.every(value=>typeof value.durationMs==='number'));
 assert.ok(!JSON.stringify(accountLogs).includes(oldPassword));assert.ok(!JSON.stringify(accountLogs).includes(newPassword));assert.ok(!JSON.stringify(accountLogs).includes('Bearer'));
}));

test('a wrong current password does not discard the client session, while an expired session does',async t=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');const values=new Map([['ls_auth_token','test-session'],['ls_auth_user','{}']]);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>values.get(key)||null,removeItem:key=>values.delete(key)}});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
 let error='invalid_old_password';t.mock.method(globalThis,'fetch',async()=>Response.json({error},{status:401}));
 const {authRequest}=await import('../limitrss/plaza/session.js');
 await assert.rejects(authRequest('/api/auth/reset',{method:'POST'}),/invalid_old_password/);assert.equal(values.get('ls_auth_token'),'test-session');
 error='unauthorized';await assert.rejects(authRequest('/api/auth/reset',{method:'POST'}),/unauthorized/);assert.equal(values.has('ls_auth_token'),false);assert.equal(values.has('ls_auth_user'),false);
});
