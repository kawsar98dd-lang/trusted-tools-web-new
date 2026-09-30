/**
 * COOKIE CONVERTER PRO MAX — script.js  v3.1
 * Author: MD KAWSAR | Trusted Tools Web
 *
 * v3.1 changes
 *  FIX  : #HttpOnly_ cookies got the wrong domain flag (FALSE) in Netscape output
 *  FIX  : sanitize() no longer strips "javascript:" / <script> from cookie values
 *  FIX  : format detection is safer (JSON only if it is not tab-separated text)
 *  FIX  : Bulk Domain Modifier now does substring replace (matches the docs)
 *  FIX  : one shared load/commit path -> every tool sanitizes/parses the same way
 *  NEW  : Remove Duplicates, Sort Cookies, Copy as "Cookie:" header string
 */
class CookieConverterEngine {

    constructor() {
        const $ = id => document.getElementById(id);
        this.$ = $;
        this.inputBox = $('inputBox');
        this.outputBox = $('outputBox');
        this.advToggleBtn = $('btnAdvToggle');
        this.advContent = $('cckAdvContent');
        this.domainFind = $('domainFind');
        this.domainReplace = $('domainReplace');
        this.toggleMinifyCheckbox = $('toggleMinify');
        this.isMinified = false;
        this.initEventListeners();
    }

    /* ---------- helpers ---------- */

    toast(msg, err = false) { window.showToast(msg, err); }

    /** Replace only typographic quotes (safe for JSON structure). */
    fixQuotes(s) {
        return s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
    }

    /** JSON if it starts with [ or { and the first line is not tab-separated. */
    isJson(val) {
        return /^[\[{]/.test(val) && !/\t/.test(val.split(/\r?\n/)[0]);
    }

    serializeJson(data) {
        return this.isMinified ? JSON.stringify(data) : JSON.stringify(data, null, 4);
    }

    /** Parse the input box into a cookie array. Returns {cookies, wasJson} or null. */
    load(emptyMsg = "No cookie data in the input box.") {
        const val = this.inputBox.value.trim();
        if (!val) { this.toast(emptyMsg, true); return null; }
        if (this.isJson(val)) {
            const cookies = this.parseJson(this.fixQuotes(val));
            return cookies ? { cookies, wasJson: true } : null;
        }
        const cookies = this.netscapeToJson(val);
        if (!cookies.length) { this.toast("No valid cookies could be parsed.", true); return null; }
        return { cookies, wasJson: false };
    }

    /** Serialize back into the original format and write to both boxes. */
    commit(cookies, wasJson) {
        const res = wasJson ? this.serializeJson(cookies) : this.jsonToNetscape(cookies);
        this.inputBox.value = res;
        this.outputBox.value = res;
    }

    /* ---------- events ---------- */

    initEventListeners() {
        const on = (id, fn) => this.$(id).addEventListener('click', fn);
        on('btnConvert', () => this.convert());
        on('btnClean', () => this.cleanExpired());
        on('btnReset', () => this.clearAll());
        on('btnPaste', () => this.pasteFromClipboard());
        on('btnCopy', () => this.copyToClipboard());
        on('btnDownload', () => this.downloadFile());
        on('btnAdvToggle', () => this.toggleAdvancedPanel());
        on('btnDomainReplace', () => this.applyDomainReplace());
        on('btnExtendYear', () => this.manipulateExpiry('extend'));
        on('btnForceSession', () => this.manipulateExpiry('session'));
        on('btnSchemaFilter', () => this.applySchemaFilter());

        /* new v3.1 tools (buttons exist only if the HTML snippet was added) */
        const opt = (id, fn) => { const b = this.$(id); if (b) b.addEventListener('click', fn); };
        opt('btnDedupe', () => this.removeDuplicates());
        opt('btnSort', () => this.sortCookies());
        opt('btnHeaderString', () => this.copyHeaderString());

        this.toggleMinifyCheckbox.addEventListener('change', () => {
            this.isMinified = this.toggleMinifyCheckbox.checked;
            this.syncMinifyUI();
        });
        on('btnToggleMinify', () => {
            this.isMinified = !this.isMinified;
            this.toggleMinifyCheckbox.checked = this.isMinified;
            this.syncMinifyUI();
        });
    }

    toggleAdvancedPanel() {
        const open = this.advContent.classList.toggle('cck-adv-content--open');
        this.advToggleBtn.setAttribute('aria-expanded', String(open));
        this.advContent.setAttribute('aria-hidden', String(!open));
    }

    /* ---------- minify UI ---------- */

    syncMinifyUI() {
        const m = this.isMinified, $ = this.$;
        $('minifyStatusText').textContent = m ? 'Minified (compact 1-liner)' : 'Beautified (4-space indent)';
        $('minifyIcon').className = m ? 'fa-solid fa-compress' : 'fa-solid fa-align-left';
        $('minifyBtnIcon').className = m ? 'fa-solid fa-toggle-on' : 'fa-solid fa-toggle-off';
        $('minifyBtnText').textContent = m ? 'Disable Minify' : 'Enable Minify';
        $('btnToggleMinify').setAttribute('aria-pressed', String(m));
        this.toggleMinifyCheckbox.setAttribute('aria-checked', String(m));
        this.reserializeOutput();
    }

    reserializeOutput() {
        const cur = this.outputBox.value.trim();
        if (!this.isJson(cur)) return;
        try { this.outputBox.value = this.serializeJson(JSON.parse(cur)); } catch { /* leave as-is */ }
    }

    /* ---------- core conversion ---------- */

    convert() {
        const data = this.load("Please enter cookie data first.");
        if (!data) return;
        if (data.wasJson) {
            this.outputBox.value = this.jsonToNetscape(data.cookies);
            this.toast("Successfully converted JSON → Netscape");
        } else {
            this.outputBox.value = this.serializeJson(data.cookies);
            this.toast(`Converted ${data.cookies.length} cookie(s) to JSON`);
        }
    }

    parseJson(str) {
        try {
            const parsed = JSON.parse(str.replace(/,\s*([\]}])/g, '$1'));
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            this.toast("Invalid JSON Format. Check brackets and commas.", true);
            return null;
        }
    }

    jsonToNetscape(cookies) {
        let out = "# Netscape HTTP Cookie File\n# Generated by Trusted Tools Web — Secure Client-Side Tool\n# This is a generated file! Do not edit.\n\n";
        cookies.forEach(c => {
            if (!c || typeof c !== 'object') return;
            let domain = String(c.domain || "").trim();
            const name = String(c.name || "").trim();
            if (!domain || !name) return;

            /* FIX: compute the wildcard flag BEFORE adding the #HttpOnly_ prefix */
            const bare = domain.replace(/^#HttpOnly_/, '');
            const flag = bare.startsWith('.') ? "TRUE" : "FALSE";
            if (c.httpOnly === true && !domain.startsWith('#HttpOnly_')) domain = "#HttpOnly_" + domain;

            const path = c.path || "/";
            const secure = c.secure === true ? "TRUE" : "FALSE";
            let exp = Math.round(Number(c.expirationDate ?? c.expires ?? 0));
            if (isNaN(exp) || exp < 0) exp = 0;
            const value = (c.value !== undefined && c.value !== null) ? String(c.value) : "";
            out += `${domain}\t${flag}\t${path}\t${secure}\t${exp}\t${name}\t${value}\n`;
        });
        return out;
    }

    netscapeToJson(text) {
        const cookies = [];
        text.split(/\r?\n/).forEach(raw => {
            const line = raw.trim();
            if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) return;
            const parts = line.split(/\t+/);
            if (parts.length < 6) return;

            let domain = parts[0], httpOnly = false;
            if (domain.startsWith('#HttpOnly_')) { httpOnly = true; domain = domain.substring(10); }

            const expRaw = parseFloat(parts[4]);
            const exp = (isNaN(expRaw) || expRaw < 0) ? 0 : expRaw;
            cookies.push({
                domain,
                expirationDate: exp,
                hostOnly: !domain.startsWith('.'),
                httpOnly,
                name: parts[5],
                path: parts[2],
                sameSite: "no_restriction",
                secure: parts[3].toUpperCase() === "TRUE",
                session: exp === 0,
                storeId: "0",
                value: parts.length > 6 ? parts.slice(6).join('\t') : "",
                id: Math.floor(Math.random() * 10000000)
            });
        });
        return cookies;
    }

    /* ---------- clean expired ---------- */

    cleanExpired() {
        const data = this.load("No data to clean.");
        if (!data) return;
        const now = Date.now() / 1000;
        const active = data.cookies.filter(c => {
            const exp = Number(c.expirationDate ?? c.expires ?? 0);
            return exp === 0 || exp === -1 || isNaN(exp) || exp > now;
        });
        const removed = data.cookies.length - active.length;
        this.commit(active, data.wasJson);
        this.toast(removed > 0 ? `Cleaned ${removed} expired cookie(s).` : "All cookies are already clean and active.");
    }

    /* ---------- advanced 1: domain modifier ---------- */

    applyDomainReplace() {
        const find = this.domainFind.value.trim();
        const rep = this.domainReplace.value.trim();
        if (!find) return this.toast("Please enter a domain to find.", true);
        if (find === rep) return this.toast("Find and Replace values are identical — no changes made.", true);

        const data = this.load();
        if (!data) return;

        /* Substring replace: ".example.com" also fixes "sub.example.com" */
        let n = 0;
        data.cookies.forEach(c => {
            if (c && typeof c.domain === 'string' && c.domain.includes(find)) {
                c.domain = c.domain.split(find).join(rep);
                n++;
            }
        });
        if (!n) return this.toast(`Domain "${find}" not found in any cookie.`, true);
        this.commit(data.cookies, data.wasJson);
        this.toast(`Replaced domain in ${n} cookie(s).`);
    }

    /* ---------- advanced 2: expiry ---------- */

    manipulateExpiry(mode) {
        const data = this.load();
        if (!data) return;
        const YEAR = 365 * 24 * 60 * 60;
        let n = 0;

        data.cookies.forEach(c => {
            if (!c || typeof c !== 'object') return;
            if (mode === 'extend') {
                const exp = Number(c.expirationDate);
                if (exp && exp !== -1 && !isNaN(exp)) { c.expirationDate = exp + YEAR; c.session = false; n++; }
            } else {
                c.expirationDate = 0; c.session = true; n++;
            }
        });

        if (mode === 'extend' && !n) return this.toast("No non-session cookies to extend (all are session cookies).", true);
        this.commit(data.cookies, data.wasJson);
        this.toast(mode === 'extend' ? `Extended expiry by 1 year on ${n} cookie(s).` : `Forced ${n} cookie(s) into session mode.`);
    }

    /* ---------- advanced 4: schema filter ---------- */

    applySchemaFilter() {
        const data = this.load();
        if (!data) return;
        const target = (document.querySelector('input[name="schemaTarget"]:checked') || {}).value || 'puppeteer';
        const map = { strict: 'Strict', lax: 'Lax', none: 'None', no_restriction: 'None', unspecified: 'None' };

        const filtered = data.cookies.filter(c => c && typeof c === 'object' && c.name).map(c => {
            const exp = Number(c.expirationDate ?? c.expires);
            const hasExp = exp > 0 && !isNaN(exp);
            const o = {
                name: c.name,
                value: c.value !== undefined ? String(c.value) : "",
                domain: c.domain || "",
                path: c.path || "/",
                httpOnly: Boolean(c.httpOnly),
                secure: Boolean(c.secure),
                sameSite: map[String(c.sameSite || "").toLowerCase()] || 'Lax'
            };
            if (target === 'playwright') o.expires = hasExp ? exp : -1;
            else if (hasExp) o.expires = exp;
            return o;
        });

        const res = this.serializeJson(filtered);
        this.inputBox.value = res;
        this.outputBox.value = res;
        this.toast(`Schema filter applied — ${filtered.length} cookie(s) ready for ${target === 'playwright' ? 'Playwright' : 'Puppeteer'}.`);
    }

    /* ---------- NEW: dedupe / sort / header string ---------- */

    removeDuplicates() {
        const data = this.load();
        if (!data) return;
        const seen = new Map(); /* last occurrence wins (newest value) */
        data.cookies.forEach(c => {
            if (c && c.name) seen.set(`${c.domain}|${c.path || '/'}|${c.name}`, c);
        });
        const unique = [...seen.values()];
        const removed = data.cookies.length - unique.length;
        this.commit(unique, data.wasJson);
        this.toast(removed ? `Removed ${removed} duplicate cookie(s).` : "No duplicates found.");
    }

    sortCookies() {
        const data = this.load();
        if (!data) return;
        data.cookies.sort((a, b) =>
            String(a.domain).localeCompare(String(b.domain)) || String(a.name).localeCompare(String(b.name)));
        this.commit(data.cookies, data.wasJson);
        this.toast(`Sorted ${data.cookies.length} cookie(s) by domain and name.`);
    }

    /** Builds "name=value; name2=value2" for use in a Cookie: HTTP header. */
    async copyHeaderString() {
        const data = this.load();
        if (!data) return;
        const str = data.cookies.filter(c => c && c.name).map(c => `${c.name}=${c.value ?? ""}`).join('; ');
        this.outputBox.value = str;
        try { await navigator.clipboard.writeText(str); this.toast("Cookie header string copied!"); }
        catch { this.toast("Header string generated in the output box."); }
    }

    /* ---------- clipboard / download / reset ---------- */

    async pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            if (text) { this.inputBox.value = text; this.toast("Pasted from clipboard successfully."); }
            else this.toast("Clipboard is empty — nothing to paste.", true);
        } catch {
            this.toast("Clipboard permission denied. Use Ctrl+V to paste manually.", true);
        }
    }

    async copyToClipboard() {
        const content = this.outputBox.value;
        if (!content) return this.toast("Nothing to copy — the output is empty.", true);
        try { await navigator.clipboard.writeText(content); this.toast("Output copied to clipboard!"); }
        catch { this.outputBox.select(); document.execCommand('copy'); this.toast("Copied using fallback method."); }
    }

    downloadFile() {
        const content = this.outputBox.value;
        if (!content) return this.toast("Output is empty — nothing to download.", true);
        const isJson = this.isJson(content.trim());
        const filename = isJson ? "cookies_clean.json" : "cookies_netscape.txt";
        const url = URL.createObjectURL(new Blob([content], { type: isJson ? "application/json" : "text/plain" }));
        const a = Object.assign(document.createElement("a"), { href: url, download: filename });
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
        this.toast(`Downloading ${filename}...`);
    }

    clearAll() {
        this.inputBox.value = this.outputBox.value = this.domainFind.value = this.domainReplace.value = "";
        this.toast("Workspace reset — ready for new data.");
    }
}

document.addEventListener('DOMContentLoaded', () => { new CookieConverterEngine(); });
