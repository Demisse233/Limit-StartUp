import {openAccountDialog} from './account-dialogs.js';
import {readToken,clearSession,authRequest} from './session.js';
const $=id=>document.getElementById(id);
const link=$('account-login'),profile=$('account-profile'),toggle=$('account-toggle'),menu=$('account-menu'),logout=$('account-logout'),manager=$('account-manager');
const strings=globalThis.LimitRSSPlazaI18n.navCopy;
let language='zh';try{language=localStorage.getItem('limitrss-language')||localStorage.getItem('plaza-language')||(navigator.language.startsWith('zh')?'zh':'en');}catch{}
language=language==='en'?'en':'zh';let user=null,avatarUrl='',generation=0,busy=false,failed=false;
const t=key=>strings[language][key];
function translate(){link.textContent=t('login');for(const [id,key] of [['account-settings','settings'],['account-password','password'],['account-shares','manageShares'],['account-manager','manager'],['account-logout',busy?'busy':'logout']])$(id).querySelector('span').textContent=t(key);$('account-signed-in').textContent=t('signedIn');toggle.setAttribute('aria-label',user?`${t('account')}: ${user.nickname||user.email}`:t('account'));$('account-menu-message').textContent=failed?t('retry'):'';}
function close(focus=false){menu.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus();}
function items(){return [...menu.querySelectorAll('[role=menuitem]')].filter(n=>!n.hidden&&!n.disabled);}
function open(focus=false){menu.hidden=false;toggle.setAttribute('aria-expanded','true');const languageButton=$('language');const languageMenu=$('language-menu');if(languageMenu)languageMenu.hidden=true;languageButton?.setAttribute('aria-expanded','false');if(focus)items()[0]?.focus();}
$('account-settings').addEventListener('click',()=>{close();if(user)openAccountDialog('profile',user);});
$('account-password').addEventListener('click',()=>{close();if(user)openAccountDialog('password',user);});
document.addEventListener('plaza-account-updated',()=>load());
document.addEventListener('plaza-account-session-ended',()=>{generation++;signedOut();});
toggle.addEventListener('click',()=>menu.hidden?open():close());
toggle.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();open(true);if(event.key==='ArrowUp')items().at(-1)?.focus();}});
menu.addEventListener('keydown',event=>{const list=items(),index=list.indexOf(document.activeElement);if(event.key==='Escape'){event.preventDefault();close(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();list[event.key==='Home'?0:event.key==='End'?list.length-1:(index+(event.key==='ArrowDown'?1:-1)+list.length)%list.length]?.focus();}else if(event.key==='Tab')close();});
document.addEventListener('click',event=>{if(!profile.contains(event.target))close();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden)close(true);});
profile.addEventListener('focusout',event=>{if(event.relatedTarget&&!profile.contains(event.relatedTarget))close();});
function resetAvatar(){if(avatarUrl)URL.revokeObjectURL(avatarUrl);avatarUrl='';profile.querySelectorAll('.profile-avatar-image').forEach(image=>{image.hidden=true;image.removeAttribute('src');});profile.querySelectorAll('.profile-avatar-fallback').forEach(n=>n.hidden=false);}
function signedOut(){user=null;resetAvatar();close();link.hidden=false;profile.hidden=true;manager.hidden=true;failed=false;translate();}
function showUser(value){user=value;link.hidden=true;profile.hidden=false;manager.hidden=!user.plazaAdmin;const name=user.nickname?.trim()||user.email;$('account-nickname').textContent=name;$('account-menu-name').textContent=name;$('account-menu-email').textContent=user.email;$('account-menu-email').hidden=name===user.email;profile.querySelectorAll('.profile-avatar-fallback').forEach(n=>n.textContent=Array.from(name||'L')[0].toLocaleUpperCase());translate();}
async function load(){const current=++generation;resetAvatar();if(!readToken()){signedOut();return;}try{const result=await authRequest('/api/auth/me');if(current!==generation)return;showUser(result.user);if(user.avatarUrl){try{const response=await fetch('/api/avatar',{cache:'no-store',headers:{Authorization:`Bearer ${readToken()}`}});if(!response.ok)return;const blob=await response.blob();if(current!==generation)return;avatarUrl=URL.createObjectURL(blob);profile.querySelectorAll('.profile-avatar-image').forEach(image=>{image.onload=()=>{if(current!==generation)return;image.hidden=false;image.nextElementSibling.hidden=true;};image.src=avatarUrl;});}catch{/* Keep the default avatar if loading fails. */}}}catch{if(current===generation)signedOut();}}
logout.addEventListener('click',async()=>{if(busy)return;busy=true;failed=false;logout.disabled=true;translate();try{await authRequest('/api/auth/logout',{method:'POST'});generation++;clearSession();signedOut();document.dispatchEvent(new CustomEvent('plaza-account-session-ended'));}catch(error){if(!readToken()||error.message==='unauthorized'){generation++;clearSession();signedOut();document.dispatchEvent(new CustomEvent('plaza-account-session-ended'));}else failed=true;}finally{busy=false;logout.disabled=false;translate();}});
document.addEventListener('limitrss-language-change',event=>{language=event.detail==='en'?'en':'zh';translate();});
window.addEventListener('storage',event=>{if(event.key==='ls_auth_token'||event.key==='ls_auth_user')load();});
window.addEventListener('pagehide',()=>{generation++;resetAvatar();});
window.addEventListener('pageshow',event=>{if(event.persisted)load();});
translate();load();
