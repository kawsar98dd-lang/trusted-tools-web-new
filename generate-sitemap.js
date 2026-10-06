/**
 * Sitemap generator — Trusted Tools Web (Cloudflare Pages)
 *
 * Usage:  node generate-sitemap.js
 *         SITE_URL=https://example.com node generate-sitemap.js
 *
 * - Scans every .html page (index, pages/, tools/<category>/<tool>.html, any new category).
 * - Emits CLEAN URLs (no .html, no /index.html) — identical to each page's canonical URL.
 * - Domain comes from SITE_URL, else assets/js/site-config.js baseUrl (single source of truth).
 * - Skips partials/docs/assets, de-duplicates URLs, and verifies the tool count against
 *   assets/js/tools-data.js (warns on mismatch).
 */
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

function readBaseUrl() {
    if (process.env.SITE_URL) return process.env.SITE_URL;
    try {
        const cfg = fs.readFileSync(path.join(rootDir, 'assets/js/site-config.js'), 'utf8');
        const m = cfg.match(/baseUrl\s*:\s*["']([^"']+)["']/);
        if (m) return m[1];
    } catch (e) { /* fall through */ }
    return 'https://trustedtoolsweb.com';
}
const DOMAIN = readBaseUrl().replace(/\/+$/, '');

const IGNORE_DIRS = ['node_modules', '.git', 'assets', 'components', 'Documents File', 'functions'];
const IGNORE_FILES = ['404.html', 'readme.html', 'documentation.html', 'footer.html', 'header.html'];

const files = [];
(function walk(dir) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        if (d.name.startsWith('.') || IGNORE_DIRS.includes(d.name)) continue;
        const p = path.join(dir, d.name);
        if (d.isDirectory()) walk(p);
        else if (d.isFile() && d.name.endsWith('.html') && !IGNORE_FILES.includes(d.name)) files.push(p);
    }
})(rootDir);
files.sort();

const seen = new Set();
const entries = [];
for (const file of files) {
    // Only canonical, indexable pages belong in the sitemap
    try { if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(fs.readFileSync(file, 'utf8'))) continue; } catch (e) { /* ignore */ }
    let rel = path.relative(rootDir, file).replace(/\\/g, '/');
    if (rel === 'index.html') rel = '';
    else rel = rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
    const url = rel ? `${DOMAIN}/${rel}` : `${DOMAIN}/`;
    if (seen.has(url)) { console.warn('Duplicate skipped:', url); continue; }
    seen.add(url);

    let priority = '0.8', changefreq = 'monthly';
    if (rel === '') { priority = '1.0'; changefreq = 'weekly'; }
    else if (rel.startsWith('tools/')) { priority = '0.9'; changefreq = 'weekly'; }
    else if (rel.startsWith('pages/')) { priority = '0.7'; changefreq = 'yearly'; }

    let lastmod;
    try { lastmod = fs.statSync(file).mtime.toISOString(); } catch (e) { lastmod = new Date().toISOString(); }
    entries.push({ url, lastmod, changefreq, priority });
}

let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
for (const e of entries) {
    xml += `  <url>\n    <loc>${e.url}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>\n`;
}
xml += '</urlset>\n';
fs.writeFileSync(path.join(rootDir, 'sitemap.xml'), xml);

const toolCount = entries.filter(e => e.url.includes('/tools/')).length;
console.log(`sitemap.xml written: ${entries.length} URLs (${toolCount} tool pages) for ${DOMAIN}`);

// Cross-check with tools-data.js (best effort)
try {
    const data = fs.readFileSync(path.join(rootDir, 'assets/js/tools-data.js'), 'utf8');
    const n = (data.match(/^\s*link\s*:\s*["']tools\//gm) || []).length;
    if (n !== toolCount) console.warn(`WARNING: tools-data.js lists ${n} tools but ${toolCount} tool pages were found.`);
    else console.log(`OK: tools-data.js and tool pages agree (${n}).`);
} catch (e) { console.warn('Could not cross-check tools-data.js:', e.message); }
