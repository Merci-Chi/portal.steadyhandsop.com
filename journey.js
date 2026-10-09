import {supabase} from './supabase-client.js';
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
 const list='<div class="journey-purchase-steps">'+purchaseSteps.map((x,i)=>'<div class="journey-purchase-stage '+(purchaseStep===i?'active':'')+'"><span class="stage-number">'+(i+1)+'</span><span>'+x.title+'</span></div>').join('')+'</div><div class="journey-progress"><div style="width:'+((purchaseStep+1)/3*100)+'%"></div></div>';
 let body='';
 if(purchaseStep===0){
  body='<h3>1. Sign Agreement</h3><p>Review the complete terms before placing your signature. This must be done before payment.</p>'+
  '<div class="journey-info"><strong>Agreement not yet published</strong><p>Your final Steady Hands website agreement must be connected here before a signature can be saved. We will not record a signature against missing terms.</p></div>'+
  '<label class="journey-sign-label">Signature</label><canvas id="journey-sign" width="760" height="220" aria-label="Draw a signature"></canvas>'+
  '<button type="button" class="secondary" id="journey-clear-sign">Clear Signature</button>'+
  '<label class="journey-agree"><input type="checkbox" id="journey-agree" disabled> I have read and agree to the website service agreement.</label>'+
  '<button class="primary" disabled>Sign & Continue</button>';
 } else if(purchaseStep===1){
  body='<h3>2. Website Design</h3><p>Your website development fee is <strong>$100 one time</strong>.</p>'+
  '<div class="journey-purchase-total"><strong>Website design</strong><span>$100 one time</span></div>'+
  '<div class="journey-info">Square checkout will be enabled after a real agreement is signed and the payment link is verified. Payment has not been completed.</div>'+
  '<button type="button" class="primary" disabled>Pay $100 with Square</button>';
 } else {
  body='<h3>3. Select Hosting</h3><p>Choose the plan that works best for your site. Billing starts only when a subscription is confirmed.</p>'+
  '<div class="journey-host-options"><label><input type="radio" name="journey-host" value="standard" '+(purchasePlan==='standard'?'checked':'')+'><span><strong>Standard Hosting</strong><small>$20/month</small></span></label>'+
  '<label><input type="radio" name="journey-host" value="backend" '+(purchasePlan==='backend'?'checked':'')+'><span><strong>Backend Hosting</strong><small>$30/month</small></span></label></div>'+
  '<button id="purchase-save-plan" class="primary" type="button">Save Hosting Selection</button><p class="journey-muted">Saving a selection does not start billing.</p>';
 }
 return '<div class="journey-dialog-body">'+list+'<div class="journey-purchase-stage-content">'+body+'</div><p id="purchase-notice" role="status" class="journey-muted">Your progress is tied to your portal account.</p></div>';
}
function setupSignatureCanvas(){
 const canvas=$('#journey-sign');if(!canvas)return;
 const ctx=canvas.getContext('2d');let drawing=false;
 function coords(e){const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)*canvas.width/b.width,y:(e.clientY-b.top)*canvas.height/b.height}}
 canvas.addEventListener('pointerdown',e=>{drawing=true;canvas.setPointerCapture(e.pointerId);const p=coords(e);ctx.beginPath();ctx.moveTo(p.x,p.y)});
 canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=coords(e);ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#173459';ctx.lineTo(p.x,p.y);ctx.stroke()});
 canvas.addEventListener('pointerup',()=>drawing=false);
 canvas.addEventListener('pointercancel',()=>drawing=false);
 $('#journey-clear-sign').onclick=()=>ctx.clearRect(0,0,canvas.width,canvas.height);
}
function renderPurchase(){
 open(purchaseMarkup(),'Complete Your Purchase');
 setupSignatureCanvas();
 const options=wrapper.querySelectorAll('input[name="journey-host"]');
 options.forEach(x=>x.onchange=async()=>{purchasePlan=x.value;await savePurchaseDraft()});
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
