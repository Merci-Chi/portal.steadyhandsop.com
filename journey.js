import {hostingCards} from './website-projects.js?v=20261016-separate-website-cards';
import {supabase} from './supabase-client.js';
import {createCustomerCheckout,verifyCustomerCheckout} from './square-checkout.js';
const wrapper=document.createElement('div');wrapper.id='journey-dialog-overlay';wrapper.hidden=true;
wrapper.innerHTML='<div class="journey-dialog" role="dialog" aria-modal="true" aria-labelledby="journey-dialog-title"><div class="journey-dialog-head"><h2 id="journey-dialog-title">Complete Your Purchase</h2><button type="button" id="journey-dialog-close" aria-label="Close">×</button></div><div id="journey-dialog-content"></div></div>';
document.body.appendChild(wrapper);
const $=s=>wrapper.querySelector(s);
function close(){wrapper.hidden=true;document.body.classList.remove('wizard-open')}
function open(content,title){$('#journey-dialog-title').textContent=title;$('#journey-dialog-content').innerHTML=content;wrapper.hidden=false;document.body.classList.add('wizard-open')}
document.addEventListener('steadyhands:approve-preview',async e=>{
 const {id,key}=e.detail||{};if(!key)return;
 open('<div class="journey-dialog-body"><div class="journey-dialog-icon">✓</div><h3>Approve your site preview?</h3><p>Confirm you are happy with this preview. Your approval will be recorded under Requests and shared with the Steady Hands team.</p><div class="journey-info">Site key: <strong id="approved-site-key"></strong></div><p id="approval-message" role="status"></p><button type="button" class="primary" id="confirm-preview-approval">Approve This Preview</button></div>','Review Your Site');
 $('#approved-site-key').textContent=key;
 $('#confirm-preview-approval').onclick=async()=>{
  const button=$('#confirm-preview-approval');button.disabled=true;$('#approval-message').textContent='Saving your approval…';
  const {data:{user},error:userError}=await supabase.auth.getUser();
  if(userError||!user){$('#approval-message').textContent='Please sign in again.';button.disabled=false;return}
  // Verify that this site is accessible to this client through preview RLS.
  let found=id?await supabase.from('portal_previews').select('id,site_key').eq('id',id).eq('site_key',key).maybeSingle():{data:null};
  if(!found.data&&id){const claimed=await supabase.from('portal_preview_claims').select('id,site_key').eq('id',id).eq('site_key',key).eq('user_id',user.id).maybeSingle();if(claimed.data)found=claimed;}
  // Public preview codes can be selected in the client portal without an assigned portal_previews row.
  const publicPreview=key==='SHS-GHWH26M9R7Q2';
  if(!found.data&&!publicPreview){$('#approval-message').textContent='This preview is not available to your account.';button.disabled=false;return}
  const existing=(user.user_metadata?.portal_approved_previews||[]).map(v=>String(v).toUpperCase());
  if(!existing.includes(key)){
   const {error}=await supabase.auth.updateUser({data:{portal_approved_previews:[...existing,key]}});
   if(error){$('#approval-message').textContent=error.message;button.disabled=false;return}
  }
  window.dispatchEvent(new CustomEvent('steadyhands:preview-approved',{detail:{key}}));
  $('#journey-dialog-content').innerHTML='<div class="journey-dialog-body"><div class="journey-dialog-icon">✓</div><h3>Preview approved!</h3><p>Your website preview has been approved.</p><button type="button" class="primary" id="approval-finish">Done</button></div>';
  $('#approval-finish').onclick=()=>{close();location.reload()};
 };
});

const purchaseSteps=[
 {title:'Sign Agreement',hint:'Review and sign your website service agreement.'},
 {title:'Website Design',hint:'Complete the $100 one-time website development payment.'},
 {title:'Select Hosting',hint:'Choose Standard Hosting or Business Hosting.'}
];
let purchaseStep=0;
let requestedPurchaseStage=null;
let purchasePlan=null;
let purchaseSaving=false;
let signatureDrawn=false;
let purchaseUser=null;
let purchaseProject=null;
let signedAgreement=null;
let showingAgreementApproval=false;
let designPaid=false,hostingPaid=false,developmentBypass=false,hostingDiscount=false;
let checkoutSessions={};
const AGREEMENT_VERSION='2026-10-14-project-v1';
async function loadSignedAgreement(userId){
 if(!purchaseProject?.id)throw new Error('Choose a website to sign its agreement.');
 const {data,error}=await supabase.from('portal_project_agreements').select('id,agreement_version,signed_at,signature_png,website_name').eq('user_id',userId).eq('project_id',purchaseProject.id).eq('agreement_version',AGREEMENT_VERSION).eq('acknowledged',true).maybeSingle();
 if(error)throw error;return data;
}
const AGREEMENT_PDF='website-services-agreement.pdf';
let pdfLibLoading=null;
function loadPdfLib(){
 if(window.PDFLib)return Promise.resolve(window.PDFLib);
 if(pdfLibLoading)return pdfLibLoading;
 pdfLibLoading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  script.onload=()=>window.PDFLib?resolve(window.PDFLib):reject(new Error('PDF generator failed to load.'));
  script.onerror=()=>reject(new Error('PDF generator is unavailable. Check your internet connection.'));
  document.head.appendChild(script);
 }).catch(err=>{pdfLibLoading=null;throw err});
 return pdfLibLoading;
}
function signedDateText(){
 const d=new Date(signedAgreement?.signed_at);
 return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-US',{year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(d):'Date not available';
}
async function downloadSignedAgreement(button){
 if(!purchaseProject?.id || !signedAgreement?.id)throw new Error('No signed website agreement was found.');
 const currentProjectId=purchaseProject.id;
 const prior=button?.textContent;
 if(button){button.disabled=true;button.textContent='Preparing signed PDF…'}
 try{
  const {data,error}=await supabase.functions.invoke('signed-project-agreement',{
   body:{projectId:currentProjectId,agreementId:signedAgreement.id}
  });
  if(error){
   let message=error.message||'Could not generate the signed PDF.';
   try{const response=error.context;if(response?.json){const details=await response.json();message=details.error||details.message||message}}catch{}
   throw new Error(message+' Check that the signed-project-agreement Supabase function is deployed.');
  }
  const blob=data instanceof Blob?data:new Blob([data],{type:'application/pdf'});
  const bytes=new Uint8Array(await blob.slice(0,8).arrayBuffer());
  if(blob.size<1000 || new TextDecoder().decode(bytes).indexOf('%PDF-')!==0)
   throw new Error('Server returned an invalid PDF. Please contact support.');
  const url=URL.createObjectURL(new Blob([blob],{type:'application/pdf'}));
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download='steady-hands-signed-agreement-'+currentProjectId+'.pdf';
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),300000);
 }finally{if(button){button.disabled=false;button.textContent=prior}}
}

function purchaseDraft(){return {plan:purchasePlan,checkoutSessions,updated_at:new Date().toISOString()}}
async function savePurchaseDraft(){
 if(!purchaseUser||!purchaseProject)return false;
 purchaseSaving=true;
 const drafts={...(purchaseUser.user_metadata?.portal_project_purchase_drafts||{}),[purchaseProject.id]:purchaseDraft()};
 const {data,error}=await supabase.auth.updateUser({data:{portal_project_purchase_drafts:drafts}});
 purchaseSaving=false;
 if(error){const el=$('#purchase-notice');if(el)el.textContent='Could not save progress: '+error.message;return false}
 if(data?.user)purchaseUser=data.user;
 return true;
}
function completedCount(){return !signedAgreement?0:!(designPaid||developmentBypass)?1:!hostingPaid?2:3}
function promoUI(purpose){return '<section class="purchase-code-box"><button type="button" class="purchase-code-toggle" data-open-code="'+purpose+'"><span>Have a code?</span></button><div class="purchase-code-fields" hidden><label>Enter your code</label><div class="purchase-code-input-row"><input type="text" autocomplete="off" spellcheck="false" placeholder="Enter your code" maxlength="80"><button type="button" class="secondary" data-apply-code="'+purpose+'">Apply</button></div><small role="status" class="purchase-code-feedback"></small></div></section>'}
async function codeStatus(){
 const {data,error}=await supabase.functions.invoke('portal-promo',{body:{action:'status'}});
 if(error||!data||data.message)throw new Error(data?.message||'Code service is not ready. Apply your server setup first.');
 developmentBypass=data.developmentBypass===true;
 hostingDiscount=data.hostingDiscount===true;
}
function purchaseMarkup(){
 const completed=completedCount();
 if(requestedPurchaseStage!==null){purchaseStep=requestedPurchaseStage;showingAgreementApproval=purchaseStep===0&&!!signedAgreement}
 const list='<div class="journey-purchase-steps">'+purchaseSteps.map((x,i)=>'<div class="journey-purchase-stage '+(i===(showingAgreementApproval?0:purchaseStep)?'active':'')+' '+(i<completed?'complete':'')+'"><span class="stage-number">'+(i<completed?'✓':i+1)+'</span><span>'+x.title+'</span></div>').join('')+'</div><div class="journey-progress-caption"><span>Purchase progress</span><strong>'+completed+'/3 complete</strong></div><div class="journey-progress"><div style="width:'+(completed/3*100)+'%"></div></div>';
 let body='';
 if(completed===3&&requestedPurchaseStage===null){queueMicrotask(()=>window.dispatchEvent(new CustomEvent('steadyhands:purchase-complete',{detail:{projectId:purchaseProject.id}})));
  body='<div class="journey-finish"><div class="journey-finish-icon">✓</div><h3>Everything is complete!</h3><p>Your agreement, website design step, and hosting checkout have been confirmed.</p><div class="journey-finish-checks"><div>✓ Agreement signed</div><div>'+(developmentBypass?'✓ Website design fee waived':'✓ Website design paid')+'</div><div>✓ Hosting confirmed</div></div><div class="journey-finish-actions"><button type="button" class="primary" id="journey-download-confirmation">↓ Download Confirmation</button><button type="button" class="secondary" id="journey-return-home">Back to Overview</button></div></div>';
 }else if(signedAgreement&&showingAgreementApproval){
  body='<div class="journey-approval-screen"><span class="journey-approval-check" aria-hidden="true">✓</span><h3>Agreement Approved</h3><p>Your signed agreement for this website has been saved successfully.</p><p class="journey-approval-date">Signed: '+signedDateText()+'</p><button type="button" id="journey-download-signed" class="primary">↓ Download Signed PDF</button><button type="button" id="journey-signed-continue" class="secondary">Return to Website Cards</button></div>';
 }else if(purchaseStep===0){
  body='<h3>1. Sign Agreement</h3><p>Review and sign for this website before paying.</p><div class="journey-info"><strong>Current agreement</strong><p>Read the <button type="button" class="journey-terms-link" id="journey-view-terms">Website Services Agreement (PDF)</button> version October 14, 2026.</p></div><label class="journey-sign-label">Signature</label><canvas id="journey-sign" width="760" height="220" aria-label="Draw a signature"></canvas><button type="button" class="secondary" id="journey-clear-sign">Clear Signature</button><label class="journey-agree"><input type="checkbox" id="journey-agree"> I have read and agree to the website service agreement.</label><button class="primary" id="journey-sign-submit" type="button">Sign Agreement</button>';
 }else if(purchaseStep===1&&(designPaid||developmentBypass)){
  body='<h3>Website Design</h3><div class="journey-info">'+(developmentBypass?'Your website development fee is waived.':'Your website design payment is confirmed.')+'</div><button type="button" class="secondary" id="journey-return-cards">Return to Website Cards</button>';
 }else if(purchaseStep===1){
  body='<h3>Website Design Payment</h3><p>One-time website development</p><div class="journey-purchase-total"><strong>Website Design</strong><span>'+(developmentBypass?'<s>$100 once</s> <b class="code-free-label">FREE</b>':'$100 once')+'</span></div>'+promoUI('development_bypass')+(checkoutSessions.development?'<button type="button" class="secondary" id="purchase-verify">I’ve Completed Payment — Check Status</button>':'')+'<button type="button" class="primary" id="pay-website-design">'+(developmentBypass?'Next: Select Hosting':'Continue to Square Checkout')+'</button>';
 }else if(hostingPaid){
  body='<h3>Hosting confirmed</h3><p>Your hosting payment has been verified for this website.</p><button type="button" class="secondary" id="journey-return-cards">Return to Website Cards</button>';
 }else{
  body='<h3>Hosting</h3><p>Select your monthly hosting plan to finish.</p>'+hostingCards(purchasePlan==='backend'?'business':purchasePlan,'journey-host','backend')+promoUI('local_hosting')+(checkoutSessions.hosting?'<button type="button" class="secondary" id="purchase-verify">I’ve Completed Payment — Check Status</button>':'')+'<button id="purchase-hosting-checkout" class="primary" type="button">Continue to Hosting Checkout</button>';
 }
 const prerequisite=purchaseStep>0&&purchaseProject?.status==='draft'?'Complete your website brief or approve a preview from Make a Site before payment.':purchaseStep>0&&!signedAgreement?'Sign your website agreement from the separate Agreement card before payment.':purchaseStep===2&&!(designPaid||developmentBypass)?'Complete Website Design payment before hosting checkout.':'';
 return '<div class="journey-dialog-body">'+(prerequisite?'<p class="journey-info" role="status">'+prerequisite+'</p>':'')+'<div class="journey-info">Website: <strong>'+String(purchaseProject?.display_name||'').replace(/[&<>"]/g,'')+'</strong></div>'+list+'<div class="journey-purchase-stage-content">'+body+'</div><p id="purchase-notice" role="status" class="journey-muted" aria-live="polite"></p></div>';
}
async function refreshPaymentStatus(){
 if(!purchaseUser)return;
 if(!signedAgreement)return;
 if(checkoutSessions.development&&!designPaid&&!developmentBypass){
  try{designPaid=await verifyCustomerCheckout(checkoutSessions.development,{projectId:purchaseProject.id,purpose:'development'})}catch(e){console.warn('Design payment verification unavailable',e)}
 }
 if((designPaid||developmentBypass)&&checkoutSessions.hosting&&!hostingPaid){
  try{hostingPaid=await verifyCustomerCheckout(checkoutSessions.hosting,{projectId:purchaseProject.id,purpose:'hosting'})}catch(e){console.warn('Hosting verification unavailable',e)}
 }
 purchaseStep=(designPaid||developmentBypass)?(hostingPaid?3:2):1;
}
function downloadConfirmation(){
 const clean=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const page='<!doctype html><html><head><meta charset="utf-8"><title>Steady Hands Purchase Confirmation</title><style>body{font:16px system-ui;color:#19365d;max-width:650px;margin:60px auto;padding:24px}h1{color:#165c9b}.line{padding:14px 0;border-bottom:1px solid #ddd}</style></head><body><h1>Steady Hands LLC</h1><h2>Purchase Confirmation</h2><p>Customer: '+clean(purchaseUser?.email)+'</p><p>Website: '+clean(purchaseProject?.display_name)+'</p><p>Project ID: '+clean(purchaseProject?.id)+'</p><div class="line">✓ Agreement signed — website-specific terms, October 14, 2026</div><div class="line">'+(developmentBypass?'✓ Website design — fee waived by code':'✓ Website design — $100 paid')+'</div><div class="line">✓ Hosting — '+clean(purchasePlan==='backend'?'Business Hosting $30/month':'Standard Hosting $20/month')+'</div><p>Verified checkout references: '+clean(checkoutSessions.development)+' / '+clean(checkoutSessions.hosting)+'</p><p>This is a confirmation summary, not a tax invoice. Square provides the official payment receipts.</p></body></html>';
 const url=URL.createObjectURL(new Blob([page],{type:'text/html'}));const link=document.createElement('a');link.href=url;link.download='steady-hands-confirmation.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
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
 open(purchaseMarkup(),requestedPurchaseStage===0?'Website Agreement':requestedPurchaseStage===1?'Website Design':'Website Purchase');
 wrapper.querySelectorAll('[data-open-code]').forEach(b=>b.onclick=()=>{const p=b.closest('.purchase-code-box').querySelector('.purchase-code-fields');p.hidden=!p.hidden;if(!p.hidden)p.querySelector('input').focus()});
 wrapper.querySelectorAll('[data-apply-code]').forEach(b=>b.onclick=async()=>{const p=b.closest('.purchase-code-fields'),note=p.querySelector('.purchase-code-feedback'),code=p.querySelector('input').value.trim();if(!code){note.textContent='Enter your code.';return}b.disabled=true;note.textContent='Verifying code…';try{const {data,error}=await supabase.functions.invoke('portal-promo',{body:{action:'redeem',purpose:b.dataset.applyCode,code}});if(error||data?.message)throw new Error(data?.message||'Unable to validate code');if(data?.valid!==true){note.textContent='Invalid code for this step.';return}await codeStatus();if(b.dataset.applyCode==='development_bypass'&&developmentBypass&&requestedPurchaseStage===null)purchaseStep=2;renderPurchase();$('#purchase-notice').textContent=developmentBypass?'Development fee waived. Continue by selecting hosting.':'Code applied successfully.'}catch(e){note.textContent=e.message||'Code could not be applied.'}finally{b.disabled=false}});
 setupSignatureCanvas();
 const sign=$('#journey-sign-submit');
 if(sign)sign.onclick=async()=>{
  const notice=$('#purchase-notice');
  if(!$('#journey-agree')?.checked){notice.textContent='Please read and check the terms acknowledgment first.';return}
  if(!signatureDrawn){notice.textContent='Please draw your signature first.';return}
  const canvas=$('#journey-sign');
  const projectAtStart=purchaseProject;
  const originalLabel=sign.textContent;
  const limit=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('The signing request timed out. Check your connection, then try again.')),ms))]);
  sign.disabled=true;
  sign.textContent='Saving signature…';
  notice.textContent='Saving signature securely…';
  try{
   if(!projectAtStart?.id)throw new Error('No website selected. Close and reopen the checkout.');
   const auth=await limit(supabase.auth.getUser(),12000);
   const user=auth?.data?.user;
   if(auth?.error||!user)throw new Error('Please sign in again.');
   let existing=await limit(loadSignedAgreement(user.id),12000);
   if(!existing){
    const png=canvas.toDataURL('image/png');
    const response=await limit(supabase.from('portal_project_agreements').insert({
     user_id:user.id,project_id:projectAtStart.id,agreement_version:AGREEMENT_VERSION,
     agreement_title:'Steady Hands LLC — Website-Specific Services Agreement',
     signature_png:png,acknowledged:true,website_name:projectAtStart.display_name
    }),15000);
    if(response.error && response.error.code!=='23505')throw response.error;
    existing=await limit(loadSignedAgreement(user.id),12000);
   }
   if(!existing)throw new Error('Could not confirm the saved signature. Please try again.');
   signedAgreement=existing;
   purchaseStep=0;
   showingAgreementApproval=true;
   renderPurchase();
   const nextNotice=$('#purchase-notice');
   if(nextNotice)nextNotice.textContent='Agreement saved.';
  }catch(error){
   console.error('Unable to save project agreement',error);
   const currentNotice=$('#purchase-notice');
   if(currentNotice)currentNotice.textContent='Signature not saved: '+(error?.message||'Please try again.');
  }finally{
   if(sign.isConnected){sign.disabled=false;sign.textContent=originalLabel}
  }
 };

 const signedDownload=$('#journey-download-signed');if(signedDownload)signedDownload.onclick=async()=>{try{await downloadSignedAgreement(signedDownload)}catch(e){$('#purchase-notice').textContent=e.message||'Signed PDF could not be prepared.'}};
 const continueSigned=$('#journey-signed-continue');if(continueSigned)continueSigned.onclick=()=>{close();location.hash='website'};
 const cards=$('#journey-return-cards');if(cards)cards.onclick=()=>{close();location.hash='website'};
 const terms=$('#journey-view-terms');if(terms)terms.onclick=()=>{const modal=document.createElement('div');modal.className='journey-terms-overlay';modal.innerHTML='<section class="journey-terms-box journey-terms-embedded" role="dialog" aria-modal="true" aria-label="Website Services Agreement PDF"><div class="journey-terms-heading"><h3>Website Services Agreement (PDF)</h3><a href="website-services-agreement.pdf" target="_blank" rel="noopener noreferrer">Open or download PDF ↗</a></div><iframe title="Steady Hands Website Services Agreement PDF" src="website-services-agreement.pdf#toolbar=1"></iframe><p><a href="website-services-agreement.pdf" target="_blank" rel="noopener noreferrer">If the preview is blank, open the PDF here.</a></p><button type="button" class="primary" id="close-terms">Close</button></section>';document.body.appendChild(modal);modal.querySelector('#close-terms').onclick=()=>modal.remove();modal.onclick=e=>{if(e.target===modal)modal.remove()}};
 const verify=$('#purchase-verify');if(verify)verify.onclick=async()=>{verify.disabled=true;$('#purchase-notice').textContent='Checking Square payment status…';await refreshPaymentStatus();renderPurchase();if(completedCount()<3)$('#purchase-notice').textContent='Square has not confirmed the payment yet. Try again after checkout.'};
 const download=$('#journey-download-confirmation');if(download)download.onclick=downloadConfirmation;
 const home=$('#journey-return-home');if(home)home.onclick=()=>{close();location.hash='overview'};
 const options=wrapper.querySelectorAll('input[name="journey-host"]');
 options.forEach(x=>x.onchange=async()=>{purchasePlan=x.value;await savePurchaseDraft()});
 const noticeCheckout=message=>{const el=$('#purchase-notice');if(el)el.textContent=message};
 async function checkout(kind,button){
  if(purchaseProject?.status!=='awaiting_payment'){noticeCheckout('Complete your website brief or approve a preview from the Make a Site card before payment.');return}
  if(!signedAgreement?.id){noticeCheckout('Please sign your website agreement from the Agreement card first.');return}
  if(kind!=='development'&&!(designPaid||developmentBypass)){noticeCheckout('Complete the Website Design payment before hosting checkout.');return}
  button.disabled=true;noticeCheckout('Preparing your personal Square checkout link…');
  // Open synchronously in response to click, so popup blockers do not interfere.
  const checkoutWindow=window.open('','_blank');
  if(checkoutWindow){checkoutWindow.document.title='Preparing Square Checkout';checkoutWindow.document.body.textContent='Preparing your secure Square checkout…'}
  try{
   const {checkoutUrl,checkoutId}=await createCustomerCheckout(kind,{agreementId:signedAgreement.id,projectId:purchaseProject.id});
   checkoutSessions[kind==='development'?'development':'hosting']=checkoutId;
   await savePurchaseDraft();
   if(checkoutWindow){checkoutWindow.opener=null;checkoutWindow.location.replace(checkoutUrl)}
   else window.location.assign(checkoutUrl);
   noticeCheckout('Your individual Square payment link is ready. Complete payment in the new tab.');
  }catch(error){
   const message='Could not start checkout: '+(error.message||'Please try again.');
   if(checkoutWindow&&!checkoutWindow.closed){checkoutWindow.document.body.innerHTML='';const status=checkoutWindow.document.createElement('div');status.style.cssText='font:16px system-ui;max-width:540px;margin:14vh auto;padding:28px;color:#173459';const heading=checkoutWindow.document.createElement('h2');heading.textContent='Square checkout could not be opened';const p=checkoutWindow.document.createElement('p');p.textContent=message;status.append(heading,p);checkoutWindow.document.body.append(status)}
   noticeCheckout(message);
  }finally{button.disabled=false}
 }
 const design=$('#pay-website-design');if(design)design.onclick=()=>{if(developmentBypass){requestedPurchaseStage=2;purchaseStep=2;renderPurchase()}else checkout('development',design)};
 const hosting=$('#purchase-hosting-checkout');if(hosting)hosting.onclick=async()=>{if(!purchasePlan){noticeCheckout('Select your hosting plan first.');return}await checkout(purchasePlan,hosting)};

}
document.addEventListener('steadyhands:purchase-options',async event=>{
 const {data:{user}}=await supabase.auth.getUser();if(!user)return;
 const projectId=event.detail?.projectId||sessionStorage.getItem('steadyhands.portal.checkout_project');
 sessionStorage.removeItem('steadyhands.portal.checkout_project');
 if(!projectId){open('<div class="journey-dialog-body"><h3>Choose a website first</h3><p>Open an Awaiting Payment website from My Websites. Each site has its own agreement and payments.</p></div>','Website Checkout');return}
 const {data:project,error:projectError}=await supabase.from('portal_website_projects').select('id,user_id,display_name,status,details').eq('id',projectId).eq('user_id',user.id).maybeSingle();
 if(projectError||!project||!['draft','awaiting_payment'].includes(project.status)){open('<div class="journey-dialog-body"><p>This website is not available for payment.</p></div>','Website Checkout');return}
 purchaseProject=project;purchaseUser=user;showingAgreementApproval=false;
 requestedPurchaseStage=({agreement:0,design:1,hosting:2})[event.detail?.stage]??null;
 const draft=user.user_metadata?.portal_project_purchase_drafts?.[project.id]||{};
 const preferredPlan=sessionStorage.getItem('portal_preferred_plan');sessionStorage.removeItem('portal_preferred_plan');
 const projectPlan=project.details?.hosting_plan==='business'?'backend':'standard';
 purchasePlan=['standard','backend'].includes(draft.plan)?draft.plan:(['standard','backend'].includes(preferredPlan)?preferredPlan:projectPlan);
 checkoutSessions=draft.checkoutSessions||{};
 designPaid=false;hostingPaid=false;developmentBypass=false;hostingDiscount=false;
 try{signedAgreement=await loadSignedAgreement(user.id)}catch(e){open('<p class="journey-info">Unable to load project agreement. Run PROJECT_PURCHASE_SETUP.sql first. '+String(e.message||e).replace(/[<>]/g,'')+'</p>','Agreement Status');return}
 purchaseStep=signedAgreement?1:0;
 // Discount redemption must also be made project-specific on the server. Do not apply account-wide promo flags.
 await refreshPaymentStatus();
 renderPurchase();
});
window.addEventListener('focus',async()=>{if(wrapper.hidden||!purchaseUser||!signedAgreement||completedCount()===3)return;if(!checkoutSessions.development&&!checkoutSessions.hosting)return;await refreshPaymentStatus();renderPurchase()});
$('#journey-dialog-close').onclick=close;
wrapper.addEventListener('click',e=>{if(e.target===wrapper)close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!wrapper.hidden)close()});
