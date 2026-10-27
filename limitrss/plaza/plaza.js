import {pageNumbers} from './pagination.js';
import {setupShare} from './share.js';
import {diagnose} from './diagnostics.js';
import {feedLanguageName} from './feed-languages.js?v=20261013-language-fix';
import {setFeedIcon} from './feed-icon.js';
try { document.documentElement.dataset.theme = localStorage.getItem('limitrss-theme') || 'auto'; } catch {}
const copy=globalThis.LimitRSSPlazaI18n.copy;
let language=localStorage.getItem('limitrss-language')||localStorage.getItem('plaza-language')||(navigator.language.startsWith('zh')?'zh':'en');if(!copy[language])language='en';let page=1,pageSize=10,total=0,request,sequence=0,statsSequence=0;
const $=id=>document.getElementById(id),t=key=>copy[language][key];
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
async function load(){
 request?.abort();request=new AbortController();const current=++sequence,started=performance.now();
 $('summary').textContent=t('loading');
 const table=document.querySelector('.feed-table');table.setAttribute('aria-busy','true');
 const loadingRow=element('tr'),loadingCell=element('td',undefined,'table-state'),loading=element('div',undefined,'table-loading'),spinner=element('span',undefined,'loading-spinner');
 loadingCell.colSpan=8;spinner.setAttribute('aria-hidden','true');loading.setAttribute('role','status');loading.append(spinner,element('span',t('loading')));loadingCell.append(loading);loadingRow.append(loadingCell);$('list').replaceChildren(loadingRow);
 $('previous').disabled=$('next').disabled=true;
 try{
  const params=new URLSearchParams({page,pageSize,q:$('search').value,category:$('category').value,status:$('status').value});
  const response=await fetch(`/api/limitrss/plaza?${params}`,{signal:request.signal});
  if(!response.ok)throw Error('HTTP');const data=await response.json();
  if(!Array.isArray(data.feeds)||!Number.isInteger(data.total))throw Error('Schema');
  if(current!==sequence)return;total=data.total;page=data.page;pageSize=data.pageSize;
  $('summary').textContent=total?t('count')(total):t('empty');$('list').replaceChildren(...data.feeds.map(render));
  renderPagination();diagnose('directory_loaded',{page,count:data.feeds.length,durationMs:Math.round(performance.now()-started)});
 }catch(error){
  if(error.name==='AbortError'||current!==sequence)return;
  diagnose('directory_failed',{durationMs:Math.round(performance.now()-started)});$('page').replaceChildren();$('page-range').textContent='';$('summary').textContent=t('error');const retry=element('button',t('retry'));retry.onclick=load;
  const row=element('tr'),cell=element('td',undefined,'table-state');cell.colSpan=8;cell.append(retry);row.append(cell);$('list').replaceChildren(row);
  $('previous').disabled=$('next').disabled=true;
 }finally{if(current===sequence)table.setAttribute('aria-busy','false');}
}

function languageName(code) {return feedLanguageName(code,language);}
async function recordInteraction(feed,action,heat) {
 try {
  const response=await fetch(`/api/limitrss/plaza/${encodeURIComponent(feed.id)}/interaction`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action}),keepalive:true});
  if(!response.ok)throw Error('interaction_failed');
  const data=await response.json();
  if(Number.isSafeInteger(data.popularity))heat.textContent=data.popularity.toLocaleString(language);
  diagnose('interaction_recorded',{status:response.status});void loadStats();
 }catch{diagnose('interaction_failed');}
}
function render(feed) {
 const rsshub=feed.sourceType==='rsshub'||/^rsshub:\/\//i.test(feed.url);
 const row=element('tr',undefined,'feed');
 const source=element('td'),identity=element('div',undefined,'feed-source');
 const image=element('img',undefined,'icon');image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';setFeedIcon(image,feed);
 const name=element('div',undefined,'feed-name');name.append(element('h3',feed.title,'feed-title'));
 if(rsshub){const badge=element('span',undefined,'rsshub-badge');badge.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" style="border-radius:31.82%;overflow:hidden"><rect width="24" height="24" fill="#ffd6a6"/><circle cx="5.781" cy="18.218" r="13.309" fill="#ff8549"/><circle cx="5.727" cy="18.273" r="4.964" fill="#ff2900"/></svg>';badge.append(document.createTextNode('RSSHub'));name.append(badge);}
 identity.append(image,name);source.append(identity);
 const addressCell=element('td'),address=element('a',feed.url,'url');address.href=feed.url.startsWith('rsshub://')?feed.url.replace('rsshub://','https://rsshub.rssforever.com/'):feed.url;address.title=feed.url;address.target='_blank';address.rel='noopener noreferrer';const addressGroup=element('div',undefined,'feed-address');addressGroup.append(address);addressCell.append(addressGroup);
 const category=element('td',t(feed.category)||t('other'));
 const feedLanguage=element('td',languageName(feed.language),'feed-language');
 const heatCell=element('td'),badge=element('span',undefined,'feed-popularity'),heat=element('span',Number(feed.popularity||0).toLocaleString(language));badge.title=t('popularityHint');badge.innerHTML='<svg viewBox="0 0 81.3477 114.502" aria-hidden="true" focusable="false"><path d="M38.3789 105.615C64.1602 105.615 81.3477 88.1836 81.3477 61.9141C81.3477 18.2129 44.1406 0 18.3105 0C13.7207 0 10.791 1.61133 10.791 4.73633C10.791 5.95703 11.3281 7.22656 12.3535 8.39844C18.1641 15.332 23.9746 23.584 24.0723 33.2031C24.0723 35.4004 23.8281 37.3535 22.2656 40.0879L24.707 39.5996C22.5098 32.4219 16.6016 27.3438 11.4258 27.3438C9.42383 27.3438 8.05664 28.8086 8.05664 31.0059C8.05664 32.2754 8.39844 35.2539 8.39844 37.4023C8.39844 48.3398 0 54.7363 0 72.3633C0 92.334 15.2832 105.615 38.3789 105.615ZM39.502 91.8945C30.3711 91.8945 24.3164 86.377 24.3164 78.1738C24.3164 69.5801 30.4199 66.5039 31.2012 60.9863C31.2988 60.5469 31.5918 60.4004 31.9336 60.6934C34.1797 62.6953 35.6445 65.1367 36.8652 67.9688C39.4531 64.4531 40.6738 57.0312 39.8438 49.0234C39.7949 48.584 40.0879 48.3398 40.5273 48.4863C51.2207 53.5156 56.7871 64.1602 56.7871 73.6816C56.7871 83.3496 51.123 91.8945 39.502 91.8945Z" fill="currentColor"/></svg>';badge.append(heat);heatCell.append(badge);
 const status=rsshub?'unknown':feed.status;
 const health=element('td'),healthGroup=element('div',undefined,'health-group');healthGroup.append(element('span',t(status)||t('unknown'),`health-label ${status}`));health.append(healthGroup);
 if(rsshub){const help=element('button',undefined,'status-help');help.type='button';help.setAttribute('aria-label',t('rsshubNote'));help.title=t('rsshubNote');help.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></svg>';const tip=element('span',t('rsshubNote'),'status-tooltip');tip.id='rsshub-note-'+feed.id;tip.setAttribute('role','tooltip');help.setAttribute('aria-describedby',tip.id);const position=()=>{const rect=help.getBoundingClientRect();tip.style.left=Math.max(18,Math.min(rect.left,innerWidth-318))+'px';tip.style.top=Math.max(12,rect.top-115)+'px';};help.onmouseenter=help.onfocus=position;help.onclick=()=>{position();help.classList.toggle('is-open');};help.append(tip);healthGroup.append(help);}
 if(!rsshub&&feed.checkedAt){
  const date=new Date(feed.checkedAt);
  if(!Number.isNaN(date.getTime())){
   const locale=language==='zh'?'zh-CN':'en';
   const checked=element('time',new Intl.DateTimeFormat(locale,{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date),'checked');
   checked.dateTime=date.toISOString();checked.title=`${t('checked')} ${date.toLocaleString(locale)}`;checked.setAttribute('aria-label',checked.title);health.append(checked);
  }
 }
 const actionCell=element('td'),actions=element('div',undefined,'row-actions');
 const launch=element('a',t('import'),'action');launch.href=`limitrss://plaza/import?id=${encodeURIComponent(feed.id)}`;launch.onclick=()=>{$('summary').textContent=t('openHint');void recordInteraction(feed,'import',heat);};
 const clipboard=element('button',undefined,'address-icon copy-button');clipboard.type='button';clipboard.title=t('copy');clipboard.setAttribute('aria-label',t('copy'));
 clipboard.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
 clipboard.onclick=async()=>{try{await navigator.clipboard.writeText(feed.url);void recordInteraction(feed,'copy',heat);clipboard.classList.add('is-copied');clipboard.title=t('copied');clipboard.setAttribute('aria-label',t('copied'));$('summary').textContent=t('copied');setTimeout(()=>{clipboard.classList.remove('is-copied');clipboard.title=t('copy');clipboard.setAttribute('aria-label',t('copy'));},2000);}catch{$('summary').textContent=t('copyFailed');}};
 const visit=element('a',undefined,'address-icon visit-button');visit.href=new URL(address.href).origin;visit.target='_blank';visit.rel='noopener noreferrer';visit.title=t('visit');visit.setAttribute('aria-label',t('visit'));
 visit.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3 10 14"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg>';
 addressGroup.append(clipboard,visit);
 actions.append(launch);actionCell.append(actions);const sharer=element('td'),person=element('div',undefined,'feed-sharer'),avatar=element('span',undefined,'sharer-avatar'),nickname=feed.sharer?.nickname||t('anonymous');avatar.textContent=Array.from(nickname)[0];avatar.setAttribute('aria-hidden','true');if(feed.sharer?.avatarUrl){const img=element('img');img.alt='';img.loading='lazy';img.src=feed.sharer.avatarUrl;img.onerror=()=>img.remove();avatar.append(img);}person.append(avatar,element('span',nickname,'sharer-name'));person.title=nickname;sharer.append(person);row.append(source,addressCell,category,feedLanguage,health,heatCell,sharer,actionCell);return row;
}
let timer;$('search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{page=1;load();},300);});for(const id of ['category','status'])$(id).onchange=()=>{page=1;load();};$('previous').onclick=()=>{page--;load();};$('next').onclick=()=>{page++;load();};document.addEventListener('limitrss-language-change',event=>{language=event.detail;sharing.localize();load();loadStats();});
document.addEventListener('plaza-account-updated',()=>{load();loadStats();});
$('page-size').onchange=()=>{pageSize=Number($('page-size').value);page=1;load();};$('stats-retry').onclick=loadStats;
const sharing=setupShare({t,onShared:()=>{load();loadStats();}});load();loadStats();

function renderPagination(){
 const pages=Math.max(1,Math.ceil(total/pageSize));$('previous').disabled=page===1;$('next').disabled=page>=pages;
 $('page-range').textContent=t('pageRange')(total?(page-1)*pageSize+1:0,Math.min(page*pageSize,total),total);
 $('page').replaceChildren(...pageNumbers(page,pages).map(value=>{if(value==='…')return element('span','…');const button=element('button',String(value));button.type='button';button.setAttribute('aria-label',t('pageLabel')(value));if(value===page)button.setAttribute('aria-current','page');button.onclick=()=>{page=value;load();};return button;}));
}
async function loadStats(){const current=++statsSequence,started=performance.now();try{const response=await fetch('/api/limitrss/plaza/stats',{cache:'no-store'});if(!response.ok)throw Error('HTTP');const data=await response.json();if(!Number.isSafeInteger(data.contributors)||!Number.isSafeInteger(data.totalUses)||!Number.isSafeInteger(data.totalFeeds))throw Error('Schema');if(current!==statsSequence)return;$('contributors').textContent=data.contributors.toLocaleString(language);$('total-uses').textContent=data.totalUses.toLocaleString(language);$('total-feeds').textContent=data.totalFeeds.toLocaleString(language);$('stats-retry').hidden=true;diagnose('stats_loaded',{durationMs:Math.round(performance.now()-started)});}catch{if(current!==statsSequence)return;$('stats-retry').hidden=false;diagnose('stats_failed',{durationMs:Math.round(performance.now()-started)});}}
