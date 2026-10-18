import {supabase as portalSupabase} from './supabase-client.js';
/*
STEADY HANDS — UNIFIED PORTAL POPUP ONBOARDING
Install index.html, css.css, js.js, and login.html over the existing portal.
Original portal.js, Supabase client, styles and portal features are reused.
Sales links: /?invite=SERVER_ISSUED_TOKEN (existing sales links to login.html also redirect here).
Preview links: /?sitekey=EXISTING_SITE_KEY, /?preview=CODE or /?project=USER_OWNED_PROJECT_ID.
Existing site keys use the already deployed get_site_by_key RPC; no new SQL
columns or new site_keys records are introduced.
Auth -> linked preview -> approval -> signed agreement -> verified Square
payments -> domain -> final confirmation -> regular client portal.
No passwords, signatures or payment success are stored in browser progress.

The popup is a UI workflow, not an authorization boundary. Supabase RLS and
server-side ownership and payment checks must protect every service record.
The signed terms and server-owned Square checkout backend from the existing
portal are required. This ZIP does not include or change their deployment.
Square create/verify contracts match the existing square-checkout.js. Prices
must come from the server; subscriptions must be verified active at checkout.
A completion marker only suppresses onboarding for returning clients. It is
never evidence of payment, membership, or a still-active subscription.

Sales preview ownership comes from sh_redeem_portal_invite and
sh_my_portal_invited_previews. Project details carry __sales_sale_id for
handoff; any privileged developer-assignment or notification workflow must
validate that link and the payments on the server. No email is auto-sent.
The source agreement is marked as a draft for legal review.
*/
'use strict';
const CONFIG = Object.freeze({
  supabaseUrl: 'https://glonbvrcudwuzjundrii.supabase.co',
  supabaseKey: 'sb_publishable_VZbed_uuOXSE744UrAfHXw_z2xDdYtr',
  agreementVersion: '2026-10-14-project-v1',
  supportEmail: 'kiara@steadyhandsop.com',
  developerName: 'Kiara',
  portalUrl: 'https://portal.steadyhandsop.com',
  development: 100, standard: 20, business: 30,
  currency: 'USD', maxDays: 5
});
const root=document.createElement('div');root.id='steady-checkout';root.innerHTML='<dialog id="onboarding-dialog" aria-labelledby="stage-title"><header class="popup-brand"><img id="brand-logo" alt="" width="34" height="34"><div><strong>STEADY HANDS</strong><span>YOUR CLIENT PORTAL</span></div><button type="button" id="popup-signout" hidden>Log out</button><button id="popup-close" type="button" aria-label="Close setup">×</button></header><div id="account-welcome" hidden></div><div id="welcome" class="welcome"><strong>Thank you for working with us.</strong><p>We’re not a build-and-vanish company. Your website comes with ongoing support after launch.</p></div><section class="checkout"><div id="demo-banner" class="demo-banner" hidden><span>PREVIEW ONLY · No account or payment created.</span><button id="leave-demo" type="button">Exit preview</button></div><div class="progress-top"><span id="step-caption">STEP 1 OF 7</span><span id="progress-percent">0% complete</span></div><div class="progress-track" role="progressbar" aria-label="Website setup progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="progress-fill"></div></div><ol class="steps" hidden><li data-step="0">Account</li><li data-step="0.5">Preview</li><li data-step="0.75">Agreement</li><li data-step="1">Development</li><li data-step="2">Hosting</li><li data-step="3">Confirm</li><li data-step="4">Domain</li></ol><div id="stage" aria-live="polite"></div><div class="checkout-footer"><span>Secure account · Square payments</span><button id="preview-flow" type="button">Preview the flow</button></div></section></dialog><dialog id="modal" aria-labelledby="modal-title"><button id="modal-close" class="modal-close" aria-label="Close dialog" type="button">×</button><div id="modal-content"></div></dialog>';document.body.appendChild(root);
const $=selector=>root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:CONFIG.currency,maximumFractionDigits:0}).format(n);
const storage = {
  get(key, session=false) { try { return (session ? sessionStorage : localStorage).getItem(key); } catch { return null; } },
  set(key,value,session=false) { try { (session ? sessionStorage : localStorage).setItem(key,value); } catch {} },
  remove(key,session=false) { try { (session ? sessionStorage : localStorage).removeItem(key); } catch {} }
};
const blank = () => ({user:null,profile:null,salesPreview:null,salesChoices:[],hasCheckout:false,project:null,agreement:null,preview:null,previewApproved:false,sessions:{},checkoutHistory:{},developmentWaived:false,codes:{},plan:'standard',paid:{development:false,hosting:false},documents:{},stage:0,submitted:null});
let state = blank();
let demo = new URL(location.href).searchParams.get('checkout_demo')==='1';
const returnedFromPasswordReset=new URL(location.href).searchParams.get('reset')==='success';
function consumeResetLoginEmail(){
  if(!returnedFromPasswordReset)return '';
  const raw=storage.get('steadyhands.portal.reset-login');
  storage.remove('steadyhands.portal.reset-login');
  try{
    const hint=JSON.parse(raw);
    const age=Date.now()-hint.savedAt;
    return typeof hint.email==='string'&&age>=0&&age<15*60*1000?hint.email:'';
  }catch{return '';}
}
let accountEmail=consumeResetLoginEmail();
let authMode = returnedFromPasswordReset?'login':'signup', api = null, apiPromise = null, signatureDrawn = false;
let busy = false, verifying = false, poll = null, clock = null, initEpoch = 0;
let signatureData = '', lastAuthNotice = returnedFromPasswordReset?'Password updated. Log in with your new password.':'';
let awaitingSignupConfirmation = false;
const entryContext = readEntryContext();
const plans = {development:'website-development',standard:'standard-monthly',business:'backend-monthly'};
const icons = {
  code:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/></svg>',
  globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>'
};
function savePreview() {}
function message(text='', success=false) { const el=$('#message'); if(el){el.textContent=text;el.classList.toggle('success',success);} }
function setBusy(value) { busy=value; const btn=$('#submit'); if(btn){btn.disabled=value || !$('#agree')?.checked || !signatureDrawn;btn.textContent=value?'Saving securely…':state.user?'Agree & continue':authMode==='signup'?'Create account & continue':'Log in & continue';} }
function primary(text,id,disabled=false) { return `<button class="primary" id="${id}" type="button" ${disabled?'disabled':''}>${text}<span class="arrow" aria-hidden="true">→</span></button>`; }
function title(tag,heading,sub) { return `${tag?`<p class="tag">${tag}</p>`:''}<h2 id="stage-title" tabindex="-1">${heading}</h2><p class="sub">${sub}</p>`; }
function focusStage() { $('#onboarding-dialog').scrollTop=0;$('#stage-title')?.focus({preventScroll:true}); if(window.matchMedia('(max-width:759px)').matches && state.stage>0) window.scrollTo({top:0,behavior:'instant'}); }
function updateProgress() {
  const order=[0,0.5,0.75,1,2,3,4], index=state.stage===0.1?0:state.stage===0.25?1:order.indexOf(state.stage), s=Math.min(state.stage,4), percent=state.stage===5?100:Math.round(Math.max(0,index)*100/7);
  $('#step-caption').textContent=state.stage===5?'YOU’RE ALL SET':`STEP ${index+1} OF 7`;
  $('#progress-percent').textContent=`${percent}% complete`;
  $('#progress-fill').style.width=`${percent}%`;
  $('.progress-track').setAttribute('aria-valuenow',String(percent));
  root.querySelectorAll('[data-step]').forEach(el=>{const n=Number(el.dataset.step);el.classList.toggle('active',n===s&&state.stage<5);el.classList.toggle('complete',n<s||state.stage===5);if(n===s&&state.stage<5)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  root.classList.toggle('flow-started',state.stage>=1);$('#welcome').hidden=![0,0.5].includes(state.stage);$('#popup-signout').hidden=demo||!state.user;
  document.querySelector('#logout').hidden=demo||!state.user;
  $('#account-welcome').hidden=state.stage!==0;
  $('#demo-banner').hidden=!demo;$('#preview-flow').hidden=demo;
}
function render(focus=false) {
  clearInterval(clock);clearInterval(poll);clock=null;poll=null;
  updateProgress();
  $('#stage').className='stage-in';
  ({'0':renderAccount,'0.1':renderProfile,'0.25':renderSalesChoice,'0.5':renderPreview,'0.75':renderAgreement,'1':renderDevelopment,'2':renderHosting,'3':renderConfirmation,'4':renderDomain,'5':renderDone})[state.stage]();
  if(focus) focusStage();
  if(!demo && (state.stage===1||state.stage===2) && Object.keys(state.sessions).length){poll=setInterval(()=>{if(document.visibilityState==='visible')checkPayments(false);},12000);}
  savePreview();
}
function go(stage){state.stage=stage;render(true);}
function openModal(html) { $('#modal-content').innerHTML=html; if(!$('#modal').open)$('#modal').showModal(); }
function closeModal(){ $('#modal').close(); }
$('#modal-close').onclick=closeModal;
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
function showOverview(){
  openModal(`<p class="tag">AGREEMENT SIGNED</p><h2 id="modal-title">Just two simple payments.</h2><p class="sub">Here’s what happens next. We’ll take it one step at a time.</p><div class="modal-step"><span>1</span><div><strong>Website development · ${money(CONFIG.development)} once</strong><p>A one-time fee to build your website. You’ll receive your own secure Square checkout link.</p></div></div><div class="modal-step"><span>2</span><div><strong>Choose your monthly hosting</strong><p>Standard at ${money(CONFIG.standard)}/month or Business at ${money(CONFIG.business)}/month. Hosting keeps your site running and your support ongoing.</p></div></div><p class="button-note">After payment, tell us your preferred domain and we’ll get started.</p><div class="modal-action">${primary('Let’s get started','overview-next')}</div>`);
  $('#overview-next').onclick=()=>{closeModal();go(1);};
}
function showTerms(){
  openModal(`<p class="tag">STEADY HANDS LLC</p><h2 id="modal-title">Terms &amp; agreement</h2><div class="agreement-document">${AGREEMENT_HTML}</div><div class="agreement-actions"><button type="button" class="secondary" id="download-terms">Save a copy</button><button type="button" class="primary" id="terms-done">Back to setup</button></div>`);
  $('#terms-done').onclick=closeModal;
  $('#download-terms').onclick=()=>{
    const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>Steady Hands Website Agreement</title><style>body{font:15px/1.8 system-ui;color:#173459;max-width:800px;margin:40px auto;padding:20px}h1{line-height:1.2}h2{font-size:18px}section{border-top:1px solid #ddd;padding-top:10px}</style><main>'+AGREEMENT_HTML+'</main></html>';
    download(new Blob([html],{type:'text/html'}),'steady-hands-website-agreement.html');
  };
}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function renderAccount(){
  const typedEmail=$('#email')?.value.trim();if(typedEmail)accountEmail=typedEmail;
  const signup=authMode==='signup';
  $('#account-welcome').innerHTML=title('STEADY HANDS CLIENT PORTAL',signup?'Welcome. Let’s get started.':'Welcome back.','Sign in to your portal. If a preview was sent to you, it will be ready in the next popup.');
  $('#stage').innerHTML=
    `<div class="tabs" role="group" aria-label="Choose sign up or log in"><button type="button" id="tab-signup" aria-pressed="${signup}" class="${signup?'selected':''}">Sign up</button><button type="button" id="tab-login" aria-pressed="${!signup}" class="${!signup?'selected':''}">Log in</button></div><form id="account-form">`+
    (signup?'<label class="field"><span>Your name</span><input id="auth-name" autocomplete="name" maxlength="100" placeholder="First and last name" required></label><label class="field"><span>Business name</span><input id="auth-business" autocomplete="organization" maxlength="100" placeholder="Your business name" required></label>':'')+
    `<label class="field"><span>Email address</span><input id="email" type="email" autocomplete="email" placeholder="you@yourbusiness.com" required></label><label class="field"><span>Password</span><div class="password-wrap"><input id="password" type="password" autocomplete="${signup?'new-password':'current-password'}" minlength="8" placeholder="At least 8 characters" required><button type="button" id="toggle-password" aria-label="Show password">Show</button></div></label><label class="check-label"><input id="auth-consent" type="checkbox" required><span>I have read and accept the <button class="text-button" id="read-terms" type="button">Terms &amp; Website Agreement</button>.</span></label><p id="message" class="message" role="status"></p><button id="auth-submit" class="primary" type="submit" disabled>${signup?'Create account':'Log in'} <span aria-hidden="true">→</span></button></form>`+
    (!signup?'<button type="button" id="forgot-password" class="text-button forgot">Forgot your password?</button>':'')+
    '<p class="button-note">Your preview, website setup, and regular portal — all in one place.</p>';
  $('#email').value=accountEmail;
  const options=document.createElement('details');options.className='popup-auth-options';options.innerHTML='<summary>Other sign-in options</summary><button class="secondary" id="popup-google" type="button">Continue with Google</button><button class="text-button" id="popup-magic" type="button">Email me a one-time login link</button>';$('#stage').appendChild(options);
  $('#popup-google').onclick=()=>otherSignIn('google');$('#popup-magic').onclick=()=>otherSignIn('magic');
  $('#read-terms').onclick=showTerms;
  $('#auth-consent').onchange=()=>{$('#auth-submit').disabled=!$('#auth-consent').checked;};
  $('#account-form').onsubmit=submitAccount;
  $('#tab-signup').onclick=()=>{authMode='signup';renderAccount();};
  $('#tab-login').onclick=()=>{authMode='login';renderAccount();};
  $('#toggle-password').onclick=()=>{const p=$('#password');p.type=p.type==='password'?'text':'password';$('#toggle-password').textContent=p.type==='password'?'Show':'Hide';};
  if($('#forgot-password'))$('#forgot-password').onclick=forgotPassword;
  if(lastAuthNotice)message(lastAuthNotice,true);
}
function authReturnUrl(){
  const url=new URL(location.href);url.search='';url.hash='';for(const key of ['invite','preview','sitekey','project','sale'])if(entryContext[key])url.searchParams.set(key,entryContext[key]);return url;
}
async function otherSignIn(kind){
  if(busy)return;if(!$('#auth-consent').checked){message('Accept the terms before continuing.');$('#auth-consent').focus();return;}
  if(demo){message('Preview only. Google and email links are available in live mode.',true);return;}
  busy=true;
  try{
    if(kind==='google'){const {error}=await api.auth.signInWithOAuth({provider:'google',options:{redirectTo:authReturnUrl().href}});if(error)throw error;}
    else{const email=$('#email');if(!email.reportValidity())return;const {error}=await api.auth.signInWithOtp({email:email.value.trim(),options:{emailRedirectTo:authReturnUrl().href,shouldCreateUser:false}});if(error)throw error;message('Check your inbox for your one-time login link.',true);}
  }catch(e){message(e.message);}finally{busy=false;}
}
async function submitAccount(event){
  event.preventDefault();if(busy||!$('#auth-consent')?.checked)return;
  const button=$('#auth-submit');button.disabled=true;button.textContent='Connecting securely…';busy=true;message('');
  try{
    if(demo){
      state.user={id:'preview-user',email:$('#email').value.trim(),user_metadata:{full_name:$('#auth-name')?.value.trim()||'Preview Client',portal_company_name:$('#auth-business')?.value.trim()||'Your Business'}};
      state.profile={full_name:state.user.user_metadata.full_name};
      state.project={id:'preview-project',display_name:state.user.user_metadata.portal_company_name,details:{}};
      state.preview={site_key:'PREVIEW-DEMO',site_title:state.project.display_name,preview_url:null};
      go(0.5);return;
    }
    const signup=authMode==='signup',email=$('#email').value.trim(),password=$('#password').value;
    const name=$('#auth-name')?.value.trim(),company=$('#auth-business')?.value.trim();
    if(signup&&(!name||!company))throw new Error('Enter your name and business name.');
    const redirect=authReturnUrl();
    for(const key of ['invite','preview','sitekey','project','sale'])if(entryContext[key])redirect.searchParams.set(key,entryContext[key]);
    const result=signup?await api.auth.signUp({email,password,options:{emailRedirectTo:redirect.href,data:{full_name:name,portal_company_name:company,portal_terms_accepted_at:new Date().toISOString()}}}):await api.auth.signInWithPassword({email,password});
    const signupUser=result.data?.user;
    const existingSignup=signup&&!result.data?.session&&(
      ['user_already_exists','email_exists'].includes(result.error?.code)||
      (!result.error&&signupUser&&Array.isArray(signupUser.identities)&&signupUser.identities.length===0)
    );
    if(existingSignup){
      $('#password').value='';
      openAccountLogin(email,'We could not confirm a new signup for this address. If you already registered, log in, use your original Google sign-in, or choose Forgot your password.');
      return;
    }
    if(result.error)throw result.error;$('#password').value='';
    if(!result.data?.session){
      if(signup&&signupUser?.id){awaitingSignupConfirmation=true;renderSignupConfirmation(email,{name,company});return;}
      throw new Error(signup?'The signup could not be confirmed. Please try again or contact Kiara.':'No sign-in session was returned. Please try again.');
    }
    await verifiedUser();lastAuthNotice='';
    await routeAfterAuthentication();
  }catch(e){message(e.message||'Unable to sign in. Please try again.');}
  finally{busy=false;if(button.isConnected){button.disabled=!$('#auth-consent')?.checked;button.textContent=authMode==='signup'?'Create account':'Log in';}}
}
function openAccountLogin(email,notice=''){
  awaitingSignupConfirmation=false;lastAuthNotice='';authMode='login';renderAccount();
  $('#email').value=email;$('#password').value='';
  if(notice)message(notice);
  focusStage();
}
function renderSignupConfirmation(email,signupDetails={}){
  $('#account-welcome').hidden=false;
  $('#account-welcome').innerHTML=title('ONE MORE STEP','Check your email to continue.','Look for a confirmation link at '+esc(email)+'. Opening a valid link will sign you in and continue setup. If you already registered, use Log in below.');
  $('#stage').innerHTML='<p class="hint">Your preview link stays connected. You do not need to enter your password again after confirming in this browser.</p><p id="message" class="message" role="status"></p><button type="button" class="primary" id="check-signup-session">I’ve confirmed my email — continue</button><div class="confirmation-actions"><button type="button" class="secondary" id="resend-signup-email">Resend confirmation email</button><button type="button" class="text-button" id="change-signup-email">Use a different email</button><button type="button" class="text-button" id="confirmation-login">Already registered? Log in</button><button type="button" class="text-button" id="confirmation-reset">Reset password</button></div>';
  $('#check-signup-session').onclick=async()=>{
    if(busy)return;busy=true;$('#check-signup-session').disabled=true;
    try{
      const {data,error}=await api.auth.getSession();if(error)throw error;
      if(!data?.session){message('Open the confirmation link in this browser first, then continue here.');return;}
      await continueConfirmedSignup();
    }catch(error){message(error.message||'Could not continue setup. Please try again.');}
    finally{busy=false;const button=$('#check-signup-session');if(button)button.disabled=false;}
  };
  $('#resend-signup-email').onclick=async()=>{
    if(busy||!awaitingSignupConfirmation)return;
    const button=$('#resend-signup-email');busy=true;button.disabled=true;button.textContent='Sending…';message('');
    try{
      const {error}=await api.auth.resend({type:'signup',email,options:{emailRedirectTo:authReturnUrl().href}});
      if(error)throw error;
      message('Resend request accepted. This does not confirm email delivery. Check your inbox and spam folder; if you already registered, use Log in or Reset password below.',true);
    }catch(error){message(error.message||'Could not resend the confirmation email. Please try again.');}
    finally{busy=false;if(button.isConnected){button.disabled=false;button.textContent='Resend confirmation email';}}
  };
  $('#confirmation-login').onclick=()=>{
    if(busy)return;openAccountLogin(email);
  };
  $('#confirmation-reset').onclick=async()=>{
    if(busy)return;openAccountLogin(email);await forgotPassword();
  };
  $('#change-signup-email').onclick=()=>{
    if(busy)return;
    awaitingSignupConfirmation=false;lastAuthNotice='';authMode='signup';renderAccount();
    $('#auth-name').value=signupDetails.name||'';$('#auth-business').value=signupDetails.company||'';
    $('#email').value='';$('#password').value='';$('#email').focus();
  };
  focusStage();
}
async function continueConfirmedSignup(){
  if(!awaitingSignupConfirmation)return;
  // Clear before routing so repeated auth events cannot start setup twice.
  awaitingSignupConfirmation=false;
  try{await verifiedUser();lastAuthNotice='';await routeAfterAuthentication();}
  catch(error){awaitingSignupConfirmation=true;throw error;}
}
function renderProfile(){
  $('#stage').innerHTML=title('A QUICK INTRODUCTION','What should we call you?','These details will be used in your client portal.')+`<form id="popup-profile-form"><label class="field"><span>Your name</span><input id="profile-name" autocomplete="name" value="${esc(state.profile?.full_name||state.user.user_metadata?.full_name||'')}" maxlength="100" required></label><label class="field"><span>Business name</span><input id="profile-business" autocomplete="organization" value="${esc(state.user.user_metadata?.portal_company_name||state.salesPreview?.site_title||'')}" maxlength="100" required></label><p id="message" class="message" role="status"></p><button type="submit" class="primary" id="profile-submit">Continue →</button></form>`;
  $('#popup-profile-form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const name=$('#profile-name').value.trim(),business=$('#profile-business').value.trim();
    if(!name||!business){message('Enter your name and business name.');return;}
    busy=true;$('#profile-submit').disabled=true;
    try{await saveProfileFields(name,business);await continueAfterProfile();}catch(err){message(err.message);}finally{busy=false;if($('#profile-submit'))$('#profile-submit').disabled=false;}
  };
}
function renderSalesChoice(){
  $('#stage').innerHTML=title('YOUR WEBSITE PREVIEWS','Which website are we finishing?','These previews are linked to your signed-in account.')+`<div class="sales-preview-options">${state.salesChoices.map((p,i)=>`<button class="sales-preview-option" type="button" data-sales-choice="${i}"><span>${esc(p.site_title)}</span><span aria-hidden="true">→</span></button>`).join('')}</div><p id="message" class="message" role="status"></p>`;
  root.querySelectorAll('[data-sales-choice]').forEach(b=>b.onclick=async()=>{
    if(busy)return;busy=true;b.disabled=true;
    try{state.salesPreview=state.salesChoices[Number(b.dataset.salesChoice)];entryContext.sale=state.salesPreview.sale_id;await selectSalesProject();await continueProfileOrCheckout();}catch(e){message(e.message);}finally{busy=false;if(b.isConnected)b.disabled=false;}
  });
}
function renderAgreement(){
  signatureDrawn=false;signatureData='';
  $('#stage').innerHTML=title('YOUR WEBSITE AGREEMENT','Let’s make it official.','Your agreement applies to '+esc(state.project.display_name)+'.')+
    `<p class="agreement-summary">${money(CONFIG.development)} one-time development. Then Standard ${money(CONFIG.standard)}/month or Business ${money(CONFIG.business)}/month for hosting and ongoing support.</p><button class="text-button" type="button" id="read-terms">Read the full agreement ↗</button><form id="agreement-form"><label class="check-label"><input type="checkbox" id="agree" required><span>I have reviewed the agreement for this website, accept its terms, and consent to sign electronically.</span></label><label for="signature" class="signature-label">Your signature</label><div class="signature-pad"><span class="signature-placeholder" id="signature-placeholder">Draw your signature here</span><canvas id="signature" width="800" height="200" tabindex="0" aria-label="Draw your electronic signature"></canvas></div><div class="signature-bottom"><span class="hint">Draw above or type your full legal name below.</span><button class="text-button" id="clear-signature" type="button">Clear</button></div><div id="typed-signature-wrap"><label class="field"><span>Type your full legal name</span><input id="typed-signature" autocomplete="name" maxlength="100" placeholder="Your electronic signature"></label></div><p id="message" class="message" role="status"></p><button id="submit" class="primary form-submit" type="submit" disabled>Sign agreement &amp; continue →</button></form>`;
  $('#read-terms').onclick=showTerms;$('#agree').onchange=()=>setBusy(busy);setupSignature();
  $('#agreement-form').onsubmit=signAgreement;
}
async function signAgreement(event){
  event.preventDefault();if(busy)return;
  if(!$('#agree')?.checked||!signatureDrawn||!signatureData){message('Accept the agreement and add your signature to continue.');return;}
  const png=signatureData;setBusy(true);message('');
  try{
    if(demo)state.agreement={id:'preview-agreement',signed_at:new Date().toISOString()};
    else{
      await verifiedUser();await assertPreviewApproval();
      let existing=await loadAgreement();
      if(!existing){
        const {error}=await api.from('portal_project_agreements').insert({user_id:state.user.id,project_id:state.project.id,agreement_version:CONFIG.agreementVersion,agreement_title:'Steady Hands LLC — Website-Specific Services Agreement',signature_png:png,acknowledged:true,website_name:state.project.display_name});
        if(error&&error.code!=='23505')throw error;existing=await loadAgreement();
      }
      if(!existing)throw new Error('Your signed agreement could not be confirmed.');state.agreement=existing;
      await hydratePayments();
    }
    chooseStage();render(true);if(state.stage===1)showOverview();
  }catch(e){message(e.message||'Your signature could not be saved. Please try again.');}
  finally{busy=false;if($('#submit'))setBusy(false);}
}

function setupSignature(){
  const canvas=$('#signature'),ctx=canvas.getContext('2d');
  ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#173459';
  let down=false, distance=0, prev=null;
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*800/r.width,y:(e.clientY-r.top)*200/r.height};};
  canvas.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();down=true;prev=point(e);canvas.setPointerCapture(e.pointerId);ctx.beginPath();ctx.moveTo(prev.x,prev.y);};
  canvas.onpointermove=e=>{if(!down)return;const p=point(e);distance+=Math.hypot(p.x-prev.x,p.y-prev.y);ctx.lineTo(p.x,p.y);ctx.stroke();prev=p;if(distance>12){signatureDrawn=true;$('#signature-placeholder').hidden=true;setBusy(busy);}};
  const end=()=>{if(down&&signatureDrawn)signatureData=canvas.toDataURL('image/png');down=false;};
  canvas.onpointerup=end;canvas.onpointercancel=end;
  $('#clear-signature').onclick=()=>{ctx.clearRect(0,0,800,200);signatureDrawn=false;signatureData='';distance=0;$('#signature-placeholder').hidden=false;$('#typed-signature').value='';setBusy(busy);};
  $('#typed-signature').oninput=e=>{ctx.clearRect(0,0,800,200);const name=e.target.value.trim();signatureDrawn=name.length>=3;$('#signature-placeholder').hidden=signatureDrawn;if(signatureDrawn){ctx.font='italic 46px Georgia';ctx.fillStyle='#173459';ctx.fillText(name,30,120,740);signatureData=canvas.toDataURL('image/png');}else signatureData='';setBusy(busy);};
}
function readEntryContext(){
  const p=new URL(location.href).searchParams;
  const fresh=['invite','project','preview','preview_code','sitekey','sale'].some(k=>p.has(k));
  if(!fresh){try{return JSON.parse(storage.get('steadyhands.checkout.entry',true)||'null')||{};}catch{return {};}}
  const rawSitekey=p.get('sitekey'),rawPreview=p.get('preview')||p.get('preview_code'), rawInvite=p.get('invite'), project=p.get('project'), sale=p.get('sale');
  const value={};
  if(rawSitekey){const key=rawSitekey.trim();if(key&&key.length<=200&&!/[\s\x00-\x1f]/.test(key))value.sitekey=key;else value.invalid=true;}
  if(rawPreview){if(/^[a-z0-9][a-z0-9_-]{1,99}$/i.test(rawPreview))value.preview=rawPreview.toUpperCase();else value.invalid=true;}
  if(rawInvite){if(/^[a-f0-9]{64}$/i.test(rawInvite)){value.invite=rawInvite;storage.set('steadyhands.portal.invite',rawInvite,true);}else value.invalid=true;}
  if(project){if(/^[a-z0-9-]{1,100}$/i.test(project))value.project=project;else value.invalid=true;}
  if(sale){if(/^[a-z0-9-]{1,100}$/i.test(sale))value.sale=sale;else value.invalid=true;}
  storage.set('steadyhands.checkout.entry',JSON.stringify(value),true);return value;
}
function entryProjectId(){return entryContext.project||storage.get('steadyhands.checkout.project.'+state.user.id+(entryContext.preview?'.'+entryContext.preview:''));}
function rememberProject(){
  storage.set('steadyhands.checkout.project.'+state.user.id,state.project.id);
  if(entryContext.preview)storage.set('steadyhands.checkout.project.'+state.user.id+'.'+entryContext.preview,state.project.id);
  entryContext.project=state.project.id;
  storage.set('steadyhands.checkout.entry',JSON.stringify(entryContext),true);
  const url=new URL(location.href);url.searchParams.set('project',state.project.id);if(entryContext.preview)url.searchParams.set('preview',entryContext.preview);if(entryContext.sitekey)url.searchParams.set('sitekey',entryContext.sitekey);if(entryContext.sale)url.searchParams.set('sale',entryContext.sale);url.searchParams.delete('invite');history.replaceState({},'',url);
}
function safePreviewUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname!=='localhost'&&!/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)&&!u.hostname.includes(':')?u.href:null;}catch{return null;}
}
async function publicPreviewByCode(key){
  // Same public catalog and known codes as the portal, restricted to real /sites/<folder>/index.html entries.
  const known={ '24HRTIRESERVICE':{folder:'24hrtireservice',title:'24 HR Mobile Tire Service'},'DEBBYSCREW':{folder:'debbyscrew',title:"Debby’s Crew LLC"},'SHS-GHWH26M9R7Q2':{folder:'greenhousewaterheaters',title:'Greenhouse Water Heaters'} };
  let folders=null;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
  try{
    const response=await fetch('https://api.github.com/repos/Merci-Chi/Steadyhandsop/git/trees/main?recursive=1',{signal:controller.signal,credentials:'omit'});
    if(!response.ok)throw new Error('Catalog unavailable');
    const tree=await response.json();
    if(tree.truncated||!Array.isArray(tree.tree))throw new Error('Catalog incomplete');
    folders=[...new Set(tree.tree.filter(x=>x.type==='blob').map(x=>/^sites\/([^/]+)\/index\.html?$/i.exec(x.path||'')?.[1]).filter(Boolean))];
  }catch{}finally{clearTimeout(timeout);}
  const folder=known[key]?.folder||folders?.find(f=>f.toUpperCase()===key);
  if(!folder||(folders&&!folders.includes(folder)))return null;
  return {site_key:key,site_title:known[key]?.title||folder.replace(/[-_]+/g,' '),preview_url:'https://steadyhandsop.com/sites/'+encodeURIComponent(folder)+'/'};
}
function existingSiteKey(project){return project?.details?.__checkout_sitekey||(project?.details?.__approved_preview?.kind==='sitekey'?project.details.__approved_preview.site_key:null);}
function samePreviewIdentity(saved,preview){
  if(!saved||!preview)return false;
  const sameKey=preview.kind==='sitekey'?String(saved.site_key)===String(preview.site_key):String(saved.site_key).toUpperCase()===String(preview.site_key).toUpperCase();
  return sameKey&&safePreviewUrl(saved.preview_url)===safePreviewUrl(preview.preview_url);
}
async function resolveSiteKeyPreview(value){
  const key=String(value||'').trim();if(!key||key.length>200||/[\s\x00-\x1f]/.test(key))throw new Error('This site key is invalid. Please ask Kiara to check your preview link.');
  // This is the same public preview RPC used by steadyhandsop.com/Previews/preview-runtime.js.
  // It does not grant CRM/company membership, and no site_keys record is created here.
  const {data,error}=await api.rpc('get_site_by_key',{p_site_key:key});
  if(error)throw new Error('Your website preview could not be loaded: '+error.message);
  const row=Array.isArray(data)?data[0]:data;
  if(!row||(row.site_key!=null&&String(row.site_key)!==key)||row.active===false)throw new Error('This site key was not found or is inactive. Contact Kiara for help.');
  const url=new URL('/Previews/generic.html','https://steadyhandsop.com');url.searchParams.set('sitekey',key);
  return {kind:'sitekey',site_key:key,site_title:String(row.company_name||'Your Website Preview').slice(0,160),preview_url:url.href};
}
function keyFromPreviewUrl(value){try{const u=new URL(value);return u.origin==='https://steadyhandsop.com'&&u.pathname==='/Previews/generic.html'?u.searchParams.get('sitekey'):null;}catch{return null;}}
function framePreviewUrl(preview){
  const u=new URL(preview.preview_url);
  if(preview.kind==='sitekey'||keyFromPreviewUrl(preview.preview_url))u.searchParams.set('portal_embed','1');
  return u.href;
}

async function loadPreview(){
  if(demo)return state.preview;
  state.previewApproved=false;
  if(entryContext.invalid)throw new Error('This preview link is invalid. Please request a new link from Kiara.');
  const saved=state.project?.details?.__approved_preview;
  const saleId=state.project?.details?.__sales_sale_id||state.salesPreview?.sale_id;
  if(saleId){
    const choices=await salesPreviews(true), preview=choices.find(p=>p.sale_id===String(saleId));
    if(!preview)throw new Error('Your salesperson’s preview is not available to this account. Contact Kiara.');
    const key=keyFromPreviewUrl(preview.preview_url);
    if(entryContext.sitekey&&key!==entryContext.sitekey)throw new Error('This sales invitation and site key refer to different previews. Please ask Kiara to check the link.');
    state.salesPreview=preview;state.preview=key?{...await resolveSiteKeyPreview(key),site_title:preview.site_title}:{site_key:preview.site_key,site_title:preview.site_title,preview_url:preview.preview_url};
    state.previewApproved=!!state.project.details?.__design_approved_at&&samePreviewIdentity(saved,state.preview);
    return state.preview;
  }

  const sitekey=entryContext.sitekey||existingSiteKey(state.project);
  if(sitekey){
    state.preview=await resolveSiteKeyPreview(sitekey);
    state.previewApproved=!!state.project?.details?.__design_approved_at&&samePreviewIdentity(saved,state.preview);return state.preview;
  }
  const key=entryContext.preview||state.project?.preview_code||state.project?.details?.__checkout_entry_preview||saved?.site_key;
  if(!key){state.preview=null;return null;}
  const normalized=String(key).toUpperCase();
  const find=async()=>{
    const results=await Promise.all([
      api.from('portal_preview_claims').select('site_key,site_title,preview_url').eq('user_id',state.user.id).eq('site_key',normalized).maybeSingle(),
      api.from('portal_previews').select('site_key,site_title,preview_url').eq('site_key',normalized).maybeSingle()
    ]);
    return results.map(r=>r.data).find(p=>p&&String(p.site_key).toUpperCase()===normalized&&safePreviewUrl(p.preview_url));
  };
  let found=await find();
  if(!found && saved && String(saved.site_key).toUpperCase()===normalized && safePreviewUrl(saved.preview_url))found=saved;
  if(!found)found=await publicPreviewByCode(normalized);
  if(!found){
    const claim=await api.rpc('claim_portal_preview',{p_code:normalized});
    if(!claim.error)found=await find();
  }
  if(!found){state.preview=null;throw new Error('This preview is not available to your account. Please check your link or contact Kiara.');}
  state.preview={site_key:normalized,site_title:String(found.site_title||state.project.display_name).slice(0,160),preview_url:safePreviewUrl(found.preview_url)};
  state.previewApproved=!!state.project.details?.__design_approved_at && String(saved?.site_key).toUpperCase()===normalized && safePreviewUrl(saved?.preview_url)===state.preview.preview_url;
  return state.preview;
}
function renderPreview(){
  const preview=state.preview;
  $('#stage').innerHTML=title('YOUR WEBSITE PREVIEW','A first look at your website.','Review your site below. Approve the preview so Kiara can finish it with your final details.')+
    (preview?`<div class="website-preview"><div class="preview-toolbar"><span class="browser-dots" aria-hidden="true">● ● ●</span><strong>${esc(preview.site_title)}</strong><span class="preview-status">PREVIEW</span></div><div class="preview-viewport"><iframe id="site-preview" title="Website preview for ${esc(preview.site_title)}" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer" loading="eager"></iframe></div><div class="preview-caption"><span>Preview created by <strong>Kiara</strong></span>${!demo?`<a href="${esc(preview.preview_url)}" target="_blank" rel="noopener noreferrer">Open full preview ↗</a>`:'<span>Example website</span>'}</div></div><p class="hint">If the embedded preview is unavailable, use “Open full preview” to review your website.</p><label class="check-label"><input id="approve-check" type="checkbox"><span>I have reviewed this preview and approve its design. I understand Kiara will finish the website after checkout.</span></label><p id="message" class="message" role="status"></p>${primary('Approve preview & continue','approve-preview',true)}<button type="button" class="text-button preview-help" data-contact-developer>Need changes first? Contact Kiara</button>`:
    `<div class="notice"><strong>Let’s connect your preview.</strong><br>Use the checkout link sent from your website preview, or enter the preview code Kiara shared with you.</div><form id="preview-code-form"><label class="field"><span>Preview code</span><input id="preview-code" maxlength="100" autocapitalize="characters" placeholder="Your preview code" required></label><button class="secondary" id="load-preview" type="submit">Load my preview</button></form><p id="message" class="message" role="status"></p><button type="button" class="text-button preview-help" data-contact-developer>Contact Kiara for your preview link</button>`);
  if(preview){
    const frame=$('#site-preview');
    if(demo)frame.srcdoc=`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui;color:#173459;background:#fff}.nav{padding:28px 38px;display:flex;justify-content:space-between;border-bottom:1px solid #e2eaf4;font-size:15px}.hero{padding:65px 45px;background:#edf5ff;display:flex;justify-content:space-between;align-items:center;gap:20px}h1{font-size:44px;line-height:1.1;margin:17px 0}p{font-size:16px;color:#6b7d95;line-height:1.8}.tag{font-size:11px;letter-spacing:2px;color:#247bed}.button{background:#247bed;color:white;border-radius:9px;padding:15px 22px;display:inline-block;font-size:13px}.art{width:170px;height:225px;border-radius:90px 90px 15px 15px;background:linear-gradient(145deg,#17498f,#39b8ff);box-shadow:15px 15px 0 #d8e9fe;flex-shrink:0}.bottom{display:flex;justify-content:space-between;padding:36px;font-size:15px;color:#7188a5}</style><div class="nav"><b>${esc(state.project.display_name)}</b><span>About &nbsp; Services &nbsp; Contact</span></div><div class="hero"><div><div class="tag">BUILT AROUND YOUR BUSINESS</div><h1>Your business.<br>A new chapter.</h1><p>A website that works as hard as you do.</p><div class="button">Let’s get started →</div></div><div class="art"></div></div><div class="bottom"><span>Thoughtful design</span><span>Made for mobile</span><span>Built to grow</span></div></html>`;
    else frame.src=framePreviewUrl(preview);
    $('#approve-check').onchange=()=>{$('#approve-preview').disabled=!$('#approve-check').checked;};
    $('#approve-preview').onclick=approvePreview;
  }else $('#preview-code-form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const code=$('#preview-code').value.trim();
    if(!/^[a-z0-9][a-z0-9_-]{1,99}$/i.test(code)){message('Enter the preview code from your link.');return;}
    busy=true;$('#load-preview').disabled=true;
    try{entryContext.invalid=false;entryContext.preview=code.toUpperCase();storage.set('steadyhands.checkout.entry',JSON.stringify(entryContext),true);await loadPreview();if(!state.preview)throw new Error('Preview not found.');render(true);}catch(error){message(error.message);}finally{busy=false;if($('#load-preview'))$('#load-preview').disabled=false;}
  };
}
async function approvePreview(){
  if(busy||!$('#approve-check')?.checked||!state.preview){message('Please review the preview and confirm your approval.');return;}
  const button=$('#approve-preview');button.disabled=true;button.textContent='Saving your approval…';busy=true;message('');
  try{
    if(!demo){
      await verifiedUser();
      // Re-resolve the linked record and preserve the latest project details.
      state.project=await checked(api.from('portal_website_projects').select('*').eq('id',state.project.id).eq('user_id',state.user.id).single());
      await loadPreview();if(!state.preview)throw new Error('Your linked preview could not be verified.');
    }
    const details={...(state.project.details||{}),__design_source:'preview',__design_approved_at:new Date().toISOString(),__approved_preview:{...state.preview},__checkout_developer:{name:CONFIG.developerName,email:CONFIG.supportEmail},...(state.preview.kind==='sitekey'?{__checkout_sitekey:state.preview.site_key}:{})};
    if(!demo)state.project=await checked(api.from('portal_website_projects').update({preview_code:state.preview.site_key,details,...(state.project.status==='draft'?{status:'awaiting_payment',submitted_at:new Date().toISOString()}:{})}).eq('id',state.project.id).eq('user_id',state.user.id).select().single());
    else state.project.details=details;
    state.previewApproved=true;if(!demo)rememberProject();
    chooseStage();render(true);
    
  }catch(e){message(e.message||'Your approval could not be saved. Please try again.');}
  finally{busy=false;if(button.isConnected){button.disabled=!$('#approve-check')?.checked;button.textContent='Approve preview & continue';}}
}
async function assertPreviewApproval(){
  if(!state.project||!state.preview||!state.previewApproved)throw new Error('Approve your website preview before continuing.');
  const latest=await checked(api.from('portal_website_projects').select('*').eq('id',state.project.id).eq('user_id',state.user.id).single());
  const approved=latest.details?.__approved_preview;
  if(!latest.details?.__design_approved_at||!samePreviewIdentity(approved,state.preview))throw new Error('Your saved preview approval could not be confirmed. Please review your preview again.');
  state.project=latest;
}
function showDeveloper(){
  const subject='Website development: '+(state.project?.display_name||'My website');
  const body='Hi Kiara,\n\nI have a site development request for '+(state.project?.display_name||'my website')+'.\n'+(state.project?.id&&!demo?'Project: '+state.project.id+'\n':'')+(state.submitted?.preferred_domain?'Preferred domain: '+state.submitted.preferred_domain+'\n':'')+'\nMy request:\n';
  openModal(`<p class="tag">YOUR PREVIEW CREATOR</p><h2 id="modal-title">Contact Developer</h2><div class="developer-contact"><span class="developer-avatar" aria-hidden="true">K</span><div><strong>Kiara</strong><a href="mailto:kiara@steadyhandsop.com">kiara@steadyhandsop.com</a></div></div><p class="sub">Kiara created your preview and will help finish your website. Send any site development requests directly to her.</p><a class="primary modal-action" href="mailto:kiara@steadyhandsop.com?subject=${encodeURIComponent(subject)}&amp;body=${encodeURIComponent(body)}">Email Kiara <span class="arrow" aria-hidden="true">↗</span></a><div class="portal-management"><strong>For account management</strong><p>Manage the status of your site, billing, or cancellations through your client portal.</p><a class="secondary" href="https://portal.steadyhandsop.com" target="_blank" rel="noopener noreferrer">Open client portal ↗</a></div>`);
}
document.addEventListener('click',event=>{if(event.target.closest('[data-contact-developer]')){event.preventDefault();showDeveloper();}});

async function getApi(){
  if(api)return api;
  if(!apiPromise)apiPromise=import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm').then(({createClient})=>api=createClient(CONFIG.supabaseUrl,CONFIG.supabaseKey,{auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}})).catch(()=>{apiPromise=null;throw new Error('Could not connect to secure sign-in. Check your internet connection and try again.');});
  return apiPromise;
}
async function checked(query){const {data,error}=await query;if(error)throw error;return data;}
async function verifiedUser(){const client=await getApi();const {data,error}=await client.auth.getUser();if(error||!data?.user)throw new Error('Your session has expired. Please log in again.');state.user=data.user;return data.user;}
async function loadAgreement(){
  if(!state.project)return null;
  return checked(api.from('portal_project_agreements').select('id,agreement_version,signed_at,website_name').eq('user_id',state.user.id).eq('project_id',state.project.id).eq('agreement_version',CONFIG.agreementVersion).eq('acknowledged',true).maybeSingle());
}
async function forgotPassword(){
  if(busy)return;
  if(demo){message('Preview only. In live mode, this sends a password reset email.',true);return;}
  const email=$('#email');if(!email.reportValidity())return;
  busy=true;
  try{const client=await getApi();const {error}=await client.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:'https://portal.steadyhandsop.com/reset-password.html'});if(error)throw error;message('Password reset requested. If this address has an eligible account, check its inbox and spam folder for instructions.',true);}catch(e){message(e.message);}finally{busy=false;}
}
function paymentCode(purpose){
  const code=state.codes[purpose]||'';
  return `<section class="payment-code"><button type="button" class="text-button" id="code-toggle" aria-expanded="${!!code}" aria-controls="payment-code-fields">Have a code?</button><form id="payment-code-fields" ${code?'':'hidden'}><label for="payment-code-input">Enter your code</label><div class="payment-code-row"><input id="payment-code-input" type="text" value="${esc(code)}" maxlength="80" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Enter your code"><button class="secondary" type="submit">Apply</button></div><small id="code-feedback" role="status">${code?(purpose==='development'?'Apply your code to waive the development fee.':'Code added. It will be verified at checkout.'):''}</small></form></section>`;
}
function paymentBlock(purpose){
  const exists=!!state.sessions[purpose];
  return paymentCode(purpose)+(demo?'<div class="demo-payment">Preview payment only. No Square checkout or charge will be created.</div>':'')+
    primary(demo?'Preview payment':exists?'Open another Square checkout':purpose==='development'?`Pay ${money(CONFIG.development)} with Square`:`Pay ${money(CONFIG[state.plan])}/month with Square`,'pay')+
    (exists&&!demo?'<button type="button" class="secondary verify-button" id="verify-payment">I’ve paid — check payment status</button>':'')+
    `<div class="payment-note">${icons.lock}<span>${demo?'Simulated payments are clearly marked throughout this preview.':'Square’s secure checkout opens in a new tab. Keep this portal open; we’ll verify your payment when you return.'}</span></div><p id="message" class="message" role="status"></p>`;
}
function renderDevelopment(){
  $('#stage').innerHTML=`<div class="payment-heading"><div class="verified-badge">✓ Agreement accepted</div><p class="tag">PAYMENT 1 OF 2</p></div>`+title('','Let’s build your website.','A one-time development fee for a website built around your business.')+
    `<div class="price-line"><strong>${money(CONFIG.development)}</strong><span>one-time<small>Separate from monthly hosting</small></span></div><ul class="feature-list"><li>Website design &amp; development</li><li>A layout that works on mobile and desktop</li><li>Review your website before it goes live</li></ul><div class="notice"><strong>One build. Ongoing partnership.</strong><br>Your hosting plan includes continued maintenance and technical support after launch.</div>`+paymentBlock('development');
  bindPayment('development');
}
function renderHosting(){
  const locked=!!state.sessions.hosting;
  $('#stage').innerHTML=`<div class="verified-badge">✓ ${state.developmentWaived?'Development fee waived by code':`Development payment ${demo?'previewed':'verified'}`}</div>`+title('PAYMENT 2 OF 2','Keep your website growing.','Choose the hosting and support that fit your business. Both plans include a team that stays with you.')+
    `<fieldset style="border:0;padding:0;margin:0"><legend class="hint">Choose one monthly hosting plan</legend><label class="plan"><div class="plan-head"><input type="radio" name="hosting" value="standard" ${state.plan==='standard'?'checked':''} ${locked?'disabled':''}><span class="plan-title">Standard</span><span class="plan-price">${money(CONFIG.standard)}<small>/month</small></span></div><p class="plan-kicker">The essentials, taken care of.</p><ul class="feature-list"><li>Keep your site running</li><li>Ongoing maintenance &amp; technical support</li><li>Help with website issues and updates</li><li>No surprising fees — extras need your approval</li></ul></label><label class="plan"><div class="plan-head"><input type="radio" name="hosting" value="business" ${state.plan==='business'?'checked':''} ${locked?'disabled':''}><span class="plan-title">Business <span class="recommended">Do more</span></span><span class="plan-price">${money(CONFIG.business)}<small>/month</small></span></div><p class="plan-kicker">Everything in Standard, plus tools to run your business.</p><ul class="feature-list"><li>Manage your website content</li><li>Send invoices &amp; estimates</li><li>Secure client logins</li><li>Approve reviews through your site</li><li>Online booking</li><li>Editable photo gallery</li></ul></label></fieldset><p class="billing-note">Monthly subscription, automatically renewed until canceled. Request cancellation through your portal or developer. Business tools are configured to your agreed website scope; third-party service charges, if any, are disclosed separately.</p>`+paymentBlock('hosting');
  root.querySelectorAll('[name="hosting"]').forEach(el=>el.onchange=()=>{state.plan=el.value;savePreview();$('#pay').innerHTML=(demo?'Preview payment':`Pay ${money(CONFIG[state.plan])}/month with Square`)+'<span class="arrow" aria-hidden="true">→</span>';});
  bindPayment('hosting');
}
function bindPayment(purpose){
  $('#pay').onclick=()=>startPayment(purpose);
  if($('#verify-payment'))$('#verify-payment').onclick=()=>checkPayments(true);
  const toggle=$('#code-toggle'),form=$('#payment-code-fields');
  if(!toggle||!form)return;
  toggle.onclick=()=>{form.hidden=!form.hidden;toggle.setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)$('#payment-code-input').focus();};
  $('#payment-code-input').oninput=()=>{delete state.codes[purpose];$('#code-feedback').textContent='';};
  form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    const code=$('#payment-code-input').value.trim();
    if(!code){delete state.codes[purpose];$('#code-feedback').textContent='Enter your code.';$('#payment-code-input').focus();return;}
    if(purpose==='development'){
      if(demo){$('#code-feedback').textContent='Codes can only be redeemed after signing in to live checkout.';return;}
      const input=$('#payment-code-input'),apply=form.querySelector('[type="submit"]'),pay=$('#pay'),note=$('#code-feedback');
      busy=true;input.disabled=true;apply.disabled=true;pay.disabled=true;note.textContent='Verifying code…';
      try{
        await redeemDevelopmentCode(code);
        input.value='';delete state.codes.development;
        chooseStage();render(true);
        message('Code accepted. Your $100 development fee is waived. Choose your hosting plan.',true);
      }catch(error){note.textContent=error.message||'Your code could not be verified. Try again.';}
      finally{busy=false;if(input.isConnected)input.disabled=false;if(apply.isConnected)apply.disabled=false;if(pay.isConnected)pay.disabled=false;}
      return;
    }
    state.codes[purpose]=code;
    $('#code-feedback').textContent=demo?'Preview only. Codes are verified during live checkout.':'Code added. It will be verified at checkout.';
  };
}
function developmentComplete(){return state.paid.development||state.developmentWaived;}
async function promoRequest(body){
  const client=await getApi();
  const {data,error}=await client.functions.invoke('portal-promo',{body:{...body,projectId:state.project.id,agreementId:state.agreement.id}});
  if(error){let detail=error.message;try{const value=await error.context?.json();detail=value?.message||value?.error||detail;}catch{}throw new Error(detail||'Code verification is unavailable. Try again.');}
  if(!data||data.error||data.message)throw new Error(data?.message||data?.error||'Code verification is unavailable. Try again.');
  if(data.projectId&&data.projectId!==state.project.id)throw new Error('The code was not verified for this website.');
  return data;
}
async function refreshDevelopmentWaiver(){
  state.developmentWaived=false;
  const status=await promoRequest({action:'status'});
  state.developmentWaived=status.developmentBypass===true;
  return state.developmentWaived;
}
async function redeemDevelopmentCode(code){
  await verifiedUser();await assertPreviewApproval();
  const agreement=await loadAgreement();
  if(!agreement||agreement.id!==state.agreement.id)throw new Error('Sign your website agreement before applying a code.');
  const result=await promoRequest({action:'redeem',purpose:'local_development',code});
  if(result.valid!==true)throw new Error('This code is invalid or is not valid for the development fee.');
  if(!await refreshDevelopmentWaiver())throw new Error('The code was checked, but the development waiver was not confirmed. Please contact your developer.');
}
async function verifyDevelopment(){
  let paymentError;
  try{if(await verifyOne('development')){state.developmentWaived=false;return true;}}catch(error){paymentError=error;}
  try{if(await refreshDevelopmentWaiver())return true;}catch{}
  if(paymentError)throw paymentError;
  return false;
}
function safeSquareUrl(value){try{const u=new URL(value);return u.protocol==='https:'&& !u.username&&!u.password&&(/(^|\.)squareup\.com$/.test(u.hostname)||/(^|\.)square\.link$/.test(u.hostname))?u.href:null;}catch{return null;}}
async function invoke(body){
  const client=await getApi();const {data,error}=await client.functions.invoke('square-subscriptions',{body});
  if(error){let detail=error.message;try{const b=await error.context?.json();detail=b?.message||b?.error||detail;}catch{}throw new Error(detail||'Square checkout is unavailable. Contact your developer.');}
  if(data?.message||data?.error)throw new Error(data.message||data.error);
  return data;
}
async function persistPurchase(){
  const client=await getApi();await verifiedUser();
  const drafts={...(state.user.user_metadata?.portal_project_purchase_drafts||{}),[state.project.id]:{plan:state.plan==='business'?'backend':'standard',checkoutSessions:state.sessions,checkoutHistory:state.checkoutHistory,updated_at:new Date().toISOString()}};
  const {data,error}=await client.auth.updateUser({data:{portal_project_purchase_drafts:drafts}});
  if(error)throw error;state.user=data.user;
}
function openSquareCheckout(checkoutWindow,url){
  if(checkoutWindow&&!checkoutWindow.closed)checkoutWindow.location.replace(url);
  render();
  message(checkoutWindow&&!checkoutWindow.closed?'Square checkout opened in a new tab. Return here after paying.':'Your browser blocked the checkout tab. Use the link below to open it.');
  const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open Square checkout in a new tab';link.style.display='block';
  $('#message').appendChild(link);
}
async function startPayment(purpose){
  if(busy)return;
  const promoCode=$('#payment-code-input')?.value.trim()||state.codes[purpose]||'';
  if(purpose==='development'&&promoCode&&!demo){$('#payment-code-fields').requestSubmit();return;}
  if(promoCode&&purpose==='hosting')state.codes[purpose]=promoCode;
  if(!state.agreement || !state.previewApproved || (purpose==='hosting'&&!developmentComplete())){message('Approve your website preview and complete the agreement before payment. Development must be paid before hosting.');return;}
  if(demo){
    openModal(`<p class="tag">PREVIEW PAYMENT</p><h2 id="modal-title">${purpose==='development'?'Website development':state.plan==='standard'?'Standard hosting':'Business hosting'}</h2><div class="price-line"><strong>${money(purpose==='development'?CONFIG.development:CONFIG[state.plan])}</strong><span>${purpose==='development'?'one-time':'per month'}</span></div><p class="sub">This simulates a successful Square payment so you can review the next step. No money will be charged.</p><div class="modal-action">${primary('Simulate successful payment','simulate-payment')}</div>`);
    $('#simulate-payment').onclick=()=>{state.paid[purpose]=true;state.sessions[purpose]='preview-'+purpose;closeModal();go(purpose==='development'?2:3);};return;
  }
  busy=true;const button=$('#pay');button.disabled=true;button.textContent='Preparing secure checkout…';message('');
  let checkoutWindow=null,checkoutOpened=false;
  try{
    if(location.protocol!=='https:')throw new Error('Square checkout requires the hosted HTTPS page.');
    // Open during the click, before asynchronous work, so browsers allow the new tab.
    checkoutWindow=window.open('','_blank');
    if(checkoutWindow){checkoutWindow.opener=null;checkoutWindow.document.title='Preparing Square checkout';checkoutWindow.document.body.textContent='Preparing your secure Square checkout…';}
    await verifiedUser();
    await assertPreviewApproval();
    const agreement=await loadAgreement();if(!agreement||agreement.id!==state.agreement.id)throw new Error('Your website agreement could not be verified. Please contact your developer.');
    // An unpaid checkout never blocks a fresh link. Keep every reference so
    // payment in an earlier tab can still be verified after a later link opens.
    if(purpose==='hosting'&&!await verifyDevelopment())throw new Error('Your development payment or fee waiver could not be verified.');
    const kind=purpose==='development'?'development':state.plan;
    const returnTo=new URL(location.href);returnTo.searchParams.set('project',state.project.id);returnTo.searchParams.set('square_checkout','return');returnTo.hash='';
    const data=await invoke({action:'create-checkout',planKey:plans[kind],agreementId:agreement.id,projectId:state.project.id,returnUrl:returnTo.href,...(promoCode?{promoCode}:{})});
    const expectedPurpose=kind==='business'?'backend':kind;
    const url=safeSquareUrl(data?.checkoutUrl);
    if(!url || !data?.checkoutId || data.projectId!==state.project.id || data.agreementId!==agreement.id || data.purpose!==expectedPurpose)throw new Error('Square did not return a valid checkout linked to this website and agreement. No payment has been confirmed. Please contact your developer.');
    if(promoCode&&data.promoCodeAccepted!==true)throw new Error('Your code could not be confirmed. No payment has been taken. Contact your developer before continuing.');
    state.checkoutHistory[purpose]=[...new Set([...checkoutIds(purpose),data.checkoutId])];
    state.sessions[purpose]=data.checkoutId;
    storage.set('steadyhands.checkout.pending.'+state.user.id+'.'+state.project.id,JSON.stringify({checkoutSessions:state.sessions,checkoutHistory:state.checkoutHistory,plan:state.plan==='business'?'backend':'standard'}));
    storage.set('steadyhands.checkout.url.'+data.checkoutId,url,true);
    // Save the checkout reference before opening Square. It is never payment proof.
    await persistPurchase();
    openSquareCheckout(checkoutWindow,url);checkoutOpened=true;
  }catch(e){message(e.message||'Could not start Square checkout. Please try again.');if(state.sessions[purpose])renderPaymentFailure(e.message);}
  finally{if(!checkoutOpened&&checkoutWindow&&!checkoutWindow.closed)checkoutWindow.close();busy=false;if(button.isConnected){button.disabled=false;button.innerHTML=(state.sessions[purpose]?'Open another Square checkout':'Try Square checkout again')+'<span class="arrow" aria-hidden="true">→</span>';}}
}
function renderPaymentFailure(text){render();message(text);}
function checkoutIds(purpose){
  return [...new Set([state.sessions[purpose],...(Array.isArray(state.checkoutHistory[purpose])?state.checkoutHistory[purpose]:[])].filter(id=>typeof id==='string'&&id))];
}
async function verifyOne(purpose){
  const ids=checkoutIds(purpose);if(!ids.length)return false;
  const results=await Promise.allSettled(ids.map(async checkoutId=>{
    const data=await invoke({action:'verify-checkout',checkoutId,projectId:state.project.id,purpose});
    if(data?.projectId!==state.project.id || data?.purpose!==purpose || (data.checkoutId&&data.checkoutId!==checkoutId))throw new Error('Payment verification did not match this website. Contact your developer.');
    return {checkoutId,data};
  }));
  const verified=results.find(result=>result.status==='fulfilled'&&result.value.data.verified===true)?.value;
  state.paid[purpose]=!!verified;
  if(verified){
    state.sessions[purpose]=verified.checkoutId;
    state.documents[purpose]=safeSquareUrl(verified.data.invoiceUrl)||safeSquareUrl(verified.data.receiptUrl);
    return true;
  }
  const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  return false;
}
async function hydratePayments(){
  let backup={};try{backup=JSON.parse(storage.get('steadyhands.checkout.pending.'+state.user.id+'.'+state.project.id)||'{}');}catch{}
  const remote=state.user.user_metadata?.portal_project_purchase_drafts?.[state.project.id]||{};
  const draft={...backup,...remote,checkoutSessions:{...(backup.checkoutSessions||{}),...(remote.checkoutSessions||{})}};
  state.sessions=draft.checkoutSessions&&typeof draft.checkoutSessions==='object'?{...draft.checkoutSessions}:{};
  state.checkoutHistory={};
  for(const purpose of ['development','hosting']){
    state.checkoutHistory[purpose]=[...new Set([
      ...(Array.isArray(backup.checkoutHistory?.[purpose])?backup.checkoutHistory[purpose]:[]),
      ...(Array.isArray(remote.checkoutHistory?.[purpose])?remote.checkoutHistory[purpose]:[]),
      backup.checkoutSessions?.[purpose],remote.checkoutSessions?.[purpose]
    ].filter(id=>typeof id==='string'&&id))];
    if(!state.sessions[purpose]&&state.checkoutHistory[purpose].length)state.sessions[purpose]=state.checkoutHistory[purpose].at(-1);
  }
  state.plan=['backend','standard'].includes(draft.plan)?(draft.plan==='backend'?'business':'standard'):(state.project.details?.hosting_plan==='business'?'business':'standard');
  state.paid={development:false,hosting:false};
  await verifyDevelopment();
  if(developmentComplete()&&state.sessions.hosting)await verifyOne('hosting');
}
async function checkPayments(manual=false){
  if(verifying||busy||demo||!state.project)return;
  verifying=true;const button=$('#verify-payment');if(button){button.disabled=true;if(manual)button.textContent='Checking with Square…';}
  const oldStage=state.stage;
  try{
    await verifiedUser();
    if(!state.paid.development)await verifyDevelopment();
    if(developmentComplete()&&state.sessions.hosting&&!state.paid.hosting)await verifyOne('hosting');
    chooseStage();
    if(state.stage!==oldStage)render(true);
    else if(manual)message('Your payment is not confirmed yet. Complete the Square checkout, then check again. Confirmation can take a moment.');
  }catch(e){if(manual)message(e.message||'Payment verification is temporarily unavailable. Please try again.');}
  finally{verifying=false;if(button?.isConnected){button.disabled=false;button.textContent='I’ve paid — check payment status';}}
}
function receipt(purpose){const u=state.documents[purpose];return u?`<a class="receipt-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer">View Square receipt ↗</a>`:'';}
function renderConfirmation(){
  if(!developmentComplete()||!state.paid.hosting){chooseStage();render();return;}
  $('#stage').innerHTML=`<div class="step-icon success-icon" aria-hidden="true">✓</div>`+title(demo?'PREVIEW CONFIRMATION':'PAYMENT CONFIRMED',demo?'Your preview payments are complete.':state.developmentWaived?'Your website setup is confirmed.':'We’ve received your payments.',demo?'This is how your confirmation will look after verified payments. No payment was taken.':state.developmentWaived?'Your agreement, development fee waiver, and hosting payment are confirmed. Let’s finish with a few next steps.':'Thank you! Your website agreement and both payments are complete. Let’s finish with a few next steps.')+
    `<div class="summary-list"><div class="summary-row"><span>Website</span><strong>${esc(state.project?.display_name)}</strong></div><div class="summary-row"><span><span class="check">✓</span> Website preview</span><strong>Approved</strong></div><div class="summary-row"><span><span class="check">✓</span> Website agreement</span><strong>Accepted &amp; signed</strong></div><div class="summary-row"><span><span class="check">✓</span> Development</span><strong>${state.developmentWaived?'$0 · Waived by code':`${money(CONFIG.development)} · ${demo?'Previewed':'Paid'}${receipt('development')}`}</strong></div><div class="summary-row"><span><span class="check">✓</span> ${state.plan==='business'?'Business':'Standard'} hosting</span><strong>${money(CONFIG[state.plan])}/month · ${demo?'Previewed':'Paid'}${receipt('hosting')}</strong></div></div>`+primary('Next: your website details','next-domain')+'<p class="button-note">One last thing — tell us the domain you’d love to use.</p>';
  $('#next-domain').onclick=()=>go(4);
}
function renderDomain(){
  $('#stage').innerHTML=`<div class="step-icon" aria-hidden="true">${icons.globe}</div>`+title('ONE LAST DETAIL','What’s your preferred domain?','Tell us the website address you’d like. We’ll check availability and reach out if we need an alternative.')+
    `<form id="domain-form"><label class="field"><span>Preferred domain name</span><input id="domain" type="text" inputmode="url" autocomplete="url" autocapitalize="none" spellcheck="false" maxlength="253" placeholder="yourbusiness.com" required><small>For example: steadyhandsop.com or yourbusiness.com</small></label><div class="domain-preview"><strong>A quick note:</strong> This is a request, not a domain purchase or availability guarantee. Domain registration and any additional costs will be confirmed with you first.</div><p id="message" class="message" role="status"></p><button class="primary" id="submit-domain" type="submit">Submit my website request <span class="arrow" aria-hidden="true">→</span></button></form><p class="button-note">We’ll use your account email to keep you in the loop.</p>`;
  $('#domain-form').onsubmit=submitDomain;
}
function normalizeDomain(raw){
  let text=raw.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/$/,'');
  if(text.length>253||/[\s\/@?#:]/.test(text))return null;
  const labels=text.split('.');
  if(labels.length<2||!labels.every(v=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v))||!/^[a-z]{2,63}$/.test(labels[labels.length-1]))return null;
  return text;
}
async function submitDomain(event){
  event.preventDefault();if(busy)return;
  const domain=normalizeDomain($('#domain').value);
  if(!domain){message('Enter a valid domain, such as yourbusiness.com. Leave out paths, spaces, and email addresses.');$('#domain').focus();return;}
  const button=$('#submit-domain');button.disabled=true;button.textContent='Submitting your request…';busy=true;message('');
  try{
    if(!state.agreement||!state.previewApproved||!developmentComplete()||!state.paid.hosting)throw new Error('Your agreement, development payment or waiver, and hosting payment must be confirmed first.');
    if(!demo){
      await verifiedUser();
      await assertPreviewApproval();
      if(!await loadAgreement()||!await verifyDevelopment()||!await verifyOne('hosting'))throw new Error('Could not verify your agreement and payments. Please contact your developer.');
      // Re-read so this write preserves the latest project brief and other details.
      state.project=await checked(api.from('portal_website_projects').select('*').eq('id',state.project.id).eq('user_id',state.user.id).single());
    }
    const previous=state.project.details?.__checkout_submission;
    const timestamp=new Date().toISOString();
    const submitted={developer:{name:CONFIG.developerName,email:CONFIG.supportEmail},preferred_domain:domain,submitted_at:previous?.submitted_at||timestamp,deadline_at:previous?.deadline_at||new Date(Date.now()+CONFIG.maxDays*86400000).toISOString()};
    const details={...(state.project.details||{}),hosting_plan:state.plan,preferred_domain:domain,__checkout_submission:submitted};
    if(!demo)state.project=await checked(api.from('portal_website_projects').update({details}).eq('id',state.project.id).eq('user_id',state.user.id).select().single());
    else state.project.details=details;
    state.submitted=submitted;go(5);
  }catch(e){message(e.message||'Your request could not be submitted. Please try again.');}
  finally{busy=false;if(button.isConnected){button.disabled=false;button.innerHTML='Submit my website request <span class="arrow" aria-hidden="true">→</span>';}}
}
function countdownParts(deadline,now=Date.now()){
  const end=Date.parse(deadline);let remaining=Number.isFinite(end)?Math.max(0,Math.floor((end-now)/1000)):0;
  return {days:Math.floor(remaining/86400),hours:Math.floor(remaining/3600)%24,minutes:Math.floor(remaining/60)%60,seconds:remaining%60,expired:remaining===0};
}
function tick(){
  const p=countdownParts(state.submitted?.deadline_at);
  for(const unit of ['days','hours','minutes','seconds']){const el=$('#'+unit);if(el)el.textContent=String(p[unit]).padStart(2,'0');}
  const el=$('#timeline-status');if(el){const d=new Date(state.submitted?.deadline_at);el.textContent=p.expired?'The estimated window has ended. Contact your developer for an update.':Number.isFinite(d.getTime())?'Estimated by '+d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Contact your developer for a timeline update.';}
}
let portalResolve=null,portalReleased=false,summaryObserver=null,summaryClock=null;
function completedProject(p){const s=p?.details?.__checkout_submission;return !!s?.preferred_domain&&Number.isFinite(Date.parse(s.deadline_at));}
let onboardingDismissed=false;
function showOnboarding(force=false){
  if(force)onboardingDismissed=false;
  if(!onboardingDismissed&&!$('#onboarding-dialog').open)$('#onboarding-dialog').showModal();
}
function resumeOnboarding(){showOnboarding(true);$('#popup-close').focus();}
function dismissOnboarding(){
  onboardingDismissed=true;
  $('#onboarding-dialog').close();
  // Closing the UI never completes setup or releases the authenticated portal.
  if(!portalReleased){
    const main=document.querySelector('#main');
    if(main){
      main.innerHTML='<section class="panel empty-workspace"><h1>Welcome to Steady Hands</h1><p>Continue signing in or setting up your website whenever you’re ready.</p><button type="button" class="primary" id="resume-setup">Continue setup</button></section>';
      const resume=main.querySelector('#resume-setup');
      resume.onclick=resumeOnboarding;
      resume.focus();
    }
  }
}
function releasePortal(close=true){
  if(demo)return;
  if(close&&$('#onboarding-dialog').open)$('#onboarding-dialog').close();clearInterval(poll);
  if(!portalReleased){portalReleased=true;portalResolve?.(state.user);}
}
async function saveProfileFields(name,business){
  await checked(api.from('portal_profiles').upsert({user_id:state.user.id,full_name:name,updated_at:new Date().toISOString()},{onConflict:'user_id'}));
  const {data,error}=await api.auth.updateUser({data:{full_name:name,portal_company_name:business}});if(error)throw error;
  state.user=data.user;state.profile={...(state.profile||{}),full_name:name};
}
async function continueProfileOrCheckout(){
  state.profile=await checked(api.from('portal_profiles').select('full_name,phone').eq('user_id',state.user.id).maybeSingle())||{};
  const name=state.profile.full_name||state.user.user_metadata?.full_name;
  const business=state.user.user_metadata?.portal_company_name||state.salesPreview?.site_title;
  if(!name?.trim()||!business?.trim()){state.stage=0.1;showOnboarding();render(true);return;}
  if(!state.profile.full_name?.trim()||!state.user.user_metadata?.portal_company_name?.trim())await saveProfileFields(name.trim(),business.trim());
  await continueAfterProfile();
}
async function salesPreviews(required=false){
  const {data,error}=await api.rpc('sh_my_portal_invited_previews');
  if(error){if(required)throw new Error('Your sales invitation could not be loaded: '+error.message);return [];}
  return (Array.isArray(data)?data:[]).filter(p=>p.sale_id&&safePreviewUrl(p.preview_url)).map(p=>({sale_id:String(p.sale_id),site_key:('invited-'+String(p.sale_id)).toUpperCase(),site_title:String(p.business_name||'Your Website Preview'),preview_url:safePreviewUrl(p.preview_url)}));
}
async function selectSalesProject(){
  const sale=state.salesPreview;
  state.hasCheckout=true;state.project=ownedProjects.find(p=>String(p.details?.__sales_sale_id)===sale.sale_id)||null;
  state.preview={site_key:sale.site_key,site_title:sale.site_title,preview_url:sale.preview_url};
  entryContext.sale=sale.sale_id;delete entryContext.invite;
  storage.remove('steadyhands.portal.invite',true);storage.set('steadyhands.checkout.entry',JSON.stringify(entryContext),true);
}
let ownedProjects=[];
async function prepareEntry(){
  if(entryContext.invalid)throw new Error('This preview invitation is invalid. Please contact Kiara for a new link.');
  ownedProjects=await checked(api.from('portal_website_projects').select('*').eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(100))||[];
  let redeemedSale=null;const hadInvite=!!entryContext.invite;
  if(entryContext.invite){
    const {data,error}=await api.rpc('sh_redeem_portal_invite',{p_token:entryContext.invite});
    if(error)throw new Error('Your sales invitation could not be connected: '+error.message);
    redeemedSale=String(data?.sale_id||data?.[0]?.sale_id||'')||null;
    delete entryContext.invite;storage.remove('steadyhands.portal.invite',true);
    if(redeemedSale)entryContext.sale=redeemedSale;
    storage.set('steadyhands.checkout.entry',JSON.stringify(entryContext),true);
    const url=new URL(location.href);url.searchParams.delete('invite');if(redeemedSale)url.searchParams.set('sale',redeemedSale);history.replaceState({},'',url);
  }
  if(entryContext.project){
    state.project=ownedProjects.find(p=>p.id===entryContext.project)||await checked(api.from('portal_website_projects').select('*').eq('id',entryContext.project).eq('user_id',state.user.id).maybeSingle());
    if(!state.project)throw new Error('This website is not available to your account. Please contact Kiara.');
    if(entryContext.sitekey&&existingSiteKey(state.project)&&entryContext.sitekey!==existingSiteKey(state.project))throw new Error('This project and site key do not match. Please ask Kiara to check the link.');
    if(completedProject(state.project))return true;
    state.salesSaleId=state.project.details?.__sales_sale_id||null;
    if(state.salesSaleId){const choices=await salesPreviews(true);state.salesPreview=choices.find(p=>p.sale_id===String(state.salesSaleId));if(!state.salesPreview)throw new Error('The preview linked to this website is not available to your account.');}
    return true;
  }
  if(entryContext.sitekey&&!hadInvite&&!entryContext.sale&&!redeemedSale){
    state.project=ownedProjects.find(p=>existingSiteKey(p)===entryContext.sitekey)||null;return true;
  }
  if(entryContext.preview){
    state.project=ownedProjects.find(p=>String(p.preview_code||p.details?.__checkout_entry_preview||'').toUpperCase()===entryContext.preview)||null;
    return true;
  }
  const choices=await salesPreviews(hadInvite);
  if(hadInvite&&!choices.length)throw new Error('Your invitation was connected, but no website preview is available yet. Please contact Kiara.');
  if(entryContext.sale||redeemedSale){
    const id=entryContext.sale||redeemedSale;
    state.salesPreview=choices.find(p=>p.sale_id===id);
    if(!state.salesPreview)throw new Error('This sales preview is not linked to your account. Please contact Kiara.');
    await selectSalesProject();return true;
  }
  const pending=choices.filter(s=>!ownedProjects.some(p=>String(p.details?.__sales_sale_id)===s.sale_id&&completedProject(p)));
  if(pending.length===1){state.salesPreview=pending[0];await selectSalesProject();return true;}
  if(pending.length>1){state.salesChoices=pending;state.stage=0.25;showOnboarding();render(true);return 'choose';}
  // A previously submitted project is a UI completion marker, not proof of an active subscription.
  // Returning clients must retain portal access if hosting is later canceled or payment services are unavailable.
  state.project=ownedProjects.find(p=>['portal-popup','guided-checkout'].includes(p.details?.__checkout_source)&&!completedProject(p))||null;
  if(state.project)return true;
  state.project=ownedProjects.find(completedProject)||null;
  return false;
}
async function routeAfterAuthentication(){
  await verifiedUser();
  const entry=await prepareEntry();
  if(entry==='choose')return;
  state.hasCheckout=entry===true;
  await continueProfileOrCheckout();
}
async function continueAfterProfile(){
  if(!state.hasCheckout||completedProject(state.project)){
    if(completedProject(state.project))state.submitted=state.project.details.__checkout_submission;
    releasePortal();return;
  }
  if(entryContext.sitekey&&!state.salesPreview)state.preview=await resolveSiteKeyPreview(entryContext.sitekey);
  await ensureProject(state.salesPreview?.site_title||state.preview?.site_title||state.user.user_metadata.portal_company_name||'My website');
  if(state.salesPreview)state.preview={site_key:state.salesPreview.site_key,site_title:state.salesPreview.site_title,preview_url:state.salesPreview.preview_url};
  await loadPreview();state.agreement=await loadAgreement();
  if(state.agreement)await hydratePayments();
  chooseStage();showOnboarding();render(true);
}
async function ensureProject(name){
  if(state.project){rememberProject();return;}
  const details={business_name:name,hosting_plan:'standard',__checkout_source:'portal-popup',__checkout_entry_preview:entryContext.preview||null,...(entryContext.sitekey?{__checkout_sitekey:entryContext.sitekey}:{}),pages:[],features:[],...(state.salesPreview?{__sales_sale_id:state.salesPreview.sale_id}:{})};
  // Create the same draft as the regular portal. Approval below submits it for payment.
  state.project=await checked(api.from('portal_website_projects').insert({user_id:state.user.id,display_name:name,status:'draft',details}).select().single());
  ownedProjects.unshift(state.project);rememberProject();
}
function chooseStage(){
  if(!state.user){state.stage=0;return;}
  if(!state.previewApproved){state.stage=0.5;return;}
  if(!state.agreement){state.stage=0.75;return;}
  if(!developmentComplete()){state.stage=1;return;}
  if(!state.paid.hosting){state.stage=2;return;}
  if(completedProject(state.project)){state.submitted=state.project.details.__checkout_submission;state.stage=5;}else state.stage=3;
}
function renderDone(){
  $('#stage').innerHTML=`<div class="step-icon success-icon" aria-hidden="true">✓</div>`+title(demo?'PREVIEW COMPLETE':'YOU’RE ALL SET','Your website is in steady hands.',demo?'This was a preview only. No account, charge, or request was created.':'Your request has been submitted. Kiara will finish your website and reach out when it’s complete.')+
    `<div class="done-domain">Preferred domain<strong>${esc(state.submitted?.preferred_domain)}</strong></div><p class="timeline-label"><strong>Estimated maximum: 5 days</strong></p><div class="countdown" role="timer" aria-label="Estimated time remaining"><div><b id="days">05</b><span>Days</span></div><div><b id="hours">00</b><span>Hours</span></div><div><b id="minutes">00</b><span>Minutes</span></div><div><b id="seconds">00</b><span>Seconds</span></div></div><p id="timeline-status" class="hint"></p><p class="hint">Estimate depends on receiving your materials and approvals.</p><button class="primary" id="open-portal" type="button">${demo?'Return to login':'Open my client portal'} <span aria-hidden="true">→</span></button><button class="secondary" style="margin-top:10px" type="button" data-contact-developer>Contact Developer</button><p class="button-note">Site development requests: <strong>Kiara</strong> · <a href="mailto:kiara@steadyhandsop.com">kiara@steadyhandsop.com</a><br>Manage site status, billing, and cancellations right here in your portal.</p>`;
  tick();clock=setInterval(tick,1000);
  $('#open-portal').onclick=()=>{if(demo){demo=false;state=blank();authMode='signup';storage.remove('steadyhands.checkout.preview',true);storage.remove('steadyhands.checkout.previewState',true);render();}else $('#onboarding-dialog').close();};
  if(!demo)releasePortal(false);
}
async function logout(){
  if(busy)return;
  awaitingSignupConfirmation=false;
  if(!demo){const {error}=await api.auth.signOut();if(error){message(error.message);return;}}
  demo=false;state=blank();authMode='login';lastAuthNotice='';clearInterval(poll);clearInterval(clock);render();showOnboarding();
}
function renderFatal(error){
  showOnboarding();$('#stage').innerHTML=title('LET’S TRY THAT AGAIN','We couldn’t open your setup.',esc(error.message||'Check your connection and try again.'))+'<button class="primary" id="retry-onboarding" type="button">Try again</button><button class="text-button preview-help" type="button" data-contact-developer>Contact Kiara</button>';
  $('#retry-onboarding').onclick=()=>{if(!state.user){state.stage=0;render();}else routeAfterAuthentication().catch(renderFatal);};
}
async function ensurePortalAccess(client){
  api=client;
  api.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_IN'&&session&&!demo&&awaitingSignupConfirmation){
      // Defer auth calls until Supabase releases its auth-event lock.
      setTimeout(()=>continueConfirmedSignup().catch(renderFatal),0);
    }
  });
  const promise=new Promise(resolve=>{portalResolve=resolve;});
  // The popup is a client workflow gate. All actual records and account rights remain protected by backend RLS.
  if(demo){state=blank();showOnboarding();render();return promise;}
  try{
    const {data,error}=await api.auth.getSession();if(error)throw error;
    if(!data?.session){state=blank();showOnboarding();render();}
    else{await verifiedUser();await routeAfterAuthentication();}
  }catch(e){renderFatal(e);}
  return promise;
}
function attachPortalSummary(){
  const main=document.querySelector('#main');if(!main)return;
  const mount=()=>{
    if(!completedProject(state.project)||!['','overview','website','billing'].includes(location.hash.slice(1)))return;
    if(main.querySelector('#steady-project-status'))return;
    const section=document.createElement('section');section.id='steady-project-status';section.className='panel';
    const submitted=state.project.details.__checkout_submission;
    section.innerHTML=`<div class="sh-status-head"><div><span class="sh-status-tag">YOUR WEBSITE</span><h2>${esc(state.project.display_name)}</h2><p>Your website request is submitted. Kiara is your developer.</p></div><span class="sh-status-badge">Request submitted</span></div><p class="sh-status-domain">Preferred domain: <strong>${esc(submitted.preferred_domain)}</strong></p><div class="sh-status-timer" aria-label="Estimated development time remaining"></div><p class="sh-status-fine">Estimated maximum 5 days from submission, subject to materials and approvals. The timer does not mark your site complete.</p><div class="sh-status-actions"><button class="primary" type="button" data-contact-developer>Contact Developer</button><button class="secondary" type="button" data-open-checkout-summary>View setup summary</button><a class="secondary" href="#billing">Billing &amp; cancellations</a></div>`;
    main.prepend(section);section.querySelector('[data-open-checkout-summary]').onclick=()=>{state.submitted=submitted;go(5);showOnboarding();};
    const tickStatus=()=>{const el=main.querySelector('.sh-status-timer');if(!el)return;const p=countdownParts(submitted.deadline_at);el.textContent=p.expired?'Estimated window ended — contact Kiara for an update.':`${p.days}d ${String(p.hours).padStart(2,'0')}h ${String(p.minutes).padStart(2,'0')}m ${String(p.seconds).padStart(2,'0')}s remaining`;};
    clearInterval(summaryClock);tickStatus();summaryClock=setInterval(tickStatus,1000);
    if(location.hash==='#billing'){
      const pending=Array.from(main.querySelectorAll('p')).find(p=>p.textContent==='No verified payment history is connected to this portal yet. Selecting a plan will start a request, not charge your card.');
      if(pending)pending.textContent='Your website checkout is recorded above. Square provides the official receipts. Use Requests for billing questions or cancellation requests; a request does not itself cancel your subscription.';
    }
  };
  summaryObserver=new MutationObserver(mount);summaryObserver.observe(main,{childList:true});mount();window.addEventListener('hashchange',()=>setTimeout(mount,0));
}
$('#popup-close').onclick=dismissOnboarding;
$('#onboarding-dialog').addEventListener('cancel',e=>{e.preventDefault();dismissOnboarding();});
let backdropPress=false;
const outsideOnboarding=e=>{
  const dialog=$('#onboarding-dialog'),r=dialog.getBoundingClientRect();
  return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);
};
$('#onboarding-dialog').addEventListener('pointerdown',e=>{backdropPress=outsideOnboarding(e);});
$('#onboarding-dialog').addEventListener('click',e=>{
  if(backdropPress&&outsideOnboarding(e))dismissOnboarding();
  backdropPress=false;
});
$('#popup-signout').onclick=logout;
$('#preview-flow').onclick=()=>{if(busy)return;demo=true;state=blank();authMode='signup';render(true);};
$('#leave-demo').onclick=()=>{if(busy)return;demo=false;state=blank();authMode='signup';render(true);};
window.addEventListener('focus',()=>{if(!demo&&(state.stage===1||state.stage===2))checkPayments(false);});
async function startUnifiedPortal(){
  await ensurePortalAccess(portalSupabase);
  await import('./portal.js?v=20261017-unified-popups');
  attachPortalSummary();
}

// Embedded agreement and logo follow; no extra local files are required.

const AGREEMENT_HTML = "\n<div class=\"brand\">Steady Hands LLC</div><h1>Website-Specific Services Agreement</h1><p class=\"effective\">Version: October 14, 2026 · Agreement version 2026-10-14-project-v1</p>\n<div class=\"summary\"><strong>One agreement for each website.</strong><p>This agreement applies solely to the website project named in the Client Portal immediately before electronic signature. A second website requires its own signed agreement, development payment and hosting subscription.</p><p><strong>Development:</strong> $100 one-time per website, unless an expressly approved website-specific promotion applies.<br><strong>Hosting:</strong> Standard $20/month or Business $30/month per website, depending on the plan selected at checkout. Any applicable taxes or additional charges must be disclosed before payment.</p></div>\n<section><h2>1. Parties, Project and Scope</h2><p>This Agreement is between Steady Hands LLC (“Steady Hands,” “we”) and the individual or organization accepting through the Client Portal (“Client,” “you”). It covers only the identified website project (“Website”). The project brief submitted in the portal describes your requested pages, design preferences, supplied materials and requested functions. Features that are not expressly approved are not promised. Changes to scope or price require Client approval before additional charges.</p></section>\n<section><h2>2. Development Fee and Timeline</h2><p>A $100 one-time website-development fee applies to each Website unless an authorized promotion states otherwise. Payment is due before development begins. A quote for work outside the agreed scope must be approved separately. Any estimated timeline depends on Client providing requested materials, approvals and access promptly; no launch date is guaranteed unless confirmed in writing.</p></section>\n<section><h2>3. Monthly Hosting and Automatic Renewal</h2><p>Hosting is purchased separately for each Website: Standard Hosting is $20/month; Business Hosting is $30/month. Each Website has its own recurring subscription. Hosting automatically renews monthly until canceled. The applicable price, billing start date, billing interval and any tax will be presented for approval at checkout. By completing the subscription checkout, Client separately authorizes the stated recurring charges. A signed Agreement by itself does not authorize a charge.</p></section>\n<section><h2>4. Hosting Plans, Updates and Extras</h2><p>Standard Hosting includes website hosting, maintenance and content-update requests through the portal. Business Hosting includes Standard Hosting and supported admin-dashboard capabilities, subject to the Website's technical features. Neither plan includes unlimited redesigns, third-party subscriptions, custom integrations or new features unless specifically agreed. We may quote additional services separately and will not charge for unapproved extras.</p></section>\n<section><h2>5. Cancellation and Service End</h2><p>Client may request cancellation in the Client Portal or by emailing the support contact shown there. Cancellation of one Website does not cancel any other Website. Unless stated otherwise at checkout, cancellation stops future renewals and service continues until the end of the paid billing period. We do not refund elapsed or partially used billing periods except where required by law or where an express refund promise applies. After service ends, the hosted Website may stop being publicly accessible. Client should request an export before the paid term ends; available export formats depend on the technology and third-party licenses involved.</p></section>\n<section><h2>6. Development Refunds and Acceptance</h2><p>The one-time development fee becomes nonrefundable after substantive work begins, except where required by applicable law or where we fail to provide an agreed remedy. If work has not begun, Client may request cancellation and a refund of the development fee. Client will have a reasonable opportunity to review a preview and report material issues against the approved scope. We will work in good faith to correct verified issues within that scope.</p></section>\n<section><h2>7. Ownership, Domains and Content</h2><p>Client retains ownership of original content, logos, trademarks and materials Client supplies. Client is responsible for having rights to those materials. Ownership of a custom Website deliverable, source code and design assets depends on what is expressly identified as transferable in the project scope and on payment in full; third-party templates, software, fonts, plugins, subscriptions and Steady Hands preexisting tools remain subject to their respective licenses and ownership. Client-owned domain names remain Client property; Steady Hands will provide reasonable cooperation for transfer of a domain under Client ownership, subject to registrar requirements and amounts due. This Agreement does not promise transfer of proprietary hosting infrastructure or licensed third-party software.</p></section>\n<section><h2>8. Client Responsibilities and Content</h2><p>Client must provide accurate information and timely decisions, maintain account security, and obtain required permissions for content and images. Client is responsible for the legality of information published at Client's direction, including required privacy notices, terms, accessibility obligations and industry-specific disclosures. Steady Hands is responsible for its own work and will not exclude liability that cannot lawfully be excluded.</p></section>\n<section><h2>9. Security, Availability and Third Parties</h2><p>We will use reasonable care to operate hosting and maintain access controls, but cannot guarantee uninterrupted availability or security. Internet networks and outside services may interrupt availability. Client should retain independent copies of essential materials. Each party will promptly notify the other upon learning of a material security issue involving the Website. Separate privacy terms may apply to personal information processed through the portal or Website.</p></section>\n<section><h2>10. Changes, Suspension and Disputes</h2><p>We may suspend service for material nonpayment, unlawful use or immediate security threats, with notice when reasonably practicable. We will provide notice of material hosting-price changes before they take effect, and Client may cancel before the new price applies. The parties agree to attempt to resolve disputes through good-faith written notice first. Neither party waives any nonwaivable consumer protection, statutory remedy or legal right.</p></section>\n<section><h2>11. Liability</h2><p>Neither party is responsible for indirect or consequential losses to the extent the law permits. Nothing in this Agreement limits liability for fraud, willful misconduct, gross negligence, infringement or any other liability that cannot lawfully be restricted. Any additional limitation of liability must be separately agreed in writing and consistent with applicable law.</p></section>\n<section><h2>12. Electronic Signature and Records</h2><p>Client may review and retain this Agreement before signing. By checking the acknowledgment and drawing an electronic signature, Client intends to sign this Agreement for the specific Website identified in the portal. Steady Hands should retain a durable copy of the signed version, project identity, signature and timestamp and make a copy available to Client. Electronic signatures are governed by applicable law. Checkout provides separate payment and recurring-billing consent.</p></section>\n<section><h2>13. Entire Agreement and Contact</h2><p>This Agreement, the identified Website's approved scope and any separately accepted checkout terms form the agreement for that Website. In the event of a conflict over price or recurring billing, the terms explicitly accepted at checkout govern those charges, subject to law. Updates to this Agreement do not retroactively change a signed Website agreement without Client consent. Notices and cancellation requests may be sent using the contact information provided in the Client Portal.</p></section>\n<div class=\"footer\"><strong>Steady Hands LLC</strong><p>Agreement version: 2026-10-14-project-v1. This document is a draft for legal review; review applicable state law before production use.</p></div>\n";

const BRAND_LOGO = "data:image/png;base64,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";
$('#brand-logo').src=BRAND_LOGO;
startUnifiedPortal().catch(renderFatal);





