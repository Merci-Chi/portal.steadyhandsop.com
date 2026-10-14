import {supabase} from './supabase-client.js';

// Reuses the same deployed Square checkout system as Merci-Chi/viewyoursite.
// Each invocation creates a fresh customer-specific checkout link on the server.
// Never put a Square access token or fixed checkout link in browser code.
const PLAN_KEYS=Object.freeze({
  development:'website-development',
  standard:'standard-monthly',
  backend:'backend-monthly'
});
export async function createCustomerCheckout(kind,{agreementId,projectId}={}){
  if(!Object.hasOwn(PLAN_KEYS,kind))throw new Error('Unknown checkout plan.');
  if(!agreementId||!projectId)throw new Error('A signed website-specific agreement and project ID are required.');
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)throw new Error('Please sign in to continue.');
  const {data,error}=await supabase.functions.invoke('square-subscriptions',{
    body:{
      action:'create-checkout',
      planKey:PLAN_KEYS[kind],
      agreementId,
      projectId,
      returnUrl:(window.location.protocol==='https:' ? window.location.origin+window.location.pathname : 'https://portal.steadyhandsop.com/')+'?square_checkout=return'
    }
  });
  if(error||!data?.checkoutUrl||!data?.checkoutId){let message=data?.message||error?.message||'Square checkout could not be created.';if(error?.context?.json){try{const body=await error.context.json();message=body?.message||message}catch{}}throw new Error(message)}
  if(data.projectId!==projectId||data.agreementId!==agreementId||data.purpose!==kind)throw new Error('Square server must confirm the website, agreement and payment purpose. Update square-subscriptions before accepting payments.');
  const url=new URL(data.checkoutUrl);
  if(url.protocol!=='https:'||!/(^|\.)squareup\.com$/.test(url.hostname)&&!/(^|\.)square\.link$/.test(url.hostname))throw new Error('Square returned an unexpected checkout address.');
  return {checkoutUrl:url.href,checkoutId:data.checkoutId};
}
export async function verifyCustomerCheckout(checkoutId,{projectId,purpose}={}){
  if(!checkoutId||!projectId||!purpose)throw new Error('Missing website-specific checkout information.');
  const {data,error}=await supabase.functions.invoke('square-subscriptions',{
    body:{action:'verify-checkout',checkoutId,projectId,purpose}
  });
  if(error||data?.message)throw new Error(data?.message||error.message);
  if(data?.projectId!==projectId||data?.purpose!==purpose)throw new Error('The checkout verification was not linked to this website.');
  return data?.verified===true;
}
