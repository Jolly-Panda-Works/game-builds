import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const run = args => execFileSync('git', args, {cwd:'source', encoding:'utf8'}).trim();
export function allocateVersion(tags, base, bump = 'patch') {
  if (!/^\d+\.\d+\.\d+$/.test(base) || !['patch','minor','major'].includes(bump)) throw Error('Invalid version or bump');
  const parse = v => v.split('.').map(Number), compare = (a,b) => a[0]-b[0] || a[1]-b[1] || a[2]-b[2];
  const latest = tags.map(t => /^(?:stores-|bazaar-|myket-)?v(\d+\.\d+\.\d+)$/.exec(t)?.[1]).filter(Boolean).map(parse).sort(compare).at(-1);
  let result = parse(base);
  if (latest && compare(latest,result) >= 0) { result = [...latest]; const index = {major:0,minor:1,patch:2}[bump]; result[index]++; for(let i=index+1;i<3;i++) result[i]=0; }
  if (result[1]>999 || result[2]>999 || result[0]*1000000+result[1]*1000+result[2]>2100000000) throw Error('Version outside Android range');
  return result.join('.');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const game = JSON.parse(fs.readFileSync('games.json')).find(g => g.id === process.env.GAME_ID);
  const sha = run(['rev-parse','HEAD']);
  // Listing releases must succeed: a permission/API failure is not an absent release.
  const releases = execFileSync('gh',['api','--paginate',`repos/${game.repository}/releases?per_page=100`,'--jq','.[] | select(.draft == false) | .tag_name'],{encoding:'utf8'}).trim().split('\n');
  const tags = run(['tag','--list']).split('\n');
  const exact = run(['tag','--points-at','HEAD']).split('\n');
  const existing = releases.find(tag => /^stores-v\d+\.\d+\.\d+$/.test(tag) && exact.includes(tag));
  let base = game.version || '0.1.0';
  if(fs.existsSync('source/package.json')) base = JSON.parse(fs.readFileSync('source/package.json')).version || base;
  if(game.versionFile) { const data = JSON.parse(fs.readFileSync(`source/${game.versionFile}`)); base = game.versionPath.split('.').reduce((v,k)=>v[k],data); }
  const build = !existing || process.env.REBUILD === 'true';
  const version = build ? allocateVersion(tags,base,process.env.BUMP || 'patch') : existing.slice(8);
  const release = `stores-v${version}`;
  const config = game.builder === 'web' ? {name:game.name,slug:game.id.replaceAll('-',''),appId:game.appId,orientation:game.orientation || 'portrait',stores:[],web:true} : JSON.parse(fs.readFileSync('source/game.config.json'));
  if(game.builder === 'web') fs.writeFileSync('source/game.config.json',JSON.stringify(config,null,2)+'\n');
  const stores = game.editions || config.stores;
  fs.appendFileSync(process.env.GITHUB_OUTPUT,`sha=${sha}\nversion=${version}\nrelease=${release}\ntag=${release}\nbuild=${build}\nstores=${JSON.stringify([...stores.filter(s=>s!=='debug'),'debug'])}\n`);
}
