import {supabase} from './supabase-client.js';
import {PORTAL_URL} from './config.js';
const $=s=>document.querySelector(s), msg=(m,error=false)=>{const el=$('#message');el.textContent=m;el.className=error?'error':'success'};
let mode='signin';const redirect=PORTAL_URL+'/index.html';
const email=$('#email');const remembered=localStorage.getItem('steadyhands.savedEmail');if(remembered){email.value=remembered;$('#remember').checked=true}
function saveEmail(){if($('#remember').checked)localStorage.setItem('steadyhands.savedEmail',email.value.trim());else localStorage.removeItem('steadyhands.savedEmail')}
function setMode(m){mode=m;$('#tab-signin').classList.toggle('selected',m==='signin');$('#tab-signup').classList.toggle('selected',m==='signup');$('#heading').textContent=m==='signin'?'Welcome back':'Create your account';$('#subheading').textContent=m==='signin'?'Sign in to access your Steady Hands account.':'Get started with your Steady Hands workspace.';$('#submit').textContent=m==='signin'?'Log In':'Create Account';$('#password').autocomplete=m==='signin'?'current-password':'new-password';$('#forgot').hidden=m!=='signin';msg('')}
$('#tab-signin').onclick=()=>setMode('signin');$('#tab-signup').onclick=()=>setMode('signup');
$('#show-password').onclick=()=>{const p=$('#password');p.type=p.type==='password'?'text':'password';$('#show-password').lastChild.textContent=p.type==='password'?' Show':' Hide'};
$('#remember').onchange=saveEmail;email.addEventListener('input',()=>{if($('#remember').checked)saveEmail()});
function busy(b){['submit','google','magic','forgot'].forEach(id=>$('#'+id).disabled=b)}
$('#auth-form').addEventListener('submit',async e=>{e.preventDefault();saveEmail();busy(true);const credentials={email:email.value.trim(),password:$('#password').value};try{const {data,error}=mode==='signin'?await supabase.auth.signInWithPassword(credentials):await supabase.auth.signUp({...credentials,options:{emailRedirectTo:redirect}});if(error)throw error;if(data.session)location.replace('index.html');else msg('Check your inbox to confirm your email address, then log in.')}catch(e){msg(e.message,true)}finally{busy(false)}});
$('#google').onclick=async()=>{saveEmail();busy(true);const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect}});if(error){msg(error.message,true);busy(false)}};
$('#magic').onclick=async()=>{if(!email.checkValidity()){email.reportValidity();return}saveEmail();busy(true);const {error}=await supabase.auth.signInWithOtp({email:email.value.trim(),options:{emailRedirectTo:redirect,shouldCreateUser:false}});msg(error?error.message:'Check your inbox for a one-time login link.',!!error);busy(false)};
$('#forgot').onclick=async()=>{if(!email.checkValidity()){email.reportValidity();return}saveEmail();busy(true);const {error}=await supabase.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:PORTAL_URL+'/reset-password.html'});msg(error?error.message:'If your account exists, check your inbox for reset instructions.',!!error);busy(false)};
(async()=>{const {data}=await supabase.auth.getSession();if(data.session)location.replace('index.html')})();
