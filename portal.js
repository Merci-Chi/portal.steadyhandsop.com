import {supabase} from './supabase-client.js';
const $=s=>document.querySelector(s),safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user=null,profile=null,companies=[],current=null;
const sections={overview:['Overview','Your Steady Hands workspace'],website:['My Website','Website and domain details'],emails:['Business Emails','Email accounts and setup'],admin:['Admin Site','Your private management dashboard'],requests:['Requests','Website changes and support'],billing:['Billing & Plans','Subscriptions and payments'],referrals:['Referrals & Rewards','Referral information'],support:['Help & Support','Contact Steady Hands'],settings:['Settings','Manage your profile']};
function pageHeader(t,d){return '<div class="pagehead"><h1>'+safe(t)+'</h1><p>'+safe(d)+'</p></div>'}
function empty(t,message){return '<div class="panel empty-workspace"><h2>'+safe(t)+'</h2><p>'+safe(message)+'</p></div>'}
const links=(arr)=>'<div class="mini-list">'+arr.map(x=>'<a target="_blank" rel="noopener noreferrer" href="'+safe(x.url)+'">'+safe(x.text)+'</a>').join('')+'</div>';
function isCompanyAvailable(){return Boolean(current?.status==='verified')}
function pageContent(p){
 const [title,subtitle]=sections[p];
 let content='';
 if(p==='settings')return pageHeader(title,subtitle)+'<div class="panel"><h3>Your profile</h3><form id="profile" class="profile-form"><label for="full-name">Full name</label><input id="full-name" maxlength="120" required value="'+safe(profile?.full_name||'')+'"><label for="phone">Phone number (optional)</label><input id="phone" type="tel" maxlength="40" value="'+safe(profile?.phone||'')+'"><label>Email</label><div class="notice">'+safe(user.email||'')+'</div><button class="primary" type="submit">Save Profile</button><p id="profile-message" role="status"></p></form></div>';
 if(p==='support')return pageHeader(title,subtitle)+'<div class="panel"><h3>Contact our team</h3><p>For assistance, email <a href="mailto:kiara@steadyhandsop.com">kiara@steadyhandsop.com</a>.</p></div>';
 if(p==='overview'){
  const greeting=(profile?.full_name||'').trim().split(' ')[0]||'there';
  content='<section class="hero"><span class="eyebrow">STEADY HANDS CLIENT PORTAL</span><h1>Welcome, '+safe(greeting)+'!</h1><p>Manage your services in one place.</p></section><div class="section-title"><h2>Your workspace</h2></div>';
  if(!companies.length)content+=empty('Your account is ready','No business is linked to your account yet. Contact Steady Hands to verify ownership and connect your existing website, emails and subscriptions.');
  else if(!isCompanyAvailable())content+=empty('Company verification pending','Your company has not been verified for access yet. Contact Steady Hands if you need help.');
  else content+='<div class="panel"><h3>'+safe(current.company_name)+'</h3><p>Your company is verified. Connected service records will appear after integration is completed.</p></div>';
  content+='<div class="grid4">'+Object.entries({website:'My Website',emails:'Business Emails',admin:'Admin Site',billing:'Billing & Plans'}).map(([k,t])=>'<button class="tile" data-page="'+k+'"><span class="ico"><img class="vector-icon" alt="" src="icons/'+({website:'globe',emails:'mail',admin:'monitor-cog',billing:'credit-card'}[k])+'.svg"></span><strong>'+t+'</strong><small>View status</small></button>').join('')+'</div>';
  return content;
 }
 if(!isCompanyAvailable())content=empty('No verified company linked','Once Steady Hands verifies and links your business, your '+title.toLowerCase()+' details can be displayed here.');
 else content=empty('No connected records yet','Your company is verified. '+title+' information will become available when this service is connected.');
 return pageHeader(title,subtitle)+content;
}
function render(){const p=sections[location.hash.slice(1)]?location.hash.slice(1):'overview';$('#main').innerHTML=pageContent(p);$('#main').scrollTop=0;document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===p));if(p==='settings')$('#profile').addEventListener('submit',saveProfile);closeSidebar()}
async function saveProfile(e){e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;const payload={user_id:user.id,full_name:$('#full-name').value.trim(),phone:$('#phone').value.trim()||null,updated_at:new Date().toISOString()};const {error}=await supabase.from('portal_profiles').upsert(payload,{onConflict:'user_id'});$('#profile-message').textContent=error?error.message:'Profile saved successfully.';if(!error)profile=payload;button.disabled=false}
function closeSidebar(){setSidebar(false)}
function setSidebar(on){const active=window.matchMedia('(max-width:760px)').matches&&on;$('#sidebar').classList.toggle('open',active);$('#sidebar-backdrop').classList.toggle('open',active);$('#menu').setAttribute('aria-expanded',String(active))}
$('#menu').onclick=()=>setSidebar(!$('#sidebar').classList.contains('open'));$('#sidebar-backdrop').onclick=closeSidebar;
$('#nav').addEventListener('click',e=>{const button=e.target.closest('[data-page]');if(button)location.hash=button.dataset.page});
$('#main').addEventListener('click',e=>{const button=e.target.closest('[data-page]');if(button)location.hash=button.dataset.page});
window.addEventListener('hashchange',render);window.addEventListener('resize',()=>{if(innerWidth>760)closeSidebar()});
let gesture;
document.addEventListener('touchstart',e=>{if(innerWidth>760||e.touches.length!==1||e.target.closest('input,textarea,select,[contenteditable]')){gesture=null;return}gesture={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});
document.addEventListener('touchend',e=>{if(!gesture||innerWidth>760)return;const dx=e.changedTouches[0].clientX-gesture.x,dy=e.changedTouches[0].clientY-gesture.y;if(Math.abs(dx)>75&&Math.abs(dx)>Math.abs(dy)*1.6)setSidebar(dx>0);gesture=null},{passive:true});
$('#logout').onclick=async()=>{await supabase.auth.signOut();location.replace('login.html')};
async function boot(){const {data:{session},error}=await supabase.auth.getSession();if(error||!session){location.replace('login.html');return}user=session.user;$('#avatar').textContent=(user.email||'SH').slice(0,2).toUpperCase();
 const p=await supabase.from('portal_profiles').select('full_name,phone').eq('user_id',user.id).maybeSingle();
 if(p.error){$('#main').innerHTML=empty('Unable to load profile',p.error.message);return}profile=p.data||{full_name:'',phone:''}; if(!profile.full_name?.trim()||!String(user.user_metadata?.portal_company_name||'').trim()){location.replace('onboarding.html');return;}
 const m=await supabase.from('portal_memberships').select('company_id,role').eq('user_id',user.id);
 if(m.error){$('#main').innerHTML=empty('Unable to load memberships',m.error.message);return}
 if(m.data?.length){const ids=m.data.map(x=>x.company_id);const c=await supabase.from('portal_companies').select('id,company_name,status').in('id',ids);if(c.error){$('#main').innerHTML=empty('Unable to load companies',c.error.message);return}companies=c.data||[];current=companies[0]||null}
 $('#company-label').textContent=current?.company_name||user.user_metadata?.portal_company_name||'My Workspace';$('#company-letter').textContent=(current?.company_name||user.user_metadata?.portal_company_name||'S').charAt(0).toUpperCase();render();
}
supabase.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')location.replace('login.html')});boot();
