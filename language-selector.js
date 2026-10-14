// Custom language selector using the Google Translate website widget.
// Translation requires a network connection and availability of Google's service.
const primary=[['en','English'],['es','Español — Spanish'],['zh-CN','中文（简体）— Chinese'],['hi','हिन्दी — Hindi'],['ar','العربية — Arabic'],['fr','Français — French'],['pt','Português — Portuguese'],['ru','Русский — Russian'],['bn','বাংলা — Bengali'],['ja','日本語 — Japanese'],['de','Deutsch — German'],['ur','اردو — Urdu']];
const extra=[['ko','한국어 — Korean'],['it','Italiano — Italian'],['tr','Türkçe — Turkish'],['vi','Tiếng Việt — Vietnamese'],['ta','தமிழ் — Tamil'],['te','తెలుగు — Telugu'],['mr','मराठी — Marathi'],['pa','ਪੰਜਾਬੀ — Punjabi'],['fa','فارسی — Persian'],['sw','Kiswahili — Swahili'],['id','Bahasa Indonesia'],['nl','Nederlands — Dutch'],['pl','Polski — Polish'],['th','ไทย — Thai'],['uk','Українська — Ukrainian'],['ro','Română — Romanian'],['el','Ελληνικά — Greek'],['he','עברית — Hebrew'],['sv','Svenska — Swedish'],['fil','Filipino'],['ms','Bahasa Melayu — Malay'],['gu','ગુજરાતી — Gujarati'],['kn','ಕನ್ನಡ — Kannada'],['ml','മലയാളം — Malayalam'],['ne','नेपाली — Nepali'],['am','አማርኛ — Amharic'],['ha','Hausa'],['yo','Yorùbá'],['zu','isiZulu']];
const languages=[...primary,...extra];
const trigger=document.getElementById('language-trigger');
const storageKey='steadyhands.portal.language';
let selected=localStorage.getItem(storageKey)||'en';
let shade=null,previousFocus=null;
function languageCookie(code){const value='/en/'+code;document.cookie='googtrans='+value+';path=/;SameSite=Lax';if(location.hostname.includes('.'))document.cookie='googtrans='+value+';path=/;domain=.'+location.hostname+';SameSite=Lax'}
function translateTo(code){
 selected=code;localStorage.setItem(storageKey,code);
 languageCookie(code);
 const nativeSelect=document.querySelector('#google_translate_element select.goog-te-combo');
 if(nativeSelect){nativeSelect.value=code==='en'?'':code;nativeSelect.dispatchEvent(new Event('change',{bubbles:true}));}
 else if(code!=='en'){
  // The widget script sometimes loads later; saved language is applied when ready.
  document.dispatchEvent(new CustomEvent('steadyhands:translate-pending'));
 }
 if(code==='en' && !nativeSelect){location.reload()}
}
function close(){if(!shade)return;shade.remove();shade=null;trigger.setAttribute('aria-expanded','false');previousFocus?.focus()}
function renderOptions(term=''){
 const area=shade?.querySelector('.language-options');if(!area)return;
 const query=term.trim().toLocaleLowerCase();
 const group=(title,values)=>{const matches=values.filter(([code,name])=>(name+' '+code).toLocaleLowerCase().includes(query));if(!matches.length)return '';return '<div class="language-group-label">'+title+'</div>'+matches.map(([code,name])=>'<button type="button" class="language-option" role="radio" aria-checked="'+(selected===code)+'" data-lang="'+code+'"><span>'+name+'</span>'+(selected===code?'<span class="language-check">✓</span>':'')+'</button>').join('')};
 area.innerHTML=group('Popular languages',primary)+group('More languages',extra)||'<p style="padding:16px;color:#70819a">No matching languages.</p>';
 area.querySelectorAll('[data-lang]').forEach(button=>button.addEventListener('click',()=>{translateTo(button.dataset.lang);close()}));
}
function open(){previousFocus=document.activeElement;shade=document.createElement('div');shade.className='language-shade';shade.innerHTML='<section class="language-dialog" role="dialog" aria-modal="true" aria-labelledby="language-heading"><header class="language-dialog-head"><div class="language-dialog-symbol" aria-hidden="true">文</div><div><h2 id="language-heading">Choose a language</h2><p>Translate your client portal</p></div><button class="language-dialog-close" aria-label="Close language selector" type="button">×</button></header><input class="language-search" type="search" aria-label="Search languages" placeholder="Search for a language…"><div class="language-options" role="radiogroup" aria-label="Languages"></div><footer class="language-dialog-foot">Translation provided by Google Translate. Some text may not translate perfectly.</footer></section>';document.body.append(shade);trigger.setAttribute('aria-expanded','true');shade.querySelector('.language-dialog-close').onclick=close;shade.addEventListener('click',e=>{if(e.target===shade)close()});shade.querySelector('.language-search').addEventListener('input',e=>renderOptions(e.target.value));renderOptions();shade.querySelector('.language-search').focus()}
trigger?.addEventListener('click',()=>shade?close():open());
document.addEventListener('keydown',e=>{if(!shade)return;if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const els=[...shade.querySelectorAll('button,input')].filter(x=>x.offsetParent!==null);if(!els.length)return;const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
window.googleTranslateElementInit=function(){new google.translate.TranslateElement({pageLanguage:'en',includedLanguages:languages.map(x=>x[0]).filter(x=>x!=='en').join(','),autoDisplay:false},'google_translate_element');let tries=0;const timer=setInterval(()=>{const select=document.querySelector('#google_translate_element select.goog-te-combo');if(select){clearInterval(timer);if(selected!=='en'&&select.value!==selected){select.value=selected;select.dispatchEvent(new Event('change',{bubbles:true}))}}else if(++tries>40)clearInterval(timer)},250)};
const script=document.createElement('script');script.src='https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';script.async=true;document.head.append(script);


// Google's translation toolbar is a fixed overlay. Detect its displayed height
// and reserve that space for the entire portal, including the mobile sidebar.
function updateTranslationBannerSpace(){
 let height=0;
 for(const frame of document.querySelectorAll('iframe')){
  const marker=(String(frame.className||'')+' '+String(frame.id||'')+' '+String(frame.getAttribute('src')||'')).toLowerCase();
  if(!/goog-te-banner-frame|v ipgjd|vipgjd-zvi9od-orhb|translate\.google/.test(marker.replaceAll('VIpgJd','vipgjd')))continue;
  const rect=frame.getBoundingClientRect();
  const style=getComputedStyle(frame);
  if(style.display==='none'||style.visibility==='hidden'||rect.width<240||rect.height<24||rect.top>12||rect.bottom<=0)continue;
  height=Math.max(height,Math.round(Math.min(rect.height,90)));
 }
 const next=height+'px';
 if(document.documentElement.style.getPropertyValue('--translate-banner-space')!==next)document.documentElement.style.setProperty('--translate-banner-space',next);
}
const translationBannerObserver=new MutationObserver(updateTranslationBannerSpace);
translationBannerObserver.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
window.addEventListener('resize',updateTranslationBannerSpace);
window.addEventListener('load',updateTranslationBannerSpace);
updateTranslationBannerSpace();
