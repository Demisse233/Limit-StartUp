try { document.documentElement.dataset.theme = localStorage.getItem('limitrss-theme') || 'auto'; } catch {}
const copy={zh:{home:'官网首页',downloadNav:'下载',directory:'订阅源目录',source:'订阅源',feedLanguage:'语言',popularity:'热度',unknownLanguage:'未标注',popularityHint:'成功复制次数与导入点击次数之和',address:'订阅地址',actions:'操作',scrollHint:'左右滑动查看完整表格',heading:'发现值得订阅的内容',intro:'由社区分享的 RSS 订阅源，找到喜欢的内容，一键导入 LimitRSS。',searchLabel:'搜索',category:'分类',status:'检测状态',notice:'检测结果来自 Plaza 服务器，与你本地网络的可用性可能不同。订阅源定期分批检测。',previous:'上一页',next:'下一页',contributeTitle:'一起丰富 Plaza',contribute:'在 LimitRSS 的订阅源菜单中选择“分享至 LimitRSS Plaza”。普通订阅源通过检测后公开展示；RSSHub 订阅源以未知状态展示。',download:'下载 LimitRSS',footer:'请仅分享适合公开访问的订阅源。',all:'全部',technology:'科技',development:'开发',news:'新闻',gaming:'游戏',culture:'文化',life:'生活',other:'其他',unknown:'未知',rsshubNote:'RSSHub 订阅源的检测状态依据RSSHub 官网和各第三方实例实际测试为准，LimitRSS Plaza 无法对其进行可用状态检测。',healthy:'可用',degraded:'暂时异常',failed:'连续失败',import:'导入 LimitRSS',visit:'访问源站',copy:'复制地址',copied:'已复制',copyFailed:'复制失败，请手动复制地址',loading:'正在加载订阅源…',empty:'没有找到符合条件的订阅源。',error:'暂时无法加载，请重试。',retry:'重试',checked:'检测于',count:n=>`${n} 个订阅源`,openHint:'浏览器可能询问是否打开 LimitRSS。未安装时，请下载客户端或复制订阅地址。'},en:{home:'Home',downloadNav:'Download',directory:'Feed directory',source:'Feed',feedLanguage:'Language',popularity:'Popularity',unknownLanguage:'Unspecified',popularityHint:'Successful copies plus import clicks',address:'Feed URL',actions:'Actions',scrollHint:'Scroll sideways to view the full table',heading:'Discover your next great feed',intro:'RSS feeds shared by the community. Find something you love and import it into LimitRSS.',searchLabel:'Search',category:'Category',status:'Health',notice:'Checks run on the Plaza server; availability on your local network may differ. Feeds are checked periodically in batches.',previous:'Previous',next:'Next',contributeTitle:'Help Plaza grow',contribute:'Choose “Share to LimitRSS Plaza” from a feed menu in LimitRSS. Regular feeds become public after a successful check; RSSHub feeds are listed with unknown availability.',download:'Download LimitRSS',footer:'Only share feeds suitable for public access.',all:'All',technology:'Technology',development:'Development',news:'News',gaming:'Gaming',culture:'Culture',life:'Lifestyle',other:'Other',unknown:'Unknown',rsshubNote:'RSSHub feed availability depends on actual tests on the official RSSHub website and each third-party instance. LimitRSS Plaza cannot check the availability of these feeds.',healthy:'Available',degraded:'Temporary issue',failed:'Repeated failures',import:'Import into LimitRSS',visit:'Visit website',copy:'Copy URL',copied:'Copied',copyFailed:'Could not copy. Please copy the URL manually.',loading:'Loading feeds…',empty:'No matching feeds found.',error:'Could not load feeds. Please try again.',retry:'Retry',checked:'Checked',count:n=>`${n} ${n===1?'feed':'feeds'}`,openHint:'Your browser may ask to open LimitRSS. If it is not installed, download the app or copy the feed URL.'}};
let language=localStorage.getItem('limitrss-language')||localStorage.getItem('plaza-language')||(navigator.language.startsWith('zh')?'zh':'en');if(!copy[language])language='en';let page=1,total=0,request,sequence=0;
const $=id=>document.getElementById(id),t=key=>copy[language][key];
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function localize(){document.documentElement.lang=language==='zh'?'zh-CN':'en';document.querySelectorAll('[data-t]').forEach(el=>el.textContent=t(el.dataset.t));window.updateNavLabels?.(language);for(const [id,keys] of [['category',['','technology','development','news','gaming','culture','life','other']],['status',['','healthy','degraded','failed','unknown']]]){const previous=$(id).value;$(id).replaceChildren(...keys.map(key=>{const option=element('option',t(key||'all'));option.value=key;return option;}));$(id).value=previous;}}
async function load(){
 request?.abort();request=new AbortController();const current=++sequence;
 $('summary').textContent=t('loading');
 const table=document.querySelector('.feed-table');table.setAttribute('aria-busy','true');
 const loadingRow=element('tr'),loadingCell=element('td',undefined,'table-state'),loading=element('div',undefined,'table-loading'),spinner=element('span',undefined,'loading-spinner');
 loadingCell.colSpan=7;spinner.setAttribute('aria-hidden','true');loading.setAttribute('role','status');loading.append(spinner,element('span',t('loading')));loadingCell.append(loading);loadingRow.append(loadingCell);$('list').replaceChildren(loadingRow);
 $('previous').disabled=$('next').disabled=true;
 try{
  const params=new URLSearchParams({page,q:$('search').value,category:$('category').value,status:$('status').value});
  const response=await fetch(`/api/limitrss/plaza?${params}`,{signal:request.signal});
  if(!response.ok)throw Error('HTTP');const data=await response.json();
  if(!Array.isArray(data.feeds)||!Number.isInteger(data.total))throw Error('Schema');
  if(current!==sequence)return;total=data.total;
  $('summary').textContent=total?t('count')(total):t('empty');$('list').replaceChildren(...data.feeds.map(render));
  $('page').textContent=`${page} / ${Math.max(1,Math.ceil(total/30))}`;$('previous').disabled=page===1;$('next').disabled=page*30>=total;
 }catch(error){
  if(error.name==='AbortError'||current!==sequence)return;
  $('summary').textContent=t('error');const retry=element('button',t('retry'));retry.onclick=load;
  const row=element('tr'),cell=element('td',undefined,'table-state');cell.colSpan=7;cell.append(retry);row.append(cell);$('list').replaceChildren(row);
  $('previous').disabled=$('next').disabled=true;
 }finally{if(current===sequence)table.setAttribute('aria-busy','false');}
}

function languageName(code) {
 if(!code)return t('unknownLanguage');
 try{return new Intl.DisplayNames([language==='zh'?'zh-CN':'en'],{type:'language'}).of(code)||code;}catch{return code;}
}
async function recordInteraction(feed,action,heat) {
 try {
  const response=await fetch(`/api/limitrss/plaza/${encodeURIComponent(feed.id)}/interaction`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action}),keepalive:true});
  if(!response.ok)return;
  const data=await response.json();
  if(Number.isSafeInteger(data.popularity))heat.textContent=data.popularity.toLocaleString(language);
 }catch{}
}
function render(feed) {
 const rsshub=feed.sourceType==='rsshub'||/^rsshub:\/\//i.test(feed.url);
 const row=element('tr',undefined,'feed');
 const source=element('td'),identity=element('div',undefined,'feed-source');
 const image=element('img',undefined,'icon');image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';image.src=feed.icon||'../assets/icon.png';image.onerror=()=>{image.onerror=null;image.src='../assets/icon.png';};
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
 actions.append(launch);actionCell.append(actions);row.append(source,addressCell,category,feedLanguage,health,actionCell,heatCell);return row;
}
let timer;$('search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{page=1;load();},300);});for(const id of ['category','status'])$(id).onchange=()=>{page=1;load();};$('previous').onclick=()=>{page--;load();};$('next').onclick=()=>{page++;load();};document.addEventListener('limitrss-language-change',event=>{language=event.detail;localize();load();});localize();load();
