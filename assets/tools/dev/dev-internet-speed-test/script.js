/**
 * =============================================================================
 *  ULTRA SPEED PRO MAX — ENTERPRISE ENGINE v3.5
 *  File     : script.js
 *  Tool     : Internet Speed Test
 *  Author   : MD KAWSAR
 *  Project  : Trusted Tools Web (CodeCanyon Release Build)
 * =============================================================================
 *
 *  ARCHITECTURE OVERVIEW
 *  ─────────────────────────────────────────────────────────────────────────
 *  This script uses the Web Worker API to offload all network I/O to a
 *  separate thread, keeping the main UI thread silky-smooth at 60 fps.
 *
 *  The Worker is created from an inline Blob URL (workerScript constant) so
 *  the entire tool remains a single, portable JS file — no external worker
 *  file is needed.
 *
 *  Test sequence (runSuite):
 *    1. Latency  → measurePing() — 6 sequential requests to Cloudflare
 *    2. Download → runWorkerTest('download') — 4 concurrent stream threads
 *    3. Upload   → runWorkerTest('upload')   — 2 concurrent XHR threads
 *
 *  UI is updated via Canvas API (speed-history graph) and SVG
 *  stroke-dashoffset manipulation (circular gauge).
 *
 *  UPGRADE NOTES (this build):
 *    • FIX  : Jitter is now calculated in chronological order (it was
 *             calculated on sorted data, which gave a wrong value).
 *    • FIX  : Upload byte counting now tracks each thread separately
 *             (previously bytes from parallel threads overwrote each other).
 *    • FIX  : Download/upload streams now really retry after a network hiccup
 *             (previously one error silently killed the stream).
 *    • FIX  : Final speed is now measured after a 1-second warm-up window
 *             (TCP slow-start / socket buffer spikes no longer inflate it).
 *    • FIX  : Test now shows a real error if no data is received at all
 *             (previously it showed 0 Mbps as if it was a valid result).
 *    • FIX  : Canvas colours have safe fallbacks (no crash if a CSS variable
 *             is missing).
 *    • FIX  : Blob URL is re-created on demand (safe with back/forward cache).
 *    • NEW  : STOP button (cancel a running test at any time).
 *    • NEW  : Offline pre-check before starting.
 *    • NEW  : Connection quality rating (Excellent / Good / Fair / Poor).
 *    • NEW  : Result summary in the toast notification.
 *    • NEW  : PING phase badge + live countdown on DOWNLOAD / UPLOAD badge.
 *    • NEW  : Screen-reader friendly status announcements (aria-live).
 *    • NEW  : Recent results history (last 5 tests, saved only in the
 *             visitor's own browser via localStorage) with a Clear button.
 *    • NEW  : COPY RESULT button (copies a ready-to-share result summary).
 *
 *  BUYER NOTE:
 *  The core logic is encapsulated inside runSuite() and the worker blob.
 *  You generally only need to edit the CONFIG object if you want to change
 *  test servers, thread counts, or test duration.
 * =============================================================================
 */

"use strict";


/* =============================================================================
   SECTION 1 — CONFIGURATION & CONSTANTS
============================================================================= */

const CONFIG = {
    /**
     * DL_ENDPOINT — Cloudflare speed test endpoint for download testing.
     * The `bytes` parameter controls the chunk size per request (25 MB).
     * A random `t` query parameter is appended at runtime to bust browser caches.
     */
    DL_ENDPOINT : 'https://speed.cloudflare.com/__down?bytes=25000000',

    /**
     * UL_ENDPOINT — Cloudflare endpoint that accepts POST data for upload testing.
     * A random `t` query parameter is appended at runtime to avoid caching.
     */
    UL_ENDPOINT : 'https://speed.cloudflare.com/__up',

    /**
     * PING_ENDPOINT — Lightweight Cloudflare trace file used for latency
     * measurement. Each fetch round-trip time is recorded as a ping sample.
     */
    PING_ENDPOINT : 'https://1.1.1.1/cdn-cgi/trace',

    /** THREADS — Number of concurrent download streams launched by the Worker. */
    THREADS : 4,

    /** DURATION — Duration of each test phase in milliseconds (default 8 s). */
    DURATION : 8000,

    /** GAUGE_MAX — Initial maximum Mbps value for the gauge scale. */
    GAUGE_MAX : 100,

    /** CIRCUMFERENCE — Stroke circumference of the SVG progress ring (2πr, r=160). */
    CIRCUMFERENCE : 1005,

    /** FETCH_TIMEOUT_MS — Hard timeout for latency + network detection requests. */
    FETCH_TIMEOUT_MS : 5000,

    /** NETWORK_DETECT_RETRY — Max retry attempts for IP detection. */
    NETWORK_DETECT_RETRY : 2,

    /** CHART_THROTTLE_MS — Minimum gap between canvas + gauge redraws (~30 fps). */
    CHART_THROTTLE_MS : 33,

    /** PING_SAMPLES — Number of round-trip fetches used to calculate ping/jitter. */
    PING_SAMPLES : 6,

    /**
     * WARMUP_MS — Initial part of each test that is ignored when the FINAL
     * result is calculated. TCP slow-start and browser socket buffers make the
     * first second unrepresentative.
     */
    WARMUP_MS : 1000,

    /**
     * OVERHEAD_FACTOR — Estimated TCP/IP + TLS header overhead compensation.
     * 1.06 = +6% (original behaviour). Set to 1.0 to show the raw payload
     * speed without any estimation.
     */
    OVERHEAD_FACTOR : 1.06,

    /** MAX_STREAM_FAILURES — Consecutive failures before a worker stream gives up. */
    MAX_STREAM_FAILURES : 5,

    /** RETRY_DELAY_MS — Pause before a failed stream retries. */
    RETRY_DELAY_MS : 300,

    /** HISTORY_KEY — localStorage key for the recent-results list (per browser). */
    HISTORY_KEY : 'ttw_isp_history_v1',

    /** HISTORY_MAX — Number of recent test results kept in history. */
    HISTORY_MAX : 5
};


/* =============================================================================
   SECTION 2 — DOM ELEMENT CACHE
============================================================================= */

const ELS = {
    /** Primary CTA button — Start / Stop */
    btn        : document.getElementById('startBtn'),

    /** SVG circle element whose stroke-dashoffset drives the gauge animation */
    gaugeRing  : document.getElementById('gaugeProgress'),

    /** Large live speed readout centred inside the circular gauge */
    speedNum   : document.getElementById('mainSpeedDisplay'),

    /** Phase badge below the gauge (IDLE / PING / DOWNLOAD / UPLOAD / DONE) */
    phaseBadge : document.getElementById('phaseBadge'),

    /** Status bar text label in the interface header */
    status     : document.getElementById('statusDisplay'),

    /** <canvas> element for the live speed-history graph */
    canvas     : document.getElementById('speedGraph'),

    /* ── Metric value elements (updated live by the test engine) ── */
    ping   : document.getElementById('pingVal'),
    jitter : document.getElementById('jitterVal'),
    down   : document.getElementById('downVal'),
    up     : document.getElementById('upVal'),

    /* ── Network information displays ── */
    ip  : document.getElementById('ipVal'),
    isp : document.getElementById('ispVal'),

    /* ── Copy-result button + recent-results history ── */
    copyBtn      : document.getElementById('copyBtn'),
    historyBox   : document.getElementById('historyBox'),
    historyBody  : document.getElementById('historyBody'),
    historyClear : document.getElementById('historyClear')
};


/* =============================================================================
   SECTION 3 — MODULE-LEVEL STATE
============================================================================= */

/** Prevents runSuite() from being triggered while a test is already running */
let isRunning = false;

/** Recent speed samples (Mbps) displayed on the canvas chart (max 100). */
let chartPoints = [];

/** Reserved for future animation loop extensions. */
let animationId;

/** 2D rendering context for the canvas speed-history graph. */
let ctx;

/** Debounce timer handle for the resize event. */
let resizeDebounceTimer;

/** Currently active Web Worker instance (terminated on page hide). */
let activeWorker = null;

/** True when the user pressed STOP during a running test. */
let cancelRequested = false;

/** Function that cancels the currently running worker phase (or null). */
let cancelActiveTest = null;

/** Result of the most recent completed test (used by COPY RESULT). */
let lastResult = null;


/* =============================================================================
   SECTION 4 — WEB WORKER BLOB
   ─────────────────────────────────────────────────────────────────────────────
   Message protocol (main → worker):
     { type, url, duration, threads, maxFailures, retryDelay }
   Message protocol (worker → main, frequent):
     { bytes: cumulative bytes transferred, time: elapsed ms }
============================================================================= */

const workerScript = `
"use strict";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

self.onmessage = async function(e) {
    const { type, url, duration, threads, maxFailures, retryDelay } = e.data;

    if (type === 'download') {
        /*
         * DOWNLOAD MODE
         * Launches 'threads' concurrent fetch streams. Each stream reads the
         * response body chunk-by-chunk, accumulating the total byte count.
         */
        let totalBytes = 0;
        const startTime = performance.now();
        let active = true;

        setTimeout(() => { active = false; }, duration);

        const fetchStream = async () => {
            let failures = 0;
            while (active) {
                const controller = new AbortController();
                const abortTimer = setTimeout(() => controller.abort(), duration + 2000);
                try {
                    const response = await fetch(url + '&t=' + Math.random(), {
                        signal: controller.signal
                    });
                    if (!response.ok) throw new Error('HTTP ' + response.status);

                    const reader = response.body.getReader();
                    failures = 0;

                    while (true) {
                        if (!active) { reader.cancel(); break; }
                        const { done, value } = await reader.read();
                        if (done) break;

                        totalBytes += value.length;

                        self.postMessage({
                            bytes : totalBytes,
                            time  : performance.now() - startTime
                        });
                    }
                } catch (err) {
                    /* Network hiccup: retry after a short pause, give up after too many failures */
                    failures++;
                    if (!active || failures >= maxFailures) break;
                    await sleep(retryDelay);
                } finally {
                    clearTimeout(abortTimer);
                }
            }
        };

        const streams = [];
        for (let i = 0; i < threads; i++) streams.push(fetchStream());
        await Promise.allSettled(streams);

    } else if (type === 'upload') {
        /*
         * UPLOAD MODE
         * XMLHttpRequest is used because it exposes upload.onprogress.
         * Each thread reports its own progress, and the totals are summed,
         * so parallel threads never overwrite each other's byte counts.
         */
        const startTime  = performance.now();
        let completedBytes = 0;
        let failures     = 0;
        let active       = true;
        const inflight   = new Map();
        const xhrs       = new Set();

        /* 2 MB dummy payload — browser sends this as the POST body */
        const data = new Uint8Array(2 * 1024 * 1024);

        setTimeout(() => {
            active = false;
            xhrs.forEach((x) => { try { x.abort(); } catch (err) {} });
        }, duration);

        const report = () => {
            let current = 0;
            inflight.forEach((v) => { current += v; });
            self.postMessage({
                bytes : completedBytes + current,
                time  : performance.now() - startTime
            });
        };

        const retryLater = (id) => {
            inflight.set(id, 0);
            failures++;
            if (active && failures < maxFailures * 2) {
                setTimeout(() => uploadThread(id), retryDelay);
            }
        };

        const uploadThread = (id) => {
            if (!active) return;

            const xhr = new XMLHttpRequest();
            xhrs.add(xhr);
            xhr.open('POST', url + '?t=' + Math.random(), true);
            xhr.timeout = duration + 2000;

            xhr.upload.onprogress = (ev) => {
                inflight.set(id, ev.loaded);
                report();
            };

            xhr.onload = () => {
                completedBytes += data.length;
                inflight.set(id, 0);
                failures = 0;
                report();
                uploadThread(id);
            };

            xhr.onerror   = () => retryLater(id);
            xhr.ontimeout = () => retryLater(id);
            xhr.onloadend = () => { xhrs.delete(xhr); };

            xhr.send(data);
        };

        /* Launch 2 concurrent upload threads */
        for (let i = 0; i < 2; i++) { inflight.set(i, 0); uploadThread(i); }
    }
};
`;

/**
 * getWorkerUrl()
 * Creates the Blob URL on demand (and re-creates it if it was revoked on
 * page hide), so the tool keeps working after back/forward navigation.
 */
let workerUrl = null;
function getWorkerUrl() {
    if (!workerUrl) {
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        workerUrl = URL.createObjectURL(blob);
    }
    return workerUrl;
}


/* =============================================================================
   SECTION 5 — INITIALISATION
============================================================================= */

document.addEventListener('DOMContentLoaded', () => {

    /* Detect and display the user's public IP address and ISP name */
    detectNetwork();

    /* Initialise the canvas element dimensions and draw the idle baseline grid */
    initCanvas();

    /* Screen-reader support: announce status changes politely */
    if (ELS.status) {
        ELS.status.setAttribute('role', 'status');
        ELS.status.setAttribute('aria-live', 'polite');
    }

    /* Primary CTA — starts the test, or stops it while running */
    if (ELS.btn) ELS.btn.addEventListener('click', handleStartStop);

    /* Copy-result + history */
    if (ELS.copyBtn)      ELS.copyBtn.addEventListener('click', copyResult);
    if (ELS.historyClear) ELS.historyClear.addEventListener('click', clearHistory);
    renderHistory();

    /**
     * MutationObserver — redraws the canvas grid when the light/dark theme
     * class on <body> changes, so grid colours follow the new theme.
     */
    const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class' && !isRunning) {
                drawEmptyGrid();
            }
        });
    });
    themeObserver.observe(document.body, { attributes: true });

    /**
     * Cleanup on page hide — terminate any running worker and revoke the
     * Blob Object URL. getWorkerUrl() re-creates it if the page is restored.
     */
    window.addEventListener('pagehide', () => {
        if (activeWorker) {
            activeWorker.terminate();
            activeWorker = null;
        }
        if (workerUrl) {
            URL.revokeObjectURL(workerUrl);
            workerUrl = null;
        }
    });
});

/**
 * handleStartStop()
 * Single click handler for the main button: starts a test when idle,
 * requests cancellation when a test is already running.
 */
function handleStartStop() {
    if (isRunning) {
        requestCancel();
        return;
    }
    runSuite();
}

/**
 * requestCancel()
 * Flags the running test for cancellation and stops the active worker phase.
 */
function requestCancel() {
    cancelRequested = true;
    if (typeof cancelActiveTest === 'function') cancelActiveTest();
}

/**
 * ensureNotCancelled()
 * Throws a recognisable error if the user pressed STOP.
 */
function ensureNotCancelled() {
    if (cancelRequested) throw makeCancelError();
}

function makeCancelError() {
    const err = new Error('Test cancelled');
    err.name = 'TestCancelled';
    return err;
}


/* =============================================================================
   SECTION 6 — CANVAS GRAPHICS ENGINE
============================================================================= */

/**
 * initCanvas()
 * Sets the canvas pixel dimensions to match its CSS-rendered size (sharp on
 * HiDPI displays) and obtains the 2D context.
 */
function initCanvas() {
    if (!ELS.canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = ELS.canvas.offsetWidth;
    const cssH = ELS.canvas.offsetHeight;

    ELS.canvas.width  = cssW * dpr;
    ELS.canvas.height = cssH * dpr;
    ELS.canvas.style.width  = cssW + 'px';
    ELS.canvas.style.height = cssH + 'px';

    ctx = ELS.canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    drawEmptyGrid();
}

/**
 * getCSSColor(varName)
 * Reads a CSS custom property from the computed style of <body>.
 */
function getCSSColor(varName) {
    return getComputedStyle(document.body).getPropertyValue(varName).trim();
}

/**
 * cssColorOr(varName, fallback)
 * Same as getCSSColor but returns a safe fallback if the variable is missing,
 * so Canvas calls (e.g. addColorStop) never throw on an empty colour string.
 */
function cssColorOr(varName, fallback) {
    return getCSSColor(varName) || fallback;
}

/**
 * withAlpha(color, alpha)
 * Adds transparency to a 6-digit hex colour; other formats fall back to the
 * default brand tint.
 */
function withAlpha(color, alpha) {
    if (/^#[0-9a-f]{6}$/i.test(color)) {
        return color + Math.round(alpha * 255).toString(16).padStart(2, '0');
    }
    return 'rgba(255, 0, 85, ' + alpha + ')';
}

/**
 * drawEmptyGrid()
 * Clears the canvas and draws a single horizontal baseline (idle state).
 */
function drawEmptyGrid() {
    if (!ctx || !ELS.canvas) return;
    const w = ELS.canvas.offsetWidth;
    const h = ELS.canvas.offsetHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = cssColorOr('--chart-grid', cssColorOr('--border-main', '#888888'));
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
}

/**
 * updateChart(val, max)
 * Pushes the latest speed sample into chartPoints (max 100) and redraws the
 * speed-history line chart with a gradient stroke and soft glow fill.
 *
 * @param {number} val — Current speed in Mbps
 * @param {number} max — Maximum expected Mbps (Y-axis scale)
 */
function updateChart(val, max) {
    if (!ctx || !ELS.canvas) return;

    chartPoints.push(val);
    if (chartPoints.length > 100) chartPoints.shift();

    const w = ELS.canvas.offsetWidth;
    const h = ELS.canvas.offsetHeight;
    ctx.clearRect(0, 0, w, h);

    if (chartPoints.length < 2) return;

    ctx.beginPath();
    const step = w / 100;

    for (let i = 0; i < chartPoints.length; i++) {
        const x = i * step;
        /* 1.2 multiplier adds a 20% headroom above the max */
        const y = h - ((chartPoints[i] / (max * 1.2)) * h);
        const clampedY = Math.max(0, Math.min(h, y));
        if (i === 0) ctx.moveTo(x, clampedY);
        else         ctx.lineTo(x, clampedY);
    }

    const brand = cssColorOr('--brand-primary', '#ff0055');
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, brand);
    grad.addColorStop(1, cssColorOr('--brand-accent', '#00e5ff'));
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();

    /* Soft glow fill beneath the line (~10% opacity) */
    ctx.lineTo(chartPoints.length * step, h);
    ctx.lineTo(0, h);
    ctx.fillStyle = withAlpha(brand, 0.1);
    ctx.fill();
}


/* =============================================================================
   SECTION 7 — MAIN TEST ORCHESTRATOR (runSuite)
============================================================================= */

/**
 * rateConnection(dl, ul, ping, jitter)
 * Returns a simple overall quality label and colour. ping/jitter may be null
 * (latency could not be measured) — in that case they are ignored.
 */
function rateConnection(dl, ul, ping, jitter) {
    const pingOk = (limit) => ping === null || ping <= limit;
    const jitOk  = (limit) => jitter === null || jitter <= limit;

    if (dl >= 100 && ul >= 20 && pingOk(30) && jitOk(10)) {
        return { label: 'EXCELLENT', color: '#238636' };
    }
    if (dl >= 25 && ul >= 5 && pingOk(60) && jitOk(20)) {
        return { label: 'GOOD', color: '#238636' };
    }
    if (dl >= 10 && ul >= 2 && pingOk(100)) {
        return { label: 'FAIR', color: cssColorOr('--accent-orange', '#f59e0b') };
    }
    return { label: 'POOR', color: '#ff0050' };
}

/** Safe wrapper for the global toast system. */
function notify(message, isError) {
    if (typeof window.showToast === 'function') {
        if (isError) window.showToast(message, true);
        else         window.showToast(message);
    }
}

/**
 * runSuite()
 * Runs all three test phases in sequence. Guards against concurrent runs
 * with the 'isRunning' flag and supports cancellation via the STOP button.
 */
async function runSuite() {
    if (isRunning) return;

    /* Offline pre-check — fail fast with a clear message */
    if (navigator.onLine === false) {
        updateStatus('NO INTERNET CONNECTION', '#ff0050');
        setPhaseBadge('OFFLINE', '');
        notify('You appear to be offline. Please check your connection and try again.', true);
        return;
    }

    isRunning = true;
    cancelRequested = false;
    resetUI();

    try {
        /* ────── PHASE 1: LATENCY TEST ────── */
        updateStatus('MEASURING LATENCY', getCSSColor('--text-muted'));
        setPhaseBadge('PING', 'active');
        const { ping, jitter } = await measurePing();
        ensureNotCancelled();

        animateNumber(ELS.ping,   ping,   0);
        animateNumber(ELS.jitter, jitter, 0);
        await wait(500);
        ensureNotCancelled();

        /* ────── PHASE 2: DOWNLOAD TEST ────── */
        updateStatus('TESTING DOWNLOAD', getCSSColor('--brand-primary'));
        setPhaseBadge('DOWNLOAD', 'active');
        setGaugeColor(getCSSColor('--brand-primary'));

        const dlSpeed = await runWorkerTest('download', CONFIG.DL_ENDPOINT);
        animateNumber(ELS.down, dlSpeed, 1);
        ELS.speedNum.innerText = dlSpeed.toFixed(2);
        await wait(1000);
        ensureNotCancelled();

        /* ────── PHASE 3: UPLOAD TEST ────── */
        chartPoints = [];
        updateStatus('TESTING UPLOAD', getCSSColor('--brand-secondary'));
        setPhaseBadge('UPLOAD', 'active');
        setGaugeColor(getCSSColor('--brand-secondary'));

        const ulSpeed = await runWorkerTest('upload', CONFIG.UL_ENDPOINT);
        animateNumber(ELS.up, ulSpeed, 1);
        ELS.speedNum.innerText = ulSpeed.toFixed(2);

        /* ────── COMPLETE ────── */
        const quality = rateConnection(dlSpeed, ulSpeed, ping, jitter);
        updateStatus('TEST COMPLETE · ' + quality.label, quality.color);
        setGaugeProgress(100);
        ELS.btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> TEST AGAIN';
        ELS.btn.disabled  = false;
        setPhaseBadge('DONE', 'active');

        let summary = 'Download ' + dlSpeed.toFixed(1) + ' Mbps • Upload ' + ulSpeed.toFixed(1) + ' Mbps';
        if (ping !== null) summary += ' • Ping ' + ping + ' ms';
        notify('Speed test complete! ' + summary + ' — ' + quality.label);

        /* Remember this result: history list + COPY RESULT button */
        lastResult = {
            t      : Date.now(),
            dl     : dlSpeed,
            ul     : ulSpeed,
            ping   : ping,
            jitter : jitter,
            q      : quality.label
        };
        addHistory(lastResult);
        if (ELS.copyBtn) ELS.copyBtn.hidden = false;

    } catch (err) {

        if (err && err.name === 'TestCancelled') {
            /* User pressed STOP — return to a clean idle state */
            updateStatus('TEST STOPPED', getCSSColor('--text-muted'));
            setPhaseBadge('STOPPED', '');
            setGaugeProgress(0);
            setGaugeColor(getCSSColor('--brand-primary'));
            chartPoints = [];
            drawEmptyGrid();
            ELS.btn.innerHTML = '<i class="fa-solid fa-bolt"></i> START ANALYSIS';
            ELS.btn.disabled  = false;
            notify('Test stopped.');
        } else {
            /* Network or API error — surface a clear error notification */
            console.error('[Ultra Speed Pro Max] Test error:', err);
            updateStatus('CONNECTION ERROR', '#ff0050');
            setPhaseBadge('ERROR', '');
            setGaugeColor('#ff0050');
            ELS.btn.innerHTML = '<i class="fa-solid fa-bolt"></i> START ANALYSIS';
            ELS.btn.disabled  = false;
            notify('Connection error. Please check your network and try again.', true);
        }

    } finally {
        /* Always release the running lock so the user can retry */
        isRunning = false;
        cancelRequested = false;
        cancelActiveTest = null;
        activeWorker = null;
    }
}


/* =============================================================================
   SECTION 8 — WEB WORKER BRIDGE (runWorkerTest)
============================================================================= */

/**
 * runWorkerTest(type, url)
 * Spawns a Web Worker, runs a download or upload test, streams live progress
 * to the UI, and resolves with the final speed in Mbps.
 *
 * Live display : cumulative average (smooth, responsive).
 * Final result : average measured AFTER the warm-up window, so TCP slow-start
 *                and socket-buffer spikes do not distort the reading.
 *
 * @param  {string} type — 'download' or 'upload'
 * @param  {string} url  — The CDN endpoint URL to test against
 * @returns {Promise<number>} — Final measured speed in Mbps
 */
function runWorkerTest(type, url) {
    return new Promise((resolve, reject) => {
        if (activeWorker) {
            activeWorker.terminate();
            activeWorker = null;
        }

        const worker   = new Worker(getWorkerUrl());
        activeWorker   = worker;
        let lastUpdate = 0;
        let settled    = false;
        let finishTimer = null;

        /* Latest sample + warm-up checkpoint (for the final result) */
        let lastBytes = 0;
        let lastTime  = 0;
        let warmBytes = null;
        let warmTime  = 0;

        /* Last countdown value shown in the phase badge */
        let lastLeft = -1;

        const settle = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(finishTimer);
            worker.terminate();
            activeWorker = null;
            cancelActiveTest = null;
            fn(value);
        };

        /* Allow the STOP button to cancel this phase */
        cancelActiveTest = () => settle(reject, makeCancelError());

        worker.postMessage({
            type        : type,
            url         : url,
            duration    : CONFIG.DURATION,
            threads     : CONFIG.THREADS,
            maxFailures : CONFIG.MAX_STREAM_FAILURES,
            retryDelay  : CONFIG.RETRY_DELAY_MS
        });

        worker.onmessage = (e) => {
            const { bytes, time } = e.data;
            const durationSec = time / 1000;
            if (durationSec <= 0) return;

            lastBytes = bytes;
            lastTime  = time;

            /* Remember the first sample after the warm-up window */
            if (warmBytes === null && time >= CONFIG.WARMUP_MS) {
                warmBytes = bytes;
                warmTime  = time;
            }

            /* Live speed: cumulative bytes → bits → Mbps (+ overhead estimate) */
            const mbps  = ((bytes * 8) / durationSec) / 1_000_000;
            const speed = parseFloat((mbps * CONFIG.OVERHEAD_FACTOR).toFixed(2));

            /* UI throttle — limit canvas + gauge redraws to ~30 fps */
            if (time - lastUpdate > CONFIG.CHART_THROTTLE_MS) {
                ELS.speedNum.innerText = speed.toFixed(2);

                /* Dynamic gauge scaling: 100 → 500 → 1000 Mbps */
                let gaugeMax = 100;
                if (speed > 500) gaugeMax = 1000;
                else if (speed > 100) gaugeMax = 500;
                const gaugePercent = Math.min((speed / gaugeMax) * 100, 100);

                setGaugeProgress(gaugePercent);
                updateChart(speed, gaugeMax);
                lastUpdate = time;

                /* Live countdown in the phase badge (only when the second changes) */
                const left = Math.max(0, Math.ceil((CONFIG.DURATION - time) / 1000));
                if (left !== lastLeft) {
                    lastLeft = left;
                    setPhaseBadge(type.toUpperCase() + ' · ' + left + 's', 'active');
                }
            }
        };

        worker.onerror = (err) => {
            console.error('[Ultra Speed Pro Max] Worker error:', err.message);
            settle(reject, new Error(err.message || 'Worker failed'));
        };

        /**
         * After (DURATION + 100 ms) the worker is terminated and the final
         * speed is calculated. If no data arrived at all, the test fails with
         * an error instead of showing a misleading 0 Mbps.
         */
        finishTimer = setTimeout(() => {
            if (lastBytes <= 0 || lastTime <= 0) {
                settle(reject, new Error('No data received from test server'));
                return;
            }

            let finalMbps;
            if (warmBytes !== null && (lastTime - warmTime) >= 500) {
                /* Preferred: speed measured after the warm-up window */
                finalMbps = (((lastBytes - warmBytes) * 8) / ((lastTime - warmTime) / 1000)) / 1_000_000;
            } else {
                /* Fallback: overall average */
                finalMbps = ((lastBytes * 8) / (lastTime / 1000)) / 1_000_000;
            }

            settle(resolve, parseFloat((finalMbps * CONFIG.OVERHEAD_FACTOR).toFixed(2)));
        }, CONFIG.DURATION + 100);
    });
}


/* =============================================================================
   SECTION 9 — LATENCY MEASUREMENT (measurePing)
============================================================================= */

/**
 * measurePing()
 * Sends sequential round-trip requests and analyses the timing data.
 *
 * Ping   = lowest single round-trip time (best-case latency).
 * Jitter = average absolute difference between CONSECUTIVE samples in the
 *          order they were measured. The first sample (which includes the
 *          connection handshake) is excluded from the jitter calculation.
 *
 * If every request fails (e.g. 1.1.1.1 is blocked on the network), null is
 * returned for both values and the speed test still continues.
 *
 * @returns {Promise<{ping: number|null, jitter: number|null}>}
 */
async function measurePing() {
    const pings = [];
    const SAMPLES = CONFIG.PING_SAMPLES;

    for (let i = 0; i < SAMPLES; i++) {
        ensureNotCancelled();
        const start = performance.now();
        try {
            await fetchWithTimeout(
                CONFIG.PING_ENDPOINT + '?t=' + Math.random(),
                { cache: 'no-store' },
                CONFIG.FETCH_TIMEOUT_MS
            );
            pings.push(performance.now() - start);
        } catch (e) {
            /* Failed sample is skipped (not replaced with a fake value) */
        }
    }

    if (pings.length === 0) {
        return { ping: null, jitter: null };
    }

    /* Ping: best-case round-trip time (never below 1 ms) */
    const ping = Math.max(1, Math.round(Math.min(...pings)));

    /* Jitter: chronological order, skipping the handshake-heavy first sample */
    const stable = pings.length > 2 ? pings.slice(1) : pings;
    let totalDeviation = 0;
    for (let i = 0; i < stable.length - 1; i++) {
        totalDeviation += Math.abs(stable[i] - stable[i + 1]);
    }
    const jitter = stable.length > 1
        ? Math.round(totalDeviation / (stable.length - 1))
        : 0;

    return { ping, jitter };
}


/* =============================================================================
   SECTION 10 — NETWORK INFORMATION DETECTION (detectNetwork)
============================================================================= */

/**
 * detectNetwork()
 * Asynchronously fetches and displays:
 *   • Public IP address  → from 1.1.1.1/cdn-cgi/trace (plain-text response)
 *   • ISP organisation   → from ipapi.co/json (JSON response, 'org' field)
 * Failures degrade gracefully to placeholder text.
 */
async function detectNetwork() {
    let attempt = 0;
    let ipDetected = false;

    while (attempt <= CONFIG.NETWORK_DETECT_RETRY && !ipDetected) {
        try {
            const res  = await fetchWithTimeout(
                'https://1.1.1.1/cdn-cgi/trace',
                {},
                CONFIG.FETCH_TIMEOUT_MS
            );
            const data = await res.text();

            const ipMatch = data.match(/ip=(.+)/);
            if (ELS.ip) ELS.ip.innerText = ipMatch ? ipMatch[1].trim() : 'Unknown';
            ipDetected = true;

            try {
                const ispRes  = await fetchWithTimeout(
                    'https://ipapi.co/json/',
                    {},
                    CONFIG.FETCH_TIMEOUT_MS
                );
                const ispData = await ispRes.json();
                if (ELS.isp) ELS.isp.innerText = sanitizeText(ispData.org) || 'Unknown ISP';
            } catch {
                if (ELS.isp) ELS.isp.innerText = 'Private Network';
            }

        } catch {
            attempt++;
            if (attempt > CONFIG.NETWORK_DETECT_RETRY) {
                if (ELS.ip)  ELS.ip.innerText  = 'Hidden';
                if (ELS.isp) ELS.isp.innerText = 'VPN/Proxy';
            } else {
                await wait(800);
            }
        }
    }
}


/* =============================================================================
   SECTION 11 — UI HELPERS & ANIMATION UTILITIES
============================================================================= */

/**
 * resetUI()
 * Returns all UI elements to their initial state before a new test run.
 * The main button stays enabled and becomes a STOP button while running.
 */
function resetUI() {
    ELS.btn.disabled  = false;
    ELS.btn.innerHTML = '<i class="fa-solid fa-stop"></i> STOP TEST';
    if (ELS.copyBtn) ELS.copyBtn.hidden = true;
    lastResult = null;
    if (ELS.ping)   ELS.ping.innerText   = '--';
    if (ELS.jitter) ELS.jitter.innerText = '--';
    if (ELS.down)   ELS.down.innerText   = '--';
    if (ELS.up)     ELS.up.innerText     = '--';
    if (ELS.speedNum) ELS.speedNum.innerText = '0.0';
    chartPoints = [];
    setGaugeProgress(0);
    setGaugeColor(getCSSColor('--brand-primary'));
    setPhaseBadge('IDLE', '');
    drawEmptyGrid();
}

/**
 * setGaugeProgress(percent)
 * Updates the SVG circular gauge via stroke-dashoffset.
 *
 * @param {number} percent — Value between 0 and 100
 */
function setGaugeProgress(percent) {
    if (!ELS.gaugeRing) return;
    percent = Math.min(Math.max(percent, 0), 100);
    const offset = CONFIG.CIRCUMFERENCE - ((percent / 100) * CONFIG.CIRCUMFERENCE);
    ELS.gaugeRing.style.strokeDashoffset = offset;
}

/**
 * setGaugeColor(color)
 * Changes the stroke colour and glow of the SVG progress ring.
 *
 * @param {string} color — Any CSS colour string
 */
function setGaugeColor(color) {
    if (!ELS.gaugeRing || !color) return;
    ELS.gaugeRing.style.stroke = color;
    ELS.gaugeRing.style.filter = `drop-shadow(0 0 10px ${color})`;
}

/**
 * updateStatus(text, color)
 * Updates the status bar text label and the pulse dot colour.
 *
 * @param {string} text  — Status message
 * @param {string} color — Colour for the status text and pulse dot
 */
function updateStatus(text, color) {
    if (!ELS.status) return;
    ELS.status.innerText   = text;
    ELS.status.style.color = color;

    const dot = document.querySelector('.isp-status-dot');
    if (dot) {
        dot.style.background = color;
        dot.style.boxShadow  = `0 0 10px ${color}`;
    }
}

/**
 * setPhaseBadge(text, state)
 * Updates the phase badge below the circular gauge.
 *
 * @param {string} text  — Badge label
 * @param {string} state — 'active' to enable glow style, any other value removes it
 */
function setPhaseBadge(text, state) {
    if (!ELS.phaseBadge) return;
    ELS.phaseBadge.innerText = text;
    if (state === 'active') ELS.phaseBadge.classList.add('active');
    else                    ELS.phaseBadge.classList.remove('active');
}

/**
 * animateNumber(el, val, decimals)
 * Updates a stat value element and plays a brief scale "pop" animation.
 * A null / invalid value shows the '--' placeholder.
 *
 * @param {HTMLElement}  el       — The element to update
 * @param {number|null}  val      — Numeric value to display
 * @param {number}       decimals — Number of decimal places to show
 */
function animateNumber(el, val, decimals) {
    if (!el) return;
    if (val === null || isNaN(parseFloat(val))) {
        el.innerText = '--';
        return;
    }
    el.innerText = parseFloat(val).toFixed(decimals);

    el.animate(
        [
            { transform: 'scale(1)'   },
            { transform: 'scale(1.2)' },
            { transform: 'scale(1)'   }
        ],
        { duration: 200, easing: 'ease-out' }
    );
}

/**
 * wait(ms)
 * Returns a Promise that resolves after the given number of milliseconds.
 */
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));


/* =============================================================================
   SECTION 12 — WINDOW RESIZE HANDLER
============================================================================= */

/**
 * Resize listener — re-measures the canvas and reinitialises the 2D context.
 * Debounced so fast window drags do not cause redundant work.
 */
window.addEventListener('resize', () => {
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(initCanvas, 150);
});


/* =============================================================================
   SECTION 13 — UTILITY HELPERS
============================================================================= */

/**
 * fetchWithTimeout(url, options, timeoutMs)
 * Wraps fetch() with an AbortController-based timeout.
 *
 * @param {string}  url       — The URL to fetch
 * @param {object}  options   — Standard fetch init options
 * @param {number}  timeoutMs — Abort deadline in milliseconds
 * @returns {Promise<Response>}
 */
function fetchWithTimeout(url, options = {}, timeoutMs = CONFIG.FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

/**
 * sanitizeText(str)
 * Strips HTML tags and trims whitespace from third-party API text before it
 * is displayed in the DOM.
 *
 * @param {*}      str — Input value (may not be a string)
 * @returns {string}   — Cleaned, trimmed string
 */
function sanitizeText(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>/g, '').trim();
}


/* =============================================================================
   SECTION 14 — RECENT RESULTS HISTORY & COPY RESULT
   ─────────────────────────────────────────────────────────────────────────────
   • History keeps the last CONFIG.HISTORY_MAX completed tests in the visitor's
     own browser (localStorage). Nothing is sent to any server.
   • All storage access is wrapped in try/catch (private mode / blocked storage
     simply means no history — the speed test itself keeps working).
   • The history table is built with createElement + textContent (no innerHTML),
     so stored data can never inject markup.
============================================================================= */

/**
 * readHistory()
 * Loads and validates the saved history array.
 * @returns {Array<{t:number, dl:number, ul:number, ping:(number|null), jitter:(number|null), q:string}>}
 */
function readHistory() {
    try {
        const raw = localStorage.getItem(CONFIG.HISTORY_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr
            .filter((e) => e && Number.isFinite(e.t) && Number.isFinite(e.dl) && Number.isFinite(e.ul))
            .map((e) => ({
                t      : e.t,
                dl     : e.dl,
                ul     : e.ul,
                ping   : Number.isFinite(e.ping)   ? e.ping   : null,
                jitter : Number.isFinite(e.jitter) ? e.jitter : null,
                q      : typeof e.q === 'string' ? e.q.slice(0, 12) : ''
            }))
            .slice(0, CONFIG.HISTORY_MAX);
    } catch (err) {
        return [];
    }
}

/** Saves the history array (silently ignores blocked storage). */
function writeHistory(list) {
    try {
        localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(list));
    } catch (err) { /* storage unavailable — history is optional */ }
}

/** Adds a new result at the top of the history and re-renders the table. */
function addHistory(entry) {
    const list = readHistory();
    list.unshift(entry);
    writeHistory(list.slice(0, CONFIG.HISTORY_MAX));
    renderHistory();
}

/** Deletes all saved results. */
function clearHistory() {
    try {
        localStorage.removeItem(CONFIG.HISTORY_KEY);
    } catch (err) { /* ignore */ }
    renderHistory();
    notify('Recent results cleared.');
}

/** Formats a stored value; null becomes an en dash. */
function fmtVal(v, decimals) {
    return v === null ? '–' : Number(v).toFixed(decimals);
}

/**
 * renderHistory()
 * Rebuilds the history table. The whole box stays hidden when empty.
 */
function renderHistory() {
    if (!ELS.historyBox || !ELS.historyBody) return;

    const list = readHistory();
    ELS.historyBody.textContent = '';
    ELS.historyBox.hidden = list.length === 0;

    list.forEach((e) => {
        const tr = document.createElement('tr');

        const when = new Date(e.t).toLocaleString(undefined, {
            month : 'short',
            day   : 'numeric',
            hour  : '2-digit',
            minute: '2-digit'
        });

        const cells = [
            when,
            fmtVal(e.dl, 1),
            fmtVal(e.ul, 1),
            fmtVal(e.ping, 0),
            fmtVal(e.jitter, 0)
        ];

        cells.forEach((text) => {
            const td = document.createElement('td');
            td.textContent = text;
            tr.appendChild(td);
        });

        ELS.historyBody.appendChild(tr);
    });
}

/** Builds the plain-text summary used by COPY RESULT. */
function buildResultText(r) {
    let text = 'Internet speed test result: Download ' + r.dl.toFixed(1) + ' Mbps | Upload ' + r.ul.toFixed(1) + ' Mbps';
    if (r.ping !== null)   text += ' | Ping ' + r.ping + ' ms';
    if (r.jitter !== null) text += ' | Jitter ' + r.jitter + ' ms';
    if (r.q) text += ' | Quality: ' + r.q;
    text += '. Tested with Ultra Speed Pro Max: ' + location.origin + location.pathname;
    return text;
}

/** Fallback copy method for browsers / contexts without the Clipboard API. */
function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    return ok;
}

/**
 * copyResult()
 * Copies the latest result summary to the clipboard and shows a toast.
 */
async function copyResult() {
    if (!lastResult) return;
    const text = buildResultText(lastResult);
    let ok = false;

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            ok = true;
        }
    } catch (err) {
        ok = false;
    }
    if (!ok) ok = legacyCopy(text);

    if (ok) notify('Result copied to clipboard.');
    else    notify('Could not copy automatically. Please copy the result manually.', true);
}
