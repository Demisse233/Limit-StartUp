// Open the existing StartUp account UI from the Plaza account menu.
window.addEventListener('load',async()=>{
 const action=new URLSearchParams(location.search).get('account');
 if(!['settings','password'].includes(action))return;
 const clean=new URL(location.href);clean.searchParams.delete('account');history.replaceState(null,'',clean);
 try{const token=localStorage.getItem('ls_auth_token');if(!token){openAuthModal('auth_login_box');return;}
 const response=await fetch('/api/auth/me',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
 if(!response.ok){if(response.status===401){clearToken();openAuthModal('auth_login_box');}return;}
 if(action==='password')openAuthModal('auth_reset_box');else{settings_jump();showSettingsPage('account');}
 }catch{/* Existing account controls remain available when the network is unavailable. */}
});
