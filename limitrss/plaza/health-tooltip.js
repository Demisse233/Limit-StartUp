// A classic script so local file previews work without ES module loading.
(()=>{
// Keep the explanation outside the horizontally scrolling table.
function setupHealthTooltip(button,tip){
 let hovered=false,focused=false,pinned=false,timer;
 function hide(){clearTimeout(timer);tip.hidden=true;}
 function close(){hovered=focused=pinned=false;hide();}
 function show(){clearTimeout(timer);tip.hidden=false;const rect=button.getBoundingClientRect(),box=tip.getBoundingClientRect();tip.style.left=Math.max(16,Math.min(rect.left-12,innerWidth-box.width-16))+'px';const above=rect.top-box.height-10;tip.style.top=Math.max(16,Math.min(above>=16?above:rect.bottom+10,innerHeight-box.height-16))+'px';}
 function leave(){hovered=false;clearTimeout(timer);timer=setTimeout(()=>{if(!hovered&&!focused&&!pinned)hide();},120);}
 button.addEventListener('mouseenter',()=>{hovered=true;show();});
 button.addEventListener('mouseleave',leave);
 tip.addEventListener('mouseenter',()=>{hovered=true;clearTimeout(timer);});
 tip.addEventListener('mouseleave',leave);
 button.addEventListener('focus',()=>{focused=true;show();});
 button.addEventListener('blur',()=>{focused=false;if(!hovered&&!pinned)hide();});
 button.addEventListener('click',()=>{pinned=!pinned;if(pinned)show();else hide();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
 document.addEventListener('click',event=>{if(!button.contains(event.target)&&!tip.contains(event.target))close();});
 document.addEventListener('scroll',event=>{if(!tip.contains(event.target))close();},true);
 window.addEventListener('resize',close);
 document.addEventListener('limitrss-language-change',close);
}

const copy={zh:{label:'检测说明',notice:'检测结果来自 Plaza 服务器，与你本地网络的可用性可能不同。订阅源定期分批检测。'},en:{label:'About health checks',notice:'Checks run on the Plaza server; availability on your local network may differ. Feeds are checked periodically in batches.'}};
function initialize(){
 const button=document.getElementById('health-help'),tip=document.getElementById('health-note');if(!button||!tip)return;
 setupHealthTooltip(button,tip);
 function localize(value){const strings=copy[value==='en'?'en':'zh'];button.setAttribute('aria-label',strings.label);tip.textContent=strings.notice;}
 let language=navigator.language.startsWith('zh')?'zh':'en';try{language=localStorage.getItem('limitrss-language')||localStorage.getItem('plaza-language')||language;}catch{}
 localize(language);
 document.addEventListener('limitrss-language-change',event=>localize(event.detail));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
