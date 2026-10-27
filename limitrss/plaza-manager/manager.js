import {feedLanguages,feedLanguageName} from '../plaza/feed-languages.js?v=20261013-language-fix';
const strings=globalThis.LimitRSSPlazaI18n.managerCopy;
const categories=['technology','development','news','gaming','culture','life','other'];
const $=id=>document.getElementById(id);let language='zh';try{language=localStorage.getItem('limitrss-language')||localStorage.getItem('plaza-language')||(navigator.language.startsWith('zh')?'zh':'en');}catch{}
let token;try{token=localStorage.getItem('ls_auth_token');}catch{}
let view='feeds',page=1,total=0,records=[],editing=null,confirming=null,requestGeneration=0,busy=false,noticeKey='';
const checking=new Set();
const t=(key,...args)=>typeof strings[language][key]==='function'?strings[language][key](...args):strings[language][key]??strings[language].unavailable;
function notice(key){noticeKey=key;$('message').textContent=key?t(key):'';}
function option(select,value,key){const n=document.createElement('option');n.value=value;n.textContent=t(key);select.append(n);}
function fillOptions(select,items){const value=select.value;select.replaceChildren();for(const [v,k]of items)option(select,v,k);select.value=value;}
function translate(){
 document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=`LimitRSS Plaza · ${t('heading')}`;
 document.querySelectorAll('[data-t]').forEach(n=>n.textContent=t(n.dataset.t));document.querySelectorAll('[data-label]').forEach(n=>n.setAttribute('aria-label',t(n.dataset.label)));document.querySelectorAll('[data-placeholder]').forEach(n=>n.placeholder=t(n.dataset.placeholder));
 fillOptions($('category'),[['','all'],...categories.map(k=>[k,k])]);fillOptions($('edit-category'),categories.map(k=>[k,k]));
 fillOptions($('state'),[['','all'],...['public','hidden','deleted','pending','healthy','degraded','failed','unknown'].map(k=>[k,k])]);
 const selected=$('edit-language').value;$('edit-language').replaceChildren();option($('edit-language'),'__choose__','chooseLanguage');$('edit-language').options[0].disabled=true;option($('edit-language'),'','untagged');for(const [code,zh,en]of feedLanguages){const n=document.createElement('option');n.value=code;n.textContent=language==='en'?en:zh;$('edit-language').append(n);}$('edit-language').value=selected;if($('edit-language').selectedIndex<0)$('edit-language').value='__choose__';
 window.updateNavLabels?.(language);notice(noticeKey);render();
 if(confirming)renderConfirmation();
}
function session(value){token=value;try{if(value)localStorage.setItem('ls_auth_token',value);else localStorage.removeItem('ls_auth_token');}catch{}}
async function api(path,options={}){
 let response;try{response=await fetch(path,{...options,cache:'no-store',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});}catch{throw Error('network');}
 let result;try{result=await response.json();}catch{throw Error('unavailable');}
 if(!response.ok){if(response.status===401){session(null);setAccess(false);}throw Error(result.error==='deleted'?'deletedError':result.error||'unavailable');}
 return result;
}
let captchaWidget=null,captchaLoading=false;
function initCaptcha(){
 if(captchaWidget!==null || captchaLoading)return;
 captchaLoading=true;
 const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
 script.onload=()=>{captchaLoading=false;try{captchaWidget=window.turnstile.render('.cf-turnstile',{sitekey:document.querySelector('.cf-turnstile').dataset.sitekey});}catch{notice('captcha_required');}};
 script.onerror=()=>{captchaLoading=false;notice('captcha_required');};document.head.append(script);
}
function setAccess(ok){$('login-panel').hidden=ok;$('workspace').hidden=!ok;$('logout').hidden=!token;if(ok)$('workspace').before($('message'));else{$('login-form').querySelector('[type=submit]').before($('message'));initCaptcha();}}
function cell(row,value,className){const c=document.createElement('td');c.textContent=value??'';if(className)c.className=className;row.append(c);return c;}
function actionButton(container,label,handler,danger=false){const b=document.createElement('button');b.type='button';b.className='row-action'+(danger?' danger':'');b.textContent=t(label);b.addEventListener('click',handler);container.append(b);return b;}
function render(){
 const keys=view==='feeds'?['feeds','category','language','visibility','actions']:['time','actor','action','feeds','actions'];
 const head=document.createElement('tr');keys.forEach(k=>{const th=document.createElement('th');th.scope='col';th.textContent=t(k);head.append(th);});$('table-head').replaceChildren(head);$('rows').replaceChildren();
 $('list-title').textContent=t(view==='feeds'?'feeds':'audit');$('summary').textContent=t('count',total);$('page').textContent=t('page',page);$('previous').disabled=page<=1||busy;$('next').disabled=page*30>=total||busy;
 for(const record of records){const tr=document.createElement('tr');
  if(view==='feeds'){
   const c=cell(tr,'');const name=document.createElement('span');name.className='feed-title';name.textContent=record.title;name.title=record.title;const address=document.createElement('span');address.className='feed-url';address.textContent=record.url;address.title=record.url;c.append(name,address);
   cell(tr,t(record.category));cell(tr,feedLanguageName(record.language,language));
   const state=record.deleted_at?'deleted':record.hidden?'hidden':!record.published?'pending':record.status;const s=cell(tr,'');const badge=document.createElement('span');badge.className='state-badge '+state;badge.textContent=t(state);const statusWrap=document.createElement('div');statusWrap.className='status-actions';statusWrap.append(badge);s.append(statusWrap);
   if(!record.deleted_at){const button=actionButton(statusWrap,checking.has(record.id)?'checking':'recheck',()=>recheck(record));button.disabled=checking.has(record.id)||record.url.startsWith('rsshub://');if(record.url.startsWith('rsshub://'))button.title=t('unsupported_feed');}
   const actions=cell(tr,'');const wrap=document.createElement('div');wrap.className='row-actions';actions.append(wrap);
   if(record.deleted_at)actionButton(wrap,'restore',()=>confirmAction(record,'restore'));
   else {actionButton(wrap,'edit',()=>edit(record));actionButton(wrap,record.hidden?'show':'hide',()=>confirmAction(record,record.hidden?'show':'hide'));actionButton(wrap,'delete',()=>confirmAction(record,'delete'),true);}
  }else{
   cell(tr,new Date(record.created_at).toLocaleString(language==='zh'?'zh-CN':'en'));cell(tr,record.actor||'');cell(tr,t(record.action));let after={};try{after=JSON.parse(record.after_json);}catch{}cell(tr,after.title||'');const c=cell(tr,'');actionButton(c,'details',()=>auditDetails(record));
  }
  $('rows').append(tr);
 }
 if(!records.length){const tr=document.createElement('tr');const c=cell(tr,busy?t('loading'):t('empty'),'empty-cell');c.colSpan=keys.length;$('rows').append(tr);}
}
async function recheck(record){
 if(checking.has(record.id))return;checking.add(record.id);notice('');render();
 try{const result=await api(`/api/limitrss/plaza-manager/${record.id}/recheck`,{method:'POST',body:JSON.stringify({revision:record.revision})});notice(result.status==='healthy'?'rechecked':'checkFailed');await load();}
 catch(error){notice(error.message);}finally{checking.delete(record.id);render();}
}
async function load(){const generation=++requestGeneration;busy=true;render();try{
 const q=new URLSearchParams({page});if(view==='feeds'){q.set('q',$('search').value);q.set('category',$('category').value);q.set('state',$('state').value);}
 const result=await api(`/api/limitrss/plaza-manager${view==='audit'?'/audit':''}?${q}`);
 if(generation!==requestGeneration)return;records=view==='feeds'?result.feeds:result.entries;total=result.total;setAccess(true);
 if(page>1&&!records.length){page--;busy=false;return load();}
 }catch(error){if(generation!==requestGeneration)return;if(error.message==='forbidden')setAccess(false);notice(error.message);}finally{if(generation===requestGeneration){busy=false;render();}}
}
function edit(record){editing=record;const form=$('edit-form');for(const key of ['title','url','icon','category','language'])form.elements[key].value=record[key]??'';if($('edit-language').selectedIndex<0)$('edit-language').value='__choose__';$('edit-message').textContent='';$('editor').showModal();}
function confirmAction(record,action){confirming={record,action};$('confirm-message').textContent='';renderConfirmation();$('confirm').showModal();}
function renderConfirmation(){const {record,action}=confirming;$('confirm-title').textContent=t('confirmHeading',t(action));$('confirm-description').textContent=`${record.title} — ${t(action==='delete'?'deletedHint':action==='hide'?'hiddenHint':action==='restore'?'restoreHint':'showHint')}`;}
async function mutate(record,action,patch={}){await api(`/api/limitrss/plaza-manager/${record.id}`,{method:'PATCH',body:JSON.stringify({revision:record.revision,action,...patch})});notice('saved');await load();}
$('edit-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;button.textContent=t('saveBusy');$('edit-message').textContent='';try{if($('edit-language').selectedIndex<0 || $('edit-language').value==='__choose__')throw Error('invalid_language');const values=Object.fromEntries(new FormData(event.target));values.language=values.language.trim()||null;await mutate(editing,'edit',values);$('editor').close();}catch(error){$('edit-message').textContent=t(error.message);}finally{button.disabled=false;button.textContent=t('save');}});
$('confirm-action').addEventListener('click',async()=>{const button=$('confirm-action');button.disabled=true;try{await mutate(confirming.record,confirming.action);$('confirm').close();}catch(error){$('confirm-message').textContent=t(error.message);}finally{button.disabled=false;}});
function auditDetails(record){$('audit-content').replaceChildren();let before={},after={};try{before=JSON.parse(record.before_json);after=JSON.parse(record.after_json);}catch{}
 for(const [key,label]of [['title','title'],['url','address'],['icon','icon'],['category','category'],['language','language'],['hidden','visibility'],['deleted_at','delete']]){
  if((before[key]??null)===(after[key]??null))continue;const div=document.createElement('div');div.className='diff-field';const name=document.createElement('strong');name.textContent=t(label);const from=document.createElement('div');from.className='diff-before';const to=document.createElement('div');to.className='diff-after';
  const format=v=>key==='language'?feedLanguageName(v,language):key==='category'?t(v):key==='hidden'?t(v?'hidden':'public'):key==='deleted_at'?t(v?'deleted':'restore'):v||t('untagged');from.textContent=format(before[key]);to.textContent=format(after[key]);div.append(name,from,to);$('audit-content').append(div);
 }
 if(!$('audit-content').childElementCount)$('audit-content').textContent=t('noChanges');$('audit-detail').showModal();
}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
$('filters').addEventListener('submit',e=>{e.preventDefault();page=1;notice('');load();});
for(const id of ['category','state'])$(id).addEventListener('change',()=>{page=1;load();});
for(const [id,v]of [['feeds-tab','feeds'],['audit-tab','audit']])$(id).addEventListener('click',()=>{view=v;page=1;records=[];$('filters').hidden=v==='audit';$('feeds-tab').setAttribute('aria-pressed',String(v==='feeds'));$('audit-tab').setAttribute('aria-pressed',String(v==='audit'));notice('');load();});
$('previous').addEventListener('click',()=>{page--;load();});$('next').addEventListener('click',()=>{page++;load();});$('refresh').addEventListener('click',()=>{notice('');load();});
$('login-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;button.textContent=t('loginBusy');try{const body=Object.fromEntries(new FormData(event.target));body.turnstileToken=(captchaWidget!==null?window.turnstile?.getResponse(captchaWidget):'')||'';const result=await api('/api/auth/login',{method:'POST',body:JSON.stringify(body)});session(result.token);event.target.elements.password.value='';notice('');page=1;await load();}catch(error){notice(error.message);}finally{button.disabled=false;button.textContent=t('login');if(captchaWidget!==null)window.turnstile?.reset(captchaWidget);}});
$('logout').addEventListener('click',async()=>{try{await api('/api/auth/logout',{method:'POST'});}catch{}session(null);records=[];total=0;requestGeneration++;setAccess(false);notice('');});
document.addEventListener('limitrss-language-change',e=>{language=e.detail==='en'?'en':'zh';translate();});
translate();if(token){$('login-panel').hidden=true;load();}else setAccess(false);
