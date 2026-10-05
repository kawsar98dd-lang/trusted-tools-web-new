#!/usr/bin/env node
/**
 * Browser check for scripts/build-page-css.js: for each tool page, compares the computed style of
 * every element rendered with the generated per-page CSS vs. the full tools-template.css
 * (initial state, light-mode, 390px and 1280px). Requires Playwright + Chromium. Not used by production.
 *   node tests/css-equivalence.js [--only=substring]
 */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  else if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const SNAP = () => {
  const props = ['display','position','width','height','margin','padding','color','background-color','background-image','border','border-radius','font-size','font-weight','font-family','line-height','opacity','visibility','overflow','flex','grid-template-columns','transform','box-shadow','z-index','top','left','right','bottom','gap','text-align','justify-content','align-items','flex-direction','animation-name','content'];
  const out = [];
  document.querySelectorAll('body, body *').forEach((e, i) => {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(e.tagName)) return;
    const cs = getComputedStyle(e);
    out.push(i + ':' + e.tagName + (e.id ? '#' + e.id : '') + '|' + props.map(p => cs.getPropertyValue(p)).join('|'));
  });
  return out;
};
(async () => {
  const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const full = fs.readFileSync(path.join(ROOT, 'assets/css/tools-template.css'));
  const pages = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) pages.push(p); } })(path.join(ROOT, 'tools'));
  let checked = 0, bad = 0;
  for (const pf of pages.sort()) {
    const html = fs.readFileSync(pf, 'utf8');
    const m = html.match(/<link[^>]+rel=["']stylesheet["'][^>]*href=["'](?:\.\.\/)+(assets\/css\/pages\/[^"']+\.css)["']/);
    if (!m) continue;
    const url = '/' + path.relative(ROOT, pf).replace(/\.html$/, '');
    if (only && !url.includes(only)) continue;
    const results = []; let leaked = false;
    for (const mode of ['pruned', 'full']) {
      for (const vw of [390, 1280]) {
        const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await page.route('**/*', route => {
          const u = route.request().url();
          if (!u.startsWith(origin)) return route.abort();
          if (mode === 'pruned' && u.endsWith('/assets/css/tools-template.css')) { leaked = true; }
          if (mode === 'full' && u.endsWith('/' + m[1])) return route.fulfill({ status: 200, contentType: 'text/css', body: full });
          return route.continue();
        });
        await page.addInitScript(() => { Math.random = () => 0.5; });
        await page.goto(origin + url, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
        await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
        await page.waitForTimeout(500);
        const a = await page.evaluate(SNAP);
        await page.evaluate(() => document.body.classList.add('light-mode'));
        await page.waitForTimeout(150);
        const b = await page.evaluate(SNAP);
        results.push({ mode, vw, a, b });
        await ctx.close();
      }
    }
    let diffs = [];
    for (const vw of [390, 1280]) {
      const P = results.find(r => r.mode === 'pruned' && r.vw === vw), F = results.find(r => r.mode === 'full' && r.vw === vw);
      for (const st of ['a', 'b']) {
        const n = Math.max(P[st].length, F[st].length);
        for (let i = 0; i < n; i++) if (P[st][i] !== F[st][i]) { diffs.push(`${vw}px ${st === 'a' ? 'dark' : 'light'}: ${(F[st][i] || '').split('|')[0]}`); }
      }
    }
    checked++;
    if (leaked) { bad++; console.log('LEAK ' + url + ': page still requests full tools-template.css'); continue; }
    if (diffs.length) { bad++; console.log('DIFF ' + url + ' (' + diffs.length + ')\n   ' + [...new Set(diffs)].slice(0, 5).join('\n   ')); }
  }
  await browser.close(); server.close();
  console.log(`CSS-EQUIVALENCE: ${checked} pages checked, ${checked - bad} identical, ${bad} with differences`);
  process.exit(bad ? 1 : 0);
})();
