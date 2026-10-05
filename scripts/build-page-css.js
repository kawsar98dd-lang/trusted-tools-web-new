#!/usr/bin/env node
/**
 * Generates per-page CSS from the shared source assets/css/tools-template.css.
 *
 *   node scripts/build-page-css.js
 *
 * For every tool page that links ../../assets/css/tools-template.css, it keeps only the rules whose
 * class/id selectors can match something on that page. A class/id token counts as "used" if it
 * appears ANYWHERE in the page HTML, its local tool scripts, or the global scripts (assets/js/*.js),
 * or starts with a string-literal prefix used in those scripts (for classes built at runtime).
 * Original source order is preserved, so the cascade is unchanged. Output goes to
 * assets/css/pages/<category>/<tool>.css.
 *
 * Re-run after editing tools-template.css. Pages keep working without it only if their <link> points
 * at the generated file, so run it before every deploy that touches the shared CSS.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets/css/tools-template.css');
const OUT = path.join(ROOT, 'assets/css/pages');

/* ---------- CSS tokenizer: strips comments, splits top-level blocks ---------- */
function stripComments(css) {
  let out = '', i = 0, n = css.length;
  while (i < n) {
    const c = css[i];
    if (c === '"' || c === "'") { const q = c; let j = i + 1; while (j < n && css[j] !== q) { if (css[j] === '\\') j++; j++; } out += css.slice(i, j + 1); i = j + 1; continue; }
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    out += c; i++;
  }
  return out;
}
function skipString(s, i) { const q = s[i]; let j = i + 1; while (j < s.length && s[j] !== q) { if (s[j] === '\\') j++; j++; } return j; }
function parseBlocks(css) {
  const nodes = []; let i = 0; const n = css.length;
  while (i < n) {
    while (i < n && /\s/.test(css[i])) i++;
    if (i >= n) break;
    let j = i, paren = 0, brack = 0;
    for (; j < n; j++) {
      const c = css[j];
      if (c === '"' || c === "'") { j = skipString(css, j); continue; }
      if (c === '(') paren++; else if (c === ')') paren--; else if (c === '[') brack++; else if (c === ']') brack--;
      else if ((c === '{' || c === ';') && paren === 0 && brack === 0) break;
    }
    const prelude = css.slice(i, j).trim();
    if (j >= n) { if (prelude) nodes.push({ kind: 'stmt', text: prelude }); break; }
    if (css[j] === ';') { nodes.push({ kind: 'stmt', text: prelude }); i = j + 1; continue; }
    let depth = 1, k = j + 1;
    for (; k < n && depth > 0; k++) {
      const c = css[k];
      if (c === '"' || c === "'") { k = skipString(css, k); continue; }
      if (c === '{') depth++; else if (c === '}') depth--;
    }
    const body = css.slice(j + 1, k - 1);
    nodes.push({ kind: 'block', prelude, body });
    i = k;
  }
  return nodes;
}
function splitTop(sel) { // split by commas at depth 0
  const parts = []; let d = 0, cur = '';
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '"' || c === "'") { const e = skipString(sel, i); cur += sel.slice(i, e + 1); i = e; continue; }
    if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--;
    if (c === ',' && d === 0) { parts.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
function tokensOf(selector) {
  let s = selector, prev;
  do { prev = s; s = s.replace(/:{1,2}[\w-]+\([^()]*\)/g, ''); } while (s !== prev); // drop :not(..), :is(..), :nth-child(..) etc.
  s = s.replace(/\[[^\]]*\]/g, '');
  const toks = [];
  for (const m of s.matchAll(/([.#])((?:\\.|[\w-]|[^\x00-\x7F])+)/g)) toks.push(m[2].replace(/\\(.)/g, '$1'));
  return toks;
}

/* ---------- corpus building ---------- */
const read = (p) => fs.readFileSync(p, 'utf8');
const globalJs = fs.readdirSync(path.join(ROOT, 'assets/js')).filter(f => f.endsWith('.js')).map(f => read(path.join(ROOT, 'assets/js', f))).join('\n');
const globalCss = ['global.css', 'style.css'].map(f => path.join(ROOT, 'assets/css', f)).filter(fs.existsSync).map(read).join('\n'); // not used as corpus; kept for reference
function corpusFor(htmlPath) {
  const html = read(htmlPath);
  let text = html + '\n' + globalJs;
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)) {
    const u = m[1]; if (/^(https?:|\/\/)/.test(u) || u.includes('/library/')) continue;
    const p = path.normalize(path.join(path.dirname(htmlPath), u));
    if (fs.existsSync(p)) text += '\n' + read(p);
  }
  return text;
}
function prefixesOf(text) {
  const set = new Set();
  // any identifier ending in - or _ right before a closing quote or ${ (e.g. 'a b-' + x, `badge--${x}`)
  for (const m of text.matchAll(/([\w-]{2,}[-_])(?=['"`]|\$\{)/g)) set.add(m[1]);
  return [...set];
}

/* ---------- pruning ---------- */
function prune(nodes, ctx) {
  const out = [];
  for (const nd of nodes) {
    if (nd.kind === 'stmt') { out.push({ ...nd }); continue; }
    const p = nd.prelude;
    if (/^@(media|supports|layer|container)\b/i.test(p)) {
      const kids = prune(parseBlocks(nd.body), ctx);
      if (kids.length) out.push({ kind: 'block', prelude: p, children: kids });
    } else if (/^@(-webkit-)?keyframes\b/i.test(p)) {
      out.push({ kind: 'block', prelude: p, body: nd.body, keyframes: p.replace(/^@(-webkit-)?keyframes\s+/i, '').trim() });
    } else if (p.startsWith('@')) {
      out.push({ kind: 'block', prelude: p, body: nd.body });
    } else {
      const keep = splitTop(p).filter(sel => tokensOf(sel).every(t => ctx.used(t)));
      if (keep.length) out.push({ kind: 'block', prelude: keep.join(','), body: nd.body.trim() });
    }
  }
  return out;
}
function serialize(nodes, ctx, depth = 0) {
  let s = '';
  for (const nd of nodes) {
    if (nd.kind === 'stmt') s += nd.text + ';\n';
    else if (nd.children) { const inner = serialize(nd.children, ctx, depth + 1); if (inner.trim()) s += nd.prelude + '{\n' + inner + '}\n'; }
    else if (nd.keyframes !== undefined) { if (ctx.keyframeUsed(nd.keyframes)) s += nd.prelude + '{' + nd.body + '}\n'; }
    else s += nd.prelude + '{' + nd.body + '}\n';
  }
  return s;
}

/* ---------- main ---------- */
const source = stripComments(read(SRC));
const blocks = parseBlocks(source);
const pages = [];
(function walk(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p); else if (d.name.endsWith('.html')) pages.push(p);
  }
})(path.join(ROOT, 'tools'));
const LINK_RE = /(<link[^>]+href=["'])((?:\.\.\/)+)assets\/css\/(?:tools-template\.css|pages\/[^"']+\.css)(["'][^>]*>)/;
const LINK_RE_G = new RegExp(LINK_RE.source, 'g'); // replaces BOTH <link rel="stylesheet"> and <link rel="preload">
let totalIn = 0, totalOut = 0, count = 0; const report = [];
for (const page of pages.sort()) {
  let html = read(page);
  if (!LINK_RE.test(html)) continue;
  const corpus = corpusFor(page);
  const prefixes = prefixesOf(corpus);
  const ctx = {
    used: (t) => corpus.includes(t) || prefixes.some(p => t.startsWith(p)),
    keyframeUsed: null
  };
  const pruned = prune(blocks, ctx);
  // keyframes used if referenced by kept CSS text or by the page/scripts
  const keptText = JSON.stringify(pruned.filter(n => n.keyframes === undefined));
  ctx.keyframeUsed = (name) => keptText.includes(name) || corpus.includes(name);
  const css = '/* Generated by scripts/build-page-css.js from assets/css/tools-template.css — do not edit */\n' + serialize(pruned, ctx);
  const rel = path.relative(path.join(ROOT, 'tools'), page).replace(/\.html$/, '.css');
  const outFile = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, css);
  const hrefRel = '../../assets/css/pages/' + rel.split(path.sep).join('/');
  const newHtml = html.replace(LINK_RE_G, (m, a, dots, z) => a + hrefRel + z);
  if (newHtml !== html) fs.writeFileSync(page, newHtml);
  totalIn += Buffer.byteLength(source); totalOut += Buffer.byteLength(css); count++;
  report.push([path.relative(ROOT, page), Buffer.byteLength(css)]);
}
report.sort((a, b) => b[1] - a[1]);
console.log(`pages processed: ${count}`);
console.log(`source size: ${(Buffer.byteLength(source) / 1024).toFixed(0)} KB (comments stripped); per-page avg: ${(totalOut / count / 1024).toFixed(0)} KB; largest: ${report[0][0]} ${(report[0][1] / 1024).toFixed(0)} KB; smallest: ${report[report.length - 1][0]} ${(report[report.length - 1][1] / 1024).toFixed(0)} KB`);
