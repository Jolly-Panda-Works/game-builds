import fs from 'node:fs';
import { broker } from './store-broker.mjs';
import { readStoreStatus } from './store-adapters.mjs';
const game=JSON.parse(fs.readFileSync('games.json','utf8')).find(g=>g.enabled&&g.storePublishing?.enabled&&g.id===process.env.GAME_ID);
if(!game)throw Error('Status game is not enabled');
const checkedAt=Date.now(),stores={};
for(const store of ['bazaar','myket']) {
  try {stores[store]=await readStoreStatus(store,game.storePublishing.appId,process.env[store==='bazaar'?'BAZAAR_PISHKHAN_TOKEN':'MYKET_ACCESS_TOKEN']);}
  catch(error){stores[store]={error:String(error.message).slice(0,200)};}
}
await broker('status-result',{game:game.id,checkedAt,stores});
console.log(`Store status refreshed for ${game.id}; errors: ${Object.values(stores).filter(s=>s.error).length}`);
