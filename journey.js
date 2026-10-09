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
 if(purchaseStep===0){
  body='<h3>1. Sign Agreement</h3><p>Review the complete terms before placing your signature. This must be done before payment.</p>'+
  '<div class="journey-info"><strong>Agreement preview</strong><p>Read the <button type="button" class="journey-terms-link" id="journey-view-terms">Terms &amp; Conditions</button> before signing. This sample is for review and is not yet the final binding agreement.</p></div>'+
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
 const sign=$('#journey-sign-submit');if(sign)sign.onclick=async()=>{const agreed=$('#journey-agree')?.checked;if(!agreed){$('#purchase-notice').textContent='Please read and check the terms acknowledgment first.';return}if(!signatureDrawn){$('#purchase-notice').textContent='Please draw your signature first.';return}sign.disabled=true;$('#purchase-notice').textContent='Saving signature securely…';const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user){$('#purchase-notice').textContent='Please sign in again.';sign.disabled=false;return}const png=$('#journey-sign').toDataURL('image/png');const {error}=await supabase.from('portal_agreement_signatures').insert({user_id:user.id,agreement_version:'sample-v1',agreement_title:'Steady Hands Website Service Agreement — Sample',signature_png:png,acknowledged:true});if(error){$('#purchase-notice').textContent='Signature not saved: '+error.message;sign.disabled=false;return}purchaseStep=1;renderPurchase();$('#purchase-notice').textContent='Sample agreement acknowledgment and signature saved to Supabase. Final contract and Square payment are not yet active.'};
 const terms=$('#journey-view-terms');if(terms)terms.onclick=()=>{const modal=document.createElement('div');modal.className='journey-terms-overlay';modal.innerHTML='<section class="journey-terms-box" role="dialog" aria-modal="true" aria-label="Terms and Conditions"><h3>Website Service Agreement — Sample</h3><p><b>Development.</b> Website design costs $100 one time.</p><p><b>Hosting.</b> Standard $20/month or Backend $30/month; recurring charges are separate.</p><p><b>Revisions.</b> Reasonable revisions may be requested. Extra work may cost more with approval.</p><p><b>Materials.</b> The client supplies accurate information and authorized content.</p><p><b>Cancellation.</b> Hosting cancellation is subject to the final subscription terms.</p><p><b>Agreement.</b> A binding agreement and final payment authorization must be completed separately.</p><button type="button" class="primary" id="close-terms">Close</button></section>';document.body.appendChild(modal);modal.querySelector('#close-terms').onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove()}};
 wrapper.querySelectorAll('[data-stage]').forEach(btn=>btn.onclick=()=>{purchaseStep=Number(btn.dataset.stage);renderPurchase()});
 const options=wrapper.querySelectorAll('input[name="journey-host"]');
 options.forEach(x=>x.onchange=async()=>{purchasePlan=x.value;await savePurchaseDraft()});
 const design=$('#pay-website-design');if(design)design.onclick=()=>{const notice=$('#purchase-notice');notice.textContent='Secure Square checkout cannot open until the final agreement has been published, signed, and verified. The saved sample signature does not authorize payment.';notice.scrollIntoView({block:'nearest',behavior:'smooth'})};
 const hosting=$('#purchase-hosting-checkout');if(hosting)hosting.onclick=()=>{const notice=$('#purchase-notice');notice.textContent=purchasePlan?'Your '+(purchasePlan==='backend'?'Backend':'Standard')+' choice is saved. Square checkout will open once your final signed agreement and website design payment are verified.':'Select a hosting plan first.';notice.scrollIntoView({block:'nearest',behavior:'smooth'})};
 const save=$('#purchase-save-plan');
 if(save)save.onclick=async()=>{if(!purchasePlan){$('#purchase-notice').textContent='Please select a hosting plan.';return}save.disabled=true;const ok=await savePurchaseDraft();if(ok)$('#purchase-notice').textContent='Hosting preference saved to your account. No subscription has been started.';save.disabled=false};
}
document.addEventListener('steadyhands:purchase-options',async()=>{
 const {data:{user}}=await supabase.auth.getUser();if(!user)return;
 purchaseUser=user;
 const draft=user.user_metadata?.portal_purchase_draft||{};
 purchasePlan=['standard','backend'].includes(draft.plan)?draft.plan:null;
 // Progress is not considered paid or signed based solely on user-editable metadata.
 purchaseStep=0;
 renderPurchase();
});
$('#journey-dialog-close').onclick=close;
wrapper.addEventListener('click',e=>{if(e.target===wrapper)close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!wrapper.hidden)close()});
