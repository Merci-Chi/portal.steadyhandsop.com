import {supabase} from './supabase-client.js';

// Reuses the same deployed Square checkout system as Merci-Chi/viewyoursite.
// Each invocation creates a fresh customer-specific checkout link on the server.
// Never put a Square access token or fixed checkout link in browser code.
const PLAN_KEYS=Object.freeze({
  development:'website-development',
  standard:'standard-monthly',
  backend:'backend-monthly'
});
export async function createCustomerCheckout(kind,{agreementId}={}){
  if(!Object.hasOwn(PLAN_KEYS,kind))throw new Error('Unknown checkout plan.');
  if(!agreementId)throw new Error('A verified, finalized signed agreement is required before checkout.');
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)throw new Error('Please sign in to continue.');
  const {data,error}=await supabase.functions.invoke('square-subscriptions',{
    body:{
      action:'create-checkout',
      planKey:PLAN_KEYS[kind],
      agreementId,
      returnUrl:window.location.origin+window.location.pathname+'?square_checkout=return'
    }
  });
  if(error||!data?.checkoutUrl||!data?.checkoutId){let message=data?.message||error?.message||'Square checkout could not be created.';if(error?.context?.json){try{const body=await error.context.json();message=body?.message||message}catch{}}throw new Error(message)}
  const url=new URL(data.checkoutUrl);
  if(url.protocol!=='https:'||!/(^|\.)squareup\.com$/.test(url.hostname)&&!/(^|\.)square\.link$/.test(url.hostname))throw new Error('Square returned an unexpected checkout address.');
  return {checkoutUrl:url.href,checkoutId:data.checkoutId};
}
export async function verifyCustomerCheckout(checkoutId){
  if(!checkoutId)throw new Error('Missing checkout session.');
  const {data,error}=await supabase.functions.invoke('square-subscriptions',{
    body:{action:'verify-checkout',checkoutId}
  });
  if(error||data?.message)throw new Error(data?.message||error.message);
  return data?.verified===true;
}
