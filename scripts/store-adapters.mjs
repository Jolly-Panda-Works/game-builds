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
    if(existing.type==='success'&&highest(existing.release)>=r.versionCode) return {status:'submitted',summary:'This versionCode is already submitted or published; no duplicate upload was made.'};
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
  await api('POST','commit/',{changelog_fa:r.notes.fa,changelog_en:r.notes.en,developer_note:`${r.version}; owner-approved request ${r.id}`,auto_publish:true,staged_rollout_percentage:100});
  return {status:'submitted',summary:'Sent for store review with the approved changelog; automatic publication after store approval is enabled.'};
}
export async function publishMyket(r,file,token,{fetchImpl=fetch}={}) {
  if(!token)throw Error('Missing MYKET_ACCESS_TOKEN');
  const api=client(`https://developer.myket.ir/api/partners/applications/${encodeURIComponent(r.appId)}/release-bundle`,{'X-Access-Token':token},fetchImpl);
  const list=await api('GET','?offset=1&limit=20');
  if(!Array.isArray(list.releases))throw Error('Unexpected Myket releases response');
  if(list.releases.some(x=>['WaitingForApproval','Approved'].includes(x.status)&&highest(x)>=r.versionCode)) return {status:'submitted',summary:'This versionCode is already submitted or published; no duplicate upload was made.'};
  const draft=list.releases.find(x=>x.status==='JustCreated');
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
  await api('POST','/commit',{isManualPublish:false,message:`${r.version}; owner-approved request ${r.id}`});
  return {status:'submitted',summary:'Sent for store review with the approved changelog; automatic publication after store approval is enabled.'};
}
