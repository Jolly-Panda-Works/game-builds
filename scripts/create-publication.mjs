import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const arg=n=>process.argv[process.argv.indexOf(`--${n}`)+1];
const game=JSON.parse(fs.readFileSync('games.json','utf8')).find(g=>g.id===arg('game')&&g.enabled);
if(!game) throw Error('Unknown registered game');
if(!game.storePublishing?.enabled) process.exit(0);
const source=path.resolve(arg('source')),out=path.resolve(arg('out')),version=arg('version');
if(!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid version');
const c=JSON.parse(fs.readFileSync(path.join(source,'game.config.json'),'utf8'));
if(c.appId!==game.storePublishing.appId) throw Error('Publication application id mismatch');
const [major,minor,patch]=version.split('.').map(Number),versionCode=major*1000000+minor*1000+patch;
const sourceSha=execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
let notes={fa:'',en:''};
for(const file of ['store-release-notes.json','apps/mobile/bazaar-release-notes.json']) {
  const p=path.join(source,file);if(!fs.existsSync(p))continue;
  const n=JSON.parse(fs.readFileSync(p,'utf8'));if(n.version===version) notes={fa:String(n.fa||'').slice(0,1500),en:String(n.en||'').slice(0,1500)};
}
if(!notes.fa&&!notes.en) {
  const tag=execFileSync('git',['-C',source,'tag','--list','stores-v*','--sort=-v:refname'],{encoding:'utf8'}).trim().split('\n')[0];
  const subjects=execFileSync('git',['-C',source,'log',...(tag?[`${tag}..HEAD`]:['-8']),'--format=%s'],{encoding:'utf8'}).trim().split('\n').filter(s=>s&&!/^(chore|build|ci|docs|test|merge)(?:\b|\()/i.test(s)).slice(0,6);
  notes.fa=subjects.filter(s=>/[\u0600-\u06ff]/.test(s)).map(s=>`• ${s}`).join('\n').slice(0,1500);
  notes.en=subjects.filter(s=>!/[\u0600-\u06ff]/.test(s)).map(s=>`• ${s}`).join('\n').slice(0,1500);
}
const assets=[];
for(const store of ['bazaar','myket']) {
  const files=fs.readdirSync(out).filter(n=>n.endsWith(`-${store}.apk`)&&!/debug/i.test(n));
  if(files.length!==1) continue;
  const name=files[0],bytes=fs.readFileSync(path.join(out,name));
  assets.push({store,name,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
if(!assets.length) process.exit(0);
fs.writeFileSync(path.join(out,'store-publication.json'),JSON.stringify({schema:1,version,versionCode,sourceSha,appId:c.appId,notes,assets},null,2)+'\n');
// Include the approval manifest in the same release's integrity file.
fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),fs.readdirSync(out).filter(n=>n!=='SHA256SUMS.txt').sort().map(n=>`${createHash('sha256').update(fs.readFileSync(path.join(out,n))).digest('hex')}  ${n}`).join('\n')+'\n');
console.log('Publication manifest prepared; store APIs were not called.');
