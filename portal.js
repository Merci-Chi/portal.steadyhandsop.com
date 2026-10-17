import {supabase} from './supabase-client.js';
import {verifyCustomerCheckout} from './square-checkout.js?v=20261016-payment-order';
import {initWebsiteProjects,websiteProjectsMarkup} from './website-projects.js?v=20261016-payment-order';
const $=s=>document.querySelector(s),safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let user=null,profile=null,companies=[],current=null,requests=[],previews=[];
let invitationError='',invitationPreviews=[];
let privateFulfillmentProgress=[];
let purchaseComplete=false;
let projectManager=null;
let approvedPreviewKeys=new Set();
const publicPreviewCodes={'SHS-GHWH26M9R7Q2':{site_title:'Greenhouse Water Heaters',preview_url:'https://steadyhandsop.com/sites/greenhousewaterheaters/'}};
const normalizePreviewCode=v=>String(v||'').trim().toUpperCase();
const sections={overview:['Home','Your Steady Hands workspace'],website:['My Website','Website and domain details'],emails:['Business Emails','Email accounts and setup'],admin:['Admin Dashboard','Your private management dashboard'],requests:['Requests','Website changes and support'],billing:['Billing & Plans','Subscriptions and payments'],referrals:['Referrals & Rewards','Referral information'],support:['Help & Support','Contact Steady Hands'],settings:['Settings','Manage your profile']};
function currentPage(){return sections[location.hash.slice(1)]?location.hash.slice(1):'overview'}
let shouldAnimateOverviewLoad=currentPage()==='overview';
let loadSequenceTimers=[];
function clearLoadSequence(){while(loadSequenceTimers.length)clearTimeout(loadSequenceTimers.pop())}
function installShellLoaders(){
 const topbar=document.querySelector('.topbar');
 if(topbar&&!topbar.querySelector('.portal-shell-loader.header-shell')){const shell=document.createElement('div');shell.className='portal-shell-loader header-shell';shell.innerHTML='<div class="portal-shell-loader-inner"><div class="shell-circle"></div><div class="shell-pill shell-pill-lg"></div><div class="shell-pill shell-pill-sm"></div></div>';topbar.appendChild(shell)}
 const sidebar=document.querySelector('#sidebar');
 if(sidebar&&!sidebar.querySelector('.portal-shell-loader.sidebar-shell')){const shell=document.createElement('div');shell.className='portal-shell-loader sidebar-shell';shell.innerHTML='<div class="sidebar-shell-card"><div class="shell-square"></div><div class="sidebar-shell-copy"><div class="shell-pill shell-pill-lg"></div><div class="shell-pill shell-pill-sm"></div></div></div><div class="sidebar-shell-nav"><div class="sidebar-shell-item is-active"><span class="shell-mini-icon"></span><span class="shell-pill"></span></div><div class="sidebar-shell-heading"></div><div class="sidebar-shell-item"><span class="shell-mini-icon"></span><span class="shell-pill"></span></div><div class="sidebar-shell-item"><span class="shell-mini-icon"></span><span class="shell-pill"></span></div><div class="sidebar-shell-item"><span class="shell-mini-icon"></span><span class="shell-pill"></span></div><div class="sidebar-shell-item"><span class="shell-mini-icon"></span><span class="shell-pill"></span></div><div class="sidebar-shell-heading"></div><div class="sidebar-shell-item"><span class="shell-mini-icon"></span><span class="shell-pill"></span></div></div>';sidebar.appendChild(shell)}
}
function removeShellLoaders(){document.querySelectorAll('.portal-shell-loader').forEach(el=>el.remove());document.body.classList.remove('portal-shell-loading','portal-home-sequencing')}
function homeDashboardSkeleton(){return '<div class="home-dashboard home-dashboard-skeleton"><section class="home-hero skeleton-block"><div class="skeleton-line skeleton-kicker"></div><div class="skeleton-line skeleton-title"></div><div class="skeleton-line skeleton-subtitle"></div></section><section class="home-section home-skeleton-section"><div class="home-section-title"><div class="skeleton-line skeleton-kicker"></div><div class="skeleton-line skeleton-heading"></div><div class="skeleton-line skeleton-subtext"></div></div><div class="home-start-grid">'+Array.from({length:3},()=>'<article class="home-start-card home-skeleton-card"><span class="home-round-icon skeleton-circle"></span><div class="skeleton-line skeleton-card-title"></div><div class="skeleton-line skeleton-card-text"></div><div class="skeleton-line skeleton-card-text short"></div><div class="skeleton-line skeleton-button"></div></article>').join('')+'</div></section><div class="home-skeleton-lower"><section class="home-section home-skeleton-section"><div class="home-section-title"><div class="skeleton-line skeleton-heading short"></div></div><div class="home-skeleton-list">'+Array.from({length:3},()=>'<div class="home-skeleton-list-row"><span class="skeleton-circle small"></span><div class="home-skeleton-list-copy"><div class="skeleton-line skeleton-list-title"></div><div class="skeleton-line skeleton-list-text short"></div></div><div class="skeleton-line skeleton-list-badge"></div></div>').join('')+'</div></section><section class="home-section home-skeleton-section"><div class="home-section-title"><div class="skeleton-line skeleton-heading short"></div></div><div class="home-skeleton-side"><div class="skeleton-line skeleton-side-line"></div><div class="skeleton-line skeleton-side-line"></div><div class="skeleton-line skeleton-side-line short"></div><div class="skeleton-line skeleton-button"></div></div></section></div></div>'}
function showInitialOverviewSkeleton(){if(currentPage()!=='overview')return;installShellLoaders();document.body.classList.add('portal-shell-loading');const main=document.querySelector('#main');if(main)main.innerHTML=homeDashboardSkeleton()}
function startOverviewRevealSequence(){
 clearLoadSequence();
 installShellLoaders();
 document.body.classList.add('portal-home-sequencing');
 document.querySelectorAll('#main .load-seq-item').forEach(el=>el.classList.remove('is-visible'));
 const items=[...document.querySelectorAll('#main .load-seq-item')];
 const headerShell=document.querySelector('.header-shell');
 const sidebarShell=document.querySelector('.sidebar-shell');
 loadSequenceTimers.push(setTimeout(()=>headerShell?.remove(),55));
 loadSequenceTimers.push(setTimeout(()=>sidebarShell?.remove(),135));
 items.forEach((item,index)=>loadSequenceTimers.push(setTimeout(()=>item.classList.add('is-visible'),215+(index*85))));
 loadSequenceTimers.push(setTimeout(()=>{removeShellLoaders();shouldAnimateOverviewLoad=false},215+(items.length*85)+125));
}
function pageHeader(t,d){return '<div class="pagehead"><h1>'+safe(t)+'</h1><p>'+safe(d)+'</p></div>'}
function empty(t,message){return '<div class="panel empty-workspace"><h2>'+safe(t)+'</h2><p>'+safe(message)+'</p></div>'}
const links=(arr)=>'<div class="mini-list">'+arr.map(x=>'<a target="_blank" rel="noopener noreferrer" href="'+safe(x.url)+'">'+safe(x.text)+'</a>').join('')+'</div>';
function isCompanyAvailable(){return Boolean(current?.status==='verified')}
const button=(label,page)=>'<button class="primary" data-page="'+page+'">'+label+'</button>';
const panel=(heading,body)=>'<section class="panel"><h3>'+heading+'</h3>'+body+'</section>';
const requestTypes={preview:'Request a Free Preview',change:'Website Changes',email:'Business Email',admin:'Admin Access',billing:'Billing Question',support:'Support',other:'Other'};
function previewCards(){return previews.length?previews.map(p=>panel(safe(p.site_title),(p.invited?'<p>Automatically linked from your registration invitation.</p>':'') + '<div class="actions"><a class="primary" target="_blank" rel="noopener noreferrer" href="'+safe(p.preview_url)+'">Open Preview</a><button class="secondary" data-share="'+safe(p.preview_url)+'">Share Preview</button></div>')).join(''):panel('Your previews','<p>No preview is assigned to your verified company yet. Request one below.</p>'+'<button class="primary" data-open-preview>Request a Free Preview</button>')}
function journeyMarkup(){
 const hasRequest=requests.some(r=>r.request_type==='preview'&&!/^(Preview Link Requested|Preview Selected|Preview Approved) — /.test(r.title||''))||previews.length>0;
 const hasPreview=previews.length>0;
 const p=previews[0];
 const hasApproval=previews.some(p=>approvedPreviewKeys.has(p.site_key));
 if(invitationPreviews.length && purchaseComplete){const ip=invitationPreviews[0];const step=privateFulfillmentProgress.find(x=>String(x.sale_id)===String(ip.site_key||'').replace(/^invited-/,'') ); const status=step?String(step.fulfillment_status||'awaiting_assignment').replaceAll('_',' '):'handoff pending';return '<section class="panel journey-card"><h2>Purchase completed</h2><p>Your website request has been passed to our website team.</p><p>Website progress: <strong>'+safe(status)+'</strong></p></section>';}

 if(invitationPreviews.length){const ip=invitationPreviews[0];return '<section class="panel journey-card"><div class="journey-heading"><div><span class="request-section-kicker">YOUR REGISTRATION</span><h2>Your website is linked</h2><p>Your salesperson has already assigned your preview. No code is necessary.</p></div></div><div class="journey-step"><span class="journey-number journey-done">✓</span><div class="journey-step-copy"><h3>1. Registration</h3><p>Your customer account is ready.</p></div></div><div class="journey-step"><span class="journey-number journey-done">✓</span><div class="journey-step-copy"><h3>2. Your website preview</h3><p>Your preview is automatically attached to your account.</p><a class="primary journey-action" target="_blank" rel="noopener noreferrer" href="'+safe(ip.preview_url)+'">View Your Preview</a></div></div><div class="journey-step"><span class="journey-number">3</span><div class="journey-step-copy"><h3>Complete Your Purchase</h3><p>Sign your agreement, then complete development and hosting checkout.</p><button class="primary" data-journey-purchase>Continue to Agreement &amp; Payment</button></div></div></section>'+(invitationError?'<p class="notice" role="alert">'+safe(invitationError)+'</p>':'');}

 if(purchaseComplete&&hasRequest&&hasApproval)return '<section class="panel journey-card"><div class="journey-heading"><div><span class="request-section-kicker">ONBOARDING COMPLETE</span><h2>Everything is complete!</h2><p>Thank you! Your website request has been submitted.</p></div><span style="font-size:38px;color:#168151">✓</span></div><div class="journey-preview-status"><h3>We are preparing your website</h3><p>Our team is reviewing your information and getting your site ready. You can follow development updates here. We will notify you when it is ready for review.</p></div><div class="journey-wait-steps"><span class="ready">✓ Request submitted</span><span>○ Planning & content review</span><span>○ Website development</span><span>○ Quality check</span><span>○ Ready for your review</span></div></section>';
 const percent=(hasRequest?1:0)+(hasApproval?1:0);
 const item=(n,done,title,desc,actions,active)=>'<article class="journey-step '+(active?'journey-active':'')+'"><div class="journey-number '+(done?'journey-done':'')+'">'+(done?'✓':n)+'</div><div class="journey-step-copy"><h3>'+title+'</h3><p>'+desc+'</p>'+actions+'</div></article>';
 const waiting=hasRequest?'<div class="journey-preview-status"><div class="journey-preview-status-head"><span>◷ &nbsp; Preview requested</span><span class="journey-status-pill">In progress</span></div><p>Your preview request is in. Once your website is assigned, you can explore it, share it, and ask for changes.</p></div><div class="journey-wait-steps"><span class="ready">✓ Request received</span><span>○ Website being prepared</span><span>○ Ready for your review</span></div>':'<div class="journey-preview-status"><strong>Start with your free preview</strong><p>Request a website preview in Step 1 to get started.</p></div>';
 const previewActions=hasPreview?'<div class="journey-preview-card preview-modern"><div class="journey-browser-top"><span class="journey-browser-dots">● ● ●</span><span class="journey-preview-address">'+safe(p.preview_url)+'</span><span class="journey-browser-live"><i data-lucide="check-circle-2"></i> Preview ready</span></div><div class="journey-browser-inner"><span class="journey-browser-icon"><i data-lucide="monitor-check"></i></span><div class="journey-preview-details"><span class="journey-preview-eyebrow">YOUR WEBSITE PREVIEW</span><strong>'+safe(p.site_title||'Your Website Preview')+'</strong><small><i data-lucide="key-round"></i> '+safe(p.site_key)+'</small></div></div></div><div class="journey-review-actions review-modern-actions"><a class="journey-action primary" target="_blank" rel="noopener noreferrer" href="'+safe(p.preview_url)+'"><i data-lucide="external-link"></i> View Website</a><button class="journey-action secondary" data-journey-change data-preview-key="'+safe(p.site_key)+'"><i data-lucide="pencil-line"></i> Request Changes</button><button class="journey-action secondary" data-share="'+safe(p.preview_url)+'"><i data-lucide="share-2"></i> Share Website</button><button class="journey-action journey-approve" data-journey-approve data-preview-id="'+safe(p.id||'')+'" data-preview-key="'+safe(p.site_key)+'"><i data-lucide="badge-check"></i> '+(hasApproval?'Website Approved':'Approve Website')+'</button></div>':waiting;
 return '<section class="panel journey-card"><div class="journey-heading"><div><span class="request-section-kicker">YOUR PROGRESS</span><h2>Your Website Journey</h2><p>From first preview to launch, in three simple steps.</p></div><strong>'+percent+' of 3</strong></div><div class="journey-meter"><div style="width:'+(percent/3*100)+'%"></div></div>'+
 item(1,hasRequest,'Request Free Preview','Tell us what you have in mind. Share a link to invite someone else.','<div class="journey-actions"><button class="primary" data-open-preview>'+(hasRequest?'Request Another Preview':'Request Preview')+'</button><button class="secondary" data-share-invite>Share</button></div>',!hasRequest)+
 item(2,hasApproval,'Review Your Site',hasPreview?'Your website preview is ready to explore!':'See, share, and fine-tune your website before purchase.',previewActions,hasRequest&&!hasApproval)+
 item(3,false,'Complete Your Purchase','Sign your agreement, pay for website design, and select hosting.','<div class="journey-actions"><button class="secondary" data-journey-purchase>Review Purchase Options</button></div>',false)+'</section>';
}
function homeDashboard(){
 const name=safe((profile?.full_name||'there').split(' ')[0]);
 const icon=(name)=>'<i data-lucide="'+name+'" aria-hidden="true"></i>';
 const previewList=previews.map(v=>'<article class="home-site-item"><span class="home-site-icon">'+icon('globe')+'</span><div><h3>'+safe(v.site_title||'Website preview')+'</h3><p>Preview available</p></div><a class="secondary" href="'+safe(v.preview_url)+'" target="_blank" rel="noopener noreferrer">View Preview '+icon('arrow-up-right')+'</a></article>').join('');
 const activity=requests.slice(0,3).map(r=>'<div class="home-activity-row"><span class="home-activity-icon">'+icon('clipboard-list')+'</span><div><strong>'+safe(r.title)+'</strong><p>'+safe(String(r.status||'submitted').replaceAll('_',' '))+'</p></div><time>'+safe(new Date(r.created_at).toLocaleDateString())+'</time></div>').join('');
 return '<div class="home-dashboard">'+
 '<section class="home-hero load-seq-item"><span class="eyebrow">WELCOME TO YOUR PORTAL</span><h1>Welcome, '+name+'!</h1><p>Everything for your website, in one place.</p></section>'+
 '<section class="home-section load-seq-item"><div class="home-section-title"><div><span class="home-kicker">GET STARTED</span><h2>What would you like to do?</h2><p>Choose the option that works best for you. You can always do more later.</p></div></div><div class="home-start-grid">'+
 '<article class="home-start-card"><span class="home-round-icon">'+icon('shopping-cart')+'</span><h3>Start a Website</h3><span class="home-pill">Get started today</span><p>Create a website project and tell us what you need. No payment to get started.</p><button class="primary" data-project-add>Start a Website</button></article>'+
 '<article class="home-start-card"><span class="home-round-icon">'+icon('eye')+'</span><h3>Request a Free Preview</h3><p>See an example of your website before you purchase. We’ll create a preview based on your business information.</p><button class="secondary" data-open-preview>Request Preview</button></article>'+
 '<article class="home-start-card"><span class="home-round-icon">'+icon('link-2')+'</span><h3>I Already Have a Preview</h3><p>Approve your existing preview without completing a questionnaire.</p><button class="secondary" data-project-add data-start-preview>Ready to Approve Preview</button></article></div></section>'+
 '<section class="home-section load-seq-item"><div class="home-section-title home-title-actions"><div><h2>Your Websites</h2><p>Manage your website projects and continue where you left off.</p></div><button class="primary" data-project-add>'+icon('plus')+' Add New Website</button></div>'+websiteProjectsMarkup()+'</section>'+
 '<section class="home-section load-seq-item"><div class="home-section-title home-title-actions"><div><h2>Hosting Plans</h2><p>Website development is a $100 one-time fee, separate from monthly hosting.</p></div><button class="secondary" data-page="billing">'+icon('chart-no-axes-column')+' Compare Plans</button></div><div class="home-plans">'+
 '<article class="home-plan"><div class="home-plan-heading"><span class="home-round-icon">'+icon('server')+'</span><div><h3>Standard Hosting</h3><div class="home-price">$20 <span>/ month</span></div></div></div><ul><li>Website hosting and maintenance</li><li>Request content updates through your portal</li><li>Reliable hosting</li><li>Basic support</li></ul><button class="primary" data-project-add>Start with Standard</button></article>'+
 '<article class="home-plan"><div class="home-plan-heading"><span class="home-round-icon">'+icon('database')+'</span><div><h3>Business Hosting</h3><div class="home-price">$30 <span>/ month</span></div></div></div><ul><li>Everything in Standard Hosting</li><li>Admin dashboard for supported features</li><li>Manage supported products and services</li><li>Advanced site features where available</li></ul><button class="primary" data-project-add>Start with Business</button></article></div></section>'+
 '<section class="home-section load-seq-item"><div class="home-section-title home-title-actions"><div><h2>Recent Activity</h2><p>Your latest requests and updates.</p></div><button class="secondary" data-page="requests">View All</button></div>'+(activity||'<div class="home-activity-row"><span class="home-activity-icon">'+icon('check-circle-2')+'</span><div><strong>Your portal is ready</strong><p>Purchase a website, request a preview, or manage your account.</p></div></div>')+'</section>'+
 '<section class="home-section load-seq-item"><div class="home-section-title"><div><h2>Need Help?</h2><p>We’re here to help. Choose the best way to get support.</p></div></div><div class="home-help-grid">'+
 '<article class="home-help"><span class="home-round-icon">'+icon('messages-square')+'</span><h3>Submit a Request</h3><p>Send us a message about your website, hosting, or account.</p><button class="secondary" data-home-support>Create a Request</button></article>'+
 '<article class="home-help"><span class="home-round-icon">'+icon('circle-help')+'</span><h3>Help & Support</h3><p>Get assistance with your website and services.</p><button class="secondary" data-page="support">Get Help</button></article>'+
 '<article class="home-help"><span class="home-round-icon">'+icon('phone')+'</span><h3>Contact Us</h3><p>Call, text, or email Steady Hands.</p><a class="home-contact" href="tel:+17023726399">(702) 372-6399</a><a class="home-email" href="mailto:kiara@steadyhandsop.com">kiara@steadyhandsop.com</a></article></div></section>'+
 '<footer class="home-footer load-seq-item"><strong>STEADY HANDS OPERATIONS</strong><span>We run the site. You run the show.</span><span>© '+new Date().getFullYear()+' Steady Hands LLC</span></footer></div>';
}
function pageContent(p){
 const [title,subtitle]=sections[p],business=safe(current?.company_name||user.user_metadata?.portal_company_name||'Your Business');
 if(p==='overview')return homeDashboard();
 if(p==='website')return pageHeader('My Websites','Your website projects, in one place.')+'<section class="home-section"><div class="home-section-title home-title-actions"><h2>Your Websites</h2><button class="primary" data-project-add>+ Add New Website</button></div>'+websiteProjectsMarkup()+'</section>';
 if(p==='requests')return pageHeader(title,'Track your requests and stay up to date.')+
 '<section class="request-page-modern"><button type="button" id="open-request-wizard" class="request-new-modern"><span class="request-new-icon"><i data-lucide="plus"></i></span><span class="request-new-copy"><strong>Create a new request</strong><small>Website changes, business email, billing and support</small></span><span class="request-new-arrow"><i data-lucide="arrow-up-right"></i></span></button>'+
 '<section class="panel request-history-panel request-history-modern"><div class="request-panel-heading"><div><span class="request-section-kicker">REQUEST CENTER</span><h3>Your requests</h3><p>Everything you have submitted, all in one place.</p></div><span class="request-history-count">'+requests.length+' '+(requests.length===1?'request':'requests')+'</span></div>'+
 (requests.length?'<div class="request-card-list">'+requests.map(r=>{
 const statusLabels={submitted:'Submitted',under_review:'Under Review',in_progress:'In Progress',completed:'Completed',declined:'Declined'};
 const typeLabels={preview:'Website Preview',change:'Website Changes',email:'Business Email',admin:'Admin Access',billing:'Billing',support:'Support',other:'General Request'};
 const typeIcons={preview:'monitor',change:'pencil-ruler',email:'mail',admin:'shield-check',billing:'credit-card',support:'life-buoy',other:'file-text'};
 const date=new Date(r.created_at);
 const prettyDate=Number.isFinite(date.getTime())?date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Date unavailable';
 const details=String(r.details||'').trim();
 return '<article class="request-item-modern"><span class="request-type-icon"><i data-lucide="'+(typeIcons[r.request_type]||'file-text')+'"></i></span><div class="request-item-main"><div class="request-item-top"><span class="request-type-label">'+safe(typeLabels[r.request_type]||r.request_type)+'</span><span class="request-status-pill status-'+safe(r.status)+'"><span class="request-status-dot"></span>'+safe(statusLabels[r.status]||r.status)+'</span></div><h4>'+safe(r.title)+'</h4>'+(details?'<p class="request-item-description">'+safe(details.length>170?details.slice(0,170)+'…':details)+'</p>':'')+'<div class="request-item-bottom"><span class="request-item-date"><i data-lucide="calendar-days"></i> '+safe(prettyDate)+'</span><div class="portal-request-actions"><button type="button" class="request-action-edit" data-edit-request="'+safe(r.id)+'" '+(r.status!=='submitted'?'disabled title="Only submitted requests can be edited"':'')+'><i data-lucide="pencil"></i> Edit</button><button type="button" class="request-action-delete" data-delete-my-request="'+safe(r.id)+'"><i data-lucide="trash-2"></i> Delete</button></div></div></div></article>';
 }).join('')+'</div>':'<div class="request-history-empty request-empty-modern"><span class="request-empty-icon"><i data-lucide="inbox"></i></span><strong>No requests yet</strong><p>When you send a request, you can track its progress right here.</p></div>')+'</section></section>';
 if(p==='billing')return pageHeader(title,'Choose hosting that fits your business.')+'<div class="twocol">'+[["Standard Hosting",20,"Website hosting and maintenance, with content updates requested through your portal."],["Business Hosting",30,"Includes an admin dashboard to manage supported content and features."]].map(v=>panel(v[0],'<div class="price">$'+v[1]+'<span class="muted small"> / month</span></div><p>'+v[2]+'</p><button class="primary" data-select-plan="'+v[0]+'">Select Plan</button>')).join('')+'</div>'+panel('Website Development','<p>One-time development is $100, separate from monthly hosting.</p>')+panel('Payments and subscriptions','<p>No verified payment history is connected to this portal yet. Selecting a plan will start a request, not charge your card.</p>');
 if(p==='emails')return pageHeader(title,'Get professional email addresses for your business.')+panel('Business Email','<p>Additional business mailboxes cost $2/month or $24/year each. Email setup requires an eligible domain and provisioning by Steady Hands.</p>'+button('Request Business Email','requests'));
 if(p==='admin')return pageHeader(title,'Manage supported website content with Business Hosting.')+panel('Admin Dashboard','<p>Business Hosting is $30/month and may include controls for your services, products, and reviews, depending on your site.</p>'+button('Request Admin Access','requests')+' '+button('View Hosting Plans','billing'));
 if(p==='referrals')return pageHeader(title,'Invite businesses to Steady Hands.')+panel('Your referrals','<p>Your submitted referral code: <strong>'+safe(user.user_metadata?.portal_referral_code||'None')+'</strong></p><p>Referral rewards and personal sharing links will appear once the referral program is connected. Entered codes are not yet validated.</p>');
 if(p==='support')return pageHeader(title,'We are here to help.')+panel('Contact Steady Hands','<p>Email <a href="mailto:kiara@steadyhandsop.com">kiara@steadyhandsop.com</a>, or submit a support request and track its status.</p>'+button('Submit Support Request','requests'));
 if(p==='settings')return pageHeader(title,'Update your account details.')+panel('Your profile','<form id="profile" class="profile-form"><label for="full-name">Display name *</label><input id="full-name" maxlength="120" required value="'+safe(profile.full_name)+'"><label for="company-name">Company name *</label><input id="company-name" maxlength="160" required value="'+safe(user.user_metadata?.portal_company_name||'')+'"><label>Email</label><div class="notice">'+safe(user.email)+'</div><button class="primary" type="submit">Save Changes</button><p id="profile-message" role="status"></p></form>');
 return pageHeader(title,subtitle);
}
function refreshPortalIcons(){window.lucide?.createIcons?.()}
function render(){const p=currentPage();$('#main').innerHTML=pageContent(p);$('#main').scrollTop=0;document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===p));if(p==='settings')$('#profile').addEventListener('submit',saveProfile);refreshPortalIcons();closeSidebar();if(p==='overview'&&shouldAnimateOverviewLoad){requestAnimationFrame(startOverviewRevealSequence)}else if(p!=='overview'){shouldAnimateOverviewLoad=false;removeShellLoaders();clearLoadSequence()}}
function setRequestType(value){const label=requestTypes[value];if(!label)return;const input=$('#type');if(!input)return;input.value=value;$('#request-type-value').textContent=label;document.querySelectorAll('[data-type-option]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.typeOption===value)))}
function setupRequestDropdown(){requestDropdownAbort.abort();requestDropdownAbort=new AbortController();const root=$('#request-dropdown'),trigger=$('#request-type-trigger'),options=$('#request-type-options');if(!root)return;const close=()=>{options.hidden=true;trigger.setAttribute('aria-expanded','false');root.classList.remove('is-open')};trigger.addEventListener('click',()=>{const opening=options.hidden;options.hidden=!opening;trigger.setAttribute('aria-expanded',String(opening));root.classList.toggle('is-open',opening);if(opening)options.querySelector('[aria-selected="true"]')?.focus()});options.addEventListener('click',e=>{const choice=e.target.closest('[data-type-option]');if(!choice)return;setRequestType(choice.dataset.typeOption);close();trigger.focus()});options.addEventListener('keydown',e=>{const buttons=[...options.querySelectorAll('[data-type-option]')],i=buttons.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus()}if(e.key==='Escape'){close();trigger.focus()}if(e.key==='Tab')close()});document.addEventListener('click',e=>{if(!root.contains(e.target))close()},{signal:requestDropdownAbort.signal})}
let requestDropdownAbort=new AbortController();
async function saveProfile(e){e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;const name=$('#full-name').value.trim(),company=$('#company-name').value.trim();if(!name||!company){$('#profile-message').textContent='Both fields are required.';button.disabled=false;return}const {error:metadataError}=await supabase.auth.updateUser({data:{portal_company_name:company}});if(metadataError){$('#profile-message').textContent=metadataError.message;button.disabled=false;return}user.user_metadata={...user.user_metadata,portal_company_name:company};const {error}=await supabase.from('portal_profiles').upsert({user_id:user.id,full_name:name,updated_at:new Date().toISOString()},{onConflict:'user_id'});$('#profile-message').textContent=error?error.message:'Saved successfully.';if(!error)profile.full_name=name;button.disabled=false}
async function submitRequest(e){e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;const record={user_id:user.id,company_name:user.user_metadata?.portal_company_name||'',request_type:$('#type').value,title:$('#request-title').value.trim(),details:$('#request-details').value.trim()};const {error}=await supabase.from('portal_service_requests').insert(record);if(error){$('#request-message').textContent='Request could not be saved. The portal requests database setup may still be needed: '+error.message;button.disabled=false;return}await loadRecords();render()}
async function loadCustomerFulfillment(){
 privateFulfillmentProgress=[];
 const {data,error}=await supabase.rpc('sh_my_customer_fulfillment_status');
 if(!error)privateFulfillmentProgress=data||[];
}
async function loadInvitationPreviews(){
 const {data,error}=await supabase.rpc('sh_my_portal_invited_previews');
 if(error){invitationError='Automatic preview lookup is unavailable. Please contact support if you need help accessing your invitation.';invitationPreviews=[];return;}
 invitationPreviews=(data||[]).filter(p=>/^https:\/\//i.test(String(p.preview_url||''))).map(p=>({site_title:p.business_name||'Your Website Preview',site_key:'invited-'+p.sale_id,preview_url:p.preview_url,invited:true}));
}
async function redeemSalespersonInvitation(){
 const token=new URLSearchParams(location.search).get('invite')||sessionStorage.getItem('steadyhands.portal.invite')||'';
 if(!token)return;
 if(!/^[a-f0-9]{64}$/i.test(token)){invitationError='This registration link is invalid.';return;}
 sessionStorage.setItem('steadyhands.portal.invite',token);
 const {error}=await supabase.rpc('sh_redeem_portal_invite',{p_token:token});
 if(error){invitationError=error.message;return;}
 invitationError='';
 sessionStorage.removeItem('steadyhands.portal.invite');
 if(location.search.includes('invite='))history.replaceState(null,'',location.pathname+location.hash);
}
async function loadRecords(){const a=await supabase.from('portal_service_requests').select('id,request_type,title,details,status,created_at,deleted_at').eq('user_id',user.id).is('deleted_at',null).order('created_at',{ascending:false}).limit(100);requests=(a.data||[]).filter(r=>!/^(Preview Link Requested|Preview Selected|Preview Approved) — /.test(r.title||''));const b=await supabase.from('portal_previews').select('id,site_title,site_key,preview_url').limit(50);previews=b.data||[];await loadInvitationPreviews();previews=[...invitationPreviews,...previews];const claimed=await supabase.from('portal_preview_claims').select('id,site_title,site_key,preview_url').eq('user_id',user.id);if(!claimed.error){const keys=new Set(previews.map(p=>p.site_key));for(const p of claimed.data||[])if(!keys.has(p.site_key)){previews.push(p);keys.add(p.site_key)}}const storageKey='steadyhands.portal.preview.'+user.id;let selected=[];try{selected=JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{}for(const code of selected){if(publicPreviewCodes[code]&&!previews.some(p=>p.site_key===code))previews.push({...publicPreviewCodes[code],site_key:code});}const legacyRequests=a.data||[];for(const r of legacyRequests){const title=String(r.title||'');const prefix=title.startsWith('Preview Selected — ')?'Preview Selected — ':'Preview Link Requested — ';const code=title.startsWith(prefix)?normalizePreviewCode(title.slice(prefix.length)):'';if(publicPreviewCodes[code]&&!previews.some(p=>p.site_key===code))previews.push({...publicPreviewCodes[code],site_key:code});}}
async function editMyRequest(id){
 const r=requests.find(x=>x.id===id);if(!r||r.status!=='submitted')return;
 const title=prompt('Edit request subject:',r.title);if(title===null)return;
 const details=prompt('Edit request details:',r.details||'');if(details===null)return;
 if(!title.trim()||!details.trim()){alert('Subject and details are required.');return}
 const {error}=await supabase.rpc('portal_edit_own_request',{request_id:id,new_title:title.trim(),new_details:details.trim()});
 if(error){alert('Could not edit request: '+error.message);return}
 await loadRecords();render();
}
async function deleteMyRequest(id){
 const r=requests.find(x=>x.id===id);if(!r||!confirm('Remove this request from your portal? Steady Hands will retain it under Deleted.'))return;
 const {error}=await supabase.rpc('portal_delete_own_request',{request_id:id});
 if(error){alert('Could not delete request: '+error.message);return}
 await loadRecords();render();
}
function closeSidebar(){setSidebar(false)}
function setSidebar(on){const active=window.matchMedia('(max-width:760px)').matches&&on;$('#sidebar').classList.toggle('open',active);$('#sidebar-backdrop').classList.toggle('open',active);$('#menu').setAttribute('aria-expanded',String(active))}
$('#menu').onclick=()=>setSidebar(!$('#sidebar').classList.contains('open'));$('#sidebar-backdrop').onclick=closeSidebar;
$('#nav').addEventListener('click',e=>{const button=e.target.closest('[data-page]');if(button)location.hash=button.dataset.page});
$('#main').addEventListener('click',async e=>{const homeCode=e.target.closest('[data-home-preview-code]');if(homeCode){openPreviewCodeModal();return}const homePlan=e.target.closest('[data-home-plan]');if(homePlan){sessionStorage.setItem('portal_preferred_plan',homePlan.dataset.homePlan);document.dispatchEvent(new CustomEvent('steadyhands:purchase-options'));return}const homeSupport=e.target.closest('[data-home-support]');if(homeSupport){sessionStorage.setItem('portal_request_type','support');location.hash='requests';render();document.querySelector('#open-request-wizard')?.click();return}const claim=e.target.closest('[data-claim-preview]');if(claim){return}const invite=e.target.closest('[data-share-invite]');if(invite){const link='https://portal.steadyhandsop.com/login.html';if(navigator.share){try{await navigator.share({title:'Get a Free Website Preview',url:link})}catch{}}else{await navigator.clipboard.writeText(link);invite.textContent='Link Copied'}return}const change=e.target.closest('[data-journey-change]');if(change){sessionStorage.setItem('portal_request_type','change');location.hash='requests';render();document.querySelector('#open-request-wizard')?.click();return}const approve=e.target.closest('[data-journey-approve]');if(approve){document.dispatchEvent(new CustomEvent('steadyhands:approve-preview',{detail:{id:approve.dataset.previewId,key:approve.dataset.previewKey}}));return}const purchase=e.target.closest('[data-journey-purchase]');if(purchase){document.dispatchEvent(new CustomEvent('steadyhands:purchase-options'));return}const edit=e.target.closest('[data-edit-request]');if(edit){await editMyRequest(edit.dataset.editRequest);return}const del=e.target.closest('[data-delete-my-request]');if(del){await deleteMyRequest(del.dataset.deleteMyRequest);return}const preview=e.target.closest('[data-open-preview]');if(preview){document.dispatchEvent(new CustomEvent('steadyhands:open-preview'));return}const share=e.target.closest('[data-share]');if(share){const url=share.dataset.share;if(navigator.share){try{await navigator.share({title:'Website Preview',url})}catch{}}else if(navigator.clipboard){await navigator.clipboard.writeText(url);share.textContent='Link Copied'}return}const plan=e.target.closest('[data-select-plan]');if(plan){sessionStorage.setItem('portal_request_type','billing');location.hash='requests';return}const button=e.target.closest('[data-page]');if(button){if(button.textContent.includes('Website'))sessionStorage.setItem('portal_request_type','other');location.hash=button.dataset.page;render()}});
window.addEventListener('steadyhands:preview-approved',async e=>{const key=normalizePreviewCode(e.detail?.key);if(key){approvedPreviewKeys.add(key);await loadRecords();render()}});
window.addEventListener('steadyhands:purchase-complete',async()=>{if(!user)return;const u=await supabase.auth.getUser();if(u.data?.user)user=u.data.user;approvedPreviewKeys=new Set((user.user_metadata?.portal_approved_previews||[]).map(normalizePreviewCode));await loadRecords();await checkPurchaseCompleted();render()});
window.addEventListener('hashchange',render);window.addEventListener('resize',()=>{if(innerWidth>760)closeSidebar()});
let gesture;
document.addEventListener('touchstart',e=>{if(innerWidth>760||e.touches.length!==1||e.target.closest('input,textarea,select,[contenteditable]')){gesture=null;return}gesture={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});
document.addEventListener('touchend',e=>{if(!gesture||innerWidth>760)return;const dx=e.changedTouches[0].clientX-gesture.x,dy=e.changedTouches[0].clientY-gesture.y;if(Math.abs(dx)>75&&Math.abs(dx)>Math.abs(dy)*1.6)setSidebar(dx>0);gesture=null},{passive:true});
$('#logout').onclick=async()=>{await supabase.auth.signOut();location.replace('login.html')};
let previewCodeModal;
function closePreviewCodeModal(){if(previewCodeModal)previewCodeModal.hidden=true}
function openPreviewCodeModal(){
 if(!previewCodeModal){
  previewCodeModal=document.createElement('div');
  previewCodeModal.id='preview-code-modal';
  previewCodeModal.hidden=true;
  previewCodeModal.innerHTML='<div class="preview-code-shade" data-close-preview></div><form class="preview-code-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-code-heading"><button type="button" class="preview-code-x" data-close-preview aria-label="Close"><i data-lucide="x"></i></button><div class="preview-code-emblem"><i data-lucide="key-round"></i></div><span class="preview-code-caption">STEADY HANDS CLIENT PORTAL</span><h2 id="preview-code-heading">Link your website preview</h2><p>Already have a preview code? Enter it here to add your website to your workspace.</p><label for="preview-code-field">Your preview code</label><div class="preview-code-input-wrap"><i data-lucide="key-round"></i><input id="preview-code-field" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="70" placeholder="SHS-XXXXXXXXXXXX" required></div><p id="preview-code-feedback" role="status" aria-live="polite"></p><div class="preview-code-footer"><button type="button" class="secondary" data-close-preview>Cancel</button><button type="submit" class="primary" id="preview-code-confirm"><i data-lucide="link-2"></i> Link Preview</button></div></form>';
  document.body.appendChild(previewCodeModal);
  previewCodeModal.addEventListener('click',e=>{if(e.target.closest('[data-close-preview]'))closePreviewCodeModal()});
  previewCodeModal.querySelector('form').addEventListener('submit',async e=>{
   e.preventDefault();
   const code=previewCodeModal.querySelector('#preview-code-field').value.trim().toUpperCase();
   const feedback=previewCodeModal.querySelector('#preview-code-feedback');
   const button=previewCodeModal.querySelector('#preview-code-confirm');
   if(!code){feedback.textContent='Enter your preview code first.';return}
   button.disabled=true;feedback.textContent='Looking up your preview…';
   try{const ok=await redeemPreview(code);if(ok)closePreviewCodeModal();else feedback.textContent='Unable to link this code. Please check it and try again.'}
   catch(err){feedback.textContent='Something went wrong. Please try again.';console.error(err)}
   finally{button.disabled=false}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!previewCodeModal.hidden)closePreviewCodeModal()});
 }
 previewCodeModal.hidden=false;previewCodeModal.querySelector('#preview-code-field').value='';previewCodeModal.querySelector('#preview-code-feedback').textContent='';
 refreshPortalIcons();previewCodeModal.querySelector('#preview-code-field').focus();
}
async function redeemPreview(value){
 const code=normalizePreviewCode(value);if(!code)return false;
 const found=publicPreviewCodes[code];
 // Site keys issued by the public website exist before a portal claim record.
 // Handle them directly, without calling a database function that cannot find them.
 if(!found){
  const res=await supabase.rpc('claim_portal_preview',{p_code:code});
  if(res.error){alert('Could not link preview: '+res.error.message);return false}
  sessionStorage.removeItem('steadyhands.preview_code');await loadRecords();render();
  alert('Your preview is now connected to your account.');return true;
 }
 // Public preview is selectable immediately; do not create a Requests entry.
 sessionStorage.removeItem('steadyhands.preview_code');
 const storageKey='steadyhands.portal.preview.'+user.id;
 const selected=JSON.parse(localStorage.getItem(storageKey)||'[]');
 if(!selected.includes(code))localStorage.setItem(storageKey,JSON.stringify([...selected,code]));
 await loadRecords();render();
 return true;
}

// Project purchase completion is tracked by each website's verified checkout records;
// never reuse the former account-wide signature/payment state.
async function checkPurchaseCompleted(){purchaseComplete=false}
async function boot(){const {data:{session},error}=await supabase.auth.getSession();if(error||!session){location.replace('login.html'+location.search);return}user=session.user;const invite=new URLSearchParams(location.search).get('invite');if(invite&&/^[a-f0-9]{64}$/i.test(invite))sessionStorage.setItem('steadyhands.portal.invite',invite);
 const p=await supabase.from('portal_profiles').select('full_name,phone').eq('user_id',user.id).maybeSingle();
 if(p.error){$('#main').innerHTML=empty('Unable to load profile',p.error.message);return}profile=p.data||{full_name:'',phone:''}; if(!profile.full_name?.trim()||!String(user.user_metadata?.portal_company_name||'').trim()){location.replace('onboarding.html');return;}
 const m=await supabase.from('portal_memberships').select('company_id,role').eq('user_id',user.id);
 if(m.error){$('#main').innerHTML=empty('Unable to load memberships',m.error.message);return}
 if(m.data?.length){const ids=m.data.map(x=>x.company_id);const c=await supabase.from('portal_companies').select('id,company_name,status').in('id',ids);if(c.error){$('#main').innerHTML=empty('Unable to load companies',c.error.message);return}companies=c.data||[];current=companies[0]||null}
 await redeemSalespersonInvitation();await loadRecords();projectManager=await initWebsiteProjects({supabase,user,refresh:render,getPreviews:()=>[...previews,...Object.entries(publicPreviewCodes).filter(([key])=>!previews.some(p=>p.site_key===key)).map(([site_key,p])=>({...p,site_key}))]});await loadCustomerFulfillment();await checkPurchaseCompleted();$('#company-label').textContent=current?.company_name||user.user_metadata?.portal_company_name||'My Workspace';$('#company-letter').textContent=(current?.company_name||user.user_metadata?.portal_company_name||'S').charAt(0).toUpperCase();render();
}
supabase.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')location.replace('login.html')});showInitialOverviewSkeleton();boot();
