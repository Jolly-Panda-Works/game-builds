import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectGames} from '../scripts/build-plan.mjs';
import {allocateVersion} from '../scripts/resolve-build.mjs';
import {makeReport,renderReports} from '../scripts/build-report.mjs';
const registry = JSON.parse(fs.readFileSync(new URL('../games.json',import.meta.url)));
test('all actual games are registered, excluding template and disposable test',()=>{
  const games = selectGames(registry);
  assert.equal(games.length,11);
  assert(games.some(g=>g.id==='nostalgia-duel'));
  assert(!games.some(g=>/template|pipeline-test/.test(g.id)));
  assert.throws(()=>selectGames([...registry,registry[0]]),/Duplicate/);
  assert.throws(()=>selectGames(registry,'missing'),/No enabled/);
});
test('versions retain higher configured versions and increment past all historical releases',()=>{
  assert.equal(allocateVersion(['v1.6.6','stores-v1.6.7'],'1.0.0'),'1.6.8');
  assert.equal(allocateVersion(['stores-v1.6.7'],'2.0.0'),'2.0.0');
  assert.equal(allocateVersion(['stores-v1.6.7'],'1.0.0','minor'),'1.7.0');
  assert.throws(()=>allocateVersion(['stores-v1.1.999'],'1.0.0'),/Android range/);
});
test('success without a release cannot masquerade as a completed build; failed builds retain download links',()=>{
  const game=registry[0], release={tagName:'stores-v1.2.3',url:'https://github.com/test/releases/tag/stores-v1.2.3',assets:[{name:'game-debug.apk',url:'https://github.com/test/releases/download/stores-v1.2.3/game-debug.apk'}]};
  assert.equal(makeReport(game,{},undefined,'true','1.2.3').status,'failed');
  assert.equal(makeReport(game,{},release,'false','1.2.3').status,'unchanged');
  assert.equal(makeReport(game,{app:{outcome:'failure'}},undefined,'','').status,'blocked');
  const failed=makeReport(game,{compile:{outcome:'failure'}},release,'true','1.2.3');
  assert.equal(failed.status,'failed');
  const md=renderReports([failed]); assert.match(md,/compile/); assert.match(md,/\[game-debug.apk\]\(https:\/\//);
});
