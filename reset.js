import {supabase} from './supabase-client.js';
const form=document.getElementById('reset-form'),msg=document.getElementById('message');
let recovery=false;
supabase.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY')recovery=true});
form.addEventListener('submit',async e=>{
 e.preventDefault();
 const p=document.getElementById('pw').value;
 if(p!==document.getElementById('confirm').value){msg.textContent='Passwords do not match.';return}
 const params=new URLSearchParams(location.search);
 const tokenHash=params.get('token_hash');
 if(tokenHash&&!recovery){const verified=await supabase.auth.verifyOtp({token_hash:tokenHash,type:'recovery'});if(verified.error){msg.textContent=verified.error.message;return}recovery=true}
 const {data}=await supabase.auth.getSession();
 if(!data.session||!recovery){msg.textContent='Open this page using the password reset link from your email. If the link expired, request a new one.';return}
 const {error}=await supabase.auth.updateUser({password:p});
 if(error){msg.textContent=error.message;return}
 // Carry only the verified recovery account's email to the login popup, including across tabs.
 const email=data.session.user?.email;
 try{
  if(email)localStorage.setItem('steadyhands.portal.reset-login',JSON.stringify({email,savedAt:Date.now()}));
 }catch{}
 const signedOut=await supabase.auth.signOut();
 if(signedOut.error){msg.textContent='Password updated, but sign-out failed. Please try again before logging in.';return}
 location.replace('login.html?reset=success');
});
