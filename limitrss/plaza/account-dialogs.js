import {authRequest,clearSession} from './session.js';
const $=id=>document.getElementById(id);
const copy=globalThis.LimitRSSPlazaI18n.accountCopy;
let language='zh';try{language=localStorage.getItem('limitrss-language')||localStorage.getItem('plaza-language')||(navigator.language.startsWith('zh')?'zh':'en');}catch{}
language=language==='en'?'en':'zh';const t=key=>copy[language][key]||copy[language].unavailable;
let currentUser=null,pendingAvatar='',profileBusy=false,passwordBusy=false,passwordComplete=false,widget=null,captchaToken='',captchaPromise=null;
const messages={profile:{key:'',success:false},password:{key:'',success:false}};
function notice(mode,key,success=false,prefix=''){messages[mode]={key,success,prefix};const node=$(mode+'-message');node.textContent=(prefix?t(prefix)+' ':'')+(key?t(key):'');node.dataset.state=success?'success':'error';}
function translate(){document.querySelectorAll('[data-account-t]').forEach(node=>node.textContent=t(node.dataset.accountT));document.querySelectorAll('[data-account-label]').forEach(node=>node.setAttribute('aria-label',t(node.dataset.accountLabel)));$('profile-save').textContent=t(profileBusy?'saving':'save');$('password-save').textContent=t(passwordBusy?'saving':'savePassword');for(const [mode,message] of Object.entries(messages))notice(mode,message.key,message.success,message.prefix);}
function changed(){document.dispatchEvent(new CustomEvent('plaza-account-updated'));}
function sessionEnded(){document.dispatchEvent(new CustomEvent('plaza-account-session-ended'));}
function handleError(mode,error,prefix=''){notice(mode,error.message,false,prefix);if(error.message==='unauthorized'){clearSession();sessionEnded();}}
function lock(mode,value){if(mode==='profile')profileBusy=value;else passwordBusy=value;$(mode+'-form').querySelectorAll('input,button').forEach(node=>node.disabled=value);translate();}
function previewAvatar(src=''){const image=$('profile-preview-image');image.hidden=!src;image.src=src;$('profile-preview-fallback').hidden=!!src;$('profile-preview-fallback').textContent=Array.from(currentUser?.nickname||currentUser?.email||'L')[0].toLocaleUpperCase();}
export function openAccountDialog(mode,user){
 currentUser={...user};notice(mode,'');
 if(mode==='profile'){pendingAvatar='';$('profile-form').reset();$('profile-email').value=user.email;$('profile-nickname').value=user.nickname||'';const avatar=document.querySelector('#account-profile .profile-avatar-image');previewAvatar(avatar&&!avatar.hidden?avatar.src:'');$('profile-dialog').showModal();}
 else{passwordComplete=false;$('password-form').reset();$('password-save').hidden=false;$('password-login').hidden=true;lock('password',false);captchaToken='';$('password-dialog').showModal();initCaptcha();}
}
function finishClose(dialog){if(dialog.id==='password-dialog'){$('password-form').reset();captchaToken='';if(widget!==null)window.turnstile?.reset(widget);}else{pendingAvatar='';$('profile-avatar-file').value='';}document.querySelector('#account-toggle')?.focus();}
for(const mode of ['profile','password']){const dialog=$(mode+'-dialog');dialog.addEventListener('cancel',event=>{if(mode==='profile'?profileBusy:passwordBusy)event.preventDefault();});dialog.addEventListener('close',()=>finishClose(dialog));}
document.querySelectorAll('[data-account-close]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.accountClose;if(id==='profile-dialog'?profileBusy:passwordBusy)return;$(id).close();}));
$('profile-avatar-file').addEventListener('change',async event=>{
 const file=event.target.files[0];if(!file)return;notice('profile','');lock('profile',true);let bitmap;
 try{if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('invalid_type');if(file.size>10*1024*1024)throw Error('file_too_large');bitmap=await createImageBitmap(file);const side=Math.min(bitmap.width,bitmap.height);if(!side)throw Error('invalid_image');const canvas=document.createElement('canvas');canvas.width=canvas.height=256;canvas.getContext('2d').drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,256,256);pendingAvatar=canvas.toDataURL('image/webp',.85);previewAvatar(pendingAvatar);}
 catch(error){handleError('profile',Error(['invalid_type','file_too_large'].includes(error.message)?error.message:'invalid_image'));event.target.value='';}
 finally{bitmap?.close();lock('profile',false);}
});
$('profile-form').addEventListener('submit',async event=>{
 event.preventDefault();if(profileBusy)return;const nickname=$('profile-nickname').value.trim();if(!nickname||nickname.length>24){notice('profile','invalid_nickname');return;}lock('profile',true);notice('profile','');let saved=false;
 try{if(pendingAvatar){await authRequest('/api/avatar',{method:'POST',body:JSON.stringify({dataUrl:pendingAvatar})});pendingAvatar='';currentUser.avatarUrl='/api/avatar';$('profile-avatar-file').value='';saved=true;changed();}if(nickname!==currentUser.nickname){await authRequest('/api/auth/nickname',{method:'PUT',body:JSON.stringify({nickname})});currentUser.nickname=nickname;changed();}notice('profile','saved',true);}
 catch(error){handleError('profile',error,saved?'partialSaved':'');}finally{lock('profile',false);}
});
$('profile-delete-avatar').addEventListener('click',async()=>{if(profileBusy)return;lock('profile',true);notice('profile','');try{if(currentUser.avatarUrl)await authRequest('/api/avatar',{method:'DELETE'});pendingAvatar='';currentUser.avatarUrl=null;$('profile-avatar-file').value='';previewAvatar();changed();notice('profile','avatarDeleted',true);}catch(error){handleError('profile',error);}finally{lock('profile',false);}});
async function initCaptcha(){
 try{if(!window.turnstile){if(!captchaPromise)captchaPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.async=true;script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=resolve;script.onerror=()=>{script.remove();captchaPromise=null;reject(Error('captcha_failed'));};document.head.append(script);});await captchaPromise;}
 if(!$('password-dialog').open)return;
 if(widget!==null){window.turnstile.reset(widget);return;}
 widget=window.turnstile.render('#account-captcha',{sitekey:$('account-captcha').dataset.sitekey,theme:document.documentElement.dataset.theme==='dark'?'dark':'auto',language:language==='en'?'en':'zh-cn',callback:value=>{if(passwordComplete||!$('password-dialog').open)return;captchaToken=value;if(['captcha_required','captcha_failed'].includes(messages.password.key))notice('password','');},'expired-callback':()=>{if(passwordComplete||!$('password-dialog').open)return;captchaToken='';notice('password','captcha_required');},'error-callback':()=>{if(passwordComplete||!$('password-dialog').open)return true;captchaToken='';notice('password','captcha_failed');return true;}});
 }catch{notice('password','captcha_failed');}
}
$('password-form').addEventListener('submit',async event=>{
 event.preventDefault();if(passwordBusy||passwordComplete)return;const oldPassword=$('profile-old-password').value,newPassword=$('profile-new-password').value;
 if(newPassword!==$('profile-confirm-password').value){notice('password','password_mismatch');return;}if(oldPassword===newPassword){notice('password','same_password');return;}if(!/^(?=.*[a-zA-Z])(?=.*\d).{8,128}$/.test(newPassword)){notice('password','weak_password');return;}if(!captchaToken){notice('password','captcha_required');return;}
 lock('password',true);notice('password','');
 try{await authRequest('/api/auth/reset',{method:'POST',body:JSON.stringify({oldPassword,newPassword,turnstileToken:captchaToken})});clearSession();sessionEnded();passwordComplete=true;$('password-form').reset();$('password-save').hidden=true;$('password-login').hidden=false;notice('password','passwordSaved',true);}
 catch(error){handleError('password',error);}finally{captchaToken='';if(widget!==null)window.turnstile?.reset(widget);lock('password',false);if(passwordComplete)$('password-form').querySelectorAll('input').forEach(input=>input.disabled=true);}
});
document.addEventListener('limitrss-language-change',event=>{language=event.detail==='en'?'en':'zh';translate();});translate();
