/**
 * =============================================================================
 *  ULTRA JSON PRO MAX — CORE MODULE
 *  File    : script.js
 *  Version : 4.0.0 (CodeCanyon Release Build — Pro Max Edition)
 *  Author  : MD KAWSAR
 * -----------------------------------------------------------------------------
 *  Description:
 *  100% client-side JSON parsing, validation, formatting, and visualisation
 *  for the Trusted Tools Web platform.
 *
 *  Architecture:
 *  Wrapped in an IIFE and exposed as the global constant `UltraJSON`.
 *  This prevents namespace pollution while allowing HTML onclick attributes
 *  to call public methods.
 *
 *  Key capabilities (v4.0 additions marked with [NEW]):
 *  ┌─────────────────────────────────────────────────────────────────────────┐
 *  │  • Beautify / Format (2-space or 4-space indent)                        │
 *  │  • Minify (zero-indent stringify)                                        │
 *  │  • Auto-Fix (Regex heuristics for JS-Object → JSON conversion)          │
 *  │  • Syntax highlighting via DOM manipulation                              │
 *  │  • Collapsible Tree View (recursive DOM node builder, size-guarded)     │
 *  │  • Grid / Table View (sparse-dataset-safe, max 500 rows)                │
 *  │  • XML Conversion (recursive tag builder)                                │
 *  │  • CSV Conversion (RFC 4180, union-key sparse-safe)                     │
 *  │  • File Upload (.json / .txt / .csv via FileReader API)                  │
 *  │  • URL Fetch (live JSON from any CORS-enabled API endpoint)              │
 *  │  • Local History (up to 8 entries in localStorage)                      │
 *  │  • Session Restore (last edited JSON across page reloads)               │
 *  │  • [NEW] TypeScript Interface Generator                                  │
 *  │  • [NEW] Dart Model Generator                                            │
 *  │  • [NEW] JSONPath Advanced Search / Filter                               │
 *  │  • [NEW] Data Cleaner (null / empty string / empty array+object)        │
 *  │  • [NEW] Sort Keys A-Z (recursive, deep)                                │
 *  └─────────────────────────────────────────────────────────────────────────┘
 *
 *  Dependencies:
 *  • global.js  → Must be loaded first; provides window.showToast().
 *  • Font Awesome 6 (icons referenced in inline HTML strings).
 * =============================================================================
 */

const UltraJSON = (() => {

    /* =========================================================================
     * SECTION 1: DOM CACHE
     * All frequently accessed DOM nodes cached once at module load time.
     * Avoids repeated getElementById() calls on hot paths.
     * ========================================================================= */

    /**
     * DOM — Cached references to every interactive element in the tool.
     * @type {Object}
     */
    const DOM = {
        /** Raw JSON input textarea */
        input        : document.getElementById('jsonInput'),

        /** Syntax-highlighted formatted output container (Code tab) */
        codeOutput   : document.getElementById('jsonOutput'),

        /** Collapsible tree view container (Tree tab) */
        treeOutput   : document.getElementById('treeOutput'),

        /** Tabular data table container (Grid tab) */
        tableOutput  : document.getElementById('tableOutput'),

        /** Validation status indicator in the Output panel header */
        statusIcon   : document.getElementById('statusIcon'),

        /** Live byte/KB size readout in the Input panel header */
        sizeStat     : document.getElementById('sizeStat'),

        /** Inline syntax-error banner between toolbar and editor grid */
        errorBox     : document.getElementById('errorBox'),

        /** NodeList of all output tab buttons (Code / Tree / Grid / Types) */
        tabs         : document.querySelectorAll('.panel-tab'),

        /** Container for history pill buttons */
        historyList  : document.getElementById('historyList'),

        /** [NEW] JSONPath search input field */
        jsonpathInput: document.getElementById('jsonpathInput'),

        /** [NEW] Output container for Types/Interface generator tab */
        typesOutput  : document.getElementById('typesOutput')
    };

    /* =========================================================================
     * SECTION 2: MODULE STATE
     * Single plain-object store tracking all mutable runtime state.
     * ========================================================================= */

    /**
     * state — Runtime state for the current editing session.
     * @property {any}     data      - Most recently parsed JSON value.
     * @property {number}  rawSize   - Size of raw input string in bytes.
     * @property {boolean} isValid   - Whether current input parses without error.
     * @property {string}  activeTab - Currently visible tab ('code'|'tree'|'table'|'types').
     */
    let state = {
        data      : null,
        rawSize   : 0,
        isValid   : false,
        activeTab : 'code'
    };

    /* =========================================================================
     * SECTION 3: INITIALISATION
     * init() called once when the DOM is fully ready.
     * Attaches permanent event listeners and restores prior session.
     * ========================================================================= */

    /**
     * init
     * Bootstraps the module: registers event listeners, restores last session,
     * and renders the local-history strip.
     */
    function init() {

        /* ── Debounced input listener — fires 600 ms after user stops typing ── */
        DOM.input.addEventListener('input', debounce(() => handleInput(true), 600));

        /* ── Tab-key indentation in the textarea (4-space insert) ── */
        DOM.input.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = DOM.input.selectionStart;
                const end   = DOM.input.selectionEnd;
                DOM.input.value =
                    DOM.input.value.substring(0, start) +
                    '    ' +
                    DOM.input.value.substring(end);
                DOM.input.selectionStart = DOM.input.selectionEnd = start + 4;
            }
        });

        /* ── Session restore from localStorage ── */
        try {
            const saved = localStorage.getItem('ultraJsonData');
            if (saved) {
                DOM.input.value = saved;
                if (saved.length < 100000) {
                    handleInput(false);
                    processJSON(4);
                } else {
                    updateSizeStat(saved);
                }
            }
            renderHistory();
        } catch (e) {
            console.warn('[UltraJSON] localStorage unavailable:', e.message);
        }
    }

    /* =========================================================================
     * SECTION 4: INPUT HANDLER
     * Reacts to every change in the raw JSON textarea.
     * ========================================================================= */

    /**
     * handleInput
     * Updates size stat, persists to localStorage, and validates.
     *
     * @param {boolean} [save=true] - When true, persists raw text to localStorage
     *                                (skipped if payload exceeds 5 MB).
     */
    function handleInput(save = true) {
        const raw     = DOM.input.value;
        state.rawSize = new Blob([raw]).size;

        updateSizeStat(raw);

        if (save && state.rawSize < 5 * 1024 * 1024) {
            try { localStorage.setItem('ultraJsonData', raw); } catch (e) { /* quota */ }
        }

        if (!raw.trim()) {
            state.data               = null;
            state.isValid            = false;
            setStatus('ready');
            DOM.errorBox.style.display = 'none';
            return;
        }

        try {
            JSON.parse(raw);
            state.isValid = true;
            setStatus('valid');
            DOM.errorBox.style.display = 'none';
        } catch (e) {
            state.isValid = false;
            setStatus('invalid');
        }
    }

    /* =========================================================================
     * SECTION 5: MAIN PROCESSOR — FORMAT & RENDER
     * Central workhorse: parses raw textarea, formats, triggers all views.
     * ========================================================================= */

    /**
     * processJSON
     * Parses raw input, formats with specified indent, renders all views.
     *
     * @param {number} indent - 0 = minified, 2 = 2-space, 4 = 4-space beautified.
     */
    function processJSON(indent) {
        const raw = DOM.input.value.trim();

        if (!raw) {
            window.showToast('Please paste or upload JSON data first.');
            return;
        }

        DOM.codeOutput.innerHTML =
            '<div style="padding:20px; color:var(--brand-secondary)">' +
            '<i class="fa-solid fa-spinner fa-spin"></i> Processing…</div>';

        setTimeout(() => {
            try {
                const parsed  = JSON.parse(raw);
                state.data    = parsed;
                state.isValid = true;

                /* ── 1. Code View ── */
                if (indent === 0) {
                    DOM.codeOutput.textContent = JSON.stringify(parsed);
                } else {
                    const formatted = JSON.stringify(parsed, null, indent);
                    if (formatted.length > 500000) {
                        DOM.codeOutput.textContent = formatted;
                    } else {
                        DOM.codeOutput.innerHTML = syntaxHighlight(formatted);
                    }
                }

                /* ── 2. Secondary views ── */
                renderTree(parsed);
                renderTable(parsed);

                /* ── 3. Finalise ── */
                setStatus('valid');
                DOM.errorBox.style.display = 'none';
                addToHistory(parsed);
                switchTab('code');

            } catch (e) {
                showError(e);
                DOM.codeOutput.textContent = '';
            }
        }, 50);
    }

    /* =========================================================================
     * SECTION 6: AUTO-FIX ENGINE
     * Regex heuristics to convert JS object literals into valid JSON.
     * ========================================================================= */

    /**
     * autoFixJSON
     * Repairs raw input using Regex heuristics, then re-renders output.
     * Transformations: strip comments, single→double quotes, trailing commas,
     * unquoted keys, trailing semicolons.
     */
    function autoFixJSON() {
        let raw = DOM.input.value.trim();
        if (!raw) return;

        let fixed = raw
            .replace(/\/\/.*$/gm, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/'/g, '"')
            .replace(/,\s*([\]}])/g, '$1')
            .replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3')
            .replace(/;\s*$/, '');

        if (fixed !== raw) {
            DOM.input.value = fixed;
            handleInput();
            try {
                processJSON(4);
                DOM.errorBox.style.display = 'none';
                const btn  = document.querySelector('button[onclick="UltraJSON.autoFixJSON()"]');
                const orig = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> Fixed!';
                setTimeout(() => btn.innerHTML = orig, 2000);
            } catch (e) {
                showError(e);
                window.showToast('Auto-Fix applied partial fixes, but JSON is still invalid. Check the error log.', true);
            }
        } else {
            window.showToast('No standard syntax errors detected. JSON may already be valid.');
        }
    }

    /* =========================================================================
     * SECTION 7: VISUALISATION ENGINES
     * Three independent renderers: Code view, Tree view, Grid view.
     * ========================================================================= */

    /* ── 7-A: Tree View Renderer ── */

    /**
     * renderTree
     * Clears the tree output and kicks off the recursive node builder.
     * Guarded by a node-count threshold to prevent main-thread freezing on
     * extremely large payloads.
     *
     * BUG FIX: Added size check — payloads with > 5,000 estimated nodes render
     * a warning message instead of building a potentially-blocking DOM tree.
     *
     * @param {any} data - The parsed JSON value to visualise.
     */
    function renderTree(data) {
        DOM.treeOutput.innerHTML = '';

        /* Performance guard: estimate node count before attempting a full render */
        const estimated = estimateNodeCount(data);
        if (estimated > 5000) {
            DOM.treeOutput.innerHTML =
                '<div style="padding:30px; text-align:center; color:var(--status-warning)">' +
                '<i class="fa-solid fa-triangle-exclamation" style="font-size:2rem; display:block; margin-bottom:12px;"></i>' +
                `<strong>Tree View Paused</strong><br>` +
                `This JSON contains approximately <strong>${estimated.toLocaleString()} nodes</strong>.<br>` +
                'Rendering such a large tree would freeze your browser. ' +
                'Use the <strong>Grid View</strong> or <strong>JSONPath Search</strong> to navigate the data.</div>';
            return;
        }

        DOM.treeOutput.appendChild(createTreeNodes(data));
    }

    /**
     * estimateNodeCount
     * Recursively counts the total number of enumerable properties in a value.
     * Used as a lightweight pre-flight check before building the tree DOM.
     *
     * @param {any}    val   - Any JSON value.
     * @param {number} depth - Current recursion depth (stops at 20 to be safe).
     * @returns {number} Approximate node count.
     */
    function estimateNodeCount(val, depth = 0) {
        if (depth > 20 || val === null || typeof val !== 'object') return 1;
        let count = 0;
        for (const k in val) {
            if (Object.prototype.hasOwnProperty.call(val, k)) {
                count += 1 + estimateNodeCount(val[k], depth + 1);
            }
        }
        return count;
    }

    /**
     * createTreeNodes
     * Recursively converts a parsed JSON value into a collapsible <ul>/<li>
     * DOM structure. Objects/arrays become expandable branches; primitives
     * become colour-coded leaf nodes.
     *
     * @param {any} obj - Current node to convert.
     * @returns {HTMLElement} A <ul> element containing the rendered nodes.
     */
    function createTreeNodes(obj) {
        const ul = document.createElement('ul');

        for (const key in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

            const li      = document.createElement('li');
            const val     = obj[key];
            const safeKey = escapeHtml(key);

            if (val !== null && typeof val === 'object') {
                const isArray = Array.isArray(val);
                const size    = Object.keys(val).length;

                const toggle = document.createElement('span');
                toggle.className = 'caret';
                toggle.innerHTML = '&#9654;';
                toggle.onclick = function () {
                    this.classList.toggle('caret-down');
                    this.parentElement.querySelector('.nested').classList.toggle('active-tree');
                };

                const label = document.createElement('span');
                label.innerHTML =
                    `<span class="json-key">${safeKey}</span>: ` +
                    `<span style="color:var(--text-muted); font-size:0.8em">` +
                    `${isArray ? `Array[${size}]` : `Object{${size}}`}</span>`;

                li.appendChild(toggle);
                li.appendChild(label);

                const nested     = createTreeNodes(val);
                nested.className = 'nested';
                li.appendChild(nested);

            } else {
                let typeClass = 'json-string';
                if (typeof val === 'number')  typeClass = 'json-number';
                if (typeof val === 'boolean') typeClass = 'json-boolean';
                if (val === null)             typeClass = 'json-null';

                li.innerHTML =
                    `<span style="display:inline-block; width:14px;"></span>` +
                    `<span class="json-key">${safeKey}</span>: ` +
                    `<span class="${typeClass}">${escapeHtml(String(val))}</span>`;
            }

            ul.appendChild(li);
        }

        return ul;
    }

    /* ── 7-B: Grid / Table View Renderer ── */

    /**
     * renderTable
     * Renders parsed JSON as an HTML table inside the Grid tab.
     *
     * BUG FIX: Uses a Set to collect ALL unique keys across EVERY row so that
     * sparse datasets (objects with different keys) display all columns correctly
     * and no data is silently dropped.
     *
     * @param {any} data - The parsed JSON value to tabulate.
     */
    function renderTable(data) {
        DOM.tableOutput.innerHTML = '';

        const dataArray = Array.isArray(data)
            ? data
            : (typeof data === 'object' && data !== null ? [data] : null);

        if (!dataArray || !dataArray.length ||
            typeof dataArray[0] !== 'object' || dataArray[0] === null) {
            DOM.tableOutput.innerHTML =
                '<div style="padding:40px; text-align:center; color:var(--text-muted)">' +
                'Grid view requires an Object or Array of Objects.</div>';
            return;
        }

        const MAX_ROWS    = 500;
        const displayData = dataArray.slice(0, MAX_ROWS);

        /*
         * BUG FIX: Collect ALL unique keys across ALL rows using a Set.
         * Previously only Object.keys(dataArray[0]) was used, which silently
         * dropped columns that were absent from the first row but present in
         * subsequent rows (sparse / heterogeneous datasets).
         */
        const keySet = new Set();
        dataArray.forEach(row => {
            if (row && typeof row === 'object') {
                Object.keys(row).forEach(k => keySet.add(k));
            }
        });
        const keys = Array.from(keySet);

        let html = '<div class="table-responsive"><table class="data-table"><thead><tr>';
        keys.forEach(k => html += `<th>${escapeHtml(k)}</th>`);
        html += '</tr></thead><tbody>';

        displayData.forEach(row => {
            html += '<tr>';
            keys.forEach(k => {
                let val = (row && row[k] !== undefined) ? row[k] : '';
                if (typeof val === 'object' && val !== null) val = '[Object]';
                html += `<td>${escapeHtml(String(val))}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        if (dataArray.length > MAX_ROWS) {
            html +=
                `<div style="padding:10px; background:rgba(210,153,34,0.1); ` +
                `color:#d29922; font-size:12px; text-align:center;">` +
                `Showing first ${MAX_ROWS} of ${dataArray.length} rows. ` +
                `Download CSV for the full dataset.</div>`;
        }

        DOM.tableOutput.innerHTML = html;
    }

    /* =========================================================================
     * SECTION 8: CONVERTERS — XML & CSV
     * ========================================================================= */

    /**
     * convertToXML
     * Converts parsed JSON to an XML document string and displays in Code view.
     * Property names are sanitised to valid XML tag names.
     */
    function convertToXML() {
        if (!state.data) return processJSON(4);
        if (!state.isValid) return;

        const jsonToXml = (obj) => {
            let xml = '';
            for (let prop in obj) {
                if (!Object.prototype.hasOwnProperty.call(obj, prop)) continue;
                let tag = String(prop).replace(/[^a-zA-Z0-9-_]/g, '_');
                if (/^\d/.test(tag)) tag = '_' + tag;

                if (Array.isArray(obj[prop])) {
                    for (let item of obj[prop]) {
                        xml += `<${tag}>${
                            (typeof item === 'object' && item !== null)
                                ? jsonToXml(item)
                                : escapeHtml(item)
                        }</${tag}>`;
                    }
                } else if (typeof obj[prop] === 'object' && obj[prop] !== null) {
                    xml += `<${tag}>${jsonToXml(obj[prop])}</${tag}>`;
                } else {
                    xml += `<${tag}>${escapeHtml(obj[prop])}</${tag}>`;
                }
            }
            return xml;
        };

        DOM.codeOutput.textContent =
            '<?xml version="1.0" encoding="UTF-8"?>\n<root>\n' +
            jsonToXml(state.data) +
            '\n</root>';

        switchTab('code');
        window.showToast('Converted to XML successfully.');
    }

    /**
     * convertToCSV
     * Flattens an array of objects into RFC 4180 CSV string.
     * Column headers are a union of ALL row keys (sparse-safe).
     */
    function convertToCSV() {
        if (!state.data) return processJSON(4);

        const data = Array.isArray(state.data) ? state.data : [state.data];

        if (!data[0] || typeof data[0] !== 'object') {
            window.showToast('CSV conversion requires an array of objects.', true);
            return;
        }

        /* Collect all unique keys across every row */
        const keySet = new Set();
        data.forEach(o => { if (o && typeof o === 'object') Object.keys(o).forEach(k => keySet.add(k)); });
        const headers = Array.from(keySet);

        const csv = [
            headers.join(','),
            ...data.map(row =>
                headers.map(k => {
                    let val = (row[k] === null || row[k] === undefined) ? '' : String(row[k]);
                    val = val.replace(/"/g, '""');
                    return `"${val}"`;
                }).join(',')
            )
        ].join('\n');

        DOM.codeOutput.textContent = csv;
        switchTab('code');
        window.showToast('Converted to CSV successfully.');
    }

    /* =========================================================================
     * SECTION 9: I/O — FILE UPLOAD, URL FETCH, DOWNLOAD, CLIPBOARD
     * ========================================================================= */

    /**
     * downloadResult
     * Creates a Blob from Code view text content and triggers a browser download.
     */
    function downloadResult() {
        const content = DOM.codeOutput.textContent;
        if (!content) {
            window.showToast('Nothing to save. Please process your JSON first.');
            return;
        }
        const blob = new Blob([content], { type: 'text/plain' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = `ultra_json_${Date.now()}.txt`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    /**
     * copyToClipboard
     * Copies Code view text content to the system clipboard.
     */
    function copyToClipboard() {
        const text = DOM.codeOutput.textContent;
        if (!text) return;

        navigator.clipboard.writeText(text).then(() => {
            const btn      = document.querySelector('button[onclick="UltraJSON.copyToClipboard()"]');
            const original = btn.innerHTML;
            btn.innerHTML  = '<i class="fa-solid fa-check"></i> Copied';
            setTimeout(() => btn.innerHTML = original, 2000);
        }).catch(() => {
            window.showToast('Clipboard access denied. Please copy manually.', true);
        });
    }

    /**
     * handleFileUpload
     * Reads a selected file via FileReader and loads its content into the editor.
     *
     * @param {HTMLInputElement} input - The file input element that triggered the event.
     */
    function handleFileUpload(input) {
        const file = input.files[0];
        if (!file) return;

        const reader   = new FileReader();
        reader.onload  = (e) => {
            DOM.input.value = e.target.result;
            handleInput();
            processJSON(4);
        };
        reader.onerror = () => window.showToast('File read failed. Please try a different file.', true);
        reader.readAsText(file);
    }

    /**
     * fetchFromUrl
     * Fetches JSON from a user-supplied URL using the native fetch API.
     * Target URL must serve CORS-permissive headers.
     */
    async function fetchFromUrl() {
        const url = document.getElementById('urlInput').value.trim();
        if (!url) return;

        const btn  = document.querySelector('button[onclick="UltraJSON.fetchFromUrl()"]');
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            const json = await res.json();
            DOM.input.value = JSON.stringify(json, null, 4);
            handleInput();
            processJSON(4);
        } catch (e) {
            window.showToast('Fetch Failed: ' + e.message, true);
        } finally {
            btn.innerHTML = orig;
        }
    }

    /* =========================================================================
     * SECTION 10: SAMPLE DATA LOADER
     * ========================================================================= */

    /**
     * loadSample
     * Populates the editor with a representative sample JSON payload.
     */
    function loadSample() {
        const sample = {
            app        : 'Ultra JSON Pro Max',
            version    : 4.0,
            commercial : true,
            features   : ['Validation', 'Minification', 'Visualisation', 'TypeScript Generator', 'JSONPath Search'],
            config     : { theme: 'auto', offline: true, maxHistory: 8 },
            users      : [
                { id: 1, name: 'Alice',   role: 'admin',  active: true,  score: 98.5 },
                { id: 2, name: 'Bob',     role: 'editor', active: false, score: 72.0 },
                { id: 3, name: 'Charlie', role: 'viewer', active: true,  score: null }
            ]
        };
        DOM.input.value = JSON.stringify(sample, null, 4);
        handleInput();
        processJSON(4);
    }

    /* =========================================================================
     * SECTION 11: CLEAR ALL
     * ========================================================================= */

    /**
     * clearAll
     * Prompts for confirmation, then wipes editor and all localStorage entries.
     */
    function clearAll() {
        if (confirm('Clear editor and local history?')) {
            DOM.input.value           = '';
            DOM.codeOutput.textContent = '';
            DOM.treeOutput.innerHTML   = '';
            DOM.tableOutput.innerHTML  = '';
            if (DOM.typesOutput)  DOM.typesOutput.textContent  = '';
            if (DOM.jsonpathInput) DOM.jsonpathInput.value      = '';
            state.data    = null;
            state.isValid = false;
            setStatus('ready');
            localStorage.removeItem('ultraJsonData');
            localStorage.removeItem('ultraJsonHist');
            renderHistory();
        }
    }

    /* =========================================================================
     * SECTION 12: LOCAL HISTORY
     * Ring buffer of up to 8 recently processed JSON entries in localStorage.
     * ========================================================================= */

    /**
     * addToHistory
     * Prepends a new entry, deduplicates, enforces 8-item cap, re-renders strip.
     *
     * @param {any} data - Parsed JSON value to store.
     */
    function addToHistory(data) {
        try {
            let h         = JSON.parse(localStorage.getItem('ultraJsonHist') || '[]');
            const str     = JSON.stringify(data);
            if (h.length && h[0].full === str) return;

            let snip = Array.isArray(data)
                ? `Array[${data.length}]`
                : `{${Object.keys(data)[0] || 'Empty'}…}`;

            h.unshift({ snip, full: str, time: new Date().toLocaleTimeString() });
            if (h.length > 8) h.pop();

            localStorage.setItem('ultraJsonHist', JSON.stringify(h));
            renderHistory();
        } catch (e) { /* quota or private browsing */ }
    }

    /**
     * renderHistory
     * Reads the history buffer and rebuilds the pill button strip.
     */
    function renderHistory() {
        const h = JSON.parse(localStorage.getItem('ultraJsonHist') || '[]');
        if (!h.length) {
            DOM.historyList.innerHTML =
                '<small style="color:var(--text-muted)">No recent files.</small>';
            return;
        }
        DOM.historyList.innerHTML = h.map((item, i) => `
            <button onclick="UltraJSON.loadHistoryItem(${i})"
                    class="btn btn-secondary"
                    style="padding:5px 12px; font-size:11px; white-space:nowrap; border-radius:50px;">
                <i class="fa-regular fa-clock"></i> ${escapeHtml(item.snip)}
            </button>
        `).join('');
    }

    /**
     * loadHistoryItem
     * Restores a specific history entry into the editor.
     *
     * @param {number} index - Zero-based index into the history ring buffer.
     */
    function loadHistoryItem(index) {
        const h = JSON.parse(localStorage.getItem('ultraJsonHist') || '[]');
        if (h[index]) {
            DOM.input.value = h[index].full;
            handleInput(false);
            processJSON(4);
        }
    }

    /* =========================================================================
     * SECTION 13: TAB SWITCHER
     * ========================================================================= */

    /**
     * switchTab
     * Activates the specified output tab and shows/hides view containers.
     * Auto-processes if a non-code tab is opened before Beautify is pressed.
     *
     * @param {string} tabName - One of 'code' | 'tree' | 'table' | 'types'.
     */
    function switchTab(tabName) {
        state.activeTab = tabName;

        DOM.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));

        DOM.codeOutput.classList.toggle('hidden', tabName !== 'code');
        DOM.treeOutput.classList.toggle('hidden', tabName !== 'tree');
        DOM.tableOutput.classList.toggle('hidden', tabName !== 'table');
        if (DOM.typesOutput) {
            DOM.typesOutput.classList.toggle('hidden', tabName !== 'types');
        }

        /* Auto-process secondary tabs when no data is yet available */
        if (tabName !== 'code' && tabName !== 'types' && !state.isValid && DOM.input.value.trim()) {
            processJSON(4);
        }

        /* When switching to types tab, auto-generate if data exists */
        if (tabName === 'types' && state.data && state.isValid) {
            generateTypes('typescript');
        }
    }

    /* =========================================================================
     * SECTION 14: [NEW] TYPESCRIPT INTERFACE & DART MODEL GENERATOR
     * Generates TypeScript interfaces or Dart model classes from the current
     * parsed JSON schema. Recursive, handles nested objects and arrays.
     * ========================================================================= */

    /**
     * generateTypes
     * Entry point for the Type Generator feature. Reads the current parsed
     * data and renders TypeScript interfaces or Dart models into the Types tab.
     *
     * @param {string} [lang='typescript'] - Target language: 'typescript' or 'dart'.
     */
    function generateTypes(lang = 'typescript') {
        if (!state.data) {
            if (!DOM.input.value.trim()) {
                window.showToast('Please paste JSON data first, then use the Types tab.');
                return;
            }
            /* Attempt a silent parse */
            try {
                state.data    = JSON.parse(DOM.input.value.trim());
                state.isValid = true;
            } catch (e) {
                window.showToast('Fix JSON errors before generating types.', true);
                return;
            }
        }

        if (!DOM.typesOutput) return;

        const root = Array.isArray(state.data) && state.data.length > 0
            ? state.data[0]
            : state.data;

        let output = '';

        if (lang === 'typescript') {
            const interfaces = {};
            buildTsInterface(root, 'Root', interfaces);
            output = Object.values(interfaces).join('\n\n');
        } else if (lang === 'dart') {
            const classes = {};
            buildDartClass(root, 'Root', classes);
            output = Object.values(classes).join('\n\n');
        }

        DOM.typesOutput.textContent = output;
        switchTab('types');
    }

    /**
     * inferTsType
     * Infers the TypeScript type string for a given JSON value.
     * Recursively names nested objects and arrays.
     *
     * @param {any}    val       - JSON value.
     * @param {string} keyName   - Camel-cased property name (used for interface naming).
     * @param {Object} collected - Accumulator for all interface definitions.
     * @returns {string} TypeScript type annotation string.
     */
    function inferTsType(val, keyName, collected) {
        if (val === null)                  return 'null';
        if (typeof val === 'string')       return 'string';
        if (typeof val === 'number')       return 'number';
        if (typeof val === 'boolean')      return 'boolean';

        if (Array.isArray(val)) {
            if (val.length === 0) return 'any[]';
            const innerType = inferTsType(val[0], keyName, collected);
            return `${innerType}[]`;
        }

        if (typeof val === 'object') {
            const interfaceName = capitalise(keyName);
            buildTsInterface(val, interfaceName, collected);
            return interfaceName;
        }

        return 'any';
    }

    /**
     * buildTsInterface
     * Recursively builds a TypeScript interface definition string and stores
     * it in the `collected` accumulator object (keyed by interface name).
     *
     * @param {Object} obj       - Plain object to introspect.
     * @param {string} name      - Interface name.
     * @param {Object} collected - Accumulator for interface definitions.
     */
    function buildTsInterface(obj, name, collected) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
        if (collected[name]) return; /* Prevent infinite recursion on self-references */

        let lines = [`export interface ${name} {`];

        for (const key in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
            const tsType = inferTsType(obj[key], key, collected);
            lines.push(`  ${key}: ${tsType};`);
        }

        lines.push('}');
        collected[name] = lines.join('\n');
    }

    /**
     * inferDartType
     * Infers the Dart type annotation string for a given JSON value.
     *
     * @param {any}    val       - JSON value.
     * @param {string} keyName   - Property name (used for class naming).
     * @param {Object} collected - Accumulator for all class definitions.
     * @returns {string} Dart type string.
     */
    function inferDartType(val, keyName, collected) {
        if (val === null)                  return 'dynamic';
        if (typeof val === 'string')       return 'String';
        if (typeof val === 'number')       return Number.isInteger(val) ? 'int' : 'double';
        if (typeof val === 'boolean')      return 'bool';

        if (Array.isArray(val)) {
            if (val.length === 0) return 'List<dynamic>';
            const innerType = inferDartType(val[0], keyName, collected);
            return `List<${innerType}>`;
        }

        if (typeof val === 'object') {
            const className = capitalise(keyName);
            buildDartClass(val, className, collected);
            return className;
        }

        return 'dynamic';
    }

    /**
     * buildDartClass
     * Recursively builds a Dart model class definition with fromJson / toJson
     * methods and stores it in the `collected` accumulator.
     *
     * @param {Object} obj       - Plain object to introspect.
     * @param {string} name      - Class name.
     * @param {Object} collected - Accumulator for class definitions.
     */
    function buildDartClass(obj, name, collected) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
        if (collected[name]) return;

        const keys     = Object.keys(obj).filter(k => Object.prototype.hasOwnProperty.call(obj, k));
        const fields   = keys.map(k => ({ key: k, type: inferDartType(obj[k], k, collected) }));

        /* Build field declarations */
        const fieldDecls = fields.map(f => `  final ${f.type} ${f.key};`).join('\n');

        /* Constructor parameters */
        const ctorParams = fields.map(f => `    required this.${f.key},`).join('\n');

        /* fromJson factory */
        const fromJsonBody = fields.map(f => {
            if (f.type === 'String')                  return `    ${f.key}: json['${f.key}'] as String,`;
            if (f.type === 'int')                     return `    ${f.key}: (json['${f.key}'] as num).toInt(),`;
            if (f.type === 'double')                  return `    ${f.key}: (json['${f.key}'] as num).toDouble(),`;
            if (f.type === 'bool')                    return `    ${f.key}: json['${f.key}'] as bool,`;
            if (f.type.startsWith('List'))            return `    ${f.key}: List.from(json['${f.key}'] ?? []),`;
            if (f.type !== 'dynamic')                 return `    ${f.key}: ${f.type}.fromJson(json['${f.key}']),`;
            return `    ${f.key}: json['${f.key}'],`;
        }).join('\n');

        /* toJson method */
        const toJsonBody = fields.map(f => {
            if (['String', 'int', 'double', 'bool', 'dynamic'].includes(f.type))
                return `      '${f.key}': ${f.key},`;
            if (f.type.startsWith('List'))
                return `      '${f.key}': ${f.key},`;
            return `      '${f.key}': ${f.key}.toJson(),`;
        }).join('\n');

        collected[name] = [
            `class ${name} {`,
            fieldDecls,
            '',
            `  const ${name}({`,
            ctorParams,
            `  });`,
            '',
            `  factory ${name}.fromJson(Map<String, dynamic> json) => ${name}(`,
            fromJsonBody,
            `  );`,
            '',
            `  Map<String, dynamic> toJson() => {`,
            toJsonBody,
            `  };`,
            `}`
        ].join('\n');
    }

    /* =========================================================================
     * SECTION 15: [NEW] JSONPATH ADVANCED SEARCH / FILTER
     * A lightweight client-side JSONPath engine covering the most common
     * operators: root ($), recursive descent (..), child access (. and []),
     * array subscripts, wildcard (*), and filter expressions (?(@.key op val)).
     * ========================================================================= */

    /**
     * executeJSONPath
     * Public trigger for the JSONPath search bar. Reads the query from
     * #jsonpathInput, executes the path against state.data, and renders
     * the result in the Code view.
     */
    function executeJSONPath() {
        const query = DOM.jsonpathInput ? DOM.jsonpathInput.value.trim() : '';
        if (!query) {
            window.showToast('Please enter a JSONPath expression (e.g. $.users[*].name).');
            return;
        }

        if (!state.data) {
            window.showToast('Process your JSON first, then run a JSONPath query.');
            return;
        }

        try {
            const results = jsonPathQuery(state.data, query);
            const formatted = JSON.stringify(results, null, 4);
            DOM.codeOutput.innerHTML = syntaxHighlight(formatted);
            switchTab('code');
            window.showToast(`JSONPath returned ${Array.isArray(results) ? results.length : 1} result(s).`);
        } catch (e) {
            window.showToast('JSONPath Error: ' + e.message, true);
        }
    }

    /**
     * jsonPathQuery
     * Minimal but robust JSONPath engine supporting:
     *  $          → root
     *  .key       → child accessor
     *  [key]      → bracket accessor (string or number)
     *  [*]        → wildcard (all children)
     *  ..key      → recursive descent
     *  [?(@.key op value)]  → filter expression
     *
     * @param {any}    data  - Root JSON value to query.
     * @param {string} path  - JSONPath expression string.
     * @returns {any[]}      - Array of matched values.
     */
    function jsonPathQuery(data, path) {
        /* Tokenise the path into a flat list of segment objects */
        const tokens = tokenisePath(path);
        let results  = [data];

        for (const token of tokens) {
            const next = [];

            for (const node of results) {

                if (token.type === 'root') {
                    next.push(node);

                } else if (token.type === 'child') {
                    if (node !== null && typeof node === 'object') {
                        if (token.key === '*') {
                            /* Wildcard: push all values */
                            Object.values(node).forEach(v => next.push(v));
                        } else if (token.key in node) {
                            next.push(node[token.key]);
                        }
                    }

                } else if (token.type === 'recursive') {
                    /* Recursive descent: collect all descendants that match key */
                    recursiveDescend(node, token.key, next);

                } else if (token.type === 'filter') {
                    /* Filter expression: evaluate predicate on each array item */
                    const arr = Array.isArray(node) ? node : Object.values(node);
                    arr.forEach(item => {
                        if (evaluateFilter(item, token.predicate)) next.push(item);
                    });

                } else if (token.type === 'subscript') {
                    /* Array subscript: numeric index */
                    if (Array.isArray(node)) {
                        const idx = token.index < 0 ? node.length + token.index : token.index;
                        if (idx >= 0 && idx < node.length) next.push(node[idx]);
                    }

                } else if (token.type === 'slice') {
                    /* Array slice: [start:end] */
                    if (Array.isArray(node)) {
                        const sliced = node.slice(
                            token.start !== undefined ? token.start : undefined,
                            token.end   !== undefined ? token.end   : undefined
                        );
                        sliced.forEach(v => next.push(v));
                    }
                }
            }

            results = next;
            if (!results.length) break;
        }

        return results;
    }

    /**
     * tokenisePath
     * Converts a JSONPath string into an array of typed token objects.
     *
     * @param {string} path - JSONPath expression.
     * @returns {Object[]}  - Token descriptors.
     */
    function tokenisePath(path) {
        const tokens = [];
        let i        = 0;

        /* Consume leading '$' as the root token */
        if (path[0] === '$') {
            tokens.push({ type: 'root' });
            i = 1;
        }

        while (i < path.length) {
            /* Recursive descent: '..' */
            if (path[i] === '.' && path[i + 1] === '.') {
                i += 2;
                const key = readIdentifier(path, i);
                i += key.length;
                tokens.push({ type: 'recursive', key });

            /* Dot accessor: '.key' or '.*' */
            } else if (path[i] === '.') {
                i++;
                const key = readIdentifier(path, i);
                i += key.length;
                tokens.push({ type: 'child', key });

            /* Bracket accessor: [key], [n], [*], [?()], [start:end] */
            } else if (path[i] === '[') {
                const close = path.indexOf(']', i);
                if (close === -1) throw new Error('Unclosed "[" in JSONPath expression.');
                const inner = path.slice(i + 1, close).trim();
                i = close + 1;

                if (inner === '*') {
                    tokens.push({ type: 'child', key: '*' });

                } else if (inner.startsWith('?(') && inner.endsWith(')')) {
                    /* Filter expression */
                    const predicate = inner.slice(2, -1).trim();
                    tokens.push({ type: 'filter', predicate });

                } else if (inner.includes(':')) {
                    /* Array slice */
                    const parts = inner.split(':');
                    tokens.push({
                        type  : 'slice',
                        start : parts[0].trim() !== '' ? parseInt(parts[0], 10) : undefined,
                        end   : parts[1] && parts[1].trim() !== '' ? parseInt(parts[1], 10) : undefined
                    });

                } else if (/^-?\d+$/.test(inner)) {
                    tokens.push({ type: 'subscript', index: parseInt(inner, 10) });

                } else {
                    /* String key in brackets — strip surrounding quotes if present */
                    const key = inner.replace(/^['"]|['"]$/g, '');
                    tokens.push({ type: 'child', key });
                }

            } else {
                /* Bare identifier (no leading dot) — treat as child accessor */
                const key = readIdentifier(path, i);
                if (!key.length) throw new Error(`Unexpected character at position ${i}: "${path[i]}"`);
                i += key.length;
                tokens.push({ type: 'child', key });
            }
        }

        return tokens;
    }

    /**
     * readIdentifier
     * Reads a continuous identifier (letters, digits, underscore, dot-free)
     * from the path string starting at position i.
     *
     * @param {string} path - Full path string.
     * @param {number} i    - Start index.
     * @returns {string}    - The identifier substring (may be '*').
     */
    function readIdentifier(path, i) {
        let j = i;
        while (j < path.length && /[\w$*]/.test(path[j])) j++;
        return path.slice(i, j);
    }

    /**
     * recursiveDescend
     * Depth-first traversal of `node`; pushes every value whose key matches
     * `targetKey` into the `results` array.
     *
     * @param {any}    node      - Current node to traverse.
     * @param {string} targetKey - Key to match (or '*' for all).
     * @param {any[]}  results   - Accumulator array.
     */
    function recursiveDescend(node, targetKey, results) {
        if (node === null || typeof node !== 'object') return;
        for (const key in node) {
            if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
            if (targetKey === '*' || key === targetKey) results.push(node[key]);
            recursiveDescend(node[key], targetKey, results);
        }
    }

    /**
     * evaluateFilter
     * Evaluates a JSONPath filter predicate string against a node.
     * Supports: @.key (existence), @.key op value (comparison).
     * Operators: ==, !=, >, <, >=, <=.
     *
     * @param {any}    item      - The item to test.
     * @param {string} predicate - Raw predicate string from the filter token.
     * @returns {boolean}        - Whether the item passes the filter.
     */
    function evaluateFilter(item, predicate) {
        if (item === null || typeof item !== 'object') return false;

        /* Comparison: @.key op value */
        const cmpMatch = predicate.match(/^@\.(\w+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
        if (cmpMatch) {
            const [, key, op, rawVal] = cmpMatch;
            const actual = item[key];
            let expected;

            /* Parse the right-hand side: number, boolean, null, or quoted string */
            if (/^-?\d+(\.\d+)?$/.test(rawVal)) {
                expected = parseFloat(rawVal);
            } else if (rawVal === 'true')  {
                expected = true;
            } else if (rawVal === 'false') {
                expected = false;
            } else if (rawVal === 'null')  {
                expected = null;
            } else {
                expected = rawVal.replace(/^['"]|['"]$/g, '');
            }

            switch (op) {
                case '==': return actual == expected;
                case '!=': return actual != expected;
                case '>':  return actual >  expected;
                case '<':  return actual <  expected;
                case '>=': return actual >= expected;
                case '<=': return actual <= expected;
            }
        }

        /* Existence check: @.key */
        const existMatch = predicate.match(/^@\.(\w+)$/);
        if (existMatch) {
            return existMatch[1] in item && item[existMatch[1]] !== undefined;
        }

        return false;
    }

    /* =========================================================================
     * SECTION 16: [NEW] DATA CLEANER
     * Recursively removes null values, empty strings, and empty
     * arrays / objects from the parsed JSON tree.
     * ========================================================================= */

    /**
     * cleanJSON
     * Public trigger for the Data Cleaner feature.
     * Applies deepClean() to state.data and re-renders the output.
     */
    function cleanJSON() {
        if (!state.data) {
            window.showToast('Please process your JSON first, then use Clean JSON.');
            return;
        }

        const cleaned = deepClean(state.data);
        state.data    = cleaned;

        const formatted = JSON.stringify(cleaned, null, 4);
        DOM.input.value = formatted;
        DOM.codeOutput.innerHTML = formatted.length > 500000
            ? (DOM.codeOutput.textContent = formatted) || ''
            : syntaxHighlight(formatted);

        renderTree(cleaned);
        renderTable(cleaned);
        switchTab('code');
        window.showToast('Data cleaned: null values, empty strings, and empty arrays/objects removed.');
    }

    /**
     * deepClean
     * Recursively removes:
     *  • null values
     *  • empty strings ("")
     *  • empty arrays ([])
     *  • empty objects ({})
     * from any JSON value. Returns the cleaned value (or undefined if the
     * value itself should be omitted).
     *
     * @param {any} val - Any JSON-serialisable value.
     * @returns {any}   - Cleaned value (undefined signals the caller to drop this entry).
     */
    function deepClean(val) {
        if (val === null)      return undefined;
        if (val === '')        return undefined;

        if (Array.isArray(val)) {
            const cleaned = val
                .map(item => deepClean(item))
                .filter(item => item !== undefined);
            return cleaned.length === 0 ? undefined : cleaned;
        }

        if (typeof val === 'object') {
            const cleaned = {};
            for (const key in val) {
                if (!Object.prototype.hasOwnProperty.call(val, key)) continue;
                const result = deepClean(val[key]);
                if (result !== undefined) cleaned[key] = result;
            }
            return Object.keys(cleaned).length === 0 ? undefined : cleaned;
        }

        /* Primitive (number, boolean) — keep as-is */
        return val;
    }

    /* =========================================================================
     * SECTION 17: [NEW] SORT KEYS A-Z
     * Recursively sorts all object keys alphabetically for easier diffing
     * and reading. Arrays maintain their order; only object keys are sorted.
     * ========================================================================= */

    /**
     * sortKeys
     * Public trigger for the Sort Keys feature.
     * Applies deepSortKeys() to state.data and re-renders the output.
     */
    function sortKeys() {
        if (!state.data) {
            window.showToast('Please process your JSON first, then use Sort Keys.');
            return;
        }

        const sorted = deepSortKeys(state.data);
        state.data   = sorted;

        const formatted = JSON.stringify(sorted, null, 4);
        DOM.input.value = formatted;
        DOM.codeOutput.innerHTML = formatted.length > 500000
            ? (DOM.codeOutput.textContent = formatted) || ''
            : syntaxHighlight(formatted);

        renderTree(sorted);
        renderTable(sorted);
        switchTab('code');
        window.showToast('All object keys sorted A → Z recursively.');
    }

    /**
     * deepSortKeys
     * Recursively rebuilds every plain object with its keys sorted
     * alphabetically. Arrays are traversed but their order is preserved.
     *
     * @param {any} val - Any JSON-serialisable value.
     * @returns {any}   - A new value with all object keys sorted.
     */
    function deepSortKeys(val) {
        if (Array.isArray(val))  return val.map(deepSortKeys);
        if (val !== null && typeof val === 'object') {
            const sorted = {};
            Object.keys(val).sort().forEach(k => {
                sorted[k] = deepSortKeys(val[k]);
            });
            return sorted;
        }
        return val;
    }

    /* =========================================================================
     * SECTION 18: UTILITY HELPERS
     * ========================================================================= */

    /**
     * syntaxHighlight
     * Applies colour-class spans to a JSON string via a single RegExp pass.
     * The string is entity-encoded first to prevent XSS.
     *
     * @param {string} json - Valid JSON string produced by JSON.stringify.
     * @returns {string}    - HTML string with <span> colour wrappers.
     */
    function syntaxHighlight(json) {
        json = json
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        return json.replace(
            /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
            (match) => {
                let cls = 'json-number';
                if (/^"/.test(match)) {
                    cls = /:$/.test(match) ? 'json-key' : 'json-string';
                } else if (/true|false/.test(match)) {
                    cls = 'json-boolean';
                } else if (/null/.test(match)) {
                    cls = 'json-null';
                }
                return `<span class="${cls}">${match}</span>`;
            }
        );
    }

    /**
     * escapeHtml
     * Sanitises a value for safe innerHTML insertion.
     *
     * @param {any} text - Value to sanitise (coerced to string).
     * @returns {string} Entity-encoded string.
     */
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;');
    }

    /**
     * capitalise
     * Capitalises the first character of a string. Used for interface/class naming.
     *
     * @param {string} s - Input string.
     * @returns {string} String with first character uppercased.
     */
    function capitalise(s) {
        if (!s) return 'Unknown';
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    /**
     * updateSizeStat
     * Updates the byte/KB size indicator in the Input panel header.
     *
     * @param {string} str - Raw string whose size to display.
     */
    function updateSizeStat(str) {
        const bytes = new Blob([str]).size;
        DOM.sizeStat.textContent = bytes > 1024
            ? (bytes / 1024).toFixed(2) + ' KB'
            : bytes + ' B';
    }

    /**
     * debounce
     * Returns a debounced version of func that fires after `wait` ms of inactivity.
     *
     * @param {Function} func - Function to debounce.
     * @param {number}   wait - Delay in milliseconds.
     * @returns {Function}    - Debounced wrapper function.
     */
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    /**
     * showError
     * Displays a parse error in the inline error box and updates the status icon.
     *
     * @param {Error} e - SyntaxError thrown by JSON.parse.
     */
    function showError(e) {
        setStatus('invalid');
        DOM.errorBox.style.display = 'block';
        DOM.errorBox.innerHTML =
            `<strong><i class="fa-solid fa-circle-exclamation"></i> Syntax Error:</strong> ` +
            escapeHtml(e.message);
    }

    /**
     * setStatus
     * Updates the validation status indicator and Input panel border colour.
     *
     * @param {'valid'|'invalid'|'ready'} type - New status state.
     */
    function setStatus(type) {
        if (type === 'valid') {
            DOM.statusIcon.innerHTML =
                '<i class="fa-solid fa-check-circle" style="color:var(--status-success)"></i> Valid JSON';
            DOM.input.parentElement.style.borderColor = 'var(--status-success)';
        } else if (type === 'invalid') {
            DOM.statusIcon.innerHTML =
                '<i class="fa-solid fa-triangle-exclamation" style="color:var(--status-error)"></i> Invalid';
            DOM.input.parentElement.style.borderColor = 'var(--status-error)';
        } else {
            DOM.statusIcon.innerHTML =
                '<i class="fa-solid fa-circle" style="color:var(--text-muted)"></i> Ready';
            DOM.input.parentElement.style.borderColor = 'var(--border-main)';
        }
    }

    /* =========================================================================
     * SECTION 19: INITIALISATION HOOK
     * ========================================================================= */
    document.addEventListener('DOMContentLoaded', init);

    /* =========================================================================
     * SECTION 20: PUBLIC API
     * Only methods called from HTML onclick attributes are exposed.
     * Internal helpers remain private inside the IIFE closure.
     * ========================================================================= */
    return {
        /* Core formatting */
        processJSON,
        autoFixJSON,

        /* View / tab control */
        switchTab,

        /* Converters */
        convertToXML,
        convertToCSV,

        /* I/O */
        downloadResult,
        copyToClipboard,
        fetchFromUrl,
        handleFileUpload,

        /* Utilities */
        loadSample,
        clearAll,
        loadHistoryItem,

        /* [NEW] Pro Max features */
        generateTypes,
        executeJSONPath,
        cleanJSON,
        sortKeys
    };

})();
