import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateApproval } from './store-policy.mjs';
import { publishBazaar,publishMyket } from './store-adapters.mjs';
const r=JSON.parse(fs.readFileSync('.local/store-request.json','utf8'));
try {
  const g=JSON.parse(fs.readFileSync('games.json','utf8')).find(g=>g.id===r.game);
  validateApproval(r,g);
  const gh=async p=>{
    const response=await fetch(`https://api.github.com${p}`,{headers:{Authorization:`Bearer ${process.env.SOURCE_READ_TOKEN}`,'User-Agent':'panda-store-publisher',Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`Source API: HTTP ${response.status}`);return response.json();
  };
  const base=`/repos/${r.repository}`;
  const latest=await gh(`${base}/releases/latest`);
  if(latest.id!==r.releaseId||latest.tag_name!==r.tag||latest.draft||latest.prerelease)throw Error('Release is stale or not publishable');
  const a=latest.assets.find(a=>a.id===r.asset.id&&a.name===r.asset.name&&a.size===r.asset.size);
  if(!a)throw Error('Approved APK was replaced or removed');
  const response=await fetch(`https://api.github.com${base}/releases/assets/${a.id}`,{headers:{Authorization:`Bearer ${process.env.SOURCE_READ_TOKEN}`,'User-Agent':'panda-store-publisher',Accept:'application/octet-stream'},signal:AbortSignal.timeout(180000)});
  if(!response.ok)throw Error(`APK download: HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length!==r.asset.size||createHash('sha256').update(bytes).digest('hex')!==r.asset.sha256)throw Error('Approved APK checksum mismatch');
  const file=path.resolve('.local/approved.apk');fs.writeFileSync(file,bytes,{mode:0o600});
  const tools=fs.readdirSync(path.join(process.env.ANDROID_HOME,'build-tools')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).at(-1);
  const dir=path.join(process.env.ANDROID_HOME,'build-tools',tools);
  execFileSync(path.join(dir,'apksigner'),['verify',file],{stdio:'pipe'});
  const info=execFileSync(path.join(dir,'aapt'),['dump','badging',file],{encoding:'utf8'});
  if(!info.includes(`package: name='${r.appId}'`)||!info.includes(`versionCode='${r.versionCode}'`)||info.includes('application-debuggable'))throw Error('APK application id, version or release signing is invalid');
  if(process.env.STORE_VALIDATE_ONLY==='true') {
    console.log('Approved APK, changelog digest, package and version validated. No store API was called.');
    process.exit(0);
  }
  const result=r.store==='bazaar'?await publishBazaar(r,file,process.env.BAZAAR_PISHKHAN_TOKEN):await publishMyket(r,file,process.env.MYKET_ACCESS_TOKEN);
  // Even a store's already-published response must not imply a draft was uploaded.
  if(r.mode==='draft'&&result.status==='submitted')throw Error('Store already has this versionCode; the draft request was not uploaded.');
  fs.writeFileSync('.local/store-result.json',JSON.stringify(result));
  console.log(result.summary);
} catch(error) {
  fs.writeFileSync('.local/store-result.json',JSON.stringify({status:'failed',summary:String(error.message).slice(0,700),...(error.replacement?{replacement:error.replacement}:{})}));
  throw error;
}
