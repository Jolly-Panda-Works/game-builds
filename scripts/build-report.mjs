import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function makeReport(game, steps, release, build, version, lookupError = '') {
  const failed = Object.entries(steps).filter(([,s])=>s.outcome === 'failure').map(([id])=>id);
  const status = failed.length ? 'failed' : !release ? 'failed' : build === 'false' ? 'unchanged' : 'built';
  return {id:game.id,name:game.name || game.id,repository:game.repository,branch:game.branch,status,version:version || release?.tagName?.replace(/^stores-v/,''),failed,
    releaseUrl:release?.url || `https://github.com/${game.repository}/releases`,assets:release?.assets?.map(a=>({name:a.name,url:a.url})) || [],lookupError,
    runUrl:`${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`};
}
export function renderReports(reports) {
  const labels = {built:'✅ ساخته شد / Built',unchanged:'⏭️ قبلاً ساخته شده / Unchanged',failed:'❌ ناموفق / Failed',cancelled:'⚠️ لغو یا گزارش ناقص / Cancelled or missing report'};
  const safe = text => String(text || '').replace(/[|\r\n]/g,' ');
  const rows = reports.map(r => {
    const downloads = r.assets.filter(a=>/\.(apk|aab|zip)$/.test(a.name)).map(a=>`[${safe(a.name)}](${a.url})`).join('<br>') || `[Releases](${r.releaseUrl})`;
    return `| ${safe(r.name)} | ${labels[r.status]}${r.failed.length ? `<br>مرحله: ${r.failed.map(safe).join(', ')}` : ''} | ${safe(r.branch)} | ${safe(r.version) || '—'} | ${downloads} |`;
  });
  return `## وضعیت بیلد بازی‌ها / Android build results\n\n| بازی | وضعیت | شاخه | نسخه | دانلود خروجی |\n|---|---|---|---|---|\n${rows.join('\n')}\n\nفایل‌های Debug مخصوص آزمایش هستند. دانلود از ریپوهای خصوصی به ورود با حساب مجاز GitHub نیاز دارد. Unchanged یعنی APK جدیدی ساخته نشد؛ لینک‌ها خروجی قبلی همان سورس هستند. برای ساخت مجدد، Run workflow → rebuild=true (نسخهٔ جدید).\n\n${reports.filter(r=>r.lookupError).map(r=>`- ${safe(r.name)}: دریافت جزئیات دانلود ناموفق؛ لینک Releases را بررسی کنید.`).join('\n')}\n`;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const games = JSON.parse(fs.readFileSync('games.json'));
  if (process.argv.includes('--aggregate')) {
    const selected = JSON.parse(process.env.SELECTED_GAMES);
    const reports = selected.map(game => {
      const file = `reports/${game.id}.json`;
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : {id:game.id,name:game.name || game.id,branch:game.branch,status:'cancelled',failed:[],assets:[],releaseUrl:`https://github.com/${game.repository}/releases`};
    });
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,renderReports(reports));
    fs.writeFileSync('reports/all-games.json',JSON.stringify(reports,null,2));
  } else {
    const game = games.find(g=>g.id === process.env.GAME_ID), steps = JSON.parse(process.env.BUILD_STEPS);
    let release, lookupError = '';
    if(process.env.GH_TOKEN && process.env.RELEASE) {
      try { release = JSON.parse(execFileSync('gh',['release','view',process.env.RELEASE,'--repo',game.repository,'--json','url,tagName,assets'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})); }
      catch { lookupError = 'Release metadata unavailable'; }
    }
    const report = makeReport(game,steps,release,process.env.BUILD_REQUIRED,process.env.VERSION,lookupError);
    fs.mkdirSync('reports',{recursive:true}); fs.writeFileSync(`reports/${game.id}.json`,JSON.stringify(report,null,2));
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,renderReports([report]));
  }
}
