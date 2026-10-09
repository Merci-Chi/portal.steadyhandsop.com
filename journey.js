import {supabase} from './supabase-client.js';
import {createCustomerCheckout,verifyCustomerCheckout} from './square-checkout.js';
const wrapper=document.createElement('div');wrapper.id='journey-dialog-overlay';wrapper.hidden=true;
wrapper.innerHTML='<div class="journey-dialog" role="dialog" aria-modal="true" aria-labelledby="journey-dialog-title"><div class="journey-dialog-head"><h2 id="journey-dialog-title">Complete Your Purchase</h2><button type="button" id="journey-dialog-close" aria-label="Close">×</button></div><div id="journey-dialog-content"></div></div>';
document.body.appendChild(wrapper);
const $=s=>wrapper.querySelector(s);
function close(){wrapper.hidden=true;document.body.classList.remove('wizard-open')}
function open(content,title){$('#journey-dialog-title').textContent=title;$('#journey-dialog-content').innerHTML=content;wrapper.hidden=false;document.body.classList.add('wizard-open')}
document.addEventListener('steadyhands:approve-preview',async e=>{
 const {id,key}=e.detail||{};if(!id||!key)return;
 open('<div class="journey-dialog-body"><div class="journey-dialog-icon">✓</div><h3>Approve your site preview?</h3><p>Confirm you are happy with this preview. Your approval will be recorded under Requests and shared with the Steady Hands team.</p><div class="journey-info">Site key: <strong id="approved-site-key"></strong></div><p id="approval-message" role="status"></p><button type="button" class="primary" id="confirm-preview-approval">Approve This Preview</button></div>','Review Your Site');
 $('#approved-site-key').textContent=key;
 $('#confirm-preview-approval').onclick=async()=>{
  const button=$('#confirm-preview-approval');button.disabled=true;$('#approval-message').textContent='Saving your approval…';
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError||!user){$('#approval-message').textContent='Please sign in again.';button.disabled=false;return}
  // Verify that this site is accessible to this client through preview RLS.
  const found=await supabase.from('portal_previews').select('id,site_key').eq('id',id).eq('site_key',key).maybeSingle();
  if(found.error||!found.data){$('#approval-message').textContent='This preview is not assigned to your verified company.';button.disabled=false;return}
  const title='Preview Approved — '+key;
  const exists=await supabase.from('portal_service_requests').select('id').eq('user_id',user.id).eq('title',title).is('deleted_at',null).limit(1);
  if(exists.data?.length){$('#approval-message').textContent='This preview has already been approved.';button.disabled=false;return}
  const {error}=await supabase.from('portal_service_requests').insert({user_id:user.id,company_name:user.user_metadata?.portal_company_name||'',request_type:'other',title,details:'Client approved their assigned website preview. Site key: '+key,preferred_contact_method:'email',preferred_contact_value:user.email});
  if(error){$('#approval-message').textContent=error.message;button.disabled=false;return}
  $('#journey-dialog-content').innerHTML='<div class="journey-dialog-body"><div class="journey-dialog-icon">✓</div><h3>Preview approved!</h3><p>Your approval has been sent to Steady Hands and saved under Requests.</p><button type="button" class="primary" id="approval-finish">Done</button></div>';
  $('#approval-finish').onclick=()=>{close();location.reload()};
 };
});

const purchaseSteps=[
 {title:'Sign Agreement',hint:'Review and sign your website service agreement.'},
 {title:'Website Design',hint:'Complete the $100 one-time website development payment.'},
 {title:'Select Hosting',hint:'Choose Standard or Backend hosting.'}
];
let purchaseStep=0;
let purchasePlan=null;
let purchaseSaving=false;
let signatureDrawn=false;
let purchaseUser=null;
let signedAgreement=null;
const AGREEMENT_VERSION='2026-10-09';
async function loadSignedAgreement(userId){const {data,error}=await supabase.from('portal_agreement_signatures').select('id,agreement_version,signed_at').eq('user_id',userId).eq('agreement_version',AGREEMENT_VERSION).eq('acknowledged',true).order('signed_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;return data;}
function purchaseKey(){return 'steadyhands_purchase_draft_'+(purchaseUser?.id||'unknown')}
function purchaseDraft(){return {step:purchaseStep,plan:purchasePlan,updated_at:new Date().toISOString()}}
async function savePurchaseDraft(){
 if(!purchaseUser)return false;
 purchaseSaving=true;
 const {error}=await supabase.auth.updateUser({data:{portal_purchase_draft:purchaseDraft()}});
 purchaseSaving=false;
 if(error){const el=$('#purchase-notice');if(el)el.textContent='Could not save progress: '+error.message;return false}
 return true;
}
function purchaseMarkup(){
 const list='<div class="journey-purchase-steps">'+purchaseSteps.map((x,i)=>'<button type="button" data-stage="'+i+'" class="journey-purchase-stage '+(purchaseStep===i?'active':'')+'"><span class="stage-number">'+(i+1)+'</span><span>'+x.title+'</span></button>').join('')+'</div><div class="journey-progress"><div style="width:'+((purchaseStep+1)/3*100)+'%"></div></div>';
 let body='';
 if(purchaseStep===0&&signedAgreement){
  body='<div class="journey-signed"><span class="journey-signed-check">✓</span><div><h3>Agreement Signed</h3><p>You signed the October 9, 2026 agreement'+(signedAgreement.signed_at?' on '+new Date(signedAgreement.signed_at).toLocaleDateString():'')+'. You do not need to sign again.</p></div></div><button type="button" id="journey-view-terms" class="secondary">View Signed Terms</button><button type="button" id="journey-signed-continue" class="primary">Continue to Website Design →</button>';
 } else if(purchaseStep===0){
  body='<h3>1. Sign Agreement</h3><p>Review the complete terms before placing your signature. This must be done before payment.</p>'+
  '<div class="journey-info"><strong>Current agreement</strong><p>Read the <button type="button" class="journey-terms-link" id="journey-view-terms">Terms &amp; Conditions</button> before signing. Effective October 9, 2026. Open and review the full terms before signing.</p></div>'+
  '<label class="journey-sign-label">Signature</label><canvas id="journey-sign" width="760" height="220" aria-label="Draw a signature"></canvas>'+
  '<button type="button" class="secondary" id="journey-clear-sign">Clear Signature</button>'+
  '<label class="journey-agree"><input type="checkbox" id="journey-agree"> I have read and agree to the website service agreement.</label>'+
  '<button class="primary" id="journey-sign-submit" type="button">Save Signature & Continue</button>';
 } else if(purchaseStep===1){
  body='<h3>2. Website Design</h3><p>Your website development fee is <strong>$100 one time</strong>.</p>'+
  '<div class="journey-purchase-total"><strong>Website design</strong><span>$100 one time</span></div>'+
  '<div class="journey-info">This will use the same unique, customer-specific Square payment links as View Your Site. Checkout activates after the final signed agreement is verified. No payment has been made.</div>'+
  '<button type="button" class="primary" id="pay-website-design">Continue to Square Checkout</button>';
 } else {
  body='<h3>3. Select Hosting</h3><p>Choose the plan that works best for your site. Billing starts only when a subscription is confirmed.</p>'+
  '<div class="journey-host-options"><label><input type="radio" name="journey-host" value="standard" '+(purchasePlan==='standard'?'checked':'')+'><span><strong>Standard Hosting</strong><small>$20/month</small></span></label>'+
  '<label><input type="radio" name="journey-host" value="backend" '+(purchasePlan==='backend'?'checked':'')+'><span><strong>Backend Hosting</strong><small>$30/month</small></span></label></div>'+
  '<button id="purchase-save-plan" class="primary" type="button">Save Hosting Selection</button><button id="purchase-hosting-checkout" class="secondary" type="button">Continue to Hosting Checkout</button><p class="journey-muted">Saving a selection does not start billing.</p>';
 }
 return '<div class="journey-dialog-body">'+list+'<div class="journey-purchase-stage-content">'+body+'</div><p id="purchase-notice" role="status" class="journey-muted">Your hosting choice is saved to your portal account. Signing and payment are not yet connected.</p></div>';
}
function setupSignatureCanvas(){signatureDrawn=false;
 const canvas=$('#journey-sign');if(!canvas)return;
 const ctx=canvas.getContext('2d');let drawing=false;
 function coords(e){const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)*canvas.width/b.width,y:(e.clientY-b.top)*canvas.height/b.height}}
 canvas.addEventListener('pointerdown',e=>{drawing=true;signatureDrawn=true;canvas.setPointerCapture(e.pointerId);const p=coords(e);ctx.beginPath();ctx.moveTo(p.x,p.y)});
 canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=coords(e);ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#173459';ctx.lineTo(p.x,p.y);ctx.stroke()});
 canvas.addEventListener('pointerup',()=>drawing=false);
 canvas.addEventListener('pointercancel',()=>drawing=false);
 $('#journey-clear-sign').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);signatureDrawn=false};
}
function renderPurchase(){
 open(purchaseMarkup(),'Complete Your Purchase');
 setupSignatureCanvas();
 const sign=$('#journey-sign-submit');if(sign)sign.onclick=async()=>{const agreed=$('#journey-agree')?.checked;if(!agreed){$('#purchase-notice').textContent='Please read and check the terms acknowledgment first.';return}if(!signatureDrawn){$('#purchase-notice').textContent='Please draw your signature first.';return}sign.disabled=true;$('#purchase-notice').textContent='Saving signature securely…';const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user){$('#purchase-notice').textContent='Please sign in again.';sign.disabled=false;return}const png=$('#journey-sign').toDataURL('image/png');const {error}=await supabase.from('portal_agreement_signatures').insert({user_id:user.id,agreement_version:AGREEMENT_VERSION,agreement_title:'Steady Hands LLC — Website Services Terms & Conditions',signature_png:png,acknowledged:true});if(error){if(error.code==='23505'){signedAgreement=await loadSignedAgreement(user.id);if(signedAgreement){purchaseStep=1;renderPurchase();return}}$('#purchase-notice').textContent='Signature not saved: '+error.message;sign.disabled=false;return}signedAgreement=await loadSignedAgreement(user.id);if(!signedAgreement){$('#purchase-notice').textContent='Signature could not be confirmed. Please try again.';sign.disabled=false;return}purchaseStep=1;renderPurchase();$('#purchase-notice').textContent='Agreement signature saved to Supabase. Website design checkout is the next step.'};
 const continueSigned=$('#journey-signed-continue');if(continueSigned)continueSigned.onclick=()=>{purchaseStep=1;renderPurchase()};
 const terms=$('#journey-view-terms');if(terms)terms.onclick=()=>{const modal=document.createElement('div');modal.className='journey-terms-overlay';modal.innerHTML='<section class="journey-terms-box journey-terms-embedded" role="dialog" aria-modal="true" aria-label="Terms and Conditions"><div class="journey-terms-heading"><h3>Website Services — Terms &amp; Conditions</h3><a href="terms-and-conditions.html" target="_blank" rel="noopener noreferrer">Open full page ↗</a></div><iframe title="Steady Hands Terms and Conditions" src="terms-and-conditions.html"></iframe><button type="button" class="primary" id="close-terms">Close</button></section>';document.body.appendChild(modal);modal.querySelector('#close-terms').onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove()}};
 wrapper.querySelectorAll('[data-stage]').forEach(btn=>{btn.onclick=()=>{if(Number(btn.dataset.stage)>0&&!signedAgreement){$('#purchase-notice').textContent='Please sign your agreement first.';return}purchaseStep=Number(btn.dataset.stage);renderPurchase()}});
 const options=wrapper.querySelectorAll('input[name="journey-host"]');
 options.forEach(x=>x.onchange=async()=>{purchasePlan=x.value;await savePurchaseDraft()});
 const noticeCheckout=message=>{const el=$('#purchase-notice');if(el)el.textContent=message};
 async function checkout(kind,button){
  if(!signedAgreement?.id){noticeCheckout('Please sign your current agreement first.');return}
  button.disabled=true;noticeCheckout('Preparing your personal Square checkout link…');
  // Open synchronously in response to click, so popup blockers do not interfere.
  const checkoutWindow=window.open('','_blank');
  if(checkoutWindow){checkoutWindow.document.title='Preparing Square Checkout';checkoutWindow.document.body.textContent='Preparing your secure Square checkout…'}
  try{
   const {checkoutUrl,checkoutId}=await createCustomerCheckout(kind,{agreementId:signedAgreement.id});
   sessionStorage.setItem('steadyhands_checkout_pending',JSON.stringify({checkoutId,kind,userId:purchaseUser.id}));
   if(checkoutWindow){checkoutWindow.opener=null;checkoutWindow.location.replace(checkoutUrl)}
   else window.location.assign(checkoutUrl);
   noticeCheckout('Your individual Square payment link is ready. Complete payment in the new tab.');
  }catch(error){
   if(checkoutWindow&&!checkoutWindow.closed)checkoutWindow.close();
   noticeCheckout('Could not start checkout: '+(error.message||'Please try again.'));
  }finally{button.disabled=false}
 }
 const design=$('#pay-website-design');if(design)design.onclick=()=>checkout('development',design);
 const hosting=$('#purchase-hosting-checkout');if(hosting)hosting.onclick=async()=>{if(!purchasePlan){noticeCheckout('Select your hosting plan first.');return}await checkout(purchasePlan,hosting)};
 const save=$('#purchase-save-plan');
 if(save)save.onclick=async()=>{if(!purchasePlan){$('#purchase-notice').textContent='Please select a hosting plan.';return}save.disabled=true;const ok=await savePurchaseDraft();if(ok)$('#purchase-notice').textContent='Hosting preference saved to your account. No subscription has been started.';save.disabled=false};
}
document.addEventListener('steadyhands:purchase-options',async()=>{
 const {data:{user}}=await supabase.auth.getUser();if(!user)return;
 purchaseUser=user;
 const draft=user.user_metadata?.portal_purchase_draft||{};
 purchasePlan=['standard','backend'].includes(draft.plan)?draft.plan:null;
 // Progress is not considered paid or signed based solely on user-editable metadata.
 try{signedAgreement=await loadSignedAgreement(user.id)}catch(e){open('<p class="journey-info">Unable to load your agreement status: '+String(e.message||e).replace(/[<>]/g,'')+'</p>','Agreement Status');return}
 purchaseStep=signedAgreement?1:0;
 renderPurchase();
});
$('#journey-dialog-close').onclick=close;
wrapper.addEventListener('click',e=>{if(e.target===wrapper)close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!wrapper.hidden)close()});
