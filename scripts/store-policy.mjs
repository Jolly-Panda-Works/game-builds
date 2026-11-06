import { createHash } from 'node:crypto';
export const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function approvedPayload(r) {
  return Object.fromEntries(['id','game','repository','releaseId','tag','version','versionCode','sourceSha','appId','asset','store','notes','mode','revision','approvedBy','approvedAt','priorDraftSha256','replaceDraft'].map(k=>[k,r[k]]));
}
export const digest=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export function validateApproval(r,g) {
  if(!g?.enabled||!g.storePublishing?.enabled||g.id!==r.game||g.repository!==r.repository||g.storePublishing.appId!==r.appId)throw Error('Game not enabled for store publication');
  if(!['draft','live'].includes(r.mode)||r.mode==='live'&&g.storePublishing.mode!=='live')throw Error('Live publication is disabled');
  if(!['bazaar','myket'].includes(r.store)||!r.asset.name.endsWith(`-${r.store}.apk`)||/debug/i.test(r.asset.name))throw Error('Debug or mismatched APK cannot be published');
  if(r.status!=='publishing'||!r.claim||!r.approvedBy||!Number.isFinite(r.approvedAt)||r.expiresAt<Date.now())throw Error('Missing or expired approval');
  if(!r.notes.fa.trim()||!r.notes.en.trim()||r.notes.fa.length>1500||r.notes.en.length>1500)throw Error('Invalid approved changelog');
  if(!/^\d+\.\d+\.\d+$/.test(r.version)||r.tag!==`stores-v${r.version}`||!/^[a-f0-9]{40}$/.test(r.sourceSha))throw Error('Invalid source identity');
  const [a,b,c]=r.version.split('.').map(Number);
  if(b>999||c>999||r.versionCode!==a*1000000+b*1000+c)throw Error('Invalid Android versionCode');
  if(r.approvalDigest!==digest(approvedPayload(r)))throw Error('Approved file or text was changed');
}
