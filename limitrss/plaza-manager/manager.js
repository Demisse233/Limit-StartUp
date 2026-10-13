const strings={
 zh:{heading:'订阅源管理',intro:'编辑与管理社区分享的订阅源，保存后立即生效。',home:'官网首页',plaza:'广场',logout:'退出登录',loginHeading:'管理员登录',loginIntro:'使用已授权的官网账号登录。',email:'邮箱',password:'密码',login:'登录',feeds:'订阅源',audit:'操作记录',views:'管理视图',refresh:'刷新',search:'搜索',searchHint:'名称或订阅地址',category:'分类',visibility:'状态',all:'全部',title:'名称',address:'订阅地址',language:'语言',languageHint:'未标注；如 zh、en、ja',icon:'图标地址',actions:'操作',public:'公开',hidden:'已下架',deleted:'已删除',pending:'待检测',healthy:'正常',degraded:'暂时异常',failed:'不可用',unknown:'未检测',edit:'编辑',hide:'下架',show:'上架',delete:'删除',restore:'恢复',previous:'上一页',next:'下一页',editHeading:'编辑订阅源',editHint:'分类和语言不会被自动检测覆盖。修改订阅地址后将重新检测。',cancel:'取消',save:'保存',confirm:'确认',close:'关闭',loading:'加载中…',empty:'没有符合条件的记录',saved:'已保存，公开目录的下次请求将使用最新数据。',deletedHint:'删除后将从公开广场移除，可在“已删除”列表恢复。',hiddenHint:'下架后将从公开广场移除，可随时重新上架。',restoreHint:'恢复后保持下架，可检查内容后再上架。',showHint:'已通过检测的订阅源将重新公开；待检测的来源需要先通过检测。',unauthorized:'请登录管理员账号。',forbidden:'此账号没有管理权限，请切换为已授权的账号。',unavailable:'服务暂时不可用，请稍后重试。',network:'网络连接失败，请重试。',conflict:'记录已被修改，请刷新列表后重试。',deletedError:'记录已被删除，请刷新列表。',not_found:'记录不存在，请刷新列表。',duplicate_url:'此订阅地址已存在，未保存修改。',invalid_input:'请检查填写内容。',invalid_title:'请填写不超过 200 字的名称。',invalid_url:'请填写有效的公开订阅或图标地址。',invalid_category:'请选择有效分类。',invalid_language:'请填写语言代码，例如 zh、en 或 zh-cn。',captcha_required:'请完成人机验证后重试。',invalid_credentials:'邮箱或密码错误。',rate_limited:'操作过于频繁，请稍后再试。',loginBusy:'正在登录…',saveBusy:'正在保存…',count:n=>`共 ${n} 条`,page:n=>`第 ${n} 页`,technology:'科技',development:'开发',news:'新闻',gaming:'游戏',culture:'文化',life:'生活',other:'其他',untagged:'未标注',actor:'操作人',action:'操作',time:'时间',details:'详情',auditDetail:'修改详情',noChanges:'没有字段变化',confirmHeading:a=>`确认${a}？`},
 en:{heading:'Feed management',intro:'Manage community feeds. Saved changes take effect immediately.',home:'Website',plaza:'Plaza',logout:'Sign out',loginHeading:'Administrator sign in',loginIntro:'Sign in with an authorized website account.',email:'Email',password:'Password',login:'Sign in',feeds:'Feeds',audit:'Activity',views:'Management views',refresh:'Refresh',search:'Search',searchHint:'Name or feed address',category:'Category',visibility:'State',all:'All',title:'Name',address:'Feed address',language:'Language',languageHint:'Unspecified; e.g. zh, en, ja',icon:'Icon address',actions:'Actions',public:'Public',hidden:'Hidden',deleted:'Deleted',pending:'Pending',healthy:'Healthy',degraded:'Degraded',failed:'Unavailable',unknown:'Unchecked',edit:'Edit',hide:'Hide',show:'Publish',delete:'Delete',restore:'Restore',previous:'Previous',next:'Next',editHeading:'Edit feed',editHint:'Checks preserve your category and language. Changing the feed address triggers a new check.',cancel:'Cancel',save:'Save',confirm:'Confirm',close:'Close',loading:'Loading…',empty:'No matching records',saved:'Saved. The next public directory request will use the latest data.',deletedHint:'This feed will be removed from Plaza. You can restore it from the Deleted list.',hiddenHint:'This feed will be hidden from Plaza. You can publish it again at any time.',restoreHint:'The restored feed stays hidden until you review and publish it.',showHint:'Checked feeds will become public again. Pending feeds must pass a check first.',unauthorized:'Please sign in as an administrator.',forbidden:'This account has no management access. Switch to an authorized account.',unavailable:'Service unavailable. Please try again later.',network:'Connection failed. Please try again.',conflict:'This record has changed. Refresh the list and try again.',deletedError:'This record was deleted. Refresh the list.',not_found:'Record not found. Refresh the list.',duplicate_url:'This feed address already exists. Your changes were not saved.',invalid_input:'Please check the entered values.',invalid_title:'Enter a name of up to 200 characters.',invalid_url:'Enter a valid public feed or icon address.',invalid_category:'Choose a valid category.',invalid_language:'Enter a language code such as zh, en or zh-cn.',captcha_required:'Complete the verification and try again.',invalid_credentials:'Incorrect email or password.',rate_limited:'Too many requests. Please try again later.',loginBusy:'Signing in…',saveBusy:'Saving…',count:n=>`${n} records`,page:n=>`Page ${n}`,technology:'Technology',development:'Development',news:'News',gaming:'Gaming',culture:'Culture',life:'Life',other:'Other',untagged:'Unspecified',actor:'Administrator',action:'Action',time:'Time',details:'Details',auditDetail:'Change details',noChanges:'No field changes',confirmHeading:a=>`Confirm ${a.toLowerCase()}?`}
};
const categories=['technology','development','news','gaming','culture','life','other'];
const $=id=>document.getElementById(id);let language='zh';try{language=localStorage.getItem('limitrss-language')||localStorage.getItem('plaza-language')||(navigator.language.startsWith('zh')?'zh':'en');}catch{}
let token;try{token=localStorage.getItem('ls_auth_token');}catch{}
let view='feeds',page=1,total=0,records=[],editing=null,confirming=null,requestGeneration=0,busy=false,noticeKey='';
const t=(key,...args)=>typeof strings[language][key]==='function'?strings[language][key](...args):strings[language][key]??strings[language].unavailable;
function notice(key){noticeKey=key;$('message').textContent=key?t(key):'';}
function option(select,value,key){const n=document.createElement('option');n.value=value;n.textContent=t(key);select.append(n);}
function fillOptions(select,items){const value=select.value;select.replaceChildren();for(const [v,k]of items)option(select,v,k);select.value=value;}
function translate(){
 document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=`LimitRSS Plaza · ${t('heading')}`;
 document.querySelectorAll('[data-t]').forEach(n=>n.textContent=t(n.dataset.t));document.querySelectorAll('[data-label]').forEach(n=>n.setAttribute('aria-label',t(n.dataset.label)));document.querySelectorAll('[data-placeholder]').forEach(n=>n.placeholder=t(n.dataset.placeholder));
 fillOptions($('category'),[['','all'],...categories.map(k=>[k,k])]);fillOptions($('edit-category'),categories.map(k=>[k,k]));
 fillOptions($('state'),[['','all'],...['public','hidden','deleted','pending','healthy','degraded','failed','unknown'].map(k=>[k,k])]);
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
function setAccess(ok){$('login-panel').hidden=ok;$('workspace').hidden=!ok;$('logout').hidden=!token;if(!ok)initCaptcha();}
function cell(row,value,className){const c=document.createElement('td');c.textContent=value??'';if(className)c.className=className;row.append(c);return c;}
function actionButton(container,label,handler,danger=false){const b=document.createElement('button');b.type='button';b.className='row-action'+(danger?' danger':'');b.textContent=t(label);b.addEventListener('click',handler);container.append(b);}
function render(){
 const keys=view==='feeds'?['feeds','category','language','visibility','actions']:['time','actor','action','feeds','actions'];
 const head=document.createElement('tr');keys.forEach(k=>{const th=document.createElement('th');th.scope='col';th.textContent=t(k);head.append(th);});$('table-head').replaceChildren(head);$('rows').replaceChildren();
 $('list-title').textContent=t(view==='feeds'?'feeds':'audit');$('summary').textContent=t('count',total);$('page').textContent=t('page',page);$('previous').disabled=page<=1||busy;$('next').disabled=page*30>=total||busy;
 for(const record of records){const tr=document.createElement('tr');
  if(view==='feeds'){
   const c=cell(tr,'');const name=document.createElement('span');name.className='feed-title';name.textContent=record.title;name.title=record.title;const address=document.createElement('span');address.className='feed-url';address.textContent=record.url;address.title=record.url;c.append(name,address);
   cell(tr,t(record.category));cell(tr,record.language||t('untagged'));
   const state=record.deleted_at?'deleted':record.hidden?'hidden':!record.published?'pending':record.status;const s=cell(tr,'');const badge=document.createElement('span');badge.className='state-badge '+state;badge.textContent=t(state);s.append(badge);
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
async function load(){const generation=++requestGeneration;busy=true;render();try{
 const q=new URLSearchParams({page});if(view==='feeds'){q.set('q',$('search').value);q.set('category',$('category').value);q.set('state',$('state').value);}
 const result=await api(`/api/limitrss/plaza-manager${view==='audit'?'/audit':''}?${q}`);
 if(generation!==requestGeneration)return;records=view==='feeds'?result.feeds:result.entries;total=result.total;setAccess(true);
 if(page>1&&!records.length){page--;busy=false;return load();}
 }catch(error){if(generation!==requestGeneration)return;if(error.message==='forbidden')setAccess(false);notice(error.message);}finally{if(generation===requestGeneration){busy=false;render();}}
}
function edit(record){editing=record;const form=$('edit-form');for(const key of ['title','url','icon','category','language'])form.elements[key].value=record[key]??'';$('edit-message').textContent='';$('editor').showModal();}
function confirmAction(record,action){confirming={record,action};$('confirm-message').textContent='';renderConfirmation();$('confirm').showModal();}
function renderConfirmation(){const {record,action}=confirming;$('confirm-title').textContent=t('confirmHeading',t(action));$('confirm-description').textContent=`${record.title} — ${t(action==='delete'?'deletedHint':action==='hide'?'hiddenHint':action==='restore'?'restoreHint':'showHint')}`;}
async function mutate(record,action,patch={}){await api(`/api/limitrss/plaza-manager/${record.id}`,{method:'PATCH',body:JSON.stringify({revision:record.revision,action,...patch})});notice('saved');await load();}
$('edit-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;button.textContent=t('saveBusy');$('edit-message').textContent='';try{const values=Object.fromEntries(new FormData(event.target));values.language=values.language.trim()||null;await mutate(editing,'edit',values);$('editor').close();}catch(error){$('edit-message').textContent=t(error.message);}finally{button.disabled=false;button.textContent=t('save');}});
$('confirm-action').addEventListener('click',async()=>{const button=$('confirm-action');button.disabled=true;try{await mutate(confirming.record,confirming.action);$('confirm').close();}catch(error){$('confirm-message').textContent=t(error.message);}finally{button.disabled=false;}});
function auditDetails(record){$('audit-content').replaceChildren();let before={},after={};try{before=JSON.parse(record.before_json);after=JSON.parse(record.after_json);}catch{}
 for(const [key,label]of [['title','title'],['url','address'],['icon','icon'],['category','category'],['language','language'],['hidden','visibility'],['deleted_at','delete']]){
  if((before[key]??null)===(after[key]??null))continue;const div=document.createElement('div');div.className='diff-field';const name=document.createElement('strong');name.textContent=t(label);const from=document.createElement('div');from.className='diff-before';const to=document.createElement('div');to.className='diff-after';
  const format=v=>key==='category'?t(v):key==='hidden'?t(v?'hidden':'public'):key==='deleted_at'?t(v?'deleted':'restore'):v||t('untagged');from.textContent=format(before[key]);to.textContent=format(after[key]);div.append(name,from,to);$('audit-content').append(div);
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
