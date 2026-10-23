import {readToken,clearSession,authRequest} from './session.js';
const link=document.getElementById('account-login'),logout=document.getElementById('account-logout'),manager=document.getElementById('account-manager');
let language='zh';try{language=localStorage.getItem('limitrss-language')||localStorage.getItem('plaza-language')||(navigator.language.startsWith('zh')?'zh':'en');}catch{}
function translate(){const en=language==='en';link.textContent=en?'Sign in':'登录';logout.textContent=en?'Sign out':'退出登录';manager.textContent=en?'Manage':'管理后台';}
document.addEventListener('limitrss-language-change',e=>{language=e.detail;translate();});translate();
function signedOut(){link.hidden=false;logout.hidden=true;manager.hidden=true;}
async function load(){if(!readToken()){signedOut();return;}try{const {user}=await authRequest('/api/auth/me');link.hidden=true;logout.hidden=false;manager.hidden=!user.plazaAdmin;}catch{signedOut();}}
logout.addEventListener('click',async()=>{logout.disabled=true;try{await authRequest('/api/auth/logout',{method:'POST'});clearSession();signedOut();}catch(error){if(error.message==='unauthorized'){clearSession();signedOut();}else{logout.textContent=language==='en'?'Retry sign out':'重试退出';}}finally{logout.disabled=false;}});
window.addEventListener('storage',event=>{if(event.key==='ls_auth_token')load();});load();
