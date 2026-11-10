import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const game = JSON.parse(fs.readFileSync('games.json')).find(g => g.id === process.env.GAME_ID);
if (game?.builder !== 'web') throw Error('Not a registered web adapter');
const source = path.resolve('source'), runtime = path.resolve('.local/android-runtime');
const config = JSON.parse(fs.readFileSync(path.join(source,'game.config.json')));
const run = (cmd,args,cwd) => execFileSync(cmd,args,{cwd,stdio:'inherit'});
fs.mkdirSync(runtime,{recursive:true});
fs.writeFileSync(path.join(runtime,'package.json'),JSON.stringify({name:'central-android-wrapper',version:'1.0.0',private:true}));
run('npm',['install','--save-exact','@capacitor/core@8.6.0','@capacitor/cli@8.6.0','@capacitor/android@8.6.0'],runtime);
const web = path.join(runtime,'www'); fs.mkdirSync(web,{recursive:true});
if (game.webBuild === 'vite') {
  run('npm',['run','build','--','--base=./'],source);
  fs.cpSync(path.join(source,'dist'),web,{recursive:true});
} else {
  // Package tracked runtime files only; never copy .git, local credentials, archives or docs.
  const files = execFileSync('git',['ls-files','-z'],{cwd:source,encoding:'utf8'}).split('\0').filter(Boolean);
  for (const file of files) {
    if (!/\.(?:html?|css|js|mjs|json|png|jpe?g|webp|gif|svg|ico|avif|woff2?|ttf|otf|mp3|ogg|wav|mp4|webm|glb|gltf|bin)$/i.test(file) || /^(?:\.|docs\/|tests\/|scripts\/)/.test(file) || /(?:^|\/)(?:package(?:-lock)?\.json|AGENTS\.md|desktop\.ini)$/.test(file)) continue;
    const target = path.join(web,file); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.copyFileSync(path.join(source,file),target);
  }
}
if(!fs.existsSync(path.join(web,'index.html'))) throw Error('Web entry point missing');
fs.writeFileSync(path.join(runtime,'capacitor.config.json'),JSON.stringify({appId:config.appId,appName:config.name,webDir:'www'}));
run('npx',['cap','add','android'],runtime);
const android = path.join(runtime,'android'), gradleFile = path.join(android,'app/build.gradle');
const [major,minor,patch] = process.env.VERSION.split('.').map(Number);
let gradle = fs.readFileSync(gradleFile,'utf8').replace(/versionCode\s+\d+/,`versionCode ${major*1000000+minor*1000+patch}`).replace(/versionName\s+"[^"]*"/,`versionName "${process.env.VERSION}"`);
gradle += '\nandroid { buildTypes { debug { applicationIdSuffix ".debug"; versionNameSuffix "-debug" } } }\n';
fs.writeFileSync(gradleFile,gradle);
const manifestFile = path.join(android,'app/src/main/AndroidManifest.xml');
fs.writeFileSync(manifestFile,fs.readFileSync(manifestFile,'utf8').replace(/<activity\s+/,`<activity android:screenOrientation="${config.orientation}" `));
fs.chmodSync(path.join(android,'gradlew'),0o755);
run('./gradlew',['assembleDebug','--no-daemon'],android);
const out = path.join(source,'out'); fs.mkdirSync(out,{recursive:true});
fs.copyFileSync(path.join(android,'app/build/outputs/apk/debug/app-debug.apk'),path.join(out,`${config.slug}-v${process.env.VERSION}-standalone-debug.apk`));
run('zip',['-qr',path.join(out,`${config.slug}-v${process.env.VERSION}-web.zip`),'.'],web);
fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),fs.readdirSync(out).filter(n=>n!=='SHA256SUMS.txt').sort().map(n=>`${createHash('sha256').update(fs.readFileSync(path.join(out,n))).digest('hex')}  ${n}`).join('\n')+'\n');
