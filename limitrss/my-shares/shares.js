import {authRequest,readToken} from '../plaza/session.js';
import {setFeedIcon} from '../plaza/feed-icon.js';
import {pageNumbers} from '../plaza/pagination.js';
import {diagnose,exportDiagnostics} from '../plaza/diagnostics.js';
const $=id=>document.getElementById(id),copy=globalThis.LimitRSSPlazaI18n.sharesCopy;
let language=document.documentElement.lang==='en'?'en':'zh',page=1,total=0,pageSize=20,feeds=[],generation=0,controller,loading=false,listFailed=false,selected=null,deleting=false,message='',messageSuccess=false,deleteError='';
const t=(key,...args)=>{const value=copy[language][key]??copy[language].unavailable;return typeof value==='function'?value(...args):value;};
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function notice(key,success=false){message=key;messageSuccess=success;$('shares-message').textContent=key?t(key):'';$('shares-message').dataset.state=success?'success':'error';}
function signedOut(expired=false){generation++;controller?.abort();feeds=[];total=0;page=1;loading=false;listFailed=false;message='';deleteError='';selected=null;$('share-delete-dialog').close();$('share-delete-feed').textContent='';$('share-delete-error').textContent='';$('shares-summary').textContent='';$('shares-range').textContent='';$('shares-pages').replaceChildren();$('shares-list').replaceChildren();$('shares-workspace').hidden=true;$('shares-sign-in').hidden=false;if(expired)$('shares-sign-in').querySelector('p').textContent=t('unauthorized');}
function render(){
 $('shares-summary').textContent=loading?t('loading'):t('count',total);$('shares-diagnostics').hidden=!listFailed&&!message;
 const body=$('shares-list');
 if(loading||listFailed||!feeds.length){const row=node('tr'),cell=node('td',undefined,'table-state');cell.colSpan=5;
  if(listFailed){const retry=node('button',t('retry'));retry.type='button';retry.onclick=()=>load();cell.append(retry);}
  else cell.textContent=loading?t('loading'):t($('share-query').value||$('share-state').value?'noMatches':'empty');row.append(cell);body.replaceChildren(row);
 }else body.replaceChildren(...feeds.map(feed=>{
  const row=node('tr'),identity=node('td'),group=node('div',undefined,'feed-source'),icon=node('img',undefined,'icon');icon.alt='';icon.loading='lazy';icon.referrerPolicy='no-referrer';setFeedIcon(icon,feed);group.append(icon,node('span',feed.title,'feed-title'));identity.append(group);
  const address=node('td'),url=node('span',feed.url,'url');url.title=feed.url;address.append(url);
  const status=node('td'),labels=node('div',undefined,'own-status');labels.append(node('span',t(feed.visibility)));if(feed.status!=='pending')labels.append(node('small',t(feed.status)));status.append(labels);
  const date=node('td',undefined,'own-date'),time=new Date(feed.sharedAt);date.textContent=Number.isNaN(time.getTime())?'—':new Intl.DateTimeFormat(language==='en'?'en':'zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
  const action=node('td'),remove=node('button',t('delete'),'delete-share');remove.type='button';remove.setAttribute('aria-label',t('deleteNamed',feed.title));remove.onclick=()=>{selected=feed;deleteError='';renderDialog();$('share-delete-dialog').showModal();};action.append(remove);row.append(identity,address,status,date,action);return row;
 }));
 const pages=Math.max(1,Math.ceil(total/pageSize));$('shares-previous').disabled=loading||listFailed||page<=1;$('shares-next').disabled=loading||listFailed||page>=pages;
 $('shares-range').textContent=loading||listFailed?'':t('pageRange',total?(page-1)*pageSize+1:0,Math.min(page*pageSize,total),total);
 $('shares-pages').replaceChildren(...(loading||listFailed?[]:pageNumbers(page,pages)).map(value=>{if(value==='…')return node('span','…');const button=node('button',String(value));button.type='button';button.setAttribute('aria-label',t('pageLabel',value));if(value===page)button.setAttribute('aria-current','page');button.onclick=()=>{page=value;load();};return button;}));
 notice(message,messageSuccess);
}
function renderDialog(){if(selected)$('share-delete-feed').textContent=selected.title;$('share-delete-error').textContent=deleteError?t(deleteError):'';for(const id of ['share-delete-close','share-delete-cancel','share-delete-confirm'])$(id).disabled=deleting;$('share-delete-confirm').textContent=t(deleting?'deleting':'confirmDelete');}
async function load(){
 const token=readToken();if(!token){signedOut();return;}
 controller?.abort();controller=new AbortController();const current=++generation,started=performance.now();loading=true;listFailed=false;$('shares-sign-in').hidden=true;$('shares-workspace').hidden=false;render();
 try{const params=new URLSearchParams({page,q:$('share-query').value,state:$('share-state').value});const data=await authRequest('/api/limitrss/my-shares?'+params,{signal:controller.signal});
  if(current!==generation||token!==readToken())return;
  if(!Array.isArray(data.feeds)||!Number.isSafeInteger(data.total)||!Number.isSafeInteger(data.page)||!Number.isSafeInteger(data.pageSize))throw Error('unavailable');
  feeds=data.feeds;total=data.total;page=data.page;pageSize=data.pageSize;diagnose('my_shares_loaded',{count:feeds.length,durationMs:Math.round(performance.now()-started)});
 }catch(error){if(current!==generation)return;if(error.message==='unauthorized'||!readToken()){signedOut(true);return;}listFailed=true;feeds=[];notice(['network','rate_limited'].includes(error.message)?error.message:'unavailable');diagnose('my_shares_load_failed',{code:error.message==='unauthorized'?'unauthorized':'unavailable',durationMs:Math.round(performance.now()-started)});
 }finally{if(current===generation){loading=false;render();}}
}
async function remove(){
 if(deleting||!selected)return;deleting=true;deleteError='';renderDialog();const feed=selected,token=readToken(),started=performance.now();diagnose('my_share_delete_started');
 try{await authRequest('/api/limitrss/my-shares/'+encodeURIComponent(feed.id),{method:'DELETE',body:JSON.stringify({revision:feed.revision})});if(token!==readToken())return;$('share-delete-dialog').close();selected=null;notice('deleted',true);diagnose('my_share_deleted',{durationMs:Math.round(performance.now()-started)});await load();}
 catch(error){const key=['conflict','not_found','unauthorized','rate_limited','network'].includes(error.message)?error.message:'unavailable';diagnose('my_share_delete_failed',{code:key,durationMs:Math.round(performance.now()-started)});
  if(key==='unauthorized'||!readToken()){signedOut(true);return;}
  if(key==='conflict'||key==='not_found'){$('share-delete-dialog').close();selected=null;notice(key);await load();}else deleteError=key;
 }finally{deleting=false;renderDialog();}
}
$('shares-search').onsubmit=event=>{event.preventDefault();page=1;notice('');load();};let timer;$('share-query').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{page=1;notice('');load();},300);};$('share-state').onchange=()=>{page=1;notice('');load();};
$('shares-previous').onclick=()=>{page--;load();};$('shares-next').onclick=()=>{page++;load();};$('shares-diagnostics').onclick=exportDiagnostics;
for(const id of ['share-delete-close','share-delete-cancel'])$(id).onclick=()=>{if(!deleting)$('share-delete-dialog').close();};$('share-delete-confirm').onclick=remove;$('share-delete-dialog').addEventListener('cancel',event=>{if(deleting)event.preventDefault();});
document.addEventListener('limitrss-language-change',event=>{language=event.detail==='en'?'en':'zh';render();renderDialog();});
document.addEventListener('plaza-account-session-ended',()=>signedOut(true));window.addEventListener('storage',event=>{if(event.key==='ls_auth_token'){selected=null;$('share-delete-dialog').close();page=1;load();}});
window.addEventListener('pagehide',()=>{generation++;controller?.abort();});window.addEventListener('pageshow',event=>{if(event.persisted)load();});
load();
