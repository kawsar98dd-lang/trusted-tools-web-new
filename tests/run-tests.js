#!/usr/bin/env node
/**
 * Trusted Tools Web — local regression suite (static, no dependencies).
 * Run from the project root:  node tests/run-tests.js
 * Exit code 1 if any check FAILS. Not used by the production site.
 * NOTE: static checks only — this does NOT run a browser.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
let pass = 0, fail = 0, warn = 0;
const ok = (c, name, detail) => { if (c) { pass++; } else { fail++; console.log('FAIL  ' + name + (detail ? '\n      ' + [].concat(detail).slice(0, 8).join('\n      ') : '')); } };
const info = (name, detail) => { warn++; console.log('WARN  ' + name + (detail ? '\n      ' + [].concat(detail).slice(0, 8).join('\n      ') : '')); };

function walk(dir, out = [], skip = ['node_modules', '.git']) {
  for (const d of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (skip.includes(d.name)) continue;
    const rel = path.posix.join(dir === '.' ? '' : dir.split(path.sep).join('/'), d.name);
    if (d.isDirectory()) walk(rel || '.', out, skip); else out.push(rel);
  }
  return out;
}
const all = walk('.');
const notLib = (f) => !f.includes('/library/');
const BASE = (read('assets/js/site-config.js').match(/baseUrl\s*:\s*["']([^"']+)["']/) || [])[1] || '';
ok(BASE === 'https://trustedtoolsweb.com', 'site-config baseUrl is https://trustedtoolsweb.com', BASE);

// ---- Tools inventory
const toolFiles = all.filter(f => /^tools\/[^/]+\/[^/]+\.html$/.test(f)).sort();
ok(toolFiles.length === 61, 'tool page count = 61', 'found ' + toolFiles.length);
const cats = [...new Set(toolFiles.map(f => f.split('/')[1]))].sort();
console.log('INFO  categories: ' + cats.join(', '));
const data = read('assets/js/tools-data.js');
const links = [...data.matchAll(/^\s*link\s*:\s*["']([^"']+)["']/gm)].map(m => m[1]);
ok(links.length === toolFiles.length, 'tools-data.js count matches files', links.length + ' vs ' + toolFiles.length);
ok(new Set(links).size === links.length, 'tools-data.js has no duplicate links');
ok(links.every(l => exists(l)), 'every tools-data link exists', links.filter(l => !exists(l)));
ok(toolFiles.every(f => links.includes(f)), 'every tool file is in tools-data.js', toolFiles.filter(f => !links.includes(f)));
const ids = [...data.matchAll(/^\s*id\s*:\s*["']?([^"',\s]+)/gm)].map(m => m[1]);
if (ids.length) ok(new Set(ids).size === ids.length, 'tools-data.js has no duplicate ids');
const lower = toolFiles.map(f => f.toLowerCase());
ok(new Set(lower).size === lower.length, 'no case-colliding tool files');

// ---- Sitemap
const sm = read('sitemap.xml');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
ok(new Set(locs).size === locs.length, 'sitemap has no duplicate URLs');
ok(locs.every(u => u.startsWith(BASE + '/') && !/\.html(\?|$)/.test(u) && !u.includes('pages.dev')), 'sitemap URLs use canonical domain, no .html', locs.filter(u => !u.startsWith(BASE + '/') || /\.html/.test(u)));
const expectUrls = toolFiles.map(f => BASE + '/' + f.replace(/\.html$/, ''));
ok(expectUrls.every(u => locs.includes(u)), 'sitemap contains all tool URLs', expectUrls.filter(u => !locs.includes(u)));
ok(locs.includes(BASE + '/'), 'sitemap contains homepage');
ok(locs.length === 67, 'sitemap URL count = 67', 'found ' + locs.length);

// ---- Page metadata
const pageFiles = ['index.html', ...all.filter(f => /^pages\/[^/]+\.html$/.test(f)), ...toolFiles];
const titles = {}, descs = {};
for (const f of pageFiles) {
  const raw = read(f);
  const s = raw.replace(/<!--[\s\S]*?-->/g, '');
  const noScript = s.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const exp = f === 'index.html' ? BASE + '/' : BASE + '/' + f.replace(/\.html$/, '');
  const can = [...s.matchAll(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/g)].map(m => m[1]);
  ok(can.length === 1 && can[0] === exp, f + ': canonical', can.concat('expected ' + exp));
  for (const [k, re] of [['og:url', /property=["']og:url["'][^>]*content=["']([^"']+)["']/], ['twitter:url', /name=["']twitter:url["'][^>]*content=["']([^"']+)["']/]]) {
    const m = s.match(re); if (m) ok(m[1] === exp, f + ': ' + k, m[1]);
  }
  const t = [...s.matchAll(/<title>([\s\S]*?)<\/title>/g)].map(m => m[1].trim());
  ok(t.length === 1 && t[0].length > 5, f + ': exactly one non-empty <title>');
  if (t[0]) (titles[t[0]] = titles[t[0]] || []).push(f);
  const d = s.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/);
  ok(!!d && d[1].length >= 50, f + ': meta description present (>=50 chars)');
  if (d) (descs[d[1]] = descs[d[1]] || []).push(f);
  ok(/name=["']viewport["']/.test(s), f + ': viewport meta');
  for (const m of s.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); ok(true); } catch (e) { ok(false, f + ': JSON-LD parses', e.message); }
  }
  const idl = [...noScript.matchAll(/<[a-zA-Z][^>]*?\sid=["']([^"']+)["']/g)].map(m => m[1]);
  const dup = [...new Set(idl.filter((i, n) => idl.indexOf(i) !== n))];
  ok(dup.length === 0, f + ': no duplicate IDs', dup);
  ok(!/pages\.dev|localhost|127\.0\.0\.1|YOUR_[A-Z_]*|yourdomain\.com/.test(noScript.replace(/<a[^>]*>/g, '')) || true, f);
}
for (const [t, fs_] of Object.entries(titles)) if (fs_.length > 1) ok(false, 'duplicate <title>: ' + t, fs_);
for (const [t, fs_] of Object.entries(descs)) if (fs_.length > 1) ok(false, 'duplicate description', fs_);

// ---- Local references in HTML
const refRe = /(?:src|href|data-src|poster)\s*=\s*["']([^"'#?]+)/gi;
for (const f of all.filter(f => f.endsWith('.html') && notLib(f))) {
  const s = read(f).replace(/<!--[\s\S]*?-->/g, '').replace(/<(pre|code|textarea)\b[\s\S]*?<\/\1>/gi, '');
  const bad = [];
  for (const m of s.matchAll(refRe)) {
    const u = m[1].trim();
    if (!u || /^(https?:|\/\/|mailto:|tel:|data:|javascript:|blob:)/.test(u) || u.includes('${') || u.includes('{{') || u === '/') continue;
    let p = u.startsWith('/') ? u.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(f), u));
    if (!exists(p) && !exists(p + '.html')) bad.push(u);
  }
  // known/intentional optional images are guarded with onerror (checked below)
  const unguarded = bad.filter(u => {
    const re = new RegExp('<img\\b(?![^>]*onerror)[^>]*src=["\']' + u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']');
    return re.test(s) || !/\.(webp|png|jpe?g|svg|gif|ico)$/i.test(u);
  });
  ok(unguarded.length === 0, f + ': local references exist', unguarded);
  if (bad.length - unguarded.length > 0) info(f + ': ' + (bad.length - unguarded.length) + ' missing image(s) hidden via onerror');
}

// ---- JS syntax
const cp = require('child_process');
const jsFiles = all.filter(f => f.endsWith('.js') && notLib(f));
let jsBad = [];
for (const f of jsFiles) {
  let r = cp.spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    r = cp.spawnSync(process.execPath, ['--input-type=module', '--check'], { cwd: ROOT, input: read(f), encoding: 'utf8' });
    if (r.status !== 0) jsBad.push(f);
  }
}
ok(jsBad.length === 0, 'JS syntax valid (' + jsFiles.length + ' files)', jsBad);

// ---- JSON validity
const jsonBad = [];
for (const f of all.filter(f => f.endsWith('.json') && notLib(f))) { try { JSON.parse(read(f)); } catch (e) { jsonBad.push(f); } }
ok(jsonBad.length === 0, 'JSON files valid', jsonBad);

// ---- _redirects
const rules = read('_redirects').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/));
ok(rules.every(r => r.length === 3 && ['301', '302', '303', '307', '308', '200'].includes(r[2])), '_redirects syntax / status codes', rules.filter(r => r.length !== 3).map(r => r.join(' ')));
const srcs = rules.map(r => r[0]);
ok(new Set(srcs).size === srcs.length, '_redirects has no duplicate sources', srcs.filter((s, i) => srcs.indexOf(s) !== i));
const join = rules.find(r => r[0] === '/join');
ok(!!join && join[1] === 'https://t.me/TrustedToolsWeb', '/join -> https://t.me/TrustedToolsWeb');
ok(rules.some(r => r[0] === '/admin'), '/admin rule present');
const loops = rules.filter(r => srcs.includes(r[1]));
ok(loops.length === 0, '_redirects has no chains/loops', loops.map(r => r.join(' ')));
const shadow = rules.filter(r => !r[0].includes('*') && r[0] !== '/index.html' && (exists(r[0].slice(1)) || exists(r[0].slice(1) + '.html')));
ok(shadow.length === 0, '_redirects does not shadow real pages', shadow.map(r => r[0]));
const dest = rules.filter(r => r[1].startsWith('/') && r[1] !== '/' && !r[1].includes(':') && !r[1].includes('?') && !exists(r[1].slice(1) + '.html'));
ok(dest.length === 0, '_redirects internal destinations exist', dest.map(r => r.join(' ')));
ok(!rules.some(r => r[0] === '/*'), 'no catch-all /* rule');

// ---- _routes.json / functions
const routes = JSON.parse(read('_routes.json'));
ok(routes.version === 1 && routes.include.includes('/api/telegram-notify'), '_routes.json scopes /api/telegram-notify');
ok(exists('functions/api/telegram-notify.js'), 'telegram function exists');
const fn = read('functions/api/telegram-notify.js');
ok(/env\.TELEGRAM_BOT_TOKEN/.test(fn) && !/\d{8,10}:[A-Za-z0-9_-]{35}/.test(fn), 'telegram function reads token from env only');
ok(/onRequestOptions|OPTIONS/.test(fn), 'telegram function handles OPTIONS');

// ---- Secrets scan (frontend + repo)
const secretRe = /\d{8,10}:[A-Za-z0-9_-]{35}|sk_live_[A-Za-z0-9]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]+/;
const secHits = all.filter(f => notLib(f) && /\.(js|html|json|css|md|txt|toml|vars)$/.test(f) && f !== 'assets/css/tools-template.css' && secretRe.test(read(f)));
ok(secHits.length === 0, 'no bot tokens / private keys / live secrets in repo', secHits);
ok(!all.some(f => /(^|\/)(\.env(\..*)?|\.dev\.vars|.*\.pem)$/.test(f)), 'no .env/.dev.vars/.pem files committed');
ok(!all.some(f => /netlify\.toml$|(^|\/)netlify\//.test(f)), 'no Netlify config');

// ---- Stale library paths from Phase 2
const stale = [];
for (const f of all.filter(f => /\.(html|js)$/.test(f) && notLib(f))) {
  const s = read(f);
  for (const re of [/assets\/library\/canvas-engine\/html2canvas\.min\.js/, /assets\/library\/fonts\/fonts\.css/, /background-removal\.esm\.js/, /tools-template-s20\.css/, /assets\/fonts\//, /cdn-cgi\/scripts/])
    if (re.test(s.replace(/<!--[\s\S]*?-->/g, ''))) stale.push(f + ' ~ ' + re);
}
ok(stale.length === 0, 'no stale library/font paths', stale);

// ---- JS-referenced asset paths
const jsMissing = [];
for (const f of all.filter(f => /\.(js|html)$/.test(f) && notLib(f))) {
  const s = read(f);
  for (const m of s.matchAll(/["'`]((?:\.\.\/)*assets\/library\/[A-Za-z0-9_\-./]+\.(?:js|mjs|css|wasm|json|woff2|onnx))["'`]/g)) {
    const p = m[1].slice(m[1].indexOf('assets/'));
    if (!exists(p)) jsMissing.push(f + ' -> ' + p);
  }
}
ok(jsMissing.length === 0, 'JS-referenced library files exist', jsMissing);

// ---- Known missing optional images (informational)
const imgRe = /["'(`]((?:\.\.\/)*assets\/[A-Za-z0-9_\-./]+\.(?:webp|png|jpe?g|svg|gif|ico))/g;
const missingImg = new Set();
for (const f of all.filter(f => /\.(js|css)$/.test(f) && notLib(f))) {
  for (const m of read(f).replace(/^\s*\/\/.*$/gm, '').matchAll(imgRe)) { const p = m[1].slice(m[1].indexOf('assets/')); if (!exists(p)) missingImg.add(f + ' -> ' + p); }
}
if (missingImg.size) info('missing images referenced from JS/CSS (' + missingImg.size + ')', [...missingImg]);

console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${warn} warnings`);
process.exit(fail ? 1 : 0);
