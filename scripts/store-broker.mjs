import { createHmac } from 'node:crypto';
import fs from 'node:fs';
export async function broker(route,payload) {
  const base=process.env.STORE_APPROVAL_URL,secret=process.env.STORE_APPROVAL_SECRET;
  if(!base||!secret)throw Error('Store approval broker is not configured');
  const url=new URL(`/store-publish/${route}`,base),method=payload===undefined?'GET':'POST',body=payload===undefined?'':JSON.stringify(payload),time=String(Math.floor(Date.now()/1000));
  const signature=createHmac('sha256',secret).update(`${method}\n${url.pathname}\n${time}\n${body}`).digest('hex');
  const r=await fetch(url,{method,headers:{'X-Store-Time':time,'X-Store-Signature':signature,'Content-Type':'application/json'},...(body?{body}:{}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error(`Approval broker ${route}: HTTP ${r.status}`);return r.json();
}
if(process.argv[1]?.endsWith('store-broker.mjs')) {
  const op=process.argv[2];fs.mkdirSync('.local',{recursive:true});
  if(op==='poll') {
    const pending=await broker('approved');
    const games=JSON.parse(fs.readFileSync('games.json','utf8'));
    // Direct dispatch carries only a hint: the authenticated claim still proves owner approval.
    // This avoids a newly-written KV key being absent from an eventually-consistent list.
    if(/^[a-f0-9]{24}$/.test(process.env.REQUEST_ID||'')&&games.some(g=>g.id===process.env.APPROVAL_GAME&&g.enabled&&g.storePublishing?.enabled))pending.push({id:process.env.REQUEST_ID,game:process.env.APPROVAL_GAME});
    const requests=[...new Map(pending.filter(r=>/^[a-f0-9]{24}$/.test(r.id)&&games.some(g=>g.id===r.game&&g.enabled&&g.storePublishing?.enabled)).map(r=>[r.id,{id:r.id,game:r.game}])).values()];
    fs.appendFileSync(process.env.GITHUB_OUTPUT,`requests=${JSON.stringify(requests)}\nhas_requests=${requests.length>0}\n`);
    const status=await broker('status-pending');
    const status_games=[...new Set([...status.map(r=>r.game),process.env.STATUS_GAME].filter(id=>games.some(g=>g.id===id&&g.enabled&&g.storePublishing?.enabled)))];
    fs.appendFileSync(process.env.GITHUB_OUTPUT,`status_games=${JSON.stringify(status_games)}\nhas_status=${status_games.length>0}\n`);
  } else if(op==='offer') {
    await broker('offer',{repository:process.env.SOURCE_REPOSITORY,releaseId:Number(process.env.RELEASE_ID)});
  } else if(op==='claim') {
    let r;
    for(let attempt=0;attempt<19;attempt++) {
      try {r=await broker('claim',{id:process.env.REQUEST_ID,runId:process.env.GITHUB_RUN_ID});break;}
      catch(error) {
        if(!/HTTP (404|409)$/.test(error.message)||attempt===18)throw error;
        await new Promise(resolve=>setTimeout(resolve,5000));
      }
    }
    const games=JSON.parse(fs.readFileSync('games.json','utf8')),g=games.find(g=>g.enabled&&g.storePublishing?.enabled&&g.id===r.game&&g.repository===r.repository);
    if(!g||r.game!==process.env.GAME_ID)throw Error('Unregistered claim');
    fs.writeFileSync('.local/store-request.json',JSON.stringify(r),{mode:0o600});
    fs.appendFileSync(process.env.GITHUB_OUTPUT,`repository_name=${g.repository.split('/')[1]}\n`);
  } else if(op==='result') {
    if(!fs.existsSync('.local/store-request.json'))process.exit(0);
    const r=JSON.parse(fs.readFileSync('.local/store-request.json','utf8'));
    const result=fs.existsSync('.local/store-result.json')?JSON.parse(fs.readFileSync('.local/store-result.json','utf8')):{status:'failed',summary:'Publisher validation or upload failed; inspect the Actions run.'};
    await broker('result',{id:r.id,claim:r.claim,runId:process.env.GITHUB_RUN_ID,...result});
  } else throw Error('Unknown broker operation');
}
