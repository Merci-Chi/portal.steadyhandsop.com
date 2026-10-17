import {getCustomerCheckoutStatus} from './square-checkout.js?v=20261016-card-status-contact';
import {getSitePreviews} from './site-preview-catalog.js?v=20261016-sites-catalog';
// Client-owned website projects. Requires sql/website-projects.sql to be applied first.
let api=null, viewer=null, refreshView=()=>{}, projects=[], selected=null, step=0, errorText='', beforeProjectClose=null, availablePreviews=()=>[];
const projectCompletion=new Map();
const activeWizardKey='steadyhands.website.setup.active';
function rememberWizard(id,index){try{sessionStorage.setItem(activeWizardKey,JSON.stringify({user:viewer?.id,project:id,step:index}))}catch{}}
function forgetWizard(){try{sessionStorage.removeItem(activeWizardKey)}catch{}}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=[
 {title:'Business Basics',hint:'Tell us what your business does.',items:[['business_name','Business name','text',true],['business_type','Type of business','text',true],['description','Describe your business','textarea',false],['service_area','Service area / location','text',false]]},
 {title:'Contact Information',hint:'Choose what customers should see on your website.',items:[['public_phone','Public phone number','tel',false],['public_email','Public email','email',false],['business_hours','Business hours','hours',false],['social_links','Social media links','social',false]]},
 {title:'Services & Products',hint:'Describe what you offer and what matters most.',items:[['services','Services or products','services',true],['prices','Pricing or packages (optional)','textarea',false],['featured','What should we highlight?','textarea',false]]},
 {title:'Design & Branding',hint:'Help us understand the look you want.',items:[['colors','Preferred colors','colors',false],['logo_url','Logo or brand asset link','url',false],['photos_uploads','Upload photos','photo-upload',false],['photos_url','Photo / image links','repeatable-links',false],['inspiration','Websites you like','repeatable-links',false]]},
 {title:'Website Pages',hint:'Choose the pages customers will need. Select as many as necessary.',items:[['pages','Pages needed','pages',true],['custom_pages','Custom pages','custom-pages',false]]},
 {title:'Website Features',hint:'You can add as many features as necessary. Choose what helps your business and add any custom requests for review.',items:[['hosting_plan','Hosting plan','hosting-plan',false],['features','Features you need','feature-options',false],['custom_features','Custom features','custom-features',false],['extra_requests','Other requests or notes','textarea',false]]},
 {title:'Review & Submit',hint:'Review your information before submitting.',items:[]}
];
const required=fields.flatMap(s=>s.items.filter(x=>x[3]).map(x=>x[0]));
function missingRequired(data){return required.filter(key=>key==='pages'?!(hasValue(data?.pages)||hasValue(data?.custom_pages)):!hasValue(data?.[key]))}
function missingStepButtons(missing){
 const sections=fields.map((section,index)=>({section,index,missing:section.items.filter(item=>missing.includes(item[0]))})).filter(x=>x.missing.length);
 return '<div class="project-missing-steps"><strong>Finish these required steps:</strong>'+sections.map(({section,index,missing})=>'<button type="button" class="project-missing-step" data-missing-step="'+index+'"><span>Step '+(index+1)+': '+esc(section.title)+'</span><small>'+missing.map(item=>esc(item[1])).join(', ')+'</small><span class="project-missing-arrow" aria-hidden="true">→</span></button>').join('')+'</div>';
}
function showMissingSteps(form,missing,navigate){
 const message=form.querySelector('#project-message');
 const target=form.querySelector('.project-required-top');
 if(!message)return;
 message.textContent=target?'':'Please finish the required information below.';
 form.querySelector('.project-missing-steps')?.remove();
 if(target){target.innerHTML=missing.length?'<p class="project-required-notice">Please finish the required information below.</p>'+missingStepButtons(missing):''}
 else if(missing.length)message.insertAdjacentHTML('afterend',missingStepButtons(missing));
 form.querySelectorAll('[data-missing-step]').forEach(button=>button.addEventListener('click',()=>navigate(Number(button.dataset.missingStep))));
}

const defaultData=()=>({hosting_plan:'standard',pages:[],custom_pages:[],features:[],custom_features:[],services:[],social_links:{}});
const hasValue=v=>Array.isArray(v)?v.some(hasValue):v&&typeof v==='object'?Object.values(v).some(hasValue):String(v??'').trim().length>0;
const getProject=id=>projects.find(x=>x.id===id);
const icon=n=>'<i data-lucide="'+n+'" aria-hidden="true"></i>';
function redrawIcons(){window.lucide?.createIcons?.()}
function status(p){return ({draft:'Getting Started',awaiting_payment:'Awaiting Payment',in_development:'In Development',ready_for_review:'Ready for Review',ready_to_launch:'Ready to Launch',live:'Live'})[p.status]||'Website Project'}
function complete(p){return required.length-missingRequired(p.details).length}
function projectHasStarted(p){
 if(p.status!=='draft'||p.preview_code||p.details?.__design_source||p.details?.__design_approved_at||Number.isInteger(p.details?.__setup_step))return true;
 // Preserve progress in older drafts that predate the explicit source marker.
 return fields.flatMap(section=>section.items).some(([key])=>key!=='hosting_plan'&&hasValue(p.details?.[key]));
}
async function loadProjectCompletion(){
 const priorViewer=viewer.id;
 const {data:agreements,error}=await api.from('portal_project_agreements').select('project_id').eq('user_id',viewer.id).eq('agreement_version','2026-10-14-project-v1').eq('acknowledged',true);
 const signed=new Set((Array.isArray(agreements)?agreements:[]).map(a=>a.project_id));
 await Promise.allSettled(projects.map(async p=>{
  const previous=projectCompletion.get(p.id)||{},state={...previous,agreementSigned:error?!!previous.agreementSigned:signed.has(p.id)};
  const sessions=viewer.user_metadata?.portal_project_purchase_drafts?.[p.id]?.checkoutSessions||{};
  for(const purpose of ['development','hosting']){
   if(!sessions[purpose]){state[purpose]=null;state[purpose+'Unavailable']=false;continue}
   try{state[purpose]=await getCustomerCheckoutStatus(sessions[purpose],{projectId:p.id,purpose});state[purpose+'Unavailable']=false}
   catch{state[purpose+'Unavailable']=true}
  }
  if(viewer.id===priorViewer)projectCompletion.set(p.id,state);
 }));
}
function projectSteps(p){
 const id=esc(p.id),approved=!!p.details?.__design_approved_at,state=projectCompletion.get(p.id)||{};
 if(!projectHasStarted(p))return '<section class="project-step-card project-start-card"><span class="home-kicker">MAKE A SITE</span><h4>How would you like to start?</h4><p>Create a site from questions, or approve a preview you already have.</p><div class="project-step-actions"><button type="button" class="secondary" data-project-edit="'+id+'">Create a Site from Questions</button><button type="button" class="secondary" data-project-approve="'+id+'">Ready to Approve a Preview</button></div></section>';
 const paid=purpose=>state[purpose]?.verified===true;
 const action=(stage,label)=>{
  const locked=stage==='design'?!paid('development')&&!state.agreementSigned:stage==='hosting'?!paid('hosting')&&(!state.agreementSigned||!paid('development')):false;
  const hint=stage==='design'||!state.agreementSigned?'Sign the agreement first.':'Complete development payment first.';
  return '<div class="project-step-actions">'+(locked?'<small id="step-lock-'+id+'-'+stage+'" class="project-step-lock-note">'+hint+'</small>':'')+'<button type="button" class="secondary project-step-action" data-project-purchase-step="'+stage+'" data-project-id="'+id+'" '+(locked?'disabled aria-describedby="step-lock-'+id+'-'+stage+'"':'')+'>'+label+'</button></div>';
 };
 return '<div class="project-step-grid project-purchase-grid">'+
 '<section class="project-step-card '+(state.agreementSigned?'is-complete':'')+'"><span class="home-kicker">01 · AGREEMENT</span><h4>Agreement</h4><p>'+(state.agreementSigned?'Your signed agreement is saved.':'Sign the agreement for this website.')+'</p>'+action('agreement',state.agreementSigned?'Review Agreement':'Start Agreement')+'</section>'+
 '<section class="project-step-card '+(paid('development')?'is-complete':'')+'"><span class="home-kicker">02 · DEVELOPMENT</span><h4>Development</h4><p>'+(paid('development')?'Your development payment is confirmed.':'Website development is $100 once, separate from hosting.')+'</p><div class="project-step-tools">'+(!approved?'<button type="button" class="project-subaction" data-project-edit="'+id+'">'+(p.status==='draft'?'Continue Site Questions':'Edit Website Details')+'</button>':'')+'<button type="button" class="project-subaction" data-project-approve="'+id+'">'+(approved?'View Approved Preview':'Approve Preview')+'</button></div>'+action('design',paid('development')?'Review Invoice':state.developmentUnavailable?'Check Payment Status':'Pay for Development')+'</section>'+
 '<section class="project-step-card '+(paid('hosting')?'is-complete':'')+'"><span class="home-kicker">03 · HOSTING</span><h4>Hosting</h4><p>'+(paid('hosting')?'Your hosting payment is confirmed.':'Standard Hosting is $20/month. Business Hosting is $30/month.')+'</p>'+action('hosting',paid('hosting')?'Review Invoice':state.hostingUnavailable?'Check Payment Status':'Pay for Hosting')+'</section></div>';
}
function contactDesignSpecialist(id){
 const p=getProject(id);if(!p)return;
 let mode='phone';const values={phone:'',email:''};
 const d=dialog('<div class="project-modal"><header><div><span class="home-kicker">DESIGN SUPPORT</span><h2>Contact Design Specialist</h2></div><button type="button" class="project-close" data-project-close aria-label="Close">×</button></header><p>Website: '+esc(p.display_name)+'</p><div class="project-contact-tabs"><button type="button" class="secondary" data-contact-mode="phone" aria-pressed="true">Phone</button><button type="button" class="secondary" data-contact-mode="email" aria-pressed="false">Switch to Email</button></div><div id="specialist-contact-fields"></div><small>Enter your design specialist’s contact details. These buttons open your device’s app; you choose whether to send or call.</small></div>');
 const render=()=>{
  const fields=d.querySelector('#specialist-contact-fields');
  fields.innerHTML='<label>'+(mode==='phone'?'Specialist phone number':'Specialist email address')+'<input id="specialist-contact-value" '+(mode==='phone'?'type="tel" inputmode="tel" placeholder="Enter phone number"':'type="email" placeholder="specialist@example.com"')+' value="'+esc(values[mode])+'"></label><p id="specialist-contact-message" role="status"></p><div class="project-contact-actions"></div>';
  const input=fields.querySelector('input'),actions=fields.querySelector('.project-contact-actions');
  const update=()=>{
   values[mode]=input.value;const value=input.value.trim();actions.innerHTML='';
   if(!value)return;
   const phone=value.replace(/[\s().-]/g,'');
   if(mode==='phone'&&!/^\+?\d{7,15}$/.test(phone)){fields.querySelector('[role=status]').textContent='Enter a valid phone number, including the country code if needed.';return}
   if(mode==='email'&&!input.checkValidity()){fields.querySelector('[role=status]').textContent='Enter a valid email address.';return}
   fields.querySelector('[role=status]').textContent='';
   const link=(label,href)=>{const a=document.createElement('a');a.className='secondary';a.textContent=label;a.href=href;actions.append(a)};
   if(mode==='phone'){link('Open Messages','sms:'+phone);link('Call','tel:'+phone)}
   else link('Open Email','mailto:'+encodeURIComponent(value)+'?subject='+encodeURIComponent('Website design: '+p.display_name));
  };
  input.oninput=update;update();
 };
 d.querySelectorAll('[data-contact-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.contactMode;d.querySelectorAll('[data-contact-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.contactMode===mode));b.textContent=b.dataset.contactMode==='phone'?(mode==='phone'?'Phone':'Switch to Phone'):(mode==='email'?'Email':'Switch to Email')});render()});
 render();
}

export function websiteProjectsMarkup(){
 if(errorText)return '<div class="project-notice">Website projects are not available yet. Contact support for help. <small>'+esc(errorText)+'</small></div>';
 if(!projects.length)return '<div class="home-empty"><span class="home-empty-icon">'+icon('panel-top')+'</span><h3>No websites yet</h3><p>Create a site from questions, or approve a preview you already have. Agreement, design payment, and hosting are separate steps.</p><button class="primary" data-project-add>Create a Website</button><button class="secondary" data-project-add data-start-preview>Ready to Approve a Preview</button></div>';
 return '<div class="project-list">'+projects.map(p=>{const archived=p.details?.__archived===true,active=['draft','awaiting_payment'].includes(p.status),id=esc(p.id);return '<article class="project-card'+(archived?' project-archived':'')+'"><div class="project-card-body"><div class="project-top"><span class="project-icon">'+icon('globe')+'</span><div class="project-name"><div class="project-name-line"><h3>'+esc(p.display_name)+'</h3><button type="button" class="secondary project-specialist-button" data-project-specialist="'+id+'">Contact Design Specialist</button></div>'+(archived||p.status!=='awaiting_payment'?'<span class="project-badge">'+(archived?'Archived':esc(status(p)))+'</span>':'')+'</div><button type="button" class="secondary project-small" data-project-rename="'+id+'">Rename</button></div>'+projectSteps(p)+'<div class="project-actions">'+(p.preview_code?'<span class="project-linked">'+icon('link')+' Preview linked</span>':'')+'<button type="button" class="secondary project-archive-button" data-project-archive="'+id+'">Archive</button></div></div>'+(archived?'<div class="project-archive-shade" aria-hidden="true"></div><div class="project-archive-action"><span>'+icon('archive')+' Archived</span><button type="button" class="primary" data-project-unarchive="'+id+'">'+icon('archive-restore')+' Unarchive</button></div>':'')+'</article>'}).join('')+'</div>';
}
function dialog(html){beforeProjectClose=null;let d=document.querySelector('#website-project-dialog');if(!d){d=document.createElement('dialog');d.id='website-project-dialog';d.className='website-project-dialog';document.body.append(d);d.addEventListener('click',e=>{if(e.target===d)close()});d.addEventListener('cancel',e=>{if(beforeProjectClose){e.preventDefault();close()}});}d.previewRequest=null;d.innerHTML=html;d.showModal();redrawIcons();return d}
function close(){if(beforeProjectClose)return beforeProjectClose();forgetWizard();document.querySelector('#website-project-dialog')?.close()}
function notify(text){const el=document.querySelector('#project-message');if(el)el.textContent=text;else alert(text)}
function addDialog(force=false,startPreview=false){
 if(projects.length&&!force){
  const drafts=projects.filter(p=>p.status==='draft');
  const d=dialog('<div class="project-modal"><header><div><span class="home-kicker">YOUR WEBSITES</span><h2>'+ (drafts.length?'You already have a website started':'You already have a website project')+'</h2></div><button type="button" class="project-close" data-project-close aria-label="Close">×</button></header><p>'+(drafts.length?'Continue an existing website, or start a new one.':'Open an existing website, or start another project.')+'</p><div class="project-existing-list">'+projects.map(p=>'<button type="button" class="secondary" data-existing-project="'+esc(p.id)+'"><strong>'+esc(p.display_name)+'</strong><span>'+esc(p.status==='draft'?'Continue setup':status(p))+'</span></button>').join('')+'</div><div class="project-modal-actions"><button type="button" class="secondary" data-project-close>Cancel</button><button type="button" class="primary" data-start-another>Start a New Website</button></div></div>');
  d.querySelector('[data-start-another]').onclick=()=>addDialog(true,startPreview);
  d.querySelectorAll('[data-existing-project]').forEach(b=>b.onclick=()=>openProject(b.dataset.existingProject));
  return;
 }
 const d=dialog('<form id="project-create-form" class="project-modal"><header><div><span class="home-kicker">NEW WEBSITE</span><h2>Add New Website</h2></div><button class="project-close" type="button" data-project-close aria-label="Close">×</button></header><p>Name your website project. You can choose a preview or enter a code now, or create a site from questions later.</p><label>Display Name <input name="display_name" required maxlength="100" placeholder="e.g. My Landscaping Website" autofocus></label><details open><summary>Have a website preview? (Optional)</summary><label>Available Previews<select name="assigned" disabled><option value="">Loading previews…</option></select></label><label>Or enter a Preview Code<input name="preview_code" maxlength="100" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Enter your preview code"></label><small>Select any preview from our Sites collection or enter your own code. You can also leave both blank and start later.</small></details><p id="project-message" role="status" aria-live="polite"></p><div class="project-modal-actions"><button type="button" class="secondary" data-project-close>Cancel</button><button class="primary" type="submit">Create Website</button></div></form>');
 const form=d.querySelector('form'),picker=form.elements.assigned,codeInput=form.elements.preview_code;
 projectPreviewChoices().then(choices=>{
  if(!form.isConnected||d.querySelector('form')!==form)return;
  picker.innerHTML='<option value="">Choose a preview (optional)</option>'+choices.map(v=>'<option value="'+esc(v.site_key)+'">'+esc(v.site_title||v.site_key)+'</option>').join('');
  picker.disabled=false;
  if([...picker.options].some(o=>o.value===codeInput.value.trim().toUpperCase()))picker.value=codeInput.value.trim().toUpperCase();
 }).catch(()=>{if(form.isConnected){picker.innerHTML='<option value="">Enter a preview code below</option>';picker.disabled=true}});
 picker.onchange=()=>{codeInput.value=picker.value};
 codeInput.oninput=()=>{picker.value=[...picker.options].some(o=>o.value===codeInput.value.trim().toUpperCase())?codeInput.value.trim().toUpperCase():''};
 form.onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  try{
   const name=form.elements.display_name.value.trim();if(!name)throw new Error('Enter a display name.');
   const code=codeInput.value.trim().toUpperCase();
   if(code){notify('Checking your preview…');await resolveProjectPreview(code)}
   const {data,error}=await api.from('portal_website_projects').insert({user_id:viewer.id,display_name:name,preview_code:code||null,details:defaultData()}).select().single();
   if(error)throw error;
   projects.unshift(data);close();refreshView();if(startPreview||code)approveProjectPreview(data.id);else intro(data.id);
  }catch(error){notify(error.message)}finally{b.disabled=false}
 };
}

async function save(p,details,submit=false){const payload={details, ...(submit?{status:'awaiting_payment',submitted_at:new Date().toISOString()}:{})};const {data,error}=await api.from('portal_website_projects').update(payload).eq('id',p.id).eq('user_id',viewer.id).select().single();if(error){notify('Could not save: '+error.message);return false}Object.assign(p,data);return true}
function intro(id){
 const d=dialog('<div class="project-modal"><header><div><span class="home-kicker">MAKE A SITE</span><h2>How would you like to start?</h2></div><button type="button" class="project-close" data-project-close aria-label="Close">×</button></header><p>Create a site from questions, or approve a preview you already have. Your agreement, website design payment, and hosting each have their own card.</p><div class="project-step-grid"><section class="project-step-card"><h4>Create a Site from Questions</h4><p>Tell us about your business, services, and preferred style. Save and return anytime.</p><button type="button" class="primary" id="project-intro-next">Start Questions</button></section><section class="project-step-card"><h4>Ready to Approve a Preview</h4><p>Review and approve your existing preview without completing the questionnaire.</p><button type="button" class="primary" data-project-approve="'+esc(id)+'">Review My Preview</button></section></div><button type="button" class="secondary" data-project-close>Return to Website Cards</button></div>');
 d.querySelector('#project-intro-next').onclick=()=>openWizard(id);
}
async function projectPreviewChoices(){
 const entries=[...availablePreviews(),...await getSitePreviews()];
 return [...new Map(entries.filter(v=>/^https:\/\//i.test(String(v.preview_url||''))).map(v=>[String(v.site_key).toUpperCase(),v])).values()].sort((a,b)=>String(a.site_title||a.site_key).localeCompare(String(b.site_title||b.site_key)));
}
async function resolveProjectPreview(code){
 const key=String(code||'').trim().toUpperCase();
 if(!key)throw new Error('Choose a preview or enter its code.');
 let found=(await projectPreviewChoices()).find(p=>String(p.site_key).toUpperCase()===key);
 if(!found){
  const claim=await api.rpc('claim_portal_preview',{p_code:key});
  if(claim.error)throw new Error('Could not link this preview: '+claim.error.message);
  const results=await Promise.all([
   api.from('portal_preview_claims').select('site_key,site_title,preview_url').eq('user_id',viewer.id).eq('site_key',key).maybeSingle(),
   api.from('portal_previews').select('site_key,site_title,preview_url').eq('site_key',key).maybeSingle()
  ]);
  found=results.map(r=>r.data).find(Boolean);
 }
 if(!found||!/^https:\/\//i.test(String(found.preview_url||'')))throw new Error('This preview is not available to your account. Check the code or contact support.');
 return found;
}
async function approveProjectPreview(id){
 const p=getProject(id);if(!p)return;
 const loading=dialog('<div class="project-modal"><header><h2>Available Website Previews</h2><button type="button" class="project-close" data-project-close aria-label="Close">×</button></header><p role="status">Loading previews from our Sites collection…</p></div>');
 const token={};loading.previewRequest=token;
 const choices=await projectPreviewChoices();
 if(!loading.open||loading.previewRequest!==token)return;
 const d=dialog('<form class="project-modal" id="project-approve-form"><header><div><span class="home-kicker">WEBSITE DESIGN</span><h2>Ready to approve your preview?</h2></div><button type="button" class="project-close" data-project-close aria-label="Close">×</button></header><p>Choose any preview from our Sites collection, or a preview linked to your account. No questionnaire is required.</p>'+(choices.length?'<label>Available Previews<select name="assigned"><option value="">Choose a preview</option>'+choices.map(v=>'<option value="'+esc(v.site_key)+'" '+(p.preview_code===v.site_key?'selected':'')+'>'+esc(v.site_title||v.site_key)+'</option>').join('')+'</select></label>':'')+'<label>Preview code<input name="code" maxlength="100" value="'+esc(p.preview_code||'')+'" placeholder="Enter your preview code"></label><button type="submit" class="secondary">Review Preview</button><div id="project-preview-review"></div><p id="project-message" role="status" aria-live="polite"></p></form>');
 const form=d.querySelector('form');form.elements.assigned?.addEventListener('change',()=>{form.elements.code.value=form.elements.assigned.value;d.querySelector('#project-preview-review').innerHTML=''});
 form.elements.code.addEventListener('input',()=>d.querySelector('#project-preview-review').innerHTML='');
 form.onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;notify('Loading preview…');
  try{
   const preview=await resolveProjectPreview(form.elements.code.value);
   const area=d.querySelector('#project-preview-review');
   area.innerHTML='<section class="project-step-card"><h4>'+esc(preview.site_title||'Your website preview')+'</h4><a class="secondary" href="'+esc(preview.preview_url)+'" target="_blank" rel="noopener noreferrer">Open Preview ↗</a><label class="project-approval-check"><input type="checkbox" id="project-preview-consent"> I have reviewed this preview and approve its design.</label><button type="button" class="primary" id="project-preview-confirm">Approve This Design</button></section>';
   notify('Review the preview, then confirm your approval.');
   area.querySelector('#project-preview-confirm').onclick=async()=>{
    const confirm=area.querySelector('#project-preview-confirm');
    if(!area.querySelector('#project-preview-consent').checked){notify('Please confirm that you have reviewed and approve this preview.');return}
    confirm.disabled=true;
    try{
     const details={...p.details,__design_source:'preview',__design_approved_at:new Date().toISOString(),__approved_preview:{site_key:preview.site_key,site_title:preview.site_title,preview_url:preview.preview_url}};
     const payload={preview_code:preview.site_key,details,...(p.status==='draft'?{status:'awaiting_payment',submitted_at:new Date().toISOString()}:{})};
     const {data,error}=await api.from('portal_website_projects').update(payload).eq('id',p.id).eq('user_id',viewer.id).select().single();
     if(error)throw error;Object.assign(p,data);close();refreshView();
     dialog('<div class="project-modal project-success"><h2>Design approved</h2><p>Your preview approval is saved. You can now use the separate Agreement, Website Design Payment, and Hosting cards. No questionnaire is needed.</p><button type="button" class="primary" data-project-close>Return to Website Cards</button></div>');
    }catch(error){notify('Could not save approval: '+error.message);confirm.disabled=false}
   };
  }catch(error){notify(error.message)}finally{button.disabled=false}
 };
}

const socials=['Instagram','TikTok','Facebook','X','Yelp','Google'];
function formatPhone(value){
 const digits=String(value||'').replace(/\D/g,'').slice(0,15);
 const prefix=digits.length>10?'+'+digits.slice(0,-10)+' ':'';
 const local=digits.slice(-10);
 if(local.length<=3)return prefix+(local.length===3?'('+local+')':local?'('+local:'');
 if(local.length<=6)return prefix+'('+local.slice(0,3)+') '+local.slice(3);
 return prefix+'('+local.slice(0,3)+') '+local.slice(3,6)+'-'+local.slice(6);
}
const workDays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function parseHours(value){
 const days={},notes=[];
 for(const line of String(value||'').split('\n')){
  const m=line.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday): (1[0-2]|[1-9]):([0-5][0-9]) (AM|PM) [–-] (1[0-2]|[1-9]):([0-5][0-9]) (AM|PM)$/);
  if(m)days[m[1]]={open:[m[2],m[3],m[4]],close:[m[5],m[6],m[7]]};else if(line.trim())notes.push(line);
 }
 return {days,notes:notes.join('\n')};
}
function hoursMarkup(value){
 const saved=parseHours(value);
 function time(day,kind,parts){
  const choices=[Array.from({length:12},(_,i)=>String(i+1)),['00','15','30','45'],['AM','PM']];
  if(!choices[1].includes(parts[1]))choices[1].push(parts[1]);
  return '<div class="project-time"><span>'+ (kind==='open'?'Opens':'Closes')+'</span><div>'+choices.map((opts,i)=>'<select data-time="'+kind+'-'+i+'" aria-label="'+day+' '+kind+' '+['hour','minutes','AM or PM'][i]+'">'+opts.map(v=>'<option value="'+v+'" '+(v===parts[i]?'selected':'')+'>'+v+'</option>').join('')+'</select>').join('<span aria-hidden="true">:</span>').replace('</select><span aria-hidden="true">:</span><select data-time="'+kind+'-2','</select><select data-time="'+kind+'-2')+'</div></div>';
 }
 return '<fieldset class="project-hours" data-business-hours><legend>Business hours</legend><p>Select the days you work. Each day starts at 9:00 AM–5:00 PM.</p>'+workDays.map(day=>{
  const v=saved.days[day];
  return '<div class="project-hours-day" data-day="'+day+'"><label class="project-day-toggle"><input type="checkbox" data-day-enabled '+(v?'checked':'')+'> '+day+'</label><div class="project-day-times" '+(v?'':'hidden')+'>'+time(day,'open',v?.open||['9','00','AM'])+time(day,'close',v?.close||['5','00','PM'])+'</div></div>';
 }).join('')+'<label class="project-hours-notes">Additional hours notes (optional)<textarea data-hours-notes rows="2" placeholder="Holiday hours, appointment only, or other details">'+esc(saved.notes)+'</textarea></label></fieldset>';
}
function collectHours(container){
 const lines=[];
 container.querySelectorAll('[data-day]').forEach(row=>{
  if(!row.querySelector('[data-day-enabled]').checked)return;
  const time=kind=>[0,1,2].map(i=>row.querySelector('[data-time="'+kind+'-'+i+'"]').value);
  const a=time('open'),b=time('close');
  lines.push(row.dataset.day+': '+a[0]+':'+a[1]+' '+a[2]+' – '+b[0]+':'+b[1]+' '+b[2]);
 });
 const notes=container.querySelector('[data-hours-notes]').value.trim();
 if(notes)lines.push(notes);
 return lines.join('\n');
}

// Shades are ordered from light to dark. Keep colors as text for existing briefs.
const preferredColors=[
 ['Red','#ef4444',['#fee2e2','#fca5a5','#f87171','#ef4444','#b91c1c','#7f1d1d']],
 ['Orange','#f97316',['#ffedd5','#fed7aa','#fdba74','#f97316','#c2410c','#7c2d12']],
 ['Yellow','#facc15',['#fef9c3','#fef08a','#fde047','#facc15','#ca8a04','#854d0e']],
 ['Green','#22c55e',['#dcfce7','#bbf7d0','#86efac','#22c55e','#15803d','#14532d']],
 ['Blue','#3b82f6',['#dbeafe','#bfdbfe','#93c5fd','#3b82f6','#1d4ed8','#1e3a8a']],
 ['Purple','#a855f7',['#f3e8ff','#e9d5ff','#d8b4fe','#a855f7','#7e22ce','#581c87']],
 ['Pink','#ec4899',['#fce7f3','#fbcfe8','#f9a8d4','#ec4899','#be185d','#831843']],
 ['Brown','#925c36',['#efdfce','#d8b99a','#b98a62','#925c36','#693e25','#402619']],
 ['Navy','#152a50',['#dce4f0','#a8bbd6','#6f89b2','#395780','#152a50','#09162c']],
 ['Beige','#d3b891',['#faf6ef','#efe4d2','#e2cfaf','#d3b891','#b49973','#8b7354']],
 ['White','#ffffff',['#ffffff','#fafafa','#f5f5f5','#eeeeee','#e5e5e5','#d4d4d4']],
 ['Black','#171717',['#a3a3a3','#737373','#525252','#303030','#171717','#000000']]
];
function colorsMarkup(value){
 return '<div class="project-complex-field project-colors-field"><span class="project-field-label">Preferred colors</span><input type="hidden" name="colors" value="'+esc(value||'')+'"><div class="project-selected-colors" data-selected-colors role="list" aria-label="Selected preferred colors"></div><p class="project-colors-hint">Choose a color, then select a shade.</p></div>';
}
function setupColors(form){
 const field=form.querySelector('.project-colors-field');if(!field)return;
 const input=field.querySelector('[name="colors"]'),list=field.querySelector('[data-selected-colors]');
 const chosen=input.value.split(',').map(v=>v.trim()).filter(Boolean);
 function render(){
  input.value=chosen.join(', ');
  list.innerHTML=chosen.map((value,index)=>{
   const hex=value.match(/#[0-9a-f]{6}/i)?.[0];
   return '<span class="project-color-chip" role="listitem">'+(hex?'<span class="project-color-dot" style="background:'+hex+'" aria-hidden="true"></span>':'')+'<span>'+esc(value)+'</span><button type="button" data-remove-color="'+index+'" aria-label="Remove '+esc(value)+'">×</button></span>';
  }).join('')+'<button type="button" class="project-color-add" data-add-color aria-label="Add preferred color" aria-haspopup="dialog">+</button>';
 }
 function pick(){
  const popup=document.createElement('dialog');popup.className='project-color-dialog';popup.setAttribute('aria-labelledby','project-color-title');document.body.append(popup);
  popup.addEventListener('close',()=>{popup.remove();list.querySelector('[data-add-color]')?.focus()});
  popup.addEventListener('click',e=>{if(e.target===popup)popup.close()});
  function show(color=null){
   popup.innerHTML='<div class="project-color-popup"><header><div><h2 id="project-color-title">'+(color?color[0]+' shades':'Choose a color')+'</h2><p>'+(color?'Light to dark · choose one shade':'Choose a color to see its shades')+'</p></div><button type="button" class="project-close" data-color-close aria-label="Close color picker">×</button></header>'+(color?'<button type="button" class="project-color-back" data-color-back>← All colors</button>':'')+'<div class="project-color-grid">'+(color?color[2].map((hex,i)=>'<button type="button" class="project-color-option" data-shade="'+i+'" aria-label="'+color[0]+' shade '+(i+1)+' of 6, '+hex+'"><span class="project-color-swatch" style="background:'+hex+'" aria-hidden="true"></span><span>Shade '+(i+1)+'</span></button>').join(''):preferredColors.map(([name,hex],i)=>'<button type="button" class="project-color-option" data-color="'+i+'"><span class="project-color-swatch" style="background:'+hex+'" aria-hidden="true"></span><span>'+name+'</span></button>').join(''))+'</div></div>';
   popup.querySelector('[data-color-close]').onclick=()=>popup.close();
   popup.querySelector('[data-color-back]')?.addEventListener('click',()=>show());
   popup.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>show(preferredColors[Number(b.dataset.color)]));
   popup.querySelectorAll('[data-shade]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.shade),value=color[0]+' shade '+(i+1)+' ('+color[2][i]+')';
    if(!chosen.includes(value))chosen.push(value);render();popup.close();
   });
   if(popup.open)popup.querySelector('.project-color-option')?.focus();
  }
  show();popup.showModal();popup.querySelector('.project-color-option')?.focus();
 }
 list.addEventListener('click',e=>{const add=e.target.closest('[data-add-color]'),remove=e.target.closest('[data-remove-color]');if(add)pick();if(remove){chosen.splice(Number(remove.dataset.removeColor),1);render();list.querySelector('[data-add-color]')?.focus()}});
 render();
}

function setupDynamic(form){setupRepeatableLinks(form);setupPhotoUpload(form);setupLockedFeatures(form);setupColors(form);setupCustomFeatures(form);setupCustomPages(form);form.querySelectorAll('[data-day-enabled]').forEach(input=>input.addEventListener('change',()=>{input.closest('[data-day]').querySelector('.project-day-times').hidden=!input.checked}));const sl=form.querySelector('[data-services-list]');function addService(v=''){if(!sl)return;const row=document.createElement('div');row.className='project-dynamic-row';row.innerHTML='<input class="project-service-item" type="text" maxlength="200" placeholder="Service or product"><button type="button" class="secondary" aria-label="Remove">×</button>';row.querySelector('input').value=v;row.querySelector('button').onclick=()=>row.remove();sl.append(row)}if(sl){let vals=JSON.parse(sl.dataset.values);(Array.isArray(vals)?vals:String(vals||'').split('\n')).filter(Boolean).forEach(addService)}form.querySelector('[data-add-service]')?.addEventListener('click',()=>addService());const soc=form.querySelector('[data-social-list]');function addSocial(name='',url='',custom=false){const row=document.createElement('div');row.className='project-social-row';row.innerHTML='<input class="project-social-name" type="text" placeholder="Platform" '+(custom?'':'readonly')+'><input class="project-social-url" type="text" placeholder="Profile URL or username">'+(custom?'<button type="button" class="secondary" aria-label="Remove">×</button>':'');row.querySelector('.project-social-name').value=name;row.querySelector('.project-social-url').value=url;row.querySelector('button')?.addEventListener('click',()=>row.remove());soc.append(row)}if(soc){let vals=JSON.parse(soc.dataset.values);if(typeof vals==='string')vals={Other:vals};if(Array.isArray(vals))vals={Other:vals.join(', ')};socials.forEach(name=>addSocial(name,vals[name]||''));Object.entries(vals).filter(([name])=>!socials.includes(name)).forEach(([name,url])=>addSocial(name,url,true))}form.querySelector('[data-add-social]')?.addEventListener('click',()=>addSocial('','',true));form.querySelectorAll('input[type=tel]').forEach(input=>{input.value=formatPhone(input.value);input.addEventListener('input',()=>{let atEnd=input.selectionStart===input.value.length;input.value=formatPhone(input.value);if(atEnd)input.setSelectionRange(input.value.length,input.value.length)})})}
function readableField(key,value){return key==='hosting_plan'?hostingName(value):readable(value)}
function readable(v){if(Array.isArray(v))return v.join(', ');if(v&&typeof v==='object')return Object.entries(v).map(([k,x])=>k+': '+x).join(', ');return v||'Not provided'}
const commonPages=[
 ['Home','Welcome visitors and guide them to your main services.'],
 ['About Us','Introduce your business and help customers get to know you.'],
 ['Services','Explain what you offer so customers can find the right service.'],
 ['Products','Show your products and help customers explore their options.'],
 ['Pricing','Make it easier for customers to understand your prices and packages.'],
 ['Photo Gallery','Show examples of your work and what customers can expect.'],
 ['Testimonials','Share customer feedback to help build trust.'],
 ['FAQ','Answer common questions before customers need to ask.'],
 ['Contact','Give customers an easy way to reach your business.'],
 ['Blog','Share articles, tips, and news about your business.']
];
const commonFeatures=[
 ['Contact form','Let visitors send questions or request more information.'],
 ['Appointment requests','Let customers request a time for you to confirm.'],
 ['Photo gallery','Showcase your work with photos selected for your website.'],
 ['Testimonials','Build confidence with feedback from your customers.'],
 ['Product listings','Help visitors browse your products and learn what you offer.'],
 ['Service listings','Make your services easy to compare and understand.'],
 ['Click-to-call button','Help mobile visitors contact you with one tap.'],
 ['Map and directions','Help customers find your location and plan their visit.'],
 ['Social media links','Connect visitors with your social profiles.'],
 ['Online booking management','Manage bookings, availability, and customer appointments.',true],
 ['Editable photo gallery','Add and organize website photos yourself.',true],
 ['Product management','Update products, prices, and availability yourself.',true],
 ['Service management','Keep service descriptions and pricing up to date yourself.',true],
 ['Blog publishing','Publish new articles and manage your website content.',true],
 ['Customer accounts','Give customers a place to sign in and view their information.',true]
];
const hostingName=plan=>plan==='business'?'Business Hosting':'Standard Hosting';
export function hostingCards(plan='standard',name='hosting_plan',businessValue='business'){
 return '<div class="project-hosting-cards" role="radiogroup" aria-label="Hosting plan">'+[['standard','Standard Hosting','$20/month','Website hosting with content updates requested through your portal.'],['business','Business Hosting','$30/month','Includes an admin dashboard to manage supported content and features.']].map(([value,title,price,benefit])=>'<label class="project-hosting-card '+value+'"><input type="radio" name="'+name+'" value="'+(value==='business'?businessValue:value)+'" '+(value===plan?'checked':'')+'><span><strong>'+title+'</strong><b>'+price+'</b><small>'+benefit+'</small></span></label>').join('')+'</div>';
}
function hostingMarkup(value){return '<input type="hidden" name="hosting_plan" value="'+(value==='business'?'business':'standard')+'">'}

function choicesMarkup(key,label,value,options){
 const selected=Array.isArray(value)?value:typeof value==='string'?value.split(',').map(x=>x.trim()).filter(Boolean):[];
 const choices=[...options,...selected.filter(name=>!options.some(o=>o[0]===name)).map(name=>[name,'Previously requested. We will review this with your website brief.'])];
 return '<fieldset class="project-choice-field" data-choice-field="'+key+'"><legend>'+esc(label)+(key==='pages'?' <span class="project-required-asterisk" aria-label="required">*</span>':'')+'</legend>'+(key==='features'?'<p class="project-choice-help">Select as many features as necessary. Choosing a Business Hosting feature will let you switch your hosting plan.</p>':'')+'<div class="project-choice-grid">'+choices.map(([name,benefit,business])=>'<label class="project-choice-card '+(business?'is-locked':'')+'"><input type="checkbox" name="'+key+'" value="'+esc(name)+'" '+(selected.includes(name)?'checked ':'')+(business?'data-business-feature ':'')+'><span class="project-choice-copy"><strong>'+esc(name)+'</strong><span>'+esc(benefit)+'</span>'+(business?'<small class="project-feature-lock">'+icon('lock-keyhole')+' Requires Business Hosting</small>':'')+'</span></label>').join('')+'</div></fieldset>';
}
function setupLockedFeatures(form){
 const planInput=form.querySelector('[name="hosting_plan"]'),features=form.querySelectorAll('[data-business-feature]');
 const current=()=>planInput?.value||'standard';
 function select(plan){if(planInput)planInput.value=plan;}
 features.forEach(input=>input.addEventListener('change',()=>{
  if(!input.checked||current()==='business')return;
  input.checked=false;
  const popup=document.createElement('dialog');popup.className='project-color-dialog project-hosting-dialog';popup.setAttribute('aria-labelledby','project-hosting-feature-title');
  popup.innerHTML='<div class="project-color-popup"><header><h2 id="project-hosting-feature-title">'+esc(input.value)+'</h2><button type="button" class="project-close" data-hosting-close aria-label="Close">×</button></header><p>This feature requires Business Hosting at $30/month instead of Standard Hosting at $20/month.</p>'+hostingCards('business','upgrade_hosting')+'<p class="project-choice-help">Choose your hosting plan. Your selection will be saved with this website; payment happens at checkout.</p><div class="project-modal-actions"><button type="button" class="secondary" data-hosting-close>Cancel</button><button type="button" class="primary" data-confirm-hosting>Use Business Hosting</button></div></div>';
  document.body.append(popup);popup.addEventListener('close',()=>{popup.remove();input.focus()});popup.addEventListener('click',e=>{if(e.target===popup)popup.close()});
  popup.querySelectorAll('[data-hosting-close]').forEach(b=>b.onclick=()=>popup.close());
  const confirm=popup.querySelector('[data-confirm-hosting]');popup.querySelectorAll('[name="upgrade_hosting"]').forEach(r=>r.addEventListener('change',()=>confirm.textContent=r.value==='business'?'Use Business Hosting':'Keep Standard Hosting'));
  confirm.onclick=()=>{const plan=popup.querySelector('[name="upgrade_hosting"]:checked').value;select(plan);input.checked=plan==='business';popup.close()};popup.showModal();
 }));
 if([...features].some(input=>input.checked)&&current()!=='business')select('business');
}

function customFeaturesMarkup(value){
 return '<div class="project-complex-field"><span class="project-field-label">Custom features</span><p class="project-choice-help">Need something else? Add as many custom features as necessary. Each request may be reviewed for feasibility, scope, and any additional cost.</p><div data-custom-features data-values="'+esc(JSON.stringify(value||[]))+'"></div><button type="button" class="secondary" data-add-custom-feature>+ Add Custom Feature</button></div>';
}
function setupCustomFeatures(form){
 const list=form.querySelector('[data-custom-features]');if(!list)return;
 function add(value=''){
  const row=document.createElement('div');row.className='project-dynamic-row';
  row.innerHTML='<input type="text" class="project-custom-feature" maxlength="500" aria-label="Custom feature request" placeholder="Describe a feature you would like"><button type="button" class="secondary" aria-label="Remove custom feature">×</button>';
  row.querySelector('input').value=value;row.querySelector('button').onclick=()=>row.remove();list.append(row);return row;
 }
 const values=JSON.parse(list.dataset.values);(Array.isArray(values)?values:String(values||'').split('\n')).filter(Boolean).forEach(add);
 form.querySelector('[data-add-custom-feature]').onclick=()=>add().querySelector('input').focus();
}
function customPagesMarkup(value){
 return '<div class="project-complex-field"><span class="project-field-label">Custom pages</span><p class="project-choice-help">Need another page? Add as many custom pages as necessary.</p><div data-custom-pages data-values="'+esc(JSON.stringify(value||[]))+'"></div><button type="button" class="secondary" data-add-custom-page>+ Add Custom Page</button></div>';
}
function setupCustomPages(form){
 const list=form.querySelector('[data-custom-pages]');if(!list)return;
 function add(value=''){
  const row=document.createElement('div');row.className='project-dynamic-row';
  row.innerHTML='<input type="text" class="project-custom-page" maxlength="500" aria-label="Custom page name" placeholder="For example: Our Team or Service Areas"><button type="button" class="secondary" aria-label="Remove custom page">×</button>';
  row.querySelector('input').value=value;row.querySelector('button').onclick=()=>row.remove();list.append(row);return row;
 }
 const values=JSON.parse(list.dataset.values);(Array.isArray(values)?values:String(values||'').split('\n')).filter(Boolean).forEach(add);
 form.querySelector('[data-add-custom-page]').onclick=()=>add().querySelector('input').focus();
}
const IMAGE_BUCKET='portal-brand-assets';
function uploadMarkup(value){
 const files=Array.isArray(value)?value:[];
 return '<div class="project-complex-field project-photo-field" data-photo-upload><span class="project-field-label">Upload photos</span><div class="project-photo-drop" tabindex="0" role="button" aria-label="Choose photos or drop them here"><span class="project-photo-upload-icon">↑</span><strong>Drag & drop photos here</strong><span>or click to browse • JPG, PNG, WEBP, GIF • up to 10 MB each</span></div><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden aria-label="Choose photos"><div class="project-photo-list" aria-live="polite"></div><small class="project-photo-status" role="status"></small><input type="hidden" name="photos_uploads" value="'+esc(JSON.stringify(files))+'"></div>';
}
function setupPhotoUpload(form){
 const root=form.querySelector('[data-photo-upload]');if(!root)return;
 const input=root.querySelector('input[type=file]'),drop=root.querySelector('.project-photo-drop'),list=root.querySelector('.project-photo-list'),status=root.querySelector('.project-photo-status'),state=root.querySelector('[name=photos_uploads]');
 let photos=[];try{photos=JSON.parse(state.value)||[]}catch{};if(!Array.isArray(photos))photos=[];
 let uploads=0;
 const sync=()=>{state.value=JSON.stringify(photos);form.dataset.uploading=uploads?'true':'false'};
 async function render(){
  list.replaceChildren();
  for(const photo of photos){
   const item=document.createElement('div');item.className='project-photo-item';
   const img=document.createElement('img');img.alt=photo.name||'Uploaded photo';
   const {data,error}=await api.storage.from(IMAGE_BUCKET).createSignedUrl(photo.path,3600);
   if(!error&&data?.signedUrl)img.src=data.signedUrl;
   const label=document.createElement('span');label.textContent=photo.name||'Photo';
   const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+(photo.name||'photo'));
   remove.onclick=async()=>{remove.disabled=true;const {error}=await api.storage.from(IMAGE_BUCKET).remove([photo.path]);if(error){status.textContent='Could not remove image: '+error.message;remove.disabled=false;return}photos=photos.filter(x=>x.path!==photo.path);sync();render()};
   item.append(img,label,remove);list.append(item);
  }
 }
 async function addFiles(fileList){
  const files=[...fileList];if(!files.length)return;
  for(const file of files){
   if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)){status.textContent='Only JPG, PNG, WEBP or GIF images can be uploaded.';continue}
   if(file.size>10*1024*1024){status.textContent=file.name+' is over the 10 MB limit.';continue}
   if(photos.length>=20){status.textContent='Maximum 20 photos per website.';break}
   uploads++;sync();status.textContent='Uploading '+file.name+'…';
   try{
    const userId=viewer?.id||(await api.auth.getUser()).data.user?.id;
    if(!userId)throw new Error('Please sign in to upload images.');
    const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[file.type];
    const path=userId+'/'+crypto.randomUUID()+'.'+ext;
    const {error}=await api.storage.from(IMAGE_BUCKET).upload(path,file,{contentType:file.type,upsert:false});
    if(error)throw error;
    photos.push({path,name:file.name});sync();await render();status.textContent='Uploaded '+file.name+'.';
   }catch(e){status.textContent='Upload failed: '+e.message+' Check that the photo storage setup SQL has been run.'}
   finally{uploads--;sync()}
  }
  input.value='';
 }
 drop.onclick=()=>input.click();drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click()}};
 input.onchange=()=>addFiles(input.files);
 drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag-over')};
 drop.ondragleave=e=>{e.preventDefault();drop.classList.remove('drag-over')};
 drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag-over');addFiles(e.dataTransfer.files)};
 sync();render();
}
function repeatableLinksMarkup(key,label,value){
 const values=(Array.isArray(value)?value:String(value||'').split(/\r?\n/)).map(x=>String(x).trim()).filter(Boolean);
 return '<div class="project-complex-field project-repeatable-links" data-repeatable-links="'+key+'"><span class="project-field-label">'+esc(label)+'</span><div class="project-repeatable-list">'+(values.length?values:['']).map(link=>'<div class="project-repeatable-row"><input type="url" inputmode="url" class="project-repeatable-input" placeholder="https://example.com" aria-label="'+esc(label)+'" value="'+esc(link)+'"><button type="button" class="secondary project-repeatable-remove" aria-label="Remove link">×</button></div>').join('')+'</div><button type="button" class="secondary project-repeatable-add">+ Add another link</button></div>';
}
function setupRepeatableLinks(form){
 form.querySelectorAll('[data-repeatable-links]').forEach(group=>{
  const list=group.querySelector('.project-repeatable-list');
  function update(){const rows=[...list.querySelectorAll('.project-repeatable-row')];rows.forEach(row=>{row.querySelector('.project-repeatable-remove').hidden=rows.length===1})}
  group.querySelector('.project-repeatable-add').onclick=()=>{const row=document.createElement('div');row.className='project-repeatable-row';row.innerHTML='<input type="url" inputmode="url" class="project-repeatable-input" placeholder="https://example.com" aria-label="'+esc(group.querySelector('.project-field-label').textContent)+'"><button type="button" class="secondary project-repeatable-remove" aria-label="Remove link">×</button>';list.append(row);update();row.querySelector('input').focus()};
  list.addEventListener('click',e=>{const button=e.target.closest('.project-repeatable-remove');if(!button)return;button.closest('.project-repeatable-row').remove();update()});
  update();
 });
}
function fieldMarkup(f,v){const [key,label,type,req]=f,requiredMark=req?' <span class="project-required-asterisk" aria-label="required">*</span>':'';if(type==='hosting-plan')return hostingMarkup(v);if(type==='photo-upload')return uploadMarkup(v);if(type==='repeatable-links')return repeatableLinksMarkup(key,label,v);if(type==='custom-pages')return customPagesMarkup(v);if(type==='pages')return choicesMarkup(key,label,v,commonPages);if(type==='feature-options')return choicesMarkup(key,label,v,commonFeatures);if(type==='custom-features')return customFeaturesMarkup(v);if(type==='colors')return colorsMarkup(v);if(type==='hours')return hoursMarkup(v);if(type==='services')return '<div class="project-complex-field"><span class="project-field-label">'+esc(label)+requiredMark+'</span><div data-services-list data-values="'+esc(JSON.stringify(v||[]))+'"></div><button type="button" class="secondary" data-add-service>+ Add Service or Product</button></div>';if(type==='social')return '<div class="project-complex-field"><span class="project-field-label">'+esc(label)+'</span><div data-social-list data-values="'+esc(JSON.stringify(v||{}))+'"></div><button type="button" class="secondary" data-add-social>+ Add Another Platform</button></div>';if(type==='checkboxes'){const opts=['Contact form','Appointment requests','Photo gallery','Testimonials','Product listings','Service listings','Other'];return '<fieldset class="project-features"><legend>'+label+'</legend>'+opts.map(o=>'<label><input type="checkbox" name="features" value="'+esc(o)+'" '+((Array.isArray(v)?v:[]).includes(o)?'checked':'')+'> '+esc(o)+'</label>').join('')+'</fieldset>'}return '<label><span class="project-field-label">'+esc(label)+requiredMark+'</span>'+(type==='textarea'?'<textarea name="'+key+'" rows="3">'+esc(v||'')+'</textarea>':'<input type="'+type+'" name="'+key+'" value="'+esc(v||'')+'">')+'</label>'}
function collect(form,p){
 const d={...(p.details||{})};const hours=form.querySelector('[data-business-hours]');if(hours)d.business_hours=collectHours(hours);
 for(const [k,v] of new FormData(form)){if(k==='features'||k==='pages')continue;if(k==='photos_uploads'){try{d[k]=JSON.parse(v)}catch{d[k]=[]}continue}d[k]=k==='public_phone'?formatPhone(v):String(v).trim()}
 for(const group of form.querySelectorAll('[data-repeatable-links]'))d[group.dataset.repeatableLinks]=[...group.querySelectorAll('.project-repeatable-input')].map(input=>input.value.trim()).filter(Boolean).join('\n');
 for(const key of ['pages','features'])if(form.querySelector('[data-choice-field="'+key+'"]'))d[key]=[...form.querySelectorAll('[name="'+key+'"]:checked')].map(x=>x.value);
 if(form.querySelector('[data-custom-pages]'))d.custom_pages=[...form.querySelectorAll('.project-custom-page')].map(x=>x.value.trim()).filter(Boolean);
 if(form.querySelector('[data-custom-features]'))d.custom_features=[...form.querySelectorAll('.project-custom-feature')].map(x=>x.value.trim()).filter(Boolean);
 if(form.querySelector('[data-services-list]'))d.services=[...form.querySelectorAll('.project-service-item')].map(x=>x.value.trim()).filter(Boolean);
 if(form.querySelector('[data-social-list]')){d.social_links={};form.querySelectorAll('.project-social-row').forEach(row=>{const name=row.querySelector('.project-social-name').value.trim(),url=row.querySelector('.project-social-url').value.trim();if(name&&url)d.social_links[name]=url})}
 if(Array.isArray(d.features)&&d.features.some(name=>commonFeatures.some(([feature,,business])=>business&&feature===name)))d.hosting_plan='business';
 return d;
}

function resumeStep(p){
 const saved=p.details?.__setup_step;
 if(Number.isInteger(saved)&&saved>=0&&saved<fields.length)return p.details?.__setup_version===2?saved:saved>=5?Math.min(saved+1,fields.length-1):saved;
 // Older drafts have no progress marker; start at their first unanswered section.
 const unfinished=fields.slice(0,-1).findIndex(section=>section.items.some(([key,,,required])=>required&&missingRequired(p.details).includes(key))||!section.items.some(([key])=>hasValue(p.details?.[key])));
 return unfinished<0?fields.length-1:unfinished;
}
function launchProjectPayment(p,purchaseStage=null){
 if(!p||p.details?.__archived)return;
 sessionStorage.setItem('portal_preferred_plan',p.details?.hosting_plan==='business'?'backend':'standard');
 sessionStorage.setItem('steadyhands.portal.checkout_project',p.id);
 close();
 document.dispatchEvent(new CustomEvent('steadyhands:purchase-options',{detail:{projectId:p.id,stage:purchaseStage}}));
}
function openProject(id){const p=getProject(id);if(!p||p.details?.__archived)return;if(!['draft','awaiting_payment'].includes(p.status)){view(id);return}if(!projectHasStarted(p)){intro(id);return}close();location.hash='website';refreshView()}
async function openWizard(id){const p=getProject(id);if(!p||p.details?.__archived)return;if(!projectHasStarted(p)){const saved=await save(p,{...p.details,__design_source:'questionnaire'});if(!saved)return;refreshView()}selected=id;step=p.status==='draft'?resumeStep(p):0;wizard()}
function wizard(){
 const p=getProject(selected);if(!p)return;
 rememberWizard(p.id,step);
 const sec=fields[step],review=step===fields.length-1,pct=Math.round((step+1)/fields.length*100);
 const summary=fields.slice(0,-1).map(s=>'<h4>'+s.title+'</h4>'+s.items.map(f=>'<div><strong>'+esc(f[1])+':</strong> '+esc(readableField(f[0],p.details?.[f[0]]))+'</div>').join('')).join('');
 const d=dialog('<form id="project-wizard" class="project-modal project-wizard"><header><div><span class="home-kicker">WEBSITE SETUP · STEP '+(step+1)+' OF '+fields.length+'</span><h2>'+sec.title+'</h2></div><button type="button" class="project-close" data-project-close aria-label="Close">×</button></header><div class="project-meter"><span style="width:'+pct+'%"></span></div><p>'+sec.hint+'</p>'+(review?'<div class="project-required-top"></div>':'')+'<div class="project-form-fields">'+(review?'<div class="project-summary">'+summary+'</div>':sec.items.map(f=>fieldMarkup(f,p.details?.[f[0]])).join(''))+'</div><p id="project-message" role="status"></p><div class="project-modal-actions">'+(step?'<button type="button" class="secondary" id="project-back">Back</button>':'')+'<button type="button" class="secondary" id="project-save-close">Save & Close</button><button type="submit" class="primary">'+(review?'Complete':'Next →')+'</button></div></form>');
 const form=d.querySelector('form');setupDynamic(form);let busy=false;
 const detailsAt=next=>({... (review?p.details:collect(form,p)),__setup_step:next,__setup_version:2});
 function lock(value){busy=value;form.querySelectorAll('button').forEach(b=>b.disabled=value)}
 async function persist(next,submit=false){
  if(busy)return false;if(form.dataset.uploading==='true'){notify('Please wait for your photos to finish uploading.');return false}lock(true);
  try{return await save(p,detailsAt(next),submit)}catch(error){notify('Could not save: '+error.message);return false}finally{lock(false)}
 }
 beforeProjectClose=async()=>{const ok=await persist(step);if(ok){beforeProjectClose=null;forgetWizard();refreshView();d.close()}};
 if(review){showMissingSteps(form,missingRequired(p.details),async target=>{const ok=await persist(target);if(ok){step=target;refreshView();wizard()}})}
 d.querySelector('#project-save-close').onclick=()=>close();
 d.querySelector('#project-back')?.addEventListener('click',async()=>{const ok=await persist(step-1);if(ok){refreshView();step--;wizard()}});
 form.onsubmit=async e=>{
  e.preventDefault();if(busy)return;
  if(review){const missing=missingRequired(p.details);if(missing.length){showMissingSteps(form,missing,async target=>{const ok=await persist(target);if(ok){step=target;refreshView();wizard()}});return}}
  if(!review&&sec.title==='Website Pages'){const data=collect(form,p);if(!(hasValue(data.pages)||hasValue(data.custom_pages))){notify('Choose at least one website page or add a custom page before continuing.');form.querySelector('[data-choice-field="pages"]')?.scrollIntoView({block:'nearest',behavior:'smooth'});return}}
  const ok=await persist(review?step:step+1,review);if(!ok)return;
  refreshView();if(review){beforeProjectClose=null;forgetWizard();if(p.status==='awaiting_payment')success(p);else{close();refreshView()}return}step++;wizard();
 };
}

function success(p){dialog('<div class="project-modal project-success"><span class="project-success-icon">✓</span><h2>Website brief saved</h2><p>Your information is ready. Review your agreement, website design payment, and hosting using their separate website cards.</p><div class="project-modal-actions"><button type="button" class="primary" data-project-close>Return to Website Cards</button></div></div>')}
async function setProjectArchived(id,archived){const p=getProject(id);if(!p)return;const details={...(p.details||{}),__archived:archived};const {data,error}=await api.from('portal_website_projects').update({details}).eq('id',id).eq('user_id',viewer.id).select().single();if(error){alert('Could not '+(archived?'archive':'unarchive')+' website: '+error.message);return}Object.assign(p,data);if(archived&&selected===id){forgetWizard();document.querySelector('#website-project-dialog')?.close()}refreshView()}
function rename(id){const p=getProject(id);if(!p)return;const name=prompt('Website display name:',p.display_name);if(name===null)return;const v=name.trim();if(!v||v.length>100){alert('Enter a display name of 1–100 characters.');return}api.from('portal_website_projects').update({display_name:v}).eq('id',id).eq('user_id',viewer.id).select().single().then(({data,error})=>{if(error)alert(error.message);else{Object.assign(p,data);refreshView()}})}
function preview(id){const p=getProject(id);if(!p)return;const d=dialog('<form id="project-preview-form" class="project-modal"><header><h2>Website Preview Code</h2><button type="button" class="project-close" data-project-close>×</button></header><p>Attach the preview code you received from Steady Hands. A preview is optional.</p><label>Preview Code<input name="code" maxlength="100" value="'+esc(p.preview_code||'')+'" placeholder="Preview code"></label><p id="project-message" role="status"></p><div class="project-modal-actions"><button type="button" class="secondary" data-project-close>Cancel</button><button class="primary" type="submit">Save Preview Code</button></div></form>');d.querySelector('form').onsubmit=async e=>{e.preventDefault();const code=e.target.elements.code.value.trim()||null;const {data,error}=await api.from('portal_website_projects').update({preview_code:code}).eq('id',id).eq('user_id',viewer.id).select().single();if(error){notify(error.message);return}Object.assign(p,data);close();refreshView()}}
function view(id){const p=getProject(id);if(!p)return;if(p.status==='awaiting_payment'){launchProjectPayment(p);return}dialog('<div class="project-modal"><header><h2>'+esc(p.display_name)+'</h2><button type="button" class="project-close" data-project-close>×</button></header><p>Status: '+esc(status(p))+'</p><div class="project-summary">'+fields.slice(0,-1).map(s=>'<h4>'+s.title+'</h4>'+s.items.map(f=>'<p><strong>'+esc(f[1])+':</strong> '+esc(readableField(f[0],p.details?.[f[0]]))+'</p>').join('')).join('')+'</div><div class="project-modal-actions"><button class="secondary" data-project-close>Close</button></div></div>')}

export function formatWebsiteQuestionnaireBrief(brief){
 return fields.slice(0,-1).map(section=>section.title+'\n'+section.items.map(([key,label])=>label+': '+readableField(key,brief[key])).join('\n')).join('\n\n');
}

// Preview requests use the same field definitions, controls, and collection as site setup.
export function openWebsitePreviewQuestionnaire({details={},submit,onComplete}){
 let page=0,brief={...defaultData(),...details},busy=false;
 function render(){
  const section=fields[page],review=page===fields.length-1;
  const summary=fields.slice(0,-1).map(s=>'<h4>'+esc(s.title)+'</h4>'+s.items.map(f=>'<div><strong>'+esc(f[1])+':</strong> '+esc(readableField(f[0],brief[f[0]]))+'</div>').join('')).join('');
  const d=dialog('<form class="project-modal project-wizard" id="preview-questionnaire"><header><div><span class="home-kicker">FREE WEBSITE PREVIEW · STEP '+(page+1)+' OF '+fields.length+'</span><h2>'+esc(section.title)+'</h2></div><button type="button" class="project-close" data-preview-close aria-label="Close">×</button></header><div class="project-meter"><span style="width:'+Math.round((page+1)/fields.length*100)+'%"></span></div><p>'+esc(section.hint)+'</p>'+(review?'<div class="project-required-top"></div>':'')+'<div class="project-form-fields">'+(review?'<div class="project-summary">'+summary+'</div>':section.items.map(f=>fieldMarkup(f,brief[f[0]])).join(''))+'</div><p id="project-message" role="status"></p><div class="project-modal-actions"><button type="button" class="secondary" data-preview-back>'+ (page?'Back':'Close')+'</button><button type="submit" class="primary">'+(review?'Submit Preview Request':'Next →')+'</button></div></form>');
  const form=d.querySelector('form');setupDynamic(form);
  if(review)showMissingSteps(form,missingRequired(brief),target=>{page=target;render()});
  function capture(){if(form.dataset.uploading==='true'){notify('Please wait for your photos to finish uploading.');return false}if(!review)brief=collect(form,{details:brief});return true}
  d.querySelector('[data-preview-close]').onclick=()=>{if(!busy&&capture())close()};
  d.querySelector('[data-preview-back]').onclick=()=>{if(busy||!capture())return;if(!page){close();return}page--;render()};
  form.onsubmit=async e=>{
   e.preventDefault();if(busy||!capture())return;
   if(!review){page++;render();return}
   const missing=missingRequired(brief);
   if(missing.length){showMissingSteps(form,missing,target=>{page=target;render()});return}
   busy=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);
   const preventCancel=e=>e.preventDefault();d.addEventListener('cancel',preventCancel);
   try{
    await submit(brief);
    const done=dialog('<div class="project-modal project-success"><span class="project-success-icon">✓</span><h2>Request submitted!</h2><p>Your free website preview request has been saved. You can view your submission on Requests.</p><div class="project-modal-actions"><button type="button" class="primary" data-preview-complete>View Requests</button></div></div>');
    done.querySelector('[data-preview-complete]').onclick=()=>{close();onComplete?.()};
   }catch(error){notify('Could not submit: '+(error.message||'Please try again.'));form.querySelectorAll('button').forEach(b=>b.disabled=false)}
   finally{busy=false;d.removeEventListener('cancel',preventCancel)}
  };
 }
 render();
}

export async function initWebsiteProjects({supabase,user,refresh,getPreviews=()=>[]}){if(viewer?.id!==user.id)projectCompletion.clear();api=supabase;viewer=user;refreshView=refresh;availablePreviews=getPreviews;const {data,error}=await api.from('portal_website_projects').select('*').eq('user_id',user.id).order('created_at',{ascending:false});if(error)errorText=error.message;else{projects=data||[];errorText='';await loadProjectCompletion()}// Restore only an unfinished setup for this signed-in user after refreshing the page.
try{
 const active=JSON.parse(sessionStorage.getItem(activeWizardKey)||'null');
 const p=active?.user===viewer.id?getProject(active.project):null;
 if(p?.status==='draft'&&Number.isInteger(active.step)&&active.step>=0&&active.step<fields.length){selected=p.id;step=active.step;wizard()}
 else if(active)forgetWizard();
}catch{forgetWizard()}
window.addEventListener('steadyhands:project-status-changed',async()=>{const auth=await api.auth.getUser();if(auth.data?.user)viewer=auth.data.user;await loadProjectCompletion();refreshView()});
document.addEventListener('click',e=>{const b=e.target.closest('[data-project-specialist],[data-project-approve],[data-project-purchase-step],[data-project-add],[data-project-edit],[data-project-rename],[data-project-preview],[data-project-close],[data-project-checkout],[data-project-view],[data-project-open],[data-project-archive],[data-project-unarchive]');if(!b)return;if(b.dataset.projectSpecialist){contactDesignSpecialist(b.dataset.projectSpecialist);return}if(b.dataset.projectApprove){approveProjectPreview(b.dataset.projectApprove);return}if(b.dataset.projectPurchaseStep){launchProjectPayment(getProject(b.dataset.projectId),b.dataset.projectPurchaseStep);return}if(b.dataset.projectUnarchive){e.preventDefault();e.stopPropagation();setProjectArchived(b.dataset.projectUnarchive,false);return}if(b.dataset.projectArchive){e.preventDefault();e.stopPropagation();setProjectArchived(b.dataset.projectArchive,true);return}if(b.dataset.projectOpen){if(e.target.closest('button,a,input,select,textarea')&&!e.target.closest('[data-project-open].project-title-button'))return;openProject(b.dataset.projectOpen);return}if(b.dataset.projectClose!==undefined){close();return}if(b.dataset.projectAdd!==undefined){addDialog(false,b.hasAttribute('data-start-preview'));return}if(b.dataset.projectEdit){selected=b.dataset.projectEdit;step=0;openWizard(b.dataset.projectEdit)}if(b.dataset.projectRename)rename(b.dataset.projectRename);if(b.dataset.projectPreview)preview(b.dataset.projectPreview);if(b.dataset.projectView){const p=getProject(b.dataset.projectView);if(p?.status==='awaiting_payment')launchProjectPayment(p);else view(b.dataset.projectView);return}if(b.dataset.projectCheckout){const p=getProject(b.dataset.projectCheckout);if(!p)return;if(p.status==='draft'){openWizard(p.id);return}if(p.status!=='awaiting_payment'){view(p.id);return}launchProjectPayment(p)}});return {reload:async()=>{const r=await api.from('portal_website_projects').select('*').eq('user_id',viewer.id);if(!r.error){projects=r.data||[];const auth=await api.auth.getUser();if(auth.data?.user)viewer=auth.data.user;await loadProjectCompletion();refreshView()}}}}
