import {supabase} from './supabase-client.js';
const types={preview:'Request a Free Preview',change:'Website Changes',email:'Business Email',admin:'Admin Access',billing:'Billing Question',support:'Support',other:'Other'};
const $=q=>document.querySelector(q);
let step=0,mode='email',working=false,success=false,previewFlow=false;
const data={type:'other',title:'',details:'',contact:'',business:'',name:'',services:'',style:'',features:''};
const shell=document.createElement('div');shell.id='request-wizard-overlay';shell.hidden=true;
shell.innerHTML='<section id="request-wizard" class="wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title"><div class="wizard-head"><div><span>STEADY HANDS · REQUESTS</span><h2 id="wizard-title">New Request</h2></div><button class="wizard-close" type="button" aria-label="Close">×</button></div><div class="wizard-progress"><span id="wizard-step-label">Step 1 of 3</span><span id="wizard-progress-percent">33%</span></div><div class="wizard-progress-track"><div id="wizard-progress-fill"></div></div><div id="wizard-content"></div><p id="wizard-error" role="alert"></p><div class="wizard-actions" id="wizard-actions"><button class="wizard-back" type="button">Back</button><button class="wizard-next" type="button">Continue →</button></div></section>';
document.body.appendChild(shell);
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
function phoneFormat(raw){
 const digits=String(raw).replace(/\D/g,'').slice(0,14);
 if(digits.length<=10){const d=digits;return d.length<=3?'('+d:d.length<=6?'('+d.slice(0,3)+')'+d.slice(3):'('+d.slice(0,3)+')'+d.slice(3,6)+'-'+d.slice(6)}
 const prefix=digits.slice(0,-10),local=digits.slice(-10);
 return '+'+prefix+'('+local.slice(0,3)+')'+local.slice(3,6)+'-'+local.slice(6);
}
async function show(){step=0;success=false;working=false;data.type=sessionStorage.getItem('portal_request_type')||'other';if(!types[data.type])data.type='other';previewFlow=data.type==='preview';sessionStorage.removeItem('portal_request_type');data.title='';data.details='';data.contact='';data.business='';data.name='';data.services='';data.style='';data.features='';mode='email';if(previewFlow){const {data:{session}}=await supabase.auth.getSession();const u=session?.user;if(u){data.business=String(u.user_metadata?.portal_company_name||'');const {data:profile}=await supabase.from('portal_profiles').select('full_name').eq('user_id',u.id).maybeSingle();data.name=String(profile?.full_name||u.user_metadata?.full_name||u.user_metadata?.name||'');}}shell.hidden=false;document.body.classList.add('wizard-open');render()}
function openPreview(){sessionStorage.setItem('portal_request_type','preview');show()}
function close(){if(working)return;shell.hidden=true;document.body.classList.remove('wizard-open');if(success){location.hash='requests';location.reload()}}
function capture(){
 if(previewFlow){
  if(step===0){data.business=$('#wizard-business').value.trim();data.name=$('#wizard-name').value.trim();data.services=$('#wizard-services').value.trim()}
  if(step===1){data.style=$('#wizard-style').value.trim();data.features=$('#wizard-features').value.trim()}
  if(step===2)data.details=$('#wizard-description').value.trim();
 }else{
  if(step===0){data.type=$('#wizard-type').value;data.title=$('#wizard-subject').value.trim()}
  if(step===1)data.details=$('#wizard-description').value.trim();
 }
 if(step===(previewFlow?3:2)){mode=$('input[name=wizard-method]:checked').value;data.contact=$('#wizard-contact').value.trim()}
}
function render(){
 $('#wizard-error').textContent='';
 const count=previewFlow?4:3;const fill=(step+1)/count*100;$('#wizard-progress-fill').style.width=fill+'%';$('#wizard-step-label').textContent='Step '+(step+1)+' of '+count;$('#wizard-progress-percent').textContent=Math.round(fill)+'%';
 $('#wizard-actions').hidden=false;$('.wizard-back').hidden=step===0;$('.wizard-next').textContent=step===count-1?'Submit Request ✓':'Continue →';
 if(previewFlow){$('#wizard-title').textContent='Request a Free Preview';if(step===0)$('#wizard-content').innerHTML='<div class="wizard-body"><h3>Tell us about your business</h3><p>What should your website be about?</p><label for="wizard-business">Company name *</label><input id="wizard-business" maxlength="160" value="'+escapeHtml(data.business)+'" required><label for="wizard-name">Your name *</label><input id="wizard-name" maxlength="120" value="'+escapeHtml(data.name)+'" required><label for="wizard-services">Business type and services *</label><textarea id="wizard-services" rows="4" placeholder="What does your business offer?">'+escapeHtml(data.services)+'</textarea></div>';if(step===1)$('#wizard-content').innerHTML='<div class="wizard-body"><h3>Your website preferences</h3><p>Choose the look and features that fit your business.</p><label for="wizard-style">Colors or design style</label><input id="wizard-style" maxlength="300" placeholder="For example: navy blue, modern, professional" value="'+escapeHtml(data.style)+'"><label for="wizard-features">Pages or features</label><textarea id="wizard-features" rows="4" placeholder="For example: gallery, booking, services, reviews">'+escapeHtml(data.features)+'</textarea></div>';if(step===2)$('#wizard-content').innerHTML='<div class="wizard-body"><h3>Anything else?</h3><p>Share your logo details, inspiration links or special requests.</p><label for="wizard-description">Additional details (optional)</label><textarea id="wizard-description" rows="5" placeholder="Tell us anything else you would like to see...">'+escapeHtml(data.details)+'</textarea></div>';}else if(step===0)$('#wizard-content').innerHTML='<div class="wizard-body"><h3>What do you need?</h3><p>Choose a service and add a short subject.</p><label for="wizard-type">Request type *</label><div class="wizard-select"><select id="wizard-type">'+Object.entries(types).map(([k,v])=>'<option value="'+k+'" '+(data.type===k?'selected':'')+'>'+v+'</option>').join('')+'</select><span>⌄</span></div><label for="wizard-subject">Subject *</label><input id="wizard-subject" maxlength="160" placeholder="A short description" value="'+escapeHtml(data.title)+'"></div>';
 if(!previewFlow&&step===1)$('#wizard-content').innerHTML='<div class="wizard-body"><h3>Tell us a little more</h3><p>A few details help us understand your request.</p><label for="wizard-description">Request details *</label><textarea id="wizard-description" maxlength="5000" rows="6" placeholder="Describe what you need. Include a site key if you already have one.">'+escapeHtml(data.details)+'</textarea></div>';
 if(step===(previewFlow?3:2))$('#wizard-content').innerHTML='<div class="wizard-body"><h3>How should we send your completed request?</h3><p>Choose where you would like to receive your update when it is ready.</p><div class="wizard-toggle"><label><input type="radio" name="wizard-method" value="email" '+(mode==='email'?'checked':'')+'><span>Email</span></label><label><input type="radio" name="wizard-method" value="text" '+(mode==='text'?'checked':'')+'><span>Text message</span></label></div><label for="wizard-contact" id="wizard-contact-label">'+(mode==='text'?'Phone number *':'Email address *')+'</label><input id="wizard-contact" required '+(mode==='text'?'type="tel" inputmode="tel" autocomplete="tel" placeholder="(000)000-0000"':'type="email" autocomplete="email" placeholder="name@company.com"')+' value="'+escapeHtml(data.contact|| (mode==='email'?window.steadyHandsPortalEmail||'':''))+'"><small id="wizard-phone-help">'+(mode==='text'?'For international numbers, include a country code (up to 4 digits).':'We will use this address to contact you.')+'</small></div>';
}
function validate(){
 if(previewFlow&&step===0){if(!$('#wizard-business').value.trim()||!$('#wizard-name').value.trim()||!$('#wizard-services').value.trim())return 'Please enter your company name, your name, and your services.'}
 if(!previewFlow&&step===0){if(!$('#wizard-subject').value.trim())return 'Please enter a subject.'}
 if(!previewFlow&&step===1){if(!$('#wizard-description').value.trim())return 'Please describe your request.'}
 if(step===(previewFlow?3:2)){const v=$('#wizard-contact').value.trim();if(mode==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))return 'Enter a valid email address.';if(mode==='text'){const count=v.replace(/\D/g,'').length;if(count<10||count>14)return 'Enter a 10-digit phone number, optionally with a country code.'}}
 return '';
}
async function advance(){if(working)return;const error=validate();if(error){$('#wizard-error').textContent=error;return}capture();if(step<(previewFlow?3:2)){step++;data.contact='';render();return}working=true;$('.wizard-next').disabled=true;$('#wizard-error').textContent='Submitting…';const {data:sessionData}=await supabase.auth.getUser();const user=sessionData?.user;if(!user){working=false;$('.wizard-next').disabled=false;$('#wizard-error').textContent='Please sign in to submit.';return}
 const details=previewFlow?['Business: '+data.business,'Requested by: '+data.name,'Business type and services: '+data.services,'Style and colors: '+(data.style||'Not specified'),'Requested features: '+(data.features||'Not specified'),'Additional details: '+(data.details||'None')].join('\n'):data.details;const title=previewFlow?'Free Website Preview — '+data.business:data.title;
 const {error:err}=await supabase.from('portal_service_requests').insert({user_id:user.id,company_name:previewFlow?data.business:(user.user_metadata?.portal_company_name||''),request_type:data.type,title,details,preferred_contact_method:mode,preferred_contact_value:data.contact});
 working=false;if(err){$('.wizard-next').disabled=false;$('#wizard-error').textContent=err.message;return}
 success=true;$('#wizard-title').textContent='Request submitted';$('#wizard-content').innerHTML='<div class="wizard-success"><div class="wizard-check">✓</div><h3>Request submitted!</h3><p>You can view your submission on <strong>Requests</strong>.</p></div>';$('#wizard-step-label').textContent='Complete';$('#wizard-progress-percent').textContent='100%';$('#wizard-progress-fill').style.width='100%';$('#wizard-actions').hidden=false;$('.wizard-back').hidden=true;$('.wizard-next').disabled=false;$('.wizard-next').textContent='View Requests';$('#wizard-error').textContent='';
}
document.addEventListener('click',e=>{if(e.target.closest('#open-request-wizard'))show()});
shell.addEventListener('click',e=>{if(e.target===shell||e.target.closest('.wizard-close'))close();if(e.target.closest('.wizard-back')){capture();step=Math.max(0,step-1);render()}if(e.target.closest('.wizard-next'))success?close():advance()});
shell.addEventListener('click',e=>{const option=e.target.closest('[data-wizard-type]');if(!option)return;data.type=option.dataset.wizardType;document.querySelectorAll('[data-wizard-type]').forEach(el=>{el.classList.toggle('selected',el===option);el.setAttribute('aria-pressed',String(el===option))})});
shell.addEventListener('change',e=>{if(e.target.name==='wizard-method'){mode=e.target.value;data.contact='';render()}});
shell.addEventListener('input',e=>{if(e.target.id==='wizard-contact'&&mode==='text'){const p=e.target;p.value=phoneFormat(p.value)}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!shell.hidden)close()});

document.addEventListener('steadyhands:open-preview',openPreview);
