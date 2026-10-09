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
document.addEventListener('steadyhands:purchase-options',()=>{
 open('<div class="journey-dialog-body"><p>Select a hosting plan, review the terms, and sign before proceeding to payment.</p><div class="journey-host-options"><label><input type="radio" name="journey-host" value="standard" checked><span><strong>Standard Hosting</strong><small>$20/month</small></span></label><label><input type="radio" name="journey-host" value="backend"><span><strong>Backend Hosting</strong><small>$30/month</small></span></label></div><div class="journey-purchase-total"><strong>Website development</strong><span>$100 one time</span></div><div class="journey-info"><strong>Agreement & terms</strong><p>The final agreement must be published and connected before legally collecting your signature or accepting payment through this flow.</p></div><label class="journey-sign-label">Signature preview</label><canvas id="journey-sign" width="760" height="220" aria-label="Draw your signature here"></canvas><button type="button" class="secondary" id="journey-clear-sign">Clear signature</button><p class="journey-muted">Signing and Square checkout are not active yet. No charges will be made here.</p><button type="button" class="primary journey-disabled" disabled>Sign Agreement & Continue to Checkout</button></div>','Complete Your Purchase');
 const canvas=$('#journey-sign'),ctx=canvas.getContext('2d');let drawing=false;
 function coords(e){const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)*canvas.width/b.width,y:(e.clientY-b.top)*canvas.height/b.height}}
 canvas.addEventListener('pointerdown',e=>{drawing=true;canvas.setPointerCapture(e.pointerId);const p=coords(e);ctx.beginPath();ctx.moveTo(p.x,p.y)});
 canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=coords(e);ctx.lineWidth=3;ctx.lineCap='round';ctx.strokeStyle='#173459';ctx.lineTo(p.x,p.y);ctx.stroke()});
 canvas.addEventListener('pointerup',()=>drawing=false);canvas.addEventListener('pointercancel',()=>drawing=false);
 $('#journey-clear-sign').onclick=()=>ctx.clearRect(0,0,canvas.width,canvas.height);
});
$('#journey-dialog-close').onclick=close;
wrapper.addEventListener('click',e=>{if(e.target===wrapper)close()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!wrapper.hidden)close()});
