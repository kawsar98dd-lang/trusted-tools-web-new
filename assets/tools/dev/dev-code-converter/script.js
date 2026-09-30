/**
 * UNIVERSAL MASTER ENCODER — SUPREME EDITION V4.1
 * Author  : MD KAWSAR
 * Brand   : TrustedToolsWeb
 * Type    : Production Ready
 * Features:
 *   - Zero-bug UTF-8 encoding via TextEncoder/TextDecoder (no deprecated escape/unescape)
 *   - XSS-safe history rendering using textContent only
 *   - Debounced live input to prevent UI lag
 *   - Magic Auto-Detect encoding
 *   - AES-256-GCM encrypt/decrypt via native Web Crypto API
 *   - HMAC-SHA256 via native Web Crypto API
 *   - True file hashing via ArrayBuffer (PDF, ZIP, EXE, etc.)
 *   - Batch Mode: process each line independently
 *   - Syntax highlighting for JSON & decoded JWT outputs
 *   - Low-power Matrix canvas animation (capped FPS + visibility API)
 *
 * V4.1 fixes:
 *   - Magic button now really decodes the input (was double-encoding)
 *   - JWT always decodes the token from the input box
 *   - Typing while an async job (AES/HMAC/SHA) runs is no longer dropped
 *   - Decode errors no longer overwrite the input box
 *   - Syntax highlighter escaped quotes before matching, so strings/keys were not coloured
 *   - Image files can now be hashed in SHA-256 / MD5 mode
 *   - Correct byte-accurate MD5 for files (own MD5 on bytes)
 *   - Chip toggles (Live / Batch / Auto Copy) no longer double-toggle; keyboard accessible
 *   - Image mode "Encode" no longer overwrites the Base64 result
 *   - Sensitive modes (AES / HMAC / JWT) are not stored in local history
 *   - Hex input validation, Morse unknown-character handling, safer clipboard/speech checks
 */

const UME_Engine = (function () {

    // ─────────────────────────────────────────────────────────────
    // PRIVATE: DOM CACHE
    // ─────────────────────────────────────────────────────────────
    const DOM = {
        in:       document.getElementById('TextInput'),
        out:      document.getElementById('ResultInput'),
        mode:     document.getElementById('codeType'),
        auto:     document.getElementById('autoConvert'),
        ac:       document.getElementById('autoCopy'),
        lbl:      document.getElementById('inputLabel'),
        outLbl:   document.getElementById('resultTitle'),
        hist:     document.getElementById('historyContainer'),
        file:     document.getElementById('fileInput'),
        charCount:    document.getElementById('charCount'),
        resultCount:  document.getElementById('resultCount'),
        timeTaken:    document.getElementById('timeTaken'),
        sFill:        document.getElementById('sFill'),
        strengthMeter: document.getElementById('strengthMeter'),
        syntaxPre:    document.getElementById('syntaxHighlightOutput'),
        aesKeyBar:    document.getElementById('aesKeyBar'),
        aesKeyInput:  document.getElementById('aesKeyInput'),
        hmacKeyBar:   document.getElementById('hmacKeyBar'),
        hmacKeyInput: document.getElementById('hmacKeyInput'),
        batchMode:    document.getElementById('batchMode'),
        chips: {
            auto:   document.getElementById('autoConvertChip'),
            copy:   document.getElementById('autoCopyChip'),
            upload: document.getElementById('uploadBtn'),
            zen:    document.getElementById('zenModeBtn'),
            batch:  document.getElementById('batchModeChip'),
            magic:  document.getElementById('magicDecodeBtn'),
        },
        btns: {
            enc:     document.getElementById('btnEncode'),
            dec:     document.getElementById('btnDecode'),
            swap:    document.getElementById('btnSwap'),
            speak:   document.getElementById('btnSpeak'),
            paste:   document.getElementById('btnPaste'),
            clear:   document.getElementById('btnClear'),
            copy:    document.getElementById('btnCopy'),
            dl:      document.getElementById('btnDownload'),
        },
    };

    // Processing guard + queue (latest request wins while a job is running)
    let isProcessing = false;
    let pendingJob = null;
    // History data array
    let historyData = [];

    // Modes that must never be written to localStorage history (may contain secrets)
    const NO_HISTORY_MODES = ['aes', 'hmac', 'jwt'];

    // ─────────────────────────────────────────────────────────────
    // UTILITY: Debounce
    // ─────────────────────────────────────────────────────────────
    function debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // ─────────────────────────────────────────────────────────────
    // UTILITY: Safe UTF-8 / Base64 / Hex helpers
    // ─────────────────────────────────────────────────────────────

    /** Encode a UTF-8 string to a Base64 string safely */
    function utf8ToBase64(str) {
        return bufferToBase64(new TextEncoder().encode(str).buffer);
    }

    /** Base64 (standard or URL-safe) string to bytes */
    function base64ToBytes(b64) {
        const normalised = b64.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(normalised);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    /** Decode a Base64 string to a UTF-8 string safely */
    function base64ToUtf8(b64) {
        return new TextDecoder('utf-8').decode(base64ToBytes(b64));
    }

    /** Convert a hex string to a Uint8Array (validated) */
    function hexToBytes(hex) {
        const clean = hex.replace(/\s+/g, '');
        if (!/^[0-9A-Fa-f]*$/.test(clean)) throw new Error('Invalid Hex — only 0-9 and A-F are allowed.');
        if (clean.length % 2 !== 0) throw new Error('Invalid Hex length — must be even.');
        const bytes = new Uint8Array(clean.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }

    /** Convert ArrayBuffer to hex string */
    function bufferToHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /** Convert ArrayBuffer to Base64 string (chunked — safe for large buffers) */
    function bufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary);
    }

    /** Convert Base64 string to ArrayBuffer */
    function base64ToBuffer(b64) {
        return base64ToBytes(b64).buffer;
    }

    /** True when bytes are valid UTF-8 text without odd control characters */
    function isReadableUtf8(bytes) {
        try {
            const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            return !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(s);
        } catch {
            return false;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // UTILITY: Byte-accurate MD5 (used for FILE hashing only).
    // The loaded md5.min.js treats input as text, which corrupts
    // binary files. This works directly on raw bytes.
    // ─────────────────────────────────────────────────────────────
    const MD5_S = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];
    const MD5_K = new Uint32Array(64);
    for (let i = 0; i < 64; i++) MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;

    function md5Bytes(bytes) {
        const len = bytes.length;
        const total = (Math.floor((len + 8) / 64) + 1) * 64;
        const buf = new Uint8Array(total);
        buf.set(bytes);
        buf[len] = 0x80;
        const dv = new DataView(buf.buffer);
        dv.setUint32(total - 8, (len << 3) >>> 0, true);
        dv.setUint32(total - 4, Math.floor(len / 536870912), true);

        let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
        const M = new Uint32Array(16);

        for (let off = 0; off < total; off += 64) {
            for (let j = 0; j < 16; j++) M[j] = dv.getUint32(off + j * 4, true);
            let A = a0, B = b0, C = c0, D = d0;
            for (let i = 0; i < 64; i++) {
                let F, g;
                if (i < 16)      { F = (B & C) | (~B & D); g = i; }
                else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
                else if (i < 48) { F = B ^ C ^ D;          g = (3 * i + 5) % 16; }
                else             { F = C ^ (B | ~D);       g = (7 * i) % 16; }
                F = (F + A + MD5_K[i] + M[g]) >>> 0;
                A = D; D = C; C = B;
                const s = MD5_S[i];
                B = (B + (((F << s) | (F >>> (32 - s))) >>> 0)) >>> 0;
            }
            a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0;
            c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
        }

        let hex = '';
        [a0, b0, c0, d0].forEach(w => {
            for (let k = 0; k < 4; k++) hex += ((w >>> (8 * k)) & 255).toString(16).padStart(2, '0');
        });
        return hex;
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 1: CORE CONVERSION HUB
    // ─────────────────────────────────────────────────────────────

    /**
     * Queue-safe entry point.
     * @param {string} action - 'encode' or 'decode'
     * @param {{fromInput?: boolean}} [opts] - fromInput: read the input box and write the output box
     */
    async function processData(action, opts = {}) {
        if (isProcessing) {
            pendingJob = [action, opts]; // latest request wins
            return;
        }
        isProcessing = true;
        try {
            await runProcess(action, opts);
        } catch (e) {
            showToast('Unexpected error: ' + e.message, 'error');
        } finally {
            isProcessing = false;
            if (pendingJob) {
                const [a, o] = pendingJob;
                pendingJob = null;
                processData(a, o);
            }
        }
    }

    async function runProcess(action, opts) {
        const t0 = performance.now();
        const mode = DOM.mode.value;

        // JWT and Magic always read the input box and write the output box.
        const fromInput = action === 'encode' || !!opts.fromInput || mode === 'jwt';
        const op = mode === 'jwt' ? 'decode' : action;
        const sourceEl = fromInput ? DOM.in : DOM.out;
        const targetEl = fromInput ? DOM.out : DOM.in;

        // Image mode: decode has nothing to convert
        if (mode === 'base64img' && action === 'decode') {
            showToast('Copy the Base64 output and paste it into a browser address bar to view the image.', 'error');
            return;
        }

        const val = sourceEl.value;

        // Guard: empty input (except image mode)
        if (!val.trim() && mode !== 'base64img') {
            if (targetEl === DOM.out) {
                DOM.out.value = '';
                hideSyntaxHighlight();
                updateStats();
            } else {
                showToast('Nothing to decode.', 'error');
            }
            return;
        }

        let result = '';
        let errorMsg = null;
        let useSyntaxHighlight = false;

        try {
            switch (mode) {
                // ── ONE-WAY HASHES ──
                case 'sha256':
                case 'md5':
                    if (op === 'decode') throw new Error('Hashes are one-way functions (irreversible by design).');
                    result = await performHash(val, mode);
                    break;

                // ── IMAGE TO BASE64 ──
                case 'base64img':
                    // The Base64 data URL was already written by the FileReader — keep it.
                    if (!DOM.out.value) throw new Error('Upload an image first using the Upload button.');
                    result = DOM.out.value;
                    break;

                // ── JWT DECODER ──
                case 'jwt':
                    result = parseJWT(val);
                    useSyntaxHighlight = true;
                    break;

                // ── JSON FORMATTER ──
                case 'json': {
                    const obj = JSON.parse(val);
                    result = op === 'encode'
                        ? JSON.stringify(obj, null, 4)
                        : JSON.stringify(obj);
                    if (op === 'encode') useSyntaxHighlight = true;
                    break;
                }

                // ── AES-256-GCM ──
                case 'aes':
                    result = op === 'encode'
                        ? await aesEncrypt(val, DOM.aesKeyInput.value)
                        : await aesDecrypt(val, DOM.aesKeyInput.value);
                    break;

                // ── HMAC-SHA256 ──
                case 'hmac':
                    if (op === 'decode') throw new Error('HMAC-SHA256 is a one-way keyed hash (irreversible).');
                    result = await hmacSHA256(val, DOM.hmacKeyInput.value);
                    break;

                // ── STANDARD CONVERSIONS ──
                default:
                    result = DOM.batchMode.checked
                        ? processBatch(val, mode, op)
                        : standardConvert(val, mode, op);
            }
        } catch (e) {
            errorMsg = e.message;
        }

        if (errorMsg) {
            if (targetEl === DOM.out) {
                hideSyntaxHighlight();
                DOM.out.value = '⚠ Error: ' + errorMsg;
            } else {
                // Never overwrite the user's input with an error message
                showToast(errorMsg, 'error');
            }
        } else if (useSyntaxHighlight && targetEl === DOM.out) {
            showSyntaxHighlight(result);
            targetEl.value = result; // Keep raw value for copy/download
        } else {
            hideSyntaxHighlight();
            targetEl.value = result;
        }

        // Stats & side effects
        DOM.timeTaken.textContent = Math.round(performance.now() - t0) + 'ms';
        updateStats();

        if (!errorMsg && val.length > 2 && action === 'encode' && mode !== 'base64img') {
            addToHistory(mode, val);
            if (DOM.ac.checked && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(result).catch(() => {});
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 2: STANDARD TEXT CONVERSIONS
    // ─────────────────────────────────────────────────────────────

    function standardConvert(text, mode, action) {
        if (action === 'encode') {
            switch (mode) {
                case 'binary':
                    return Array.from(text)
                        .map(c => c.codePointAt(0).toString(2).padStart(8, '0'))
                        .join(' ');

                case 'hex':
                    return Array.from(new TextEncoder().encode(text))
                        .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
                        .join(' ');

                case 'base64':
                    return utf8ToBase64(text);

                case 'ascii':
                    return Array.from(text)
                        .map(c => c.codePointAt(0))
                        .join(' ');

                case 'url':
                    return encodeURIComponent(text);

                case 'morse':
                    return textToMorse(text);

                default:
                    return text;
            }
        } else {
            const clean = text.trim();
            switch (mode) {
                case 'binary':
                    return clean.split(/\s+/)
                        .map(b => {
                            const cp = parseInt(b, 2);
                            if (!/^[01]+$/.test(b) || isNaN(cp)) throw new Error('Invalid binary token: ' + b);
                            return String.fromCodePoint(cp);
                        })
                        .join('');

                case 'hex': {
                    const bytes = hexToBytes(clean);
                    return new TextDecoder('utf-8').decode(bytes);
                }

                case 'base64':
                    return base64ToUtf8(clean.replace(/\s/g, ''));

                case 'ascii':
                    return clean.split(/\s+/)
                        .map(d => {
                            const cp = parseInt(d, 10);
                            if (isNaN(cp)) throw new Error('Invalid ASCII code: ' + d);
                            return String.fromCodePoint(cp);
                        })
                        .join('');

                case 'url':
                    return decodeURIComponent(clean);

                case 'morse':
                    return morseToText(clean);

                default:
                    return text;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 3: BATCH MODE
    // ─────────────────────────────────────────────────────────────
    function processBatch(text, mode, action) {
        return text.split('\n').map(line => {
            if (!line.trim()) return '';
            try {
                return standardConvert(line, mode, action);
            } catch (e) {
                return '⚠ ' + e.message;
            }
        }).join('\n');
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 4: JWT PARSER
    // ─────────────────────────────────────────────────────────────
    function parseJWT(token) {
        const parts = token.trim().split('.');
        if (parts.length !== 3) throw new Error('Invalid JWT structure — expected 3 dot-separated parts.');

        let header, payload;
        try {
            header  = JSON.parse(base64ToUtf8(parts[0]));
            payload = JSON.parse(base64ToUtf8(parts[1]));
        } catch {
            throw new Error('Invalid JWT — header or payload is not valid Base64URL JSON.');
        }

        // Enrich payload with human-readable timestamps
        const enriched = { ...payload };
        ['exp', 'iat', 'nbf'].forEach(field => {
            if (typeof enriched[field] === 'number' && isFinite(enriched[field])) {
                enriched[`${field}_human`] = new Date(enriched[field] * 1000).toUTCString();
            }
        });

        return (
            '// ─── HEADER ───────────────────────────────────\n' +
            JSON.stringify(header, null, 4) +
            '\n\n// ─── PAYLOAD ──────────────────────────────────\n' +
            JSON.stringify(enriched, null, 4) +
            '\n\n// ─── SIGNATURE (NOT VERIFIED) ─────────────────\n' +
            '// "' + parts[2].substring(0, 40) + (parts[2].length > 40 ? '...' : '') + '"'
        );
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 5: HASHING (SHA-256 & MD5)
    // ─────────────────────────────────────────────────────────────

    async function performHash(text, type) {
        if (type === 'md5') {
            if (typeof md5 !== 'function') throw new Error('MD5 library failed to load. Check the script tag.');
            return md5(text);
        }
        if (!window.crypto || !window.crypto.subtle) throw new Error('SHA-256 requires a secure context (HTTPS or localhost).');
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return bufferToHex(hashBuffer);
    }

    /** Hash a File using its raw bytes (byte-accurate for any file type). */
    async function hashFile(file, type) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const arrayBuffer = ev.target.result;
                    if (type === 'md5') {
                        resolve(md5Bytes(new Uint8Array(arrayBuffer)));
                    } else {
                        if (!window.crypto || !window.crypto.subtle) throw new Error('SHA-256 requires a secure context (HTTPS or localhost).');
                        resolve(bufferToHex(await crypto.subtle.digest('SHA-256', arrayBuffer)));
                    }
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file.'));
            reader.readAsArrayBuffer(file);
        });
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 6: AES-256-GCM ENCRYPTION / DECRYPTION
    // Output format: Base64(salt[16] + iv[12] + ciphertext)
    // ─────────────────────────────────────────────────────────────

    async function deriveAESKey(passphrase, salt) {
        if (!passphrase || passphrase.trim() === '') {
            throw new Error('A secret key is required for AES encryption. Enter it in the key field above.');
        }
        if (!window.crypto || !window.crypto.subtle) throw new Error('AES requires a secure context (HTTPS or localhost).');
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(passphrase),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function aesEncrypt(plaintext, passphrase) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv   = crypto.getRandomValues(new Uint8Array(12));
        const key  = await deriveAESKey(passphrase, salt);
        const cipherBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            new TextEncoder().encode(plaintext)
        );
        const combined = new Uint8Array(16 + 12 + cipherBuffer.byteLength);
        combined.set(salt, 0);
        combined.set(iv, 16);
        combined.set(new Uint8Array(cipherBuffer), 28);
        return bufferToBase64(combined.buffer);
    }

    async function aesDecrypt(cipherBase64, passphrase) {
        let combined;
        try {
            combined = new Uint8Array(base64ToBuffer(cipherBase64.replace(/\s/g, '')));
        } catch {
            throw new Error('Invalid AES ciphertext — not valid Base64.');
        }
        if (combined.byteLength < 29) throw new Error('Invalid AES ciphertext — data is too short.');
        const salt       = combined.slice(0, 16);
        const iv         = combined.slice(16, 28);
        const ciphertext = combined.slice(28);
        const key = await deriveAESKey(passphrase, salt);
        let plainBuffer;
        try {
            plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        } catch {
            throw new Error('Decryption failed — wrong key or corrupted ciphertext.');
        }
        return new TextDecoder().decode(plainBuffer);
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 7: HMAC-SHA256
    // ─────────────────────────────────────────────────────────────

    async function hmacSHA256(message, secret) {
        if (!secret || secret.trim() === '') {
            throw new Error('A secret key is required for HMAC. Enter it in the key field above.');
        }
        if (!window.crypto || !window.crypto.subtle) throw new Error('HMAC requires a secure context (HTTPS or localhost).');
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', keyMaterial, new TextEncoder().encode(message));
        return bufferToHex(signature);
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 8: MAGIC AUTO-DETECT
    // Heuristic: Hex and Base64 are only accepted when the decoded
    // bytes are readable UTF-8 text, which avoids most false matches.
    // ─────────────────────────────────────────────────────────────

    function detectEncoding(text) {
        const t = text.trim();
        const compact = t.replace(/\s/g, '');

        // JWT: three base64url segments; header must be JSON
        if (/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*$/.test(t)) {
            try {
                const h = JSON.parse(base64ToUtf8(t.split('.')[0]));
                if (h && typeof h === 'object') return 'jwt';
            } catch { /* not a JWT */ }
        }

        // Binary: only 0s and 1s in groups of 8 bits
        if (/^[01\s]+$/.test(t) && t.split(/\s+/).every(s => s.length === 8)) return 'binary';

        // Hex: hex chars only, even length, decodes to readable text
        if (/^[0-9A-Fa-f]+$/.test(compact) && compact.length % 2 === 0 && compact.length >= 4) {
            try { if (isReadableUtf8(hexToBytes(compact))) return 'hex'; } catch { /* not hex */ }
        }

        // URL encoded
        if (/%[0-9A-Fa-f]{2}/.test(t)) return 'url';

        // Morse: only . - / and spaces (at least one dot or dash)
        if (/^[.\-\/\s]+$/.test(t) && /[.\-]/.test(t)) return 'morse';

        // Base64: alphabet + padding, decodes to readable text
        if (/^[A-Za-z0-9+/\-_]+=*$/.test(compact) && compact.length % 4 === 0) {
            try { if (isReadableUtf8(base64ToBytes(compact))) return 'base64'; } catch { /* not base64 */ }
        }

        return null;
    }

    function magicDecode() {
        const val = DOM.in.value.trim();
        if (!val) { showToast('Paste something in the input first!', 'error'); return; }

        const detected = detectEncoding(val);
        if (!detected) {
            showToast('Could not auto-detect encoding format.', 'error');
            return;
        }

        DOM.mode.value = detected;
        changeMode(true); // update labels only — do not auto-encode
        processData('decode', { fromInput: true }); // decode input → output
        showToast('Magic! Detected: ' + detected.toUpperCase());
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 9: MORSE CODE
    // ─────────────────────────────────────────────────────────────
    const MORSE = {
        'A':'.-',  'B':'-...','C':'-.-.','D':'-..', 'E':'.','F':'..-.','G':'--.','H':'....',
        'I':'..', 'J':'.---','K':'-.-', 'L':'.-..','M':'--','N':'-.', 'O':'---','P':'.--.',
        'Q':'--.-','R':'.-.', 'S':'...', 'T':'-',  'U':'..-','V':'...-','W':'.--','X':'-..-',
        'Y':'-.--','Z':'--..','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....',
        '6':'-....','7':'--...','8':'---..','9':'----.','0':'-----',' ':'/','.'  : '.-.-.-',
        ',':'--..--','?':'..--..','!':'-.-.--','-':'-....-','/':'-..-.','(':'-.--.',')'  :'-.--.-'
    };
    const REV_MORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
    // Unknown characters are skipped (previously they produced a false word break)
    function textToMorse(t) { return t.toUpperCase().split('').map(c => MORSE[c]).filter(Boolean).join(' '); }
    function morseToText(t) { return t.trim().split(/\s+/).map(c => REV_MORSE[c] || '').join(''); }

    // ─────────────────────────────────────────────────────────────
    // SECTION 10: SYNTAX HIGHLIGHTING
    // Tokenises the RAW text, then escapes every piece it outputs.
    // ─────────────────────────────────────────────────────────────

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function highlightJSON(json) {
        const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\]])/g;
        let out = '';
        let last = 0;
        let m;
        while ((m = re.exec(json)) !== null) {
            out += escapeHtml(json.slice(last, m.index));
            if (m[5])                 out += '<span class="ume-hl-bracket">' + escapeHtml(m[5]) + '</span>';
            else if (m[3])            out += '<span class="ume-hl-literal">' + escapeHtml(m[3]) + '</span>';
            else if (m[4])            out += '<span class="ume-hl-number">' + escapeHtml(m[4]) + '</span>';
            else if (m[1] && m[2])    out += '<span class="ume-hl-key">' + escapeHtml(m[1]) + '</span>' + escapeHtml(m[2]);
            else                      out += '<span class="ume-hl-string">' + escapeHtml(m[1]) + '</span>';
            last = re.lastIndex;
        }
        return out + escapeHtml(json.slice(last));
    }

    function highlightJWT(raw) {
        return raw.split('\n').map(line => {
            if (line.trim().startsWith('//')) return '<span class="ume-hl-comment">' + escapeHtml(line) + '</span>';
            return highlightJSON(line);
        }).join('\n');
    }

    function showSyntaxHighlight(content) {
        // All text is escaped inside highlightJSON()/highlightJWT() before insertion
        DOM.syntaxPre.innerHTML = DOM.mode.value === 'jwt' ? highlightJWT(content) : highlightJSON(content);
        DOM.syntaxPre.classList.remove('d-none');
        DOM.out.classList.add('d-none');
    }

    function hideSyntaxHighlight() {
        DOM.syntaxPre.classList.add('d-none');
        DOM.out.classList.remove('d-none');
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 11: UI & EVENT HANDLERS
    // ─────────────────────────────────────────────────────────────

    const debouncedEncode = debounce(() => processData('encode'), 350);
    const debouncedDecode = debounce(() => processData('decode'), 350);

    /** Make a role="button" div behave like a real button for the keyboard */
    function bindKeyboardActivate(el, handler) {
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handler();
            }
        });
    }

    function initListeners() {
        // --- Input listeners ---
        DOM.in.addEventListener('input', () => {
            updateStats();
            checkStrength();
            if (DOM.auto.checked) debouncedEncode();
        });

        DOM.out.addEventListener('input', () => {
            const noDecodeTypes = ['sha256', 'md5', 'base64img', 'hmac', 'jwt'];
            if (DOM.auto.checked && !noDecodeTypes.includes(DOM.mode.value)) {
                debouncedDecode();
            }
        });

        // --- Mode selector ---
        DOM.mode.addEventListener('change', () => changeMode());

        // --- Encode / Decode buttons ---
        DOM.btns.enc.addEventListener('click', () => processData('encode'));
        DOM.btns.dec.addEventListener('click', () => processData('decode'));

        // --- Swap ---
        DOM.btns.swap.addEventListener('click', swapContent);

        // --- Copy ---
        DOM.btns.copy.addEventListener('click', () => {
            copyText(DOM.out.value || DOM.syntaxPre.textContent);
        });

        // --- Paste ---
        DOM.btns.paste.addEventListener('click', async () => {
            try {
                if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('unsupported');
                const t = await navigator.clipboard.readText();
                DOM.in.value = t;
                updateStats();
                checkStrength();
                if (DOM.auto.checked) debouncedEncode();
            } catch {
                showToast('Clipboard access denied by browser.', 'error');
            }
        });

        // --- Clear ---
        DOM.btns.clear.addEventListener('click', () => {
            DOM.in.value = '';
            DOM.out.value = '';
            hideSyntaxHighlight();
            updateStats();
            checkStrength();
            showToast('Cleared!');
        });

        // --- Text-to-Speech ---
        DOM.btns.speak.addEventListener('click', () => {
            if (!('speechSynthesis' in window)) return showToast('Read aloud is not supported in this browser.', 'error');
            if (!DOM.in.value) return showToast('Nothing to read aloud.', 'error');
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(DOM.in.value));
        });

        // --- Download ---
        DOM.btns.dl.addEventListener('click', downloadResult);

        // --- Checkbox chips: rely on the native label → checkbox behaviour and
        //     listen to 'change' (avoids the old double-toggle). ---
        DOM.auto.addEventListener('change', () => {
            DOM.chips.auto.classList.toggle('active', DOM.auto.checked);
            DOM.chips.auto.setAttribute('aria-checked', String(DOM.auto.checked));
        });

        DOM.ac.addEventListener('change', () => {
            DOM.chips.copy.classList.toggle('active', DOM.ac.checked);
        });

        DOM.batchMode.addEventListener('change', () => {
            DOM.chips.batch.classList.toggle('active', DOM.batchMode.checked);
            DOM.chips.batch.setAttribute('aria-checked', String(DOM.batchMode.checked));
            showToast('Batch Mode ' + (DOM.batchMode.checked ? 'ON' : 'OFF'));
            if (DOM.in.value && DOM.mode.value !== 'base64img') processData('encode');
        });

        // Keyboard access for the label chips (their checkbox is display:none)
        [[DOM.chips.auto, DOM.auto], [DOM.chips.batch, DOM.batchMode], [DOM.chips.copy, DOM.ac]].forEach(([chip, box]) => {
            chip.setAttribute('tabindex', '0');
            bindKeyboardActivate(chip, () => box.click());
        });

        // --- Magic decode button ---
        DOM.chips.magic.addEventListener('click', magicDecode);
        bindKeyboardActivate(DOM.chips.magic, magicDecode);

        // --- Upload chip ---
        DOM.chips.upload.addEventListener('click', () => DOM.file.click());
        bindKeyboardActivate(DOM.chips.upload, () => DOM.file.click());

        // --- Zen / Fullscreen ---
        DOM.chips.zen.addEventListener('click', toggleFullScreen);
        bindKeyboardActivate(DOM.chips.zen, toggleFullScreen);

        // --- File upload ---
        DOM.file.addEventListener('change', handleFileUpload);

        // --- Key inputs re-run encode when text is present ---
        DOM.aesKeyInput.addEventListener('input', debounce(() => {
            if (DOM.in.value && DOM.mode.value === 'aes') processData('encode');
        }, 600));

        DOM.hmacKeyInput.addEventListener('input', debounce(() => {
            if (DOM.in.value && DOM.mode.value === 'hmac') processData('encode');
        }, 600));
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 12: MODE CHANGE HANDLER
    // ─────────────────────────────────────────────────────────────

    function changeMode(skipAutoEncode) {
        const m = DOM.mode.value;
        const labelMap = {
            binary:    ['Text Input',     'Binary Output'],
            hex:       ['Text Input',     'Hexadecimal'],
            base64:    ['Text Input',     'Base64 String'],
            base64img: ['Image File',     'Base64 Code'],
            jwt:       ['JWT Token',      'Decoded JSON'],
            json:      ['Raw JSON',       'Beautified / Minified'],
            sha256:    ['Text Input',     'SHA-256 Hash'],
            md5:       ['Text Input',     'MD5 Hash'],
            ascii:     ['Text Input',     'ASCII Codes'],
            morse:     ['Text Input',     'Morse Code'],
            url:       ['Text Input',     'URL Encoded / Decoded'],
            aes:       ['Plaintext',      'AES-256-GCM Ciphertext'],
            hmac:      ['Message Input',  'HMAC-SHA256 Signature'],
        };

        DOM.lbl.textContent = labelMap[m] ? labelMap[m][0] : 'Input Data';
        const outText = labelMap[m] ? labelMap[m][1] : 'Output Result';
        // Safe DOM update — no innerHTML
        DOM.outLbl.textContent = '';
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-code';
        icon.setAttribute('aria-hidden', 'true');
        DOM.outLbl.appendChild(icon);
        DOM.outLbl.append(' ' + outText);

        // Show/hide key bars
        DOM.aesKeyBar.classList.toggle('d-none', m !== 'aes');
        DOM.hmacKeyBar.classList.toggle('d-none', m !== 'hmac');

        // Image mode UI
        if (m === 'base64img') {
            DOM.chips.upload.classList.add('active');
            DOM.in.placeholder = 'Upload an image using the Upload button above...';
            DOM.in.readOnly = true;
        } else {
            DOM.chips.upload.classList.remove('active');
            DOM.in.placeholder = 'Type or paste content here...';
            DOM.in.readOnly = false;
        }

        hideSyntaxHighlight();

        if (!skipAutoEncode && DOM.in.value && m !== 'base64img') processData('encode');
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 13: SWAP CONTENT
    // ─────────────────────────────────────────────────────────────
    function swapContent() {
        if (DOM.mode.value === 'base64img') {
            return showToast('Image mode cannot be swapped!', 'error');
        }
        const temp = DOM.in.value;
        DOM.in.value = DOM.out.value || DOM.syntaxPre.textContent;
        DOM.out.value = temp;
        hideSyntaxHighlight();
        checkStrength();
        updateStats();
        const oneWay = ['sha256', 'md5', 'hmac', 'jwt'];
        if (!oneWay.includes(DOM.mode.value) && DOM.in.value) {
            processData('decode');
            showToast('Swapped & Decoded!');
        } else {
            showToast('Content swapped!');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 14: FILE UPLOAD HANDLER
    // ─────────────────────────────────────────────────────────────
    async function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = ''; // allow re-selecting the same file

        if (file.size > 100 * 1024 * 1024) {
            showToast('File > 100MB — browser may freeze during processing.', 'error');
        }

        const sizeKB = (file.size / 1024).toFixed(2);

        // Hash modes first — any file type (including images) is hashed byte-for-byte
        if (DOM.mode.value === 'sha256' || DOM.mode.value === 'md5') {
            const algo = DOM.mode.value;
            DOM.in.value = `[FILE LOADED — Hashing...]\nName : ${file.name}\nSize : ${sizeKB} KB\nType : ${file.type || 'unknown'}`;
            showToast('Hashing file...', 'success');
            try {
                const hash = await hashFile(file, algo);
                hideSyntaxHighlight();
                DOM.out.value = hash;
                DOM.in.value = `[FILE HASHED]\nName : ${file.name}\nSize : ${sizeKB} KB\nType : ${file.type || 'unknown'}\n\nAlgorithm : ${algo.toUpperCase()}`;
                updateStats();
                showToast('File hash computed successfully!');
            } catch (err) {
                DOM.out.value = '⚠ Error: ' + err.message;
                showToast('Hashing failed: ' + err.message, 'error');
            }
            return;
        }

        // Image → Base64 mode
        if (file.type.startsWith('image/') || DOM.mode.value === 'base64img') {
            DOM.mode.value = 'base64img';
            changeMode(true);
            const reader = new FileReader();
            reader.onload = (ev) => {
                DOM.out.value = ev.target.result;
                DOM.in.value = `[IMAGE LOADED]\nName : ${file.name}\nSize : ${sizeKB} KB\nType : ${file.type || 'unknown'}`;
                hideSyntaxHighlight();
                updateStats();
                showToast('Image converted to Base64!');
            };
            reader.onerror = () => showToast('Failed to read image.', 'error');
            reader.readAsDataURL(file);
            return;
        }

        // Text files → load as text
        const reader = new FileReader();
        reader.onload = (ev) => {
            DOM.in.value = ev.target.result;
            updateStats();
            checkStrength();
            if (DOM.auto.checked) debouncedEncode();
            showToast('File loaded!');
        };
        reader.onerror = () => showToast('Failed to read file.', 'error');
        reader.readAsText(file, 'UTF-8');
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 15: STATS & UI HELPERS
    // ─────────────────────────────────────────────────────────────

    function updateStats() {
        DOM.charCount.textContent   = DOM.in.value.length + ' Chars';
        DOM.resultCount.textContent = (DOM.out.value || DOM.syntaxPre.textContent || '').length + ' Length';
    }

    function checkStrength() {
        const val = DOM.in.value;
        if (!val) { DOM.strengthMeter.style.display = 'none'; return; }
        DOM.strengthMeter.style.display = 'block';

        let score = 0;
        if (val.length > 8)           score++;
        if (/[A-Z]/.test(val))        score++;
        if (/[0-9]/.test(val))        score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        const colors = ['#ff0055', '#ff9f43', '#00d2ff', '#00ff9d'];
        const widths = ['25%', '50%', '75%', '100%'];
        const idx = Math.max(0, score - 1);
        DOM.sFill.style.width      = widths[idx] || '10%';
        DOM.sFill.style.background = colors[idx] || colors[0];
    }

    function legacyCopy(txt) {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        document.body.removeChild(ta);
        showToast(ok ? 'Copied!' : 'Copy failed — please copy manually.', ok ? 'success' : 'error');
    }

    function copyText(txt) {
        if (!txt) return showToast('Nothing to copy.', 'error');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt)
                .then(() => showToast('Copied to clipboard!'))
                .catch(() => legacyCopy(txt));
        } else {
            legacyCopy(txt);
        }
    }

    function downloadResult() {
        const content = DOM.out.value || DOM.syntaxPre.textContent;
        if (!content) return showToast('Nothing to download.', 'error');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `trusted-tools-${DOM.mode.value}-${Date.now()}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function showToast(msg, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast-msg ${type}`;

        const icon = document.createElement('i');
        icon.className = type === 'error'
            ? 'fa-solid fa-triangle-exclamation'
            : 'fa-solid fa-circle-check';
        icon.setAttribute('aria-hidden', 'true');

        toast.appendChild(icon);
        toast.appendChild(document.createTextNode(' ' + msg));
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3200);
    }

    function toggleFullScreen() {
        if (!document.fullscreenElement) {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
            } else {
                showToast('Fullscreen is not supported in this browser.', 'error');
            }
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 16: HISTORY (XSS-SAFE)
    // ─────────────────────────────────────────────────────────────

    function renderHistory() {
        try {
            const raw = JSON.parse(localStorage.getItem('ttw_ume_history') || '[]');
            // Validate shape and mode — storage can be edited by anyone
            historyData = Array.isArray(raw)
                ? raw.filter(i => i && typeof i.mode === 'string' && typeof i.val === 'string' &&
                                  typeof i.time === 'string' && !NO_HISTORY_MODES.includes(i.mode) &&
                                  Array.from(DOM.mode.options).some(o => o.value === i.mode))
                : [];
        } catch {
            historyData = [];
        }

        while (DOM.hist.firstChild) DOM.hist.removeChild(DOM.hist.firstChild);

        if (historyData.length === 0) {
            const empty = document.createElement('span');
            empty.className = 'ume-history-empty';
            empty.textContent = 'No history yet...';
            DOM.hist.appendChild(empty);
            return;
        }

        [...historyData].reverse().forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.setAttribute('role', 'listitem');
            div.setAttribute('tabindex', '0');
            div.setAttribute('aria-label', 'History: ' + item.mode + ' - ' + item.val.substring(0, 20));

            const textDiv = document.createElement('div');
            textDiv.className = 'h-text';

            const strong = document.createElement('strong');
            strong.textContent = item.mode.toUpperCase() + ':';

            textDiv.appendChild(strong);
            textDiv.append(' ' + item.val.substring(0, 24) + (item.val.length > 24 ? '…' : ''));

            const timeDiv = document.createElement('div');
            timeDiv.className = 'h-time';
            timeDiv.textContent = item.time;

            div.appendChild(textDiv);
            div.appendChild(timeDiv);

            const loadItem = () => {
                DOM.in.value = item.val;
                DOM.mode.value = item.mode;
                changeMode();
                updateStats();
                checkStrength();
                showToast('History loaded!');
            };

            div.addEventListener('click', loadItem);
            div.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadItem(); }
            });

            DOM.hist.appendChild(div);
        });
    }

    function addToHistory(mode, val) {
        // Never store secrets (AES plaintext, HMAC messages, JWT tokens) or very large inputs
        if (NO_HISTORY_MODES.includes(mode) || val.length > 2000) return;
        if (historyData.length > 0 && historyData[historyData.length - 1].val === val) return;

        historyData.push({
            mode,
            val,
            time: new Date().toLocaleTimeString(),
        });
        if (historyData.length > 12) historyData.shift();

        try {
            localStorage.setItem('ttw_ume_history', JSON.stringify(historyData));
        } catch {
            // localStorage might be unavailable (private mode / quota)
        }
        renderHistory();
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 17: PUBLIC INIT
    // ─────────────────────────────────────────────────────────────
    return {
        init() {
            initListeners();
            renderHistory();
            changeMode(); // Set initial labels
        },
    };

})();

// ─────────────────────────────────────────────────────────────────────────────
// MATRIX FX — LOW-POWER OPTIMISED CANVAS ANIMATION
//   1. Capped at ~18 FPS.
//   2. Stops when the tab is hidden (Page Visibility API).
//   3. Larger font on mobile = fewer columns = lower workload.
//   4. Not started at all when the user prefers reduced motion.
//   5. Resize only re-initialises when the WIDTH changes (mobile address-bar
//      show/hide changes only the height and used to reset the animation).
// ─────────────────────────────────────────────────────────────────────────────
const MatrixFX = (function () {
    const canvas = document.getElementById('matrixCanvas');
    if (!canvas) return null;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const CHARS = '01TRUSTEDTOOLSWEB'.split('');
    const TARGET_FPS = 18;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;

    const isMobile = window.innerWidth < 768;
    const FONT_SIZE = isMobile ? 20 : 13;

    let columns = 0;
    let drops = [];
    let animationId = null;
    let lastFrameTime = 0;
    let lastWidth = 0;

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        lastWidth = window.innerWidth;
        columns = Math.floor(canvas.width / FONT_SIZE);
        drops   = Array(columns).fill(1);
    }

    function draw(timestamp) {
        if (timestamp - lastFrameTime < FRAME_INTERVAL) {
            animationId = requestAnimationFrame(draw);
            return;
        }
        lastFrameTime = timestamp;

        ctx.fillStyle = 'rgba(5, 5, 5, 0.10)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#00ff9d';
        ctx.font      = FONT_SIZE + 'px monospace';

        for (let i = 0; i < drops.length; i++) {
            const char = CHARS[Math.floor(Math.random() * CHARS.length)];
            ctx.fillText(char, i * FONT_SIZE, drops[i] * FONT_SIZE);
            if (drops[i] * FONT_SIZE > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }

        animationId = requestAnimationFrame(draw);
    }

    function startAnimation() {
        if (!animationId) animationId = requestAnimationFrame(draw);
    }

    function stopAnimation() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopAnimation(); else startAnimation();
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth !== lastWidth) resize();
        }, 200);
    });

    resize();
    startAnimation();
    return { start: startAnimation, stop: stopAnimation };
})();

// ─────────────────────────────────────────────────────────────────────────────
// BOOTSTRAP — wait for DOM ready
// ─────────────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UME_Engine.init());
} else {
    UME_Engine.init();
}
