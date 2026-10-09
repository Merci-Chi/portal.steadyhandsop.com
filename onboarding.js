import {supabase} from './supabase-client.js';
const $=id=>document.getElementById(id);
const {data:{user},error}=await supabase.auth.getUser();
if(error||!user){location.replace('login.html');}
else {
 const {data:existing,error:lookupError}=await supabase.from('portal_profiles').select('user_id,full_name').eq('user_id',user.id).maybeSingle();
 if(lookupError){$('message').textContent=lookupError.message;$('save').disabled=true;}
 else {
  const metadata=user.user_metadata||{};
  const company=String(metadata.portal_company_name||'').trim();
  if(existing?.full_name?.trim()&&company){location.replace('index.html');}
  else {
   $('name').value=existing?.full_name||metadata.full_name||metadata.name||'';
   $('company').value=company;
   $('setup').addEventListener('submit',async e=>{
    e.preventDefault();
    const name=$('name').value.trim(),companyName=$('company').value.trim();
    if(!name||!companyName){$('message').textContent='Both fields are required.';return;}
    $('save').disabled=true;$('message').textContent='';
    // Company name is user-submitted onboarding metadata, NOT verified company membership.
    const {error:metadataError}=await supabase.auth.updateUser({data:{portal_company_name:companyName}});
    if(metadataError){$('message').textContent=metadataError.message;$('save').disabled=false;return;}
    const {error:profileError}=await supabase.from('portal_profiles').upsert({user_id:user.id,full_name:name,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(profileError){$('message').textContent=profileError.message;$('save').disabled=false;return;}
    location.replace('index.html');
   });
  }
 }
}
$('signout').addEventListener('click',async()=>{await supabase.auth.signOut();location.replace('login.html')});
