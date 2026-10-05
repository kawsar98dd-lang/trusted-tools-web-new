#!/usr/bin/env node
/**
 * Optional browser smoke test (requires Playwright + a Chromium build; NOT used by production).
 *   node tests/browser-smoke.js [--only=substring] [--json=out.json]
 * Serves the project from a local static server (clean URLs like Cloudflare Pages), opens every
 * page, and records page errors, console errors and failed LOCAL requests. External hosts are
 * ignored (they may be unreachable in CI). It checks that pages load — not that each tool works.
 */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  else if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
(async () => {
  const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
  const jsonOut = (process.argv.find(a => a.startsWith('--json=')) || '').slice(7);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const tools = [...fs.readFileSync(path.join(ROOT, 'assets/js/tools-data.js'), 'utf8').matchAll(/^\s*link\s*:\s*["']([^"']+)["']/gm)].map(m => '/' + m[1].replace(/\.html$/, ''));
  const urls = ['/', '/pages/about', '/pages/contact', '/pages/privacy-policy', '/pages/terms', '/pages/disclaimer', ...tools].filter(u => !only || u.includes(only));
  const browser = await chromium.launch();
  const results = [];
  for (const u of urls) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const page = await ctx.newPage();
    const r = { url: u, pageErrors: [], consoleErrors: [], failedLocal: [], status: 0, hOverflow: false };
    page.on('pageerror', e => r.pageErrors.push(String(e.message).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') r.consoleErrors.push(m.text().slice(0, 200)); });
    page.on('response', resp => { if (resp.url().startsWith(origin) && resp.status() >= 400) r.failedLocal.push(resp.status() + ' ' + resp.url().slice(origin.length)); });
    page.on('requestfailed', rq => { if (rq.url().startsWith(origin)) r.failedLocal.push('FAILED ' + rq.url().slice(origin.length)); });
    try {
      const resp = await page.goto(origin + u, { waitUntil: 'load', timeout: 30000 });
      r.status = resp ? resp.status() : 0;
      await page.waitForTimeout(700);
      r.title = await page.title();
      r.hOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    } catch (e) { r.pageErrors.push('NAV: ' + e.message.slice(0, 160)); }
    await ctx.close();
    results.push(r);
  }
  await browser.close(); server.close();
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
  let bad = 0;
  for (const r of results) {
    const issues = r.pageErrors.length + r.failedLocal.length + (r.status !== 200 ? 1 : 0);
    if (issues) { bad++; console.log('ISSUE ' + r.url + ' status=' + r.status + '\n   ' + [...r.pageErrors.map(x => 'pageerror: ' + x), ...[...new Set(r.failedLocal)].map(x => 'req: ' + x)].slice(0, 6).join('\n   ')); }
  }
  console.log(`\nSMOKE: ${results.length} pages, ${results.length - bad} clean, ${bad} with issues; horizontal overflow @390px on ${results.filter(r => r.hOverflow).length}`);
  process.exit(bad ? 1 : 0);
})();
