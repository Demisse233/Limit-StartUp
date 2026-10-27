import {authRequest,readToken} from './session.js';
import {diagnose,exportDiagnostics} from './diagnostics.js';
const $=id=>document.getElementById(id);
export function parseOpml(text){
 if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('invalidOpml');
 const doc=new DOMParser().parseFromString(text,'application/xml');
 if(doc.querySelector('parsererror')||doc.documentElement.localName.toLowerCase()!=='opml')throw Error('invalidOpml');
 const seen=new Set(),feeds=[];
 for(const outline of doc.querySelectorAll('outline')){
  const raw=outline.getAttribute('xmlUrl')||outline.getAttribute('xmlurl');if(!raw)continue;
  let url;try{url=canonicalUrl(raw);}catch{throw Error('invalidUrl');}
  if(seen.has(url))continue;seen.add(url);feeds.push({url,title:(outline.getAttribute('title')||outline.getAttribute('text')||'').slice(0,200)});
  if(feeds.length>100)throw Error('tooManyFeeds');
 }
 if(!feeds.length)throw Error('emptyOpml');return feeds;
}
export function canonicalUrl(value){const url=new URL(value.trim());if(!['http:','https:','rsshub:'].includes(url.protocol)||url.username||url.password)throw Error('invalidUrl');url.hash='';return url.href;}
export function setupShare({t,onShared}){
 let mode='rss',busy=false,rows=[],inputKey='',lastMessage='',lastCounts=null;
 const fields=['share-url','share-file','rss-tab','opml-tab'];
 function setMode(value,focus=false){if(busy)return;mode=value;for(const name of ['rss','opml']){const active=mode===name;$(name+'-tab').setAttribute('aria-selected',String(active));$(name+'-tab').tabIndex=active?0:-1;$(name+'-panel').hidden=!active;} $('share-url').required=mode==='rss';$('share-file').required=mode==='opml';$('share-url').disabled=mode!=='rss';$('share-file').disabled=mode!=='opml';if(focus)$(mode+'-tab').focus();}
 function render(){
  $('share-submit').textContent=t(busy?'sharing':rows.some(row=>row.status==='rejected')?'retryFailed':'shareSubmit');
  $('share-message').textContent=lastCounts?t('shareSummary')(lastCounts):lastMessage?t(lastMessage):'';
  $('share-message').dataset.state=lastCounts&&!lastCounts.rejected?'success':'';
  $('share-results').replaceChildren(...rows.map(row=>{const li=document.createElement('li');li.dataset.status=row.status;li.textContent=`${row.title||row.url} — ${t(row.status)}`;return li;}));
 }
 function login(){try{sessionStorage.setItem('plaza-share-pending','1');}catch{}location.href='../login/?next='+encodeURIComponent('/limitrss/plaza/');}
 async function open(){if(busy)return;if(!readToken()){login();return;}try{await authRequest('/api/auth/me');$('share-dialog').showModal();}catch(error){if(error.message==='unauthorized'||!readToken())login();else{lastMessage='sessionFailed';$('share-dialog').showModal();render();}}}
 $('contribute').onclick=open;$('share-close').onclick=()=>$('share-dialog').close();
 for(const name of ['rss','opml']){$(name+'-tab').onclick=()=>setMode(name);$(name+'-tab').onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setMode(event.key==='Home'?'rss':event.key==='End'?'opml':mode==='rss'?'opml':'rss',true);}};}
 $('export-diagnostics').onclick=exportDiagnostics;
 $('share-form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  lastCounts=null;lastMessage='';busy=true;fields.forEach(id=>$(id).disabled=true);$('share-submit').disabled=true;const started=performance.now();
  try{
   let feeds,key;
   if(mode==='rss'){feeds=[{url:canonicalUrl($('share-url').value)}];key=feeds[0].url;}
   else{const file=$('share-file').files[0];if(!file)throw Error('chooseFile');if(file.size>1024*1024)throw Error('fileTooLarge');const text=await file.text();feeds=parseOpml(text);key=text;}
   if(key!==inputKey){rows=feeds.map(feed=>({...feed,status:'waiting'}));inputKey=key;}
   busy=true;fields.forEach(id=>$(id).disabled=true);$('share-submit').disabled=true;lastMessage='sharing';render();
   const pending=rows.filter(row=>!['created','duplicate'].includes(row.status));
   for(let offset=0;offset<pending.length;offset+=10){
    const batch=pending.slice(offset,offset+10);batch.forEach(row=>row.status='waiting');render();
    try{
     const data=await authRequest('/api/limitrss/plaza/share',{method:'POST',body:JSON.stringify({feeds:batch.map(({url,title})=>({url,title}))}),signal:AbortSignal.timeout(90000)});
     if(!Array.isArray(data.results)||data.results.length!==batch.length||data.results.some((row,i)=>row.index!==i||!['created','duplicate','rejected'].includes(row.status)))throw Error('unavailable');
     batch.forEach((row,i)=>row.status=data.results[i].status);
     diagnose('share_batch_completed',{count:batch.length,durationMs:Math.round(performance.now()-started)});
    }catch(error){pending.slice(offset).forEach(row=>row.status='rejected');diagnose('share_batch_failed',{code:['unauthorized','rate_limited'].includes(error.message)?error.message:'unavailable',durationMs:Math.round(performance.now()-started)});throw error;}
    render();
   }
   lastCounts=rows.reduce((a,row)=>(a[row.status]++,a),{created:0,duplicate:0,rejected:0});lastMessage='';
   diagnose('share_completed',{status:lastCounts.rejected?207:201,count:rows.length,durationMs:Math.round(performance.now()-started)});
   onShared();
  }catch(error){lastMessage=['invalidOpml','emptyOpml','tooManyFeeds','invalidUrl','chooseFile','fileTooLarge'].includes(error.message)?error.message:error.message==='unauthorized'?'signInAgain':error.message==='rate_limited'?'rateLimited':'shareFailed';diagnose('share_failed',{code:lastMessage,durationMs:Math.round(performance.now()-started)});}
  finally{busy=false;fields.forEach(id=>$(id).disabled=false);$('share-submit').disabled=false;setMode(mode);$('export-diagnostics').hidden=!lastMessage&&!rows.some(row=>row.status==='rejected');render();}
 };
 document.addEventListener('plaza-account-session-ended',()=>{$('share-dialog').close();});
 try{if(sessionStorage.getItem('plaza-share-pending')&&readToken()){sessionStorage.removeItem('plaza-share-pending');void open();}}catch{}
 setMode('rss');return {localize:render};
}
