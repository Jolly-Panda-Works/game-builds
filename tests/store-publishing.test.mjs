import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import { validateApproval,approvedPayload,digest } from '../scripts/store-policy.mjs';
import { publishBazaar,publishMyket,readStoreStatus } from '../scripts/store-adapters.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'panda-publisher-')),file=path.join(dir,'test.apk');fs.writeFileSync(file,'fake-signed-bytes');
function fixture(mode='draft') {
  const r={id:'a'.repeat(24),game:'choo-choo-pop',repository:'Jolly-Panda-Works/choo-choo-pop',releaseId:1,tag:'stores-v1.0.0',version:'1.0.0',versionCode:1000000,sourceSha:'b'.repeat(40),appId:'com.jollypanda.choochoopop',asset:{id:2,name:'game-v1.0.0-bazaar.apk',sha256:'c'.repeat(64),size:17},store:'bazaar',notes:{fa:'تغییرات دقیق',en:'Exact changes'},mode,revision:1,approvedBy:'7',approvedAt:Date.now(),expiresAt:Date.now()+100000,status:'publishing',claim:'claim'};
  r.approvalDigest=digest(approvedPayload(r));return r;
}
const g={id:'choo-choo-pop',repository:'Jolly-Panda-Works/choo-choo-pop',enabled:true,storePublishing:{enabled:true,mode:'live',appId:'com.jollypanda.choochoopop'}};
test('approval policy binds the precise APK, text, owner and version',()=>{
  const r=fixture();validateApproval(r,g);
  for(const change of [x=>x.notes.fa+='changed',x=>x.asset.sha256='d'.repeat(64),x=>x.approvedBy=null,x=>x.versionCode++,x=>x.asset.name='standalone-debug.apk']) {
    const copy=structuredClone(r);change(copy);assert.throws(()=>validateApproval(copy,g));
  }
  assert.throws(()=>validateApproval(fixture('live'),{...g,storePublishing:{...g.storePublishing,mode:'draft'}}));
});
function mock(provider,draft=false) {
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(options.method==='GET')return Response.json(provider==='myket'?{releases:draft?[{status:'JustCreated',versionCode:1000000}]:[]}:{type:'error'});
    return Response.json({type:'success',package:{version_code:1000000}});
  };
  return {calls,fetchImpl};
}
test('Bazaar draft trial uploads APK but never commits or publishes',async()=>{
  const m=mock('bazaar');const result=await publishBazaar(fixture(),file,'fake-token',m);
  assert.equal(result.status,'draft-uploaded');assert.ok(m.calls.some(c=>c.url.endsWith('/upload/')));
  assert.ok(!m.calls.some(c=>c.url.endsWith('/commit/')));
});
test('Bazaar live sends exactly the approved notes and auto-publish after review',async()=>{
  const m=mock('bazaar'),r=fixture('live');await publishBazaar(r,file,'fake-token',m);
  const body=JSON.parse(m.calls.find(c=>c.url.endsWith('/commit/')).options.body);
  assert.equal(body.changelog_fa,r.notes.fa);assert.equal(body.changelog_en,r.notes.en);assert.equal(body.auto_publish,true);
});
test('Myket draft and live flows are distinct',async()=>{
  const r=fixture();r.store='myket';r.asset.name='game-v1.0.0-myket.apk';const a=mock('myket');
  assert.equal((await publishMyket(r,file,'fake-token',a)).status,'draft-uploaded');assert.ok(!a.calls.some(c=>c.url.endsWith('/commit')));
  r.mode='live';const b=mock('myket');await publishMyket(r,file,'fake-token',b);
  assert.equal(JSON.parse(b.calls.find(c=>c.url.endsWith('/commit')).options.body).isManualPublish,false);
  const notes=JSON.parse(b.calls.find(c=>c.options.method==='PUT'&&!c.url.endsWith('/upload')).options.body).translationInfos;
  assert.equal(notes[0].description,r.notes.fa);
});
test('an unrelated store draft is never silently deleted',async()=>{
  const r=fixture();r.store='myket';const m=mock('myket',true);
  await assert.rejects(publishMyket(r,file,'fake-token',m),/explicit replacement approval/);
  assert.ok(!m.calls.some(c=>c.options.method==='DELETE'));
});
test('replacement is allowed only for the exact snapshot explicitly approved by the owner',async()=>{
  const r=fixture(),m=mock('myket',true);r.store='myket';
  let replacement;
  try{await publishMyket(r,file,'fake-token',m);}catch(error){replacement=error.replacement;}
  assert.ok(replacement?.fingerprint);r.replaceDraft=replacement;
  const approved=mock('myket',true);await publishMyket(r,file,'fake-token',approved);
  assert.equal(approved.calls.filter(c=>c.options.method==='DELETE').length,1);
  r.replaceDraft.fingerprint='0'.repeat(64);
  const changed=mock('myket',true);await assert.rejects(publishMyket(r,file,'fake-token',changed));
  assert.ok(!changed.calls.some(c=>c.options.method==='DELETE'));
});
test('manual publication mode commits for review without automatic release in both stores',async()=>{
  const r=fixture('review');validateApproval(r,g);
  const a=mock('bazaar');await publishBazaar(r,file,'fake-token',a);
  assert.equal(JSON.parse(a.calls.find(c=>c.url.endsWith('/commit/')).options.body).auto_publish,false);
  const b=mock('myket');await publishMyket(r,file,'fake-token',b);
  assert.equal(JSON.parse(b.calls.find(c=>c.url.endsWith('/commit')).options.body).isManualPublish,true);
});
test('status reads never write and never confuse Myket approval with publication',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{calls.push(options.method);return Response.json({releases:[{title:'1.0.0',status:'Approved',packages:[{versionCode:1000000}]},{title:'0.9.0',status:'Published',packages:[{versionCode:9000}]}]});};
  const status=await readStoreStatus('myket','com.test.app','fake',{fetchImpl});
  assert.equal(status.published.version,'0.9.0');assert.equal(status.submitted.status,'Approved');assert.deepEqual(calls,['GET']);
  const bazaarCalls=[];
  const bazaar=await readStoreStatus('bazaar','com.test.app','fake',{fetchImpl:async(url,options)=>{bazaarCalls.push(options.method);return Response.json({type:'success',release:{packages:[{version_name:'1.2.3',version_code:1002003}]}});}});
  assert.equal(bazaar.published.version,'1.2.3');assert.equal(bazaar.draft.versionCode,1002003);assert.deepEqual(bazaarCalls,['GET','GET','GET']);
});
test('real store status variants: Bazaar not-exists and localized Myket statuses',async()=>{
  const empty=await readStoreStatus('bazaar','com.test.app','fake',{fetchImpl:async()=>Response.json({type:'not-exists',release:{}})});
  assert.equal(empty.published,null);assert.equal(empty.draft,null);
  const status=await readStoreStatus('myket','com.test.app','fake',{fetchImpl:async url=>{
    assert.ok(url.includes('offset=0'));
    return Response.json({releases:[{status:'در حال بررسی توسط ادمین',versionCode:1006001},{status:'منتشر شده',versionCode:1005000}]});
  }});
  assert.equal(status.published.versionCode,1005000);assert.equal(status.submitted.versionCode,1006001);assert.equal(status.publicationUnconfirmed,false);
});
