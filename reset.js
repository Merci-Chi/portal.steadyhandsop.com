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
 await supabase.auth.signOut();location.replace('login.html?reset=success');
});
