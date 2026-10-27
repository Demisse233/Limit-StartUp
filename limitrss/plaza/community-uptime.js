// Confirmed launch date: 2026-10-11. Use completed calendar days in Asia/Shanghai.
// A classic script also supports double-clicked local HTML previews.
(()=>{
 const launchedAt=Date.parse('2026-10-11T00:00:00+08:00'),day=86400000,offset=8*3600000;
 function initialize(){
  const node=document.getElementById('community-uptime');if(!node)return;
  let language=navigator.language.startsWith('zh')?'zh':'en',timer;
  try{language=localStorage.getItem('limitrss-language')||localStorage.getItem('plaza-language')||language;}catch{}
  function update(){
   clearTimeout(timer);const now=Date.now();
   const days=Math.max(0,Math.floor((now+offset)/day)-Math.floor((launchedAt+offset)/day));
   const value=days.toLocaleString(language==='en'?'en':'zh');
   const number=document.createElement('span');number.className='uptime-days';number.textContent=value;
   node.textContent=language==='en'?'Since launch, LimitRSS Plaza has served the community for ':'自上线以来，LimitRSS Plaza 已持续服务 ';
   node.append(number,language==='en'?` ${days===1?'day':'days'}.`:' 天');
   timer=setTimeout(update,day-((now+offset)%day)+50);
  }
  document.addEventListener('limitrss-language-change',event=>{language=event.detail;update();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
  window.addEventListener('pageshow',update);
  update();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
