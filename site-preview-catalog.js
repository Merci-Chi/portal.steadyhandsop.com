// Public preview catalog: every website entry point under Steadyhandsop/sites/.
// GitHub Pages does not provide directory listings, so use the public repository tree.
const TREE_URL='https://api.github.com/repos/Merci-Chi/Steadyhandsop/git/trees/main?recursive=1';
const RAW_ROOT='https://raw.githubusercontent.com/Merci-Chi/Steadyhandsop/main/';
const SITE_ROOT='https://steadyhandsop.com/sites/';
const CACHE_KEY='steadyhands.public-sites.v1';
const CACHE_TTL=5*60*1000;
const known={
 '24hrtireservice':{site_key:'24HRTIRESERVICE',site_title:'24 HR Mobile Tire Service'},
 debbyscrew:{site_key:'DEBBYSCREW',site_title:"Debby's Crew LLC"},
 greenhousewaterheaters:{site_key:'SHS-GHWH26M9R7Q2',site_title:'Greenhouse Water Heaters'}
};
let pending=null;
function record(folder,title){return {site_key:known[folder]?.site_key||folder.toUpperCase(),site_title:title||known[folder]?.site_title||folder.replace(/[-_]+/g,' '),preview_url:SITE_ROOT+encodeURIComponent(folder)+'/'}}
async function fetchWithTimeout(url,ms){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
 try{const response=await fetch(url,{signal:controller.signal,credentials:'omit'});if(!response.ok)throw new Error('Preview catalog is temporarily unavailable.');return response}finally{clearTimeout(timer)}
}
export function foldersFromTree(tree){
 if(tree?.truncated===true||!Array.isArray(tree?.tree))throw new Error('Preview catalog could not be fully loaded.');
 return [...new Set(tree.tree.filter(item=>item.type==='blob').map(item=>/^sites\/([^/]+)\/index\.html?$/i.exec(item.path||'')?.[1]).filter(Boolean))].sort();
}
async function readCatalog(){
 let stale=null;
 try{
  const cached=JSON.parse(sessionStorage.getItem(CACHE_KEY)||'null');
  if(cached&&Array.isArray(cached.folders)&&cached.folders.every(f=>typeof f==='string'&&f&&!['.','..'].includes(f)&&!/[\/\\]/.test(f))){
   stale=cached.folders.map(f=>record(f,cached.titles?.[f]));
   if(Date.now()-cached.savedAt<CACHE_TTL)return stale;
  }
 }catch{}
 try{
  const response=await fetchWithTimeout(TREE_URL,6000);
  const folders=foldersFromTree(await response.json());
  const entries=await Promise.all(folders.map(async folder=>{
   if(known[folder])return record(folder);
   // Titles for newly added previews come from inert HTML parsing, never execution.
   try{
    const response=await fetchWithTimeout(RAW_ROOT+'sites/'+encodeURIComponent(folder)+'/index.html',2500);
    const page=new DOMParser().parseFromString(await response.text(),'text/html');
    const title=page.querySelector('title')?.textContent?.split('|')[0].trim();
    return record(folder,title?.slice(0,160));
   }catch{return record(folder)}
  }));
  try{sessionStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),folders,titles:Object.fromEntries(folders.map((f,i)=>[f,entries[i].site_title]))}))}catch{}
  return entries;
 }catch(error){
  console.warn('Using the last available Sites preview catalog.',error);
  // Keep the currently published previews available if GitHub is temporarily unreachable.
  return stale||Object.keys(known).map(f=>record(f));
 }
}
export function getSitePreviews(){
 if(!pending)pending=readCatalog().finally(()=>{pending=null});
 return pending;
}
