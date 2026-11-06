import { openAsBlob } from 'node:fs';
import { digest } from './store-policy.mjs';
function replacement(draft) {
  const error=Error('An existing store draft needs explicit replacement approval in Telegram.');
  error.replacement={fingerprint:digest(draft),versionCode:highest(draft)};return error;
}
const codes=value=>{
  const found=[];
  if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)) {
    if(/^version_?code$/i.test(k)&&Number.isFinite(Number(v)))found.push(Number(v));
    else if(v&&typeof v==='object')found.push(...codes(v));
  }
  return found;
};
const highest=value=>Math.max(0,...codes(value));
const state=x=>String(x?.status||'').trim().replaceAll('ي','ی').replaceAll('ك','ک');
const isPublished=x=>['Published','منتشر شده','منتشرشده','انتشار یافته'].includes(state(x));
const isDraft=x=>['JustCreated','پیش نویس','پیش‌نویس','ایجاد شده'].includes(state(x));
function identity(value) {
  let version;
  const walk=x=>{
    if(!x||typeof x!=='object')return;
    for(const [key,v]of Object.entries(x)) {
      if(/^version_?name$/i.test(key)&&typeof v==='string')version=v;
      else if(v&&typeof v==='object')walk(v);
    }
  };walk(value);
  const code=highest(value);
  return {version:version||(/^\d+\.\d+\.\d+$/.test(value?.title||'')?value.title:null),versionCode:code||null,status:String(value?.status||'')};
}
export async function readStoreStatus(store,appId,token,{fetchImpl=fetch}={}) {
  if(!token)throw Error(`Missing ${store} API credential`);
  if(store==='bazaar') {
    const api=client('https://api.pishkhan.cafebazaar.ir/v1/apps/releases/',{'CAFEBAZAAR-PISHKHAN-API-SECRET':token},fetchImpl);
    const result={};
    for(const [field,path]of Object.entries({published:'last-published/',submitted:'last-committed/',draft:'last-uncommitted/'})) {
      const data=await api('GET',path);
      if(data.type==='success'&&data.release)result[field]=identity(data.release);
      else if(data.type==='not-exists'||['error','success'].includes(data.type)&&data.release==null)result[field]=null;
      else throw Error(`Unexpected Bazaar ${field} response (type=${String(data.type)}, fields=${Object.keys(data).join(',')}, release=${data.release===null?'null':typeof data.release})`);
    }
    return result;
  }
  if(store!=='myket')throw Error('Unsupported store');
  const api=client(`https://developer.myket.ir/api/partners/applications/${encodeURIComponent(appId)}/release-bundle`,{'X-Access-Token':token},fetchImpl);
  const data=await api('GET','?offset=0&limit=20');
  if(!Array.isArray(data.releases))throw Error('Unexpected Myket releases response');
  const rows=data.releases.slice().sort((a,b)=>highest(b)-highest(a));
  // Approved is not proof of publication: manual-release bundles can remain approved.
  const published=rows.find(isPublished),submitted=rows.find(x=>!isDraft(x)&&!isPublished(x)),draft=rows.find(isDraft);
  return {published:published?identity(published):null,submitted:submitted?identity(submitted):null,draft:draft?identity(draft):null,publicationUnconfirmed:!published};
}
function client(base,headers,fetchImpl) {
  return async(method,path='',body)=>{
    for(let attempt=0;attempt<4;attempt++) {
      const form=body instanceof FormData;
      const response=await fetchImpl(base+path,{method,headers:{...headers,...(body&&!form?{'Content-Type':'application/json'}:{})},...(body?{body:form?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(180000)});
      let json={};try{json=await response.json();}catch{/* error text is deliberately not logged: it can contain API internals */}
      if(response.status===429&&attempt<3){await new Promise(r=>setTimeout(r,1000*2**attempt));continue;}
      if(!response.ok)throw Error(`Store API ${method} ${path||'/'} failed: HTTP ${response.status}`);
      if(method!=='GET'&&(json.type==='error'||json.success===false||json.isSuccess===false))throw Error(`Store API ${method} ${path||'/'} rejected the operation`);
      return json;
    }
  };
}
export async function publishBazaar(r,file,token,{fetchImpl=fetch}={}) {
  if(!token)throw Error('Missing BAZAAR_PISHKHAN_TOKEN');
  const api=client('https://api.pishkhan.cafebazaar.ir/v1/apps/releases/',{'CAFEBAZAAR-PISHKHAN-API-SECRET':token},fetchImpl);
  for(const endpoint of ['last-committed/','last-published/']) {
    const existing=await api('GET',endpoint);
    if(existing.type==='success'&&highest(existing.release)>=r.versionCode) throw Error('Bazaar already has this or a newer versionCode submitted/published. No upload or publication-setting change was made; check current store status.');
  }
  const existing=await api('GET','last-uncommitted/');
  const resume=existing.type==='success'&&highest(existing.release)===r.versionCode&&r.priorDraftSha256===r.asset.sha256;
  if(existing.type==='success'&&!resume) {
    if(r.replaceDraft?.fingerprint!==digest(existing.release))throw replacement(existing.release);
    await api('DELETE');
  }
  if(!resume) {
    await api('POST');
    const form=new FormData();form.append('architecture','all');form.append('apk',await openAsBlob(file,{type:'application/vnd.android.package-archive'}),r.asset.name);
    const result=await api('POST','upload/',form);
    if(result.package&&Number(result.package.version_code)!==r.versionCode)throw Error('Bazaar uploaded versionCode mismatch');
  }
  if(r.mode==='draft')return {status:'draft-uploaded',summary:'Signed APK uploaded as a draft. No review or public publication was requested.'};
  await api('POST','commit/',{changelog_fa:r.notes.fa,changelog_en:r.notes.en,developer_note:`${r.version}; owner-approved request ${r.id}`,auto_publish:r.mode==='live',staged_rollout_percentage:100});
  return {status:'submitted',summary:r.mode==='live'?'Sent for store review; automatic publication after store approval is enabled.':'Sent for store review; manual publication after approval is required in the store dashboard.'};
}
export async function publishMyket(r,file,token,{fetchImpl=fetch}={}) {
  if(!token)throw Error('Missing MYKET_ACCESS_TOKEN');
  const api=client(`https://developer.myket.ir/api/partners/applications/${encodeURIComponent(r.appId)}/release-bundle`,{'X-Access-Token':token},fetchImpl);
  const list=await api('GET','?offset=0&limit=20');
  if(!Array.isArray(list.releases))throw Error('Unexpected Myket releases response');
  if(list.releases.some(x=>!isDraft(x)&&highest(x)>=r.versionCode)) throw Error('Myket already has this or a newer versionCode in a non-draft state. No upload or publication-setting change was made; check current store status.');
  const draft=list.releases.find(isDraft);
  const resume=draft&&highest(draft)===r.versionCode&&r.priorDraftSha256===r.asset.sha256;
  if(draft&&!resume) {
    if(r.replaceDraft?.fingerprint!==digest(draft))throw replacement(draft);
    await api('DELETE');
  }
  await api('PUT','',{title:r.version,stagedRolloutPercent:100,translationInfos:[{language:'fa',description:r.notes.fa},{language:'en',description:r.notes.en}]});
  if(!resume) {
    const form=new FormData();form.append('',await openAsBlob(file,{type:'application/vnd.android.package-archive'}),r.asset.name);
    await api('PUT','/upload',form);
  }
  if(r.mode==='draft')return {status:'draft-uploaded',summary:'Signed APK and changelog uploaded as a draft. No review or public publication was requested.'};
  await api('POST','/commit',{isManualPublish:r.mode==='review',message:`${r.version}; owner-approved request ${r.id}`});
  return {status:'submitted',summary:r.mode==='live'?'Sent for store review; automatic publication after store approval is enabled.':'Sent for store review; manual publication after approval is required in the store dashboard.'};
}
