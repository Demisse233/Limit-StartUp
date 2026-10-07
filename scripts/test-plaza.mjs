import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getPlatformProxy} from 'wrangler';
import {schema, feedUrl, publicUrl, publicAddress, parseFeed, checkFeed, classify, quota} from '../functions/_lib/plaza.js';
import {onRequestGet,onRequestPost} from '../functions/api/limitrss/plaza/index.js';
import {onRequestGet as detail} from '../functions/api/limitrss/plaza/[id].js';
test('public URLs preserve feed query strings but reject private destinations and credentials',()=>{
 assert.equal(publicUrl('https://EXAMPLE.com/rss?category=game#x'),'https://example.com/rss?category=game');
 for(const url of ['http://127.0.0.1/','http://2130706433/','http://[::1]/','http://localhost/','https://user:pass@example.com/','https://example.com/?api_key=secret','file:///tmp/feed','http://foo.local/'])assert.throws(()=>publicUrl(url));
 for(const ip of ['10.0.0.1','127.0.0.1','172.17.0.1','169.254.1.1','192.168.1.1','100.64.1.1','224.0.0.1','::1'])assert.equal(publicAddress(ip),false);
 assert.equal(publicAddress('1.1.1.1'),true);
 assert.equal(feedUrl('rsshub://github/trending?since=weekly'),'rsshub://github/trending?since=weekly');
 assert.throws(()=>feedUrl('rsshub://github/trending?token=secret'));
});
test('validates RSS/Atom, rejects HTML/malformed XML/entities, classifies feed descriptions',()=>{
 assert.equal(parseFeed('<rss><channel><title>原神</title></channel></rss>').category,'gaming');
 assert.equal(parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title><subtitle>Programming tutorials</subtitle></feed>').category,'development');
 for(const xml of ['<html><title>Site</title></html>','<rss><channel></rss>','<!DOCTYPE rss><rss/>','<rss><channel><title></title></channel></rss>'])assert.throws(()=>parseFeed(xml));
 assert.equal(classify('Apple Newsroom'),'technology');
});
test('anonymous upload, deduplication, pending visibility, checks and recovery using actual D1',async()=>{
 const proxy=await getPlatformProxy({configPath:'wrangler.toml',persist:false});
 try{
  const DB=proxy.env.DB;for(const statement of schema.split(';').filter(x=>x.trim()))await DB.prepare(statement).run();const env={DB};
  const post=feeds=>onRequestPost({env,request:new Request('https://site/api/limitrss/plaza',{method:'POST',headers:{'CF-Connecting-IP':'1.2.3.4'},body:JSON.stringify({feeds})})});
  const limitedRequest=new Request('https://site',{headers:{'CF-Connecting-IP':'123.1.2.3'}});
  assert.equal(await quota(limitedRequest,env,'test',1,10),true);assert.equal(await quota(limitedRequest,env,'test',1,10),false);
  let response=await post([{title:'Community blog',url:'https://example.com/rss'},{title:'private',url:'http://127.0.0.1/'}]);assert.equal(response.status,201);assert.deepEqual((await response.json()).results.map(x=>x.status),['created','rejected']);
  response=await post([{title:'overwrite',url:'https://example.com/rss'}]);assert.equal((await response.json()).results[0].status,'duplicate');
  const list=async(query='')=>(await onRequestGet({env,request:new Request('https://site/api/limitrss/plaza'+query)})).json();assert.equal((await list()).total,0);
  let row=await DB.prepare('SELECT * FROM plaza_feeds').first();
  const transport=async url=>url.includes('dns-query')?Response.json({Answer:[{type:1,data:'1.1.1.1'}]}):new Response('<rss><channel><title>原神</title></channel></rss>');
  await checkFeed(row,env,transport);assert.equal((await list('?category=gaming')).total,1);assert.equal((await list('?q=missing')).total,0);
  response=await detail({env,params:{id:row.id}});assert.equal((await response.json()).title,'Community blog');
  const failed=async()=>{throw Error('network_error')};
  for(let i=0;i<3;i++){row=await DB.prepare('SELECT * FROM plaza_feeds').first();await checkFeed(row,env,failed);}
  assert.equal((await list()).feeds[0].status,'failed');
  row=await DB.prepare('SELECT * FROM plaza_feeds').first();await checkFeed(row,env,transport);assert.equal((await list()).feeds[0].status,'healthy');
  row=await DB.prepare('SELECT * FROM plaza_feeds').first();await checkFeed(row,env,async url=>url.includes('dns-query')?Response.json({Answer:[{type:1,data:'10.0.0.1'}]}):transport(url));
  assert.equal((await DB.prepare('SELECT * FROM plaza_feeds').first()).reason,'unsafe_origin');
 }finally{await proxy.dispose();}
});
