import fs from 'node:fs';
export function selectGames(registry, selected = 'all') {
  const ids = new Set(), repositories = new Set();
  for (const game of registry) {
    if (!/^[a-z0-9-]+$/.test(game.id) || !/^Jolly-Panda-Works\/[A-Za-z0-9_.-]+$/.test(game.repository) || !['main', 'Iranian-store'].includes(game.branch)) throw Error(`Invalid registration: ${game.id}`);
    if (ids.has(game.id) || repositories.has(game.repository.toLowerCase())) throw Error(`Duplicate registration: ${game.id}`);
    ids.add(game.id); repositories.add(game.repository.toLowerCase());
    if (game.builder && !['native', 'web'].includes(game.builder)) throw Error(`Unknown builder: ${game.id}`);
    if (game.builder === 'web' && (!/^com\.jollypanda\.[a-z][a-z0-9_]*$/.test(game.appId) || !['static', 'vite'].includes(game.webBuild))) throw Error(`Invalid web adapter: ${game.id}`);
  }
  const games = registry.filter(g => g.enabled && (selected === 'all' || selected === g.id));
  if (!games.length && selected !== 'all') throw Error(`No enabled registered game: ${selected}`);
  return games.map(g => ({...g, repositoryName: g.repository.split('/')[1]}));
}
if (process.argv[1]?.endsWith('build-plan.mjs')) {
  const games = selectGames(JSON.parse(fs.readFileSync('games.json')), process.env.GAME || 'all');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `games=${JSON.stringify(games)}\nhas_games=${games.length > 0}\n`);
}
