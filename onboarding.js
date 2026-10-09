import {supabase} from './supabase-client.js';
const $=id=>document.getElementById(id);
const {data:{user},error}=await supabase.auth.getUser();
if(error||!user)location.replace('login.html');
else {
 const {data:existing,error:lookupError}=await supabase.from('portal_profiles').select('user_id,full_name,phone').eq('user_id',user.id).maybeSingle();
 if(lookupError)$('message').textContent=lookupError.message;
 else if(existing?.full_name?.trim())location.replace('index.html');
 else {
  $('name').value=existing?.full_name||user.user_metadata?.full_name||user.user_metadata?.name||'';
  $('phone').value=existing?.phone||'';
  $('setup').onsubmit=async e=>{
   e.preventDefault();const name=$('name').value.trim();if(!name){$('message').textContent='Please enter your name.';return}
   $('save').disabled=true;
   const {error:saveError}=await supabase.from('portal_profiles').upsert({user_id:user.id,full_name:name,phone:$('phone').value.trim()||null,updated_at:new Date().toISOString()},{onConflict:'user_id'});
   if(saveError){$('message').textContent=saveError.message;$('save').disabled=false;return}
   location.replace('index.html');
  };
 }
}
$('signout').onclick=async()=>{await supabase.auth.signOut();location.replace('login.html')};
