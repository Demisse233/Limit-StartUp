import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script,createContext} from 'node:vm';
import {getPlatformProxy} from 'wrangler';
import {SCHEMA_SQL} from '../functions/_lib/db.js';
import {onRequestPost as register} from '../functions/api/auth/register.js';
import {onRequestPost as login} from '../functions/api/auth/login.js';
import {registrationEmailDomain,screenEmailFormat,isDisposableDomain,createEmailDomainChecker,emailCheckMessage} from '../functions/_lib/email-validation.js';

const answer = (type,data) => Response.json({Status:0,Answer:[{type,data}]});
function checker(transport, options={}) {return createEmailDomainChecker({transport,cacheProvider:()=>null,...options});}

test('registration email syntax enforces lengths, dot atoms and domain labels without altering aliases',()=>{
 for(const address of ['a+b@gmail.com',"o'hara@outlook.com",'hello.world@company.co.uk','reader@xn--bcher-kva.de'])assert.ok(registrationEmailDomain(address),address);
 for(const address of ['',null,{},'a@@qq.com','a@localhost','a@127.0.0.1','a@-gmail.com','a@gmail-.com','a@gma_il.com','a@gmail.com.','a..b@gmail.com','.a@gmail.com','a.@gmail.com','"a b"@gmail.com','a\n@gmail.com','a@x.com/path','a@x.com:443','a@x.com?test','a@x..com','a'.repeat(65)+'@gmail.com','a@'+'b'.repeat(64)+'.com','a@'+('b'.repeat(62)+'.').repeat(4)+'com'])assert.equal(registrationEmailDomain(address),null,String(address));
 assert.equal(screenEmailFormat('john.smith+tag@gmail.com').domain,'gmail.com');
});

test('vendored disposable list blocks exact domains and subdomains, preserving normal providers',()=>{
 for(const domain of ['mailinator.com','YOPMAIL.COM','inbox.mailinator.com'])assert.equal(isDisposableDomain(domain),true);
 for(const domain of ['gmail.com','qq.com','163.com','126.com','outlook.com','icloud.com','yahoo.com','proton.me','unrelated-mailinator.test','mailinator.com.example.org'])assert.equal(isDisposableDomain(domain),false,domain);
 assert.equal(screenEmailFormat('hello@mailinator.com').code,'disposable_email');
});

test('valid MX, nonexistent domain and null MX are distinct',async()=>{
 assert.equal((await checker(()=>answer(15,'10 mx.provider.test.'))('provider.test')).reason,'mx');
 const nx=await checker(()=>Response.json({Status:3}))('missing.test');assert.equal(nx.code,'invalid_email_domain');assert.equal(nx.reason,'nxdomain');
 const empty=await checker(()=>answer(15,'0 .'))('no-mail.test');assert.equal(empty.reason,'null_mx');
});

test('missing MX supports implicit IPv4/IPv6 mail hosts and rejects domains with neither',async()=>{
 for(const [type,data] of [[1,'192.0.2.1'],[28,'2001:db8::1']]){
  const result=await checker(url=>url.endsWith(type===1?'type=A':'type=AAAA')?answer(type,data):Response.json({Status:0}))('implicit.test');assert.equal(result.reason,'implicit_mx');
 }
 assert.equal((await checker(()=>Response.json({Status:0}))('empty.test')).reason,'no_mail_host');
});

test('DNS failures are retriable, never treated as invalid domains or allowed registration',async()=>{
 for(const response of [()=>{throw Error('offline');},()=>new Response('',{status:429}),()=>new Response('not json'),()=>Response.json({Status:2}),()=>Response.json({Status:5}),()=>Response.json({Status:0,TC:true}),()=>Response.json({success:true}),()=>answer(15,'malformed')])assert.equal((await checker(response)('failure.test')).code,'email_check_unavailable');
 const result=await checker(url=>url.endsWith('type=AAAA')?Response.json({Status:2}):Response.json({Status:0}))('partial.test');assert.equal(result.code,'email_check_unavailable');
});

test('timeout bounds both the request and reading its response body',async()=>{
 for(const transport of [()=>new Promise(()=>{}),()=>({ok:true,json:()=>new Promise(()=>{})})]){
  const start=Date.now();const result=await checker(transport,{timeoutMs:10})('slow.test');assert.equal(result.code,'email_check_unavailable');assert.ok(Date.now()-start<1000);
 }
});

test('domain-only cache separates domains, caches definite results and never caches outages',async()=>{
 const entries=new Map();let queries=0;
 const cache={match:async key=>entries.get(key.url)?.clone(),put:async(key,value)=>entries.set(key.url,value)};
 const check=checker(()=>{queries++;return answer(15,'10 mx.cache.test.');},{cacheProvider:()=>cache});
 assert.equal((await check('cache.test')).cache,'miss');assert.equal((await check('cache.test')).cache,'hit');assert.equal(queries,1);
 await check('other.test');assert.equal(queries,2);assert.equal(entries.size,2);
 const failed=checker(()=>Response.json({Status:2}),{cacheProvider:()=>cache});await failed('failed.test');assert.equal(entries.size,2);
 const negative=checker(()=>Response.json({Status:3}),{cacheProvider:()=>cache});await negative('missing.test');assert.equal((await negative('missing.test')).cache,'hit');assert.equal(entries.size,3);
 for(const key of entries.keys())assert.ok(!key.includes('@'));
});

test('cache failures do not bypass DNS or reject a valid domain',async()=>{
 const result=await checker(()=>answer(15,'10 mx.cache.test.'),{cacheProvider:()=>({match(){throw Error('cache');},put(){throw Error('cache');}})})('cache.test');assert.equal(result.ok,true);assert.equal(result.cache,'unavailable');
});

test('registration rejects bad addresses before storage; checks DNS only after CAPTCHA; logs no secrets',async t=>{
 const proxy=await getPlatformProxy({configPath:'wrangler.toml',persist:false});
 const logs=[];t.mock.method(console,'log',message=>logs.push(JSON.parse(message)));
 try {
  const DB=proxy.env.DB;for(const sql of SCHEMA_SQL.replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
  const env={DB,JWT_SECRET:'email-test-secret'};let dnsCalls=0;let mode='valid';
  t.mock.method(globalThis,'fetch',async url=>{
   if(String(url).includes('siteverify'))return Response.json({success:mode!=='captcha'});
   assert.ok(String(url).startsWith('https://cloudflare-dns.com/dns-query?'));dnsCalls++;
   return mode==='nx'?Response.json({Status:3}):mode==='outage'?Response.json({Status:2}):answer(15,'10 mx.registration.test.');
  });
  const body={email:'reader@registration.test',password:'very-secret-password-123',nickname:'Reader',turnstileToken:'private-captcha-token'};
  const submit=(overrides={},language='en')=>register({env,request:new Request('https://site/api/auth/register',{method:'POST',headers:{'Accept-Language':language},body:JSON.stringify({...body,...overrides})})});
  for(const email of ['a..b@gmail.com','reader@mailinator.com','reader@sub.mailinator.com',{},['reader@gmail.com']])assert.equal((await submit({email})).status,400);
  assert.equal(dnsCalls,0);
  mode='captcha';assert.equal((await submit()).status,403);assert.equal(dnsCalls,0);
  mode='nx';let response=await submit();assert.equal(response.status,400);assert.equal((await response.json()).error,'invalid_email_domain');
  mode='outage';response=await submit();assert.equal(response.status,503);assert.equal((await response.json()).error,'email_check_unavailable');
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n,0);
  mode='valid';response=await submit({email:' Reader@Registration.test '});assert.equal(response.status,200);assert.ok((await response.json()).token);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const calls=dnsCalls;assert.equal((await submit()).status,400);assert.equal(dnsCalls,calls);
  assert.equal((await login({env,request:new Request('https://site/api/auth/login',{method:'POST',body:JSON.stringify(body)})})).status,200);
  response=await submit({email:'reader@yopmail.com'},'zh-CN');assert.match((await response.json()).message,/临时邮箱/);
  assert.ok(logs.some(row=>row.event==='register_email_check'&&row.code==='ok'));assert.ok(logs.some(row=>row.code==='email_check_unavailable'));
  const serialized=JSON.stringify(logs);for(const secret of [body.email,body.password,body.turnstileToken,body.nickname])assert.ok(!serialized.includes(secret));
 } finally {await proxy.dispose();}
});

test('new API errors are localized and browser diagnostics stay bounded and exportable without inputs',async()=>{
 for(const code of ['invalid_email','disposable_email','invalid_email_domain','email_check_unavailable']){
  assert.ok(emailCheckMessage(code,new Request('https://site',{headers:{'Accept-Language':'en-US'}})));
  assert.ok(emailCheckMessage(code,new Request('https://site',{headers:{'Accept-Language':'zh-CN'}})));
 }
 const storage=new Map();let exported;
 const context=createContext({Date,JSON,Number,Set,Blob,sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},URL:{createObjectURL:blob=>{exported=blob;return 'blob:test';},revokeObjectURL(){}},document:{createElement:()=>({click(){}})},setTimeout:()=>{}});
 new Script(await readFile('limitrss/auth-diagnostics.js','utf8')).runInContext(context);
 const diag=context.LimitRSSAuthDiagnostics;for(let n=0;n<60;n++)diag.record('email_check_unavailable',503,n);diag.record('email=secret@gmail.com',500,1);
 assert.equal(diag.read().length,50);assert.equal(diag.read().at(-1).code,'unavailable');diag.exportDiagnostics();assert.equal(JSON.parse(await exported.text()).entries.length,50);assert.ok(!JSON.stringify(diag.read()).includes('secret'));
 const script=await readFile('limitrss/login/login.js','utf8');const copySource=script.slice(script.indexOf('const copy=')+11,script.indexOf('\n};')+2);const copy=new Script(`(${copySource})`).runInNewContext();
 assert.deepEqual(Object.keys(copy.zh).sort(),Object.keys(copy.en).sort());
 for(const code of ['disposable_email','invalid_email_domain','email_check_unavailable','exportDiagnostics'])assert.ok(copy.zh[code]&&copy.en[code]);
});
