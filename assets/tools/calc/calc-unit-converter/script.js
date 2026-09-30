/* ================================================================
   OmniConvert Ultra — Core Engine
   Version: 3.0 (Major Feature Release)

   [DEVELOPER NOTE]:
   This script handles all logic for conversion, UI updates,
   API fetching, chart rendering, and new power features:
   - Compound Unit inputs (length & weight)
   - Decimal Precision control
   - Crypto & Precious Metals in Currency
   - Data Base Toggle (Binary 1024 / Decimal 1000)
   - Smart Paste / NLP-lite natural language parsing
   ================================================================ */

"use strict";

/* ================================================================
   [USER CONFIG]: Database Configuration (DB)
   Defines categories and units.
   FORMAT:
   - type: 'linear' (Length/Weight), 'func' (Temp), 'api' (Currency), 'inv' (Fuel)
   - u: Unit factors relative to the base unit (factor = value in base unit).
   ================================================================ */
const DB = {
    length: {
        i: "fa-ruler-combined", n: "Length", type: "linear",
        base: "m",
        // Compound partners: which unit pairs with which for compound input
        compoundPair: { ft: "inch", m: "cm", yd: "ft", km: "m", mi: "ft" },
        u: { m:1, cm:0.01, mm:0.001, km:1000, inch:0.0254, ft:0.3048, yd:0.9144, mi:1609.34, nm:1852 }
    },
    weight: {
        i: "fa-weight-hanging", n: "Weight", type: "linear",
        base: "kg",
        compoundPair: { kg: "g", lb: "oz", st: "lb", t: "kg" },
        u: { kg:1, g:0.001, mg:1e-6, t:1000, lb:0.453592, oz:0.0283495, st:6.35029, carat:0.0002, tola:0.01166, grain:6.479e-5 }
    },
    currency: {
        i: "fa-coins", n: "Currency", type: "api",
        // Base = USD = 1. All other rates are relative to USD.
        // Crypto & Precious Metal fallback rates (updated periodically as defaults)
        u: {
            USD:1, EUR:0.92, BDT:122.33, INR:83.4, GBP:0.79, CAD:1.36,
            AUD:1.52, AED:3.67, SAR:3.75, MYR:4.73, KWD:0.31, JPY:155.2,
            CNY:7.23, PKR:278.5, RUB:92.5, SGD:1.34, CHF:0.90, HKD:7.82,
            // Precious Metals (rates per troy ounce in USD, expressed as USD/unit)
            XAU: 0.000475,  // 1 USD ≈ 0.000475 oz of gold (~$2105/oz)
            XAG: 0.041,     // 1 USD ≈ 0.041 oz of silver (~$24.4/oz)
            // Crypto (rates in USD — meaning 1 USD buys this fraction of BTC)
            BTC: 0.0000149, // ~$67,000/BTC
            ETH: 0.000294,  // ~$3,400/ETH
            BNB: 0.00167    // ~$600/BNB
        }
    },
    speed: {
        i: "fa-gauge-high", n: "Speed", type: "linear",
        u: { mps:1, kph:0.277778, mph:0.44704, knot:0.514444, mach:343, c:299792458, fps:0.3048 }
    },
    temp: {
        i: "fa-temperature-half", n: "Temp", type: "func",
        u: { C:"Celsius", F:"Fahrenheit", K:"Kelvin", R:"Rankine" }
    },
    data: {
        i: "fa-hard-drive", n: "Storage", type: "data",
        // Two sets of factors: binary (1024) and decimal (1000)
        // Active set is chosen by state.dataBase
        uBinary:  { B:1, KB:1024, MB:1048576, GB:1073741824, TB:1099511627776, PB:1125899906842624, bit:0.125, Nibble:0.5 },
        uDecimal: { B:1, KB:1000, MB:1000000, GB:1000000000, TB:1000000000000, PB:1000000000000000, bit:0.125, Nibble:0.5 },
        get u() { return _state && _state.dataBase === 'decimal' ? this.uDecimal : this.uBinary; }
    },
    time: {
        i: "fa-clock", n: "Time", type: "linear",
        u: { s:1, min:60, h:3600, d:86400, wk:604800, mo:2628000, y:31536000, ms:0.001, ns:1e-9 }
    },
    area: {
        i: "fa-vector-square", n: "Area", type: "linear",
        u: { m2:1, ha:10000, km2:1e6, ac:4046.86, ft2:0.092903, in2:0.00064516, bigha:1337.8, katha:66.89 }
    },
    volume: {
        i: "fa-cube", n: "Volume", type: "linear",
        u: { l:1, ml:0.001, m3:1000, cm3:0.001, gal:3.78541, qt:0.946353, pt:0.473176, cup:0.236588, fl_oz:0.0295735, tbsp:0.0147868, tsp:0.00492892 }
    },
    pressure: {
        i: "fa-gauge", n: "Pressure", type: "linear",
        u: { Pa:1, bar:100000, psi:6894.76, atm:101325, torr:133.322 }
    },
    energy: {
        i: "fa-bolt", n: "Energy", type: "linear",
        u: { J:1, kJ:1000, cal:4.184, kcal:4184, Wh:3600, kWh:3.6e6, BTU:1055.06, eV:1.60218e-19 }
    },
    power: {
        i: "fa-plug", n: "Power", type: "linear",
        u: { W:1, kW:1000, hp:745.7, MW:1e6 }
    },
    fuel: {
        i: "fa-gas-pump", n: "Fuel", type: "inv",
        u: { mpg:1, kmpl:0.425144, l100km: "special" }
    },
    angle: {
        i: "fa-compass", n: "Angle", type: "linear",
        u: { deg:1, rad:57.2958, grad:0.9, arcmin:0.0166667, arcsec:0.000277778 }
    }
};

/* ================================================================
   APP STATE
   Stores current settings and runtime variables.
   ================================================================ */
// Internal reference used by DB.data getter before state is declared
let _state = null;

let state = {
    cat: 'length',
    from: 'm',
    to: 'ft',
    compound: 'cm',       // Secondary unit for compound inputs
    compoundActive: false, // Whether compound input row is visible
    modalTarget: null,
    chart: null,
    isLiveRate: false,
    lastInputSource: 'from',
    precision: 4,          // Default decimal places
    dataBase: 'binary'     // 'binary' (1024) | 'decimal' (1000)
};
_state = state;

/* ================================================================
   INITIALIZATION
   ================================================================ */
window.addEventListener('DOMContentLoaded', async () => {
    loadTheme();
    loadPrecision();
    renderCats();
    await initCurrency();
    setCat('length');
    loadHist();
    setupInputListeners();
});

/* ================================================================
   CORE RENDERING
   ================================================================ */

/** Renders the category icon slider. */
function renderCats() {
    const slider = document.getElementById('catSlider');
    if (!slider) return;

    slider.innerHTML = Object.keys(DB).map(k => `
        <div class="ocu-cat-item ${k === state.cat ? 'active' : ''}" onclick="setCat('${k}')">
            <i class="fa-solid ${DB[k].i}"></i> ${DB[k].n}
        </div>
    `).join('');
}

/** Updates active category and all related UI elements. */
function setCat(k) {
    state.cat = k;
    const keys = Object.keys(DB[k].u);
    state.from = keys[0];
    state.to   = keys[1] || keys[0];

    // Reset compound mode when switching categories
    state.compoundActive = false;
    hideCompoundRow();

    // Show/hide compound toggle button (only for length and weight)
    const compoundBtn = document.getElementById('compoundToggleBtn');
    if (compoundBtn) {
        compoundBtn.style.display = (k === 'length' || k === 'weight') ? 'inline-flex' : 'none';
    }

    // Show/hide the data base toggle (only for storage)
    const baseWrapper = document.getElementById('baseToggleWrapper');
    if (baseWrapper) {
        baseWrapper.style.display = (k === 'data') ? 'flex' : 'none';
    }

    // Set default compound unit from pair map
    if (DB[k].compoundPair) {
        state.compound = DB[k].compoundPair[state.from] || keys[2] || keys[1];
    }

    renderCats();
    updateLabels();
    clearInputs();

    // Show chart only for Currency category
    const chartBox = document.getElementById('chartBox');
    if (chartBox) {
        if (k === 'currency') {
            chartBox.style.display = 'block';
            setTimeout(updateChart, 300);
        } else {
            chartBox.style.display = 'none';
        }
    }
}

function updateLabels() {
    document.getElementById('uFromDisp').innerText     = state.from;
    document.getElementById('uToDisp').innerText       = state.to;
    document.getElementById('uCompoundDisp').innerText = state.compound;

    if (state.lastInputSource === 'from') calculateForward();
    else calculateBackward();
}

function clearInputs() {
    document.getElementById('inpFrom').value    = '';
    document.getElementById('inpTo').value      = '';
    document.getElementById('inpCompound').value = '';
    document.getElementById('formula').innerText = '';
}

/* ================================================================
   COMPOUND UNIT SUPPORT
   ================================================================ */

/** Toggle the compound secondary input row. */
function toggleCompound() {
    state.compoundActive = !state.compoundActive;
    const btn = document.getElementById('compoundToggleBtn');

    if (state.compoundActive) {
        showCompoundRow();
        // Auto-assign the logical compound partner for the selected primary unit
        const catData = DB[state.cat];
        if (catData && catData.compoundPair && catData.compoundPair[state.from]) {
            state.compound = catData.compoundPair[state.from];
        } else {
            // Fallback: pick second unit that isn't the same as primary
            const keys = Object.keys(DB[state.cat].u);
            state.compound = keys.find(k => k !== state.from) || keys[0];
        }
        document.getElementById('uCompoundDisp').innerText = state.compound;
        if (btn) btn.classList.add('active');
        showToast('Compound mode: ' + state.from + ' + ' + state.compound);
    } else {
        hideCompoundRow();
        if (btn) btn.classList.remove('active');
        // Recalculate without the compound portion
        calculateForward();
    }
}

function showCompoundRow() {
    const row = document.getElementById('compoundRow');
    if (row) row.style.display = 'flex';
}

function hideCompoundRow() {
    const row = document.getElementById('compoundRow');
    if (row) {
        row.style.display = 'none';
        document.getElementById('inpCompound').value = '';
    }
}

/**
 * Compute the combined base-unit value from primary + compound inputs.
 * Example: 5 ft + 8 in → convert both to meters and sum.
 * @returns {number|null}
 */
function getCompoundValue() {
    const primaryRaw  = document.getElementById('inpFrom').value;
    const secondaryRaw = document.getElementById('inpCompound').value;

    const primaryVal   = parseInput(primaryRaw);
    const secondaryVal = parseInput(secondaryRaw);

    if (primaryVal === null && secondaryVal === null) return null;

    const catData = DB[state.cat];
    if (catData.type !== 'linear') return primaryVal; // Compound only supported for linear

    const primaryFactor   = catData.u[state.from]    || 1;
    const secondaryFactor = catData.u[state.compound] || 1;

    const primaryBase   = (primaryVal   || 0) * primaryFactor;
    const secondaryBase = (secondaryVal || 0) * secondaryFactor;

    return primaryBase + secondaryBase;
}

/* ================================================================
   PRECISION CONTROL
   ================================================================ */

function setPrecision(val) {
    state.precision = parseInt(val, 10) || 4;
    try { localStorage.setItem('omniPrecision', state.precision); } catch (e) {}
    // Re-run calculation with new precision
    if (state.lastInputSource === 'from') calculateForward();
    else calculateBackward();
}

function loadPrecision() {
    try {
        const saved = localStorage.getItem('omniPrecision');
        if (saved) {
            state.precision = parseInt(saved, 10);
            const sel = document.getElementById('precisionSelect');
            if (sel) sel.value = state.precision;
        }
    } catch (e) {}
}

/* ================================================================
   DATA BASE TOGGLE (Binary 1024 / Decimal 1000)
   ================================================================ */

function toggleDataBase() {
    state.dataBase = (state.dataBase === 'binary') ? 'decimal' : 'binary';

    const toggle = document.getElementById('baseToggle');
    if (toggle) {
        toggle.classList.toggle('is-decimal', state.dataBase === 'decimal');
    }

    showToast(state.dataBase === 'decimal'
        ? 'Decimal Base (1 KB = 1,000 B)'
        : 'Binary Base (1 KiB = 1,024 B)'
    );

    // Recalculate with new base
    calculateForward();
}

/* ================================================================
   CALCULATION ENGINE
   ================================================================ */

function setupInputListeners() {
    const inpFrom     = document.getElementById('inpFrom');
    const inpTo       = document.getElementById('inpTo');
    const inpCompound = document.getElementById('inpCompound');

    inpFrom.addEventListener('input', () => {
        state.lastInputSource = 'from';
        calculateForward();
    });

    inpTo.addEventListener('input', () => {
        state.lastInputSource = 'to';
        calculateBackward();
    });

    inpCompound.addEventListener('input', () => {
        state.lastInputSource = 'from';
        calculateForward();
    });

    inpFrom.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') calculateForward();
    });
}

/**
 * Safely evaluate a math expression string.
 * Uses math.js when available; falls back to a safe manual parser.
 * Never uses eval() directly.
 * @param {string} raw
 * @returns {number|null}
 */
function parseInput(raw) {
    if (!raw && raw !== 0) return null;
    const cleaned = String(raw).replace(/,/g, '').replace(/[^0-9.+\-*/() eE]/g, '').trim();
    if (!cleaned) return null;

    try {
        if (typeof math !== 'undefined') {
            const result = math.evaluate(cleaned);
            return (typeof result === 'number' && isFinite(result)) ? result : null;
        }
        // Safe fallback: only allow simple numeric expressions
        const safePattern = /^[\d\s.+\-*/()eE]+$/;
        if (!safePattern.test(cleaned)) return null;
        // eslint-disable-next-line no-new-func
        const fn = new Function('"use strict"; return (' + cleaned + ')');
        const val = fn();
        return (typeof val === 'number' && isFinite(val)) ? val : null;
    } catch (e) {
        return null;
    }
}

function calculateForward() {
    try {
        let val;

        if (state.compoundActive && (state.cat === 'length' || state.cat === 'weight')) {
            val = getCompoundValue();
        } else {
            const raw = document.getElementById('inpFrom').value;
            if (!raw) { document.getElementById('inpTo').value = ''; document.getElementById('formula').innerText = ''; return; }
            val = parseInput(raw);
        }

        if (val === null || isNaN(val)) return;

        const res = performConversion(val, state.from, state.to);
        document.getElementById('inpTo').value = formatNumber(res, state.precision);
        updateFormula(state.from, state.to);
        saveHist(val, res);
    } catch (e) {
        console.error('[OCU] calculateForward error:', e);
    }
}

function calculateBackward() {
    try {
        const raw = document.getElementById('inpTo').value;
        if (!raw) { document.getElementById('inpFrom').value = ''; return; }

        const val = parseInput(raw);
        if (val === null || isNaN(val)) return;

        // For backward calculation, swap 'from' and 'to'
        const res = performConversion(val, state.to, state.from);
        document.getElementById('inpFrom').value = formatNumber(res, state.precision);
        updateFormula(state.from, state.to);
    } catch (e) {
        console.error('[OCU] calculateBackward error:', e);
    }
}

/**
 * Core conversion dispatch function.
 * Routes to the correct math model based on category type.
 * @param {number} val  - Input value
 * @param {string} from - Source unit key
 * @param {string} to   - Target unit key
 * @returns {number}
 */
function performConversion(val, from, to) {
    const catData = DB[state.cat];

    if (catData.type === 'func')  return convertTemp(val, from, to);
    if (catData.type === 'inv')   return convertFuel(val, from, to);

    // Currency / API rates:
    // Formula: result = amount * (targetRate / sourceRate)
    // (rates are expressed as "how much of this unit = 1 USD")
    if (catData.type === 'api') {
        const rates = catData.u;
        if (!rates[from] || !rates[to]) return NaN;
        return val * (rates[to] / rates[from]);
    }

    // Linear & Data:
    // Factor definition = "value of 1 unit in the base unit"
    // Formula: base = val * fromFactor;  result = base / toFactor
    const rates  = catData.u;
    const base   = val * (rates[from] || 1);
    return base / (rates[to] || 1);
}

function convertTemp(v, f, t) {
    if (f === t) return v;
    let k;
    if      (f === 'C') k = v + 273.15;
    else if (f === 'F') k = (v + 459.67) * 5 / 9;
    else if (f === 'K') k = v;
    else if (f === 'R') k = v * 5 / 9;
    else                k = v;

    if (t === 'C') return k - 273.15;
    if (t === 'F') return k * 9 / 5 - 459.67;
    if (t === 'K') return k;
    if (t === 'R') return k * 9 / 5;
    return k;
}

function convertFuel(v, f, t) {
    if (v <= 0) return 0;
    if (f === t) return v;
    if (f === 'l100km') return (t === 'mpg') ? 235.215 / v : 100 / v;
    if (t === 'l100km') return (f === 'mpg') ? 235.215 / v : 100 / v;
    const mpg = (f === 'kmpl') ? v * 2.35215 : v;
    return (t === 'kmpl') ? mpg / 2.35215 : mpg;
}

/**
 * Updates the formula display bar (e.g., "1 USD = 122 BDT [LIVE]").
 */
function updateFormula(from, to) {
    try {
        const formulaEl = document.getElementById('formula');
        const catData   = DB[state.cat];
        let   rate;

        if (catData.type === 'api') {
            rate = catData.u[to] / catData.u[from];
            const badge = state.isLiveRate
                ? `<span class="currency-badge badge-live">LIVE</span>`
                : `<span class="currency-badge badge-offline">OFFLINE</span>`;
            formulaEl.innerHTML = `1 ${from} = ${formatNumber(rate, state.precision)} ${to} ${badge}`;
        } else if (catData.type === 'func') {
            const sample = performConversion(1, from, to);
            formulaEl.innerText = `1 ${from} ≈ ${formatNumber(sample, state.precision)} ${to}`;
        } else {
            rate = (catData.u[from] || 1) / (catData.u[to] || 1);
            formulaEl.innerText = `1 ${from} ≈ ${formatNumber(rate, state.precision)} ${to}`;
        }
    } catch (e) {
        console.error('[OCU] updateFormula error:', e);
    }
}

/**
 * Smart number formatter — respects state.precision, uses scientific notation for extremes.
 * @param {number} n
 * @param {number} [decimals]
 * @returns {string}
 */
function formatNumber(n, decimals) {
    const dp = (decimals !== undefined) ? decimals : state.precision;
    if (isNaN(n) || !isFinite(n)) return 'Error';
    if (n === 0) return '0';
    if (Math.abs(n) < 1e-7 || Math.abs(n) >= 1e13) return n.toExponential(dp);

    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: dp,
        minimumFractionDigits: 0,
        useGrouping: false
    }).format(n);
}

/* ================================================================
   API & CURRENCY (including Crypto & Precious Metals)
   ================================================================ */

async function initCurrency() {
    try {
        const cached = localStorage.getItem('omniRates');
        const now    = Date.now();

        if (cached) {
            const data = JSON.parse(cached);
            // 1-hour cache validity
            if (now - data.time < 3600000 && data.rates) {
                DB.currency.u = { ...DB.currency.u, ...data.rates };
                state.isLiveRate = true;
                return;
            }
        }
    } catch (e) {
        console.warn('[OCU] Cache parse error:', e);
    }

    try {
        const loader = document.getElementById('loader');
        if (loader) loader.style.width = '70%';

        const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        if (!res.ok) throw new Error('API limit or network error');
        const json = await res.json();

        if (json && json.rates) {
            // Merge live fiat rates into DB — preserve crypto/metals fallback
            // if the API does not return them
            DB.currency.u = { ...DB.currency.u, ...json.rates };
            localStorage.setItem('omniRates', JSON.stringify({ time: Date.now(), rates: DB.currency.u }));
            state.isLiveRate = true;
        }
    } catch (e) {
        state.isLiveRate = false;
        showToast('Offline Mode: Rates may be outdated', 'error');
    } finally {
        const loader = document.getElementById('loader');
        if (loader) loader.style.width = '0%';
    }
}

/* ================================================================
   CHART.JS INTEGRATION
   ================================================================ */

function updateChart() {
    if (state.cat !== 'currency') return;
    if (typeof Chart === 'undefined') return;

    const canvas = document.getElementById('conversionChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (state.chart) {
        state.chart.destroy();
        state.chart = null;
    }

    const isLight   = document.body.classList.contains('light-mode');
    const color     = isLight ? '#4f46e5' : '#6366f1';
    const gridColor = isLight ? '#e2e8f0' : '#334155';

    const baseRate = (DB.currency.u[state.to] || 1) / (DB.currency.u[state.from] || 1);
    const labels   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Simulate a realistic weekly trend with slight random walk
    let seed = baseRate;
    const data = labels.map(() => {
        seed = seed * (1 + (Math.random() * 0.02 - 0.01));
        return seed;
    });

    try {
        state.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: `${state.from} → ${state.to}`,
                    data,
                    borderColor: color,
                    backgroundColor: isLight ? 'rgba(79,70,229,0.1)' : 'rgba(99,102,241,0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: isLight ? '#64748b' : '#94a3b8' } },
                    y: { grid: { color: gridColor }, ticks: { display: false } }
                }
            }
        });
    } catch (e) {
        console.error('[OCU] Chart render error:', e);
    }
}

/* ================================================================
   SMART SEARCH — NLP-lite Natural Language Parsing
   Handles:
   - "100 usd in bdt" | "100 usd to bdt"
   - "10 kg to lbs"
   - "5 feet 8 inches" (sets compound mode)
   - Direct unit prefix search
   ================================================================ */

// Unit alias map for natural language variations
const UNIT_ALIASES = {
    // Length
    'feet': 'ft', 'foot': 'ft', 'inches': 'inch', 'in': 'inch',
    'meters': 'm', 'meter': 'm', 'metre': 'm', 'metres': 'm',
    'centimeters': 'cm', 'centimeter': 'cm', 'centimetre': 'cm',
    'kilometers': 'km', 'kilometer': 'km', 'kilometre': 'km',
    'miles': 'mi', 'mile': 'mi', 'yards': 'yd', 'yard': 'yd',
    // Weight
    'pounds': 'lb', 'pound': 'lb', 'lbs': 'lb',
    'ounces': 'oz', 'ounce': 'oz',
    'kilograms': 'kg', 'kilogram': 'kg', 'grams': 'g', 'gram': 'g',
    'tonnes': 't', 'tonne': 't', 'tons': 't', 'ton': 't',
    // Temperature
    'celsius': 'C', 'fahrenheit': 'F', 'kelvin': 'K',
    // Currency
    'dollars': 'USD', 'dollar': 'USD', 'usd': 'USD', '$': 'USD',
    'euros': 'EUR', 'euro': 'EUR', 'eur': 'EUR',
    'pounds sterling': 'GBP', 'gbp': 'GBP',
    'bitcoin': 'BTC', 'btc': 'BTC', 'ethereum': 'ETH', 'eth': 'ETH',
    'gold': 'XAU', 'xau': 'XAU', 'silver': 'XAG', 'xag': 'XAG',
    'bdt': 'BDT', 'inr': 'INR', 'taka': 'BDT', 'rupee': 'INR', 'rupees': 'INR',
    // Data
    'bytes': 'B', 'byte': 'B', 'bits': 'bit',
    'kilobytes': 'KB', 'megabytes': 'MB', 'gigabytes': 'GB',
    'terabytes': 'TB', 'petabytes': 'PB',
    // Time
    'seconds': 's', 'second': 's', 'minutes': 'min', 'minute': 'min',
    'hours': 'h', 'hour': 'h', 'days': 'd', 'day': 'd',
    'weeks': 'wk', 'week': 'wk', 'months': 'mo', 'month': 'mo',
    'years': 'y', 'year': 'y'
};

/** Normalize a token to its canonical DB key. */
function resolveUnit(token) {
    const t = token.toLowerCase().trim();
    if (UNIT_ALIASES[t]) return UNIT_ALIASES[t];
    // Direct case-insensitive match against all DB unit keys
    for (const catKey of Object.keys(DB)) {
        const units = Object.keys(DB[catKey].u);
        const found = units.find(u => u.toLowerCase() === t);
        if (found) return found;
    }
    return null;
}

/** Find which category a unit key belongs to. */
function findCatForUnit(unitKey) {
    for (const catKey of Object.keys(DB)) {
        if (DB[catKey].u && Object.prototype.hasOwnProperty.call(DB[catKey].u, unitKey)) {
            return catKey;
        }
    }
    return null;
}

/**
 * Main smart search handler.
 * Parses natural language and dispatches to the correct category/unit/value.
 */
function smartSearch(txt) {
    if (!txt || txt.length < 2) return;
    const raw = txt.trim();
    const lower = raw.toLowerCase();

    // ── Pattern 1: "100 usd in bdt" / "100 usd to bdt" / "100 usd = bdt" ──
    // Supports: <number> <unit> (in|to|as|=|→) <unit>
    const patternFull = /^([\d.,+\-*/() eE]+)\s+([a-z$€£¥₹₿]+(?:\s+[a-z]+)?)\s*(?:in|to|as|into|=|→)\s*([a-z$€£¥₹₿]+(?:\s+[a-z]+)?)$/i;
    const mFull = lower.match(patternFull);

    if (mFull) {
        const numStr  = mFull[1].trim();
        const fromRaw = mFull[2].trim();
        const toRaw   = mFull[3].trim();

        const fromUnit = resolveUnit(fromRaw);
        const toUnit   = resolveUnit(toRaw);

        if (fromUnit && toUnit) {
            const cat = findCatForUnit(fromUnit);
            if (cat && DB[cat].u[toUnit] !== undefined) {
                const val = parseInput(numStr);
                if (val !== null) {
                    applySmartResult(cat, fromUnit, toUnit, val);
                    return;
                }
            }
        }
    }

    // ── Pattern 2: "10 kg to lbs" (number + unit + to + unit) ──
    const patternShort = /^([\d.,]+)\s*([a-z]+)\s*(?:to|in)\s*([a-z]+)$/i;
    const mShort = lower.match(patternShort);

    if (mShort) {
        const val      = parseInput(mShort[1]);
        const fromUnit = resolveUnit(mShort[2]);
        const toUnit   = resolveUnit(mShort[3]);

        if (val !== null && fromUnit && toUnit) {
            const cat = findCatForUnit(fromUnit);
            if (cat) {
                applySmartResult(cat, fromUnit, toUnit, val);
                return;
            }
        }
    }

    // ── Pattern 3: "5 feet 8 inches" (compound input) ──
    const patternCompound = /^([\d.,]+)\s*([a-z]+)\s+([\d.,]+)\s*([a-z]+)$/i;
    const mComp = lower.match(patternCompound);

    if (mComp) {
        const v1   = parseInput(mComp[1]);
        const u1   = resolveUnit(mComp[2]);
        const v2   = parseInput(mComp[3]);
        const u2   = resolveUnit(mComp[4]);

        if (v1 !== null && v2 !== null && u1 && u2) {
            const cat = findCatForUnit(u1);
            if (cat && (cat === 'length' || cat === 'weight') && DB[cat].u[u2] !== undefined) {
                setCat(cat);
                state.from     = u1;
                state.compound = u2;
                state.compoundActive = true;
                showCompoundRow();
                document.getElementById('inpFrom').value     = v1;
                document.getElementById('inpCompound').value = v2;
                document.getElementById('uFromDisp').innerText     = u1;
                document.getElementById('uCompoundDisp').innerText = u2;
                const compBtn = document.getElementById('compoundToggleBtn');
                if (compBtn) { compBtn.style.display = 'inline-flex'; compBtn.classList.add('active'); }
                calculateForward();
                renderCats();
                return;
            }
        }
    }

    // ── Pattern 4: Direct unit prefix search ──
    for (const cat of Object.keys(DB)) {
        const units = Object.keys(DB[cat].u);
        const found = units.find(u => u.toLowerCase().startsWith(lower));
        if (found) {
            setCat(cat);
            state.from = found;
            updateLabels();
            return;
        }
    }
}

/** Apply a fully resolved smart search result to the UI. */
function applySmartResult(cat, fromUnit, toUnit, val) {
    setCat(cat);
    state.from = fromUnit;
    state.to   = toUnit;
    renderCats();
    updateLabels();

    document.getElementById('inpFrom').value = val;
    state.lastInputSource = 'from';
    calculateForward();

    if (cat === 'currency') setTimeout(updateChart, 300);
}

/* ================================================================
   UI ACTIONS
   ================================================================ */

function copyResult() {
    const val = document.getElementById('inpTo').value;
    if (val && val !== 'Error') {
        try {
            navigator.clipboard.writeText(val);
            showToast('Copied to Clipboard ✓', 'success');
        } catch (e) {
            showToast('Copy failed — please copy manually');
        }
    }
}

function swap() {
    // Swap unit labels
    [state.from, state.to] = [state.to, state.from];

    const vFrom = document.getElementById('inpFrom').value;
    const vTo   = document.getElementById('inpTo').value;

    if (vTo && vTo !== 'Error') {
        document.getElementById('inpFrom').value = vTo;
        document.getElementById('inpTo').value   = vFrom;
    }

    // Reset compound state — compound partner should update
    if (state.compoundActive && DB[state.cat] && DB[state.cat].compoundPair) {
        const newPair = DB[state.cat].compoundPair[state.from];
        if (newPair) {
            state.compound = newPair;
            document.getElementById('uCompoundDisp').innerText = state.compound;
        }
    }

    updateLabels();
    if (state.cat === 'currency') updateChart();
}

function clearAll() {
    clearInputs();
    showToast('Cleared');
}

function toggleCalc() {
    const panel = document.getElementById('calcPanel');
    const btn   = document.getElementById('btnCalc');
    const isHidden = panel.style.display === 'none' || panel.style.display === '';
    panel.style.display = isHidden ? 'grid' : 'none';
    btn.classList.toggle('active', isHidden);
}

/** Calculator button handler — routes input to the last focused field. */
function calcInput(v) {
    // Output box is readonly — calc always goes to From
    const inp = document.getElementById('inpFrom');
    if (v === '.' && inp.value.includes('.')) return;
    inp.value += v;
    state.lastInputSource = 'from';
    calculateForward();
}

function calcSolve() {
    const inp = document.getElementById('inpFrom');
    const val = parseInput(inp.value);
    if (val !== null) {
        inp.value = val;
        calculateForward();
    }
}

function startDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Voice input not supported in this browser');
        return;
    }

    try {
        const r  = new SpeechRecognition();
        r.lang   = 'en-US';
        r.start();
        const inp = document.getElementById('inpFrom');
        inp.placeholder = 'Listening…';

        r.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            inp.placeholder  = '0';

            // Try smart search first (natural language from voice)
            smartSearch(transcript);

            // Fallback: extract a bare number
            const num = transcript.match(/[\d.]+/);
            if (num && !transcript.toLowerCase().includes('to') && !transcript.toLowerCase().includes('in')) {
                inp.value = num[0];
                calculateForward();
            }
        };
        r.onerror = () => {
            inp.placeholder = '0';
            showToast('Voice recognition error', 'error');
        };
        r.onend = () => { inp.placeholder = '0'; };
    } catch (e) {
        showToast('Voice recognition failed to start', 'error');
    }
}

/* ================================================================
   HISTORY MANAGEMENT
   ================================================================ */

function saveHist(inV, outV) {
    if (window._histTimer) clearTimeout(window._histTimer);
    window._histTimer = setTimeout(() => {
        if (!inV && inV !== 0) return;
        if (!outV && outV !== 0) return;
        const formatted = formatNumber(outV, state.precision);
        if (formatted === 'Error') return;

        const item = {
            t: `${formatNumber(inV, state.precision)} ${state.from} → ${formatted} ${state.to}`,
            d: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        let h = [];
        try { h = JSON.parse(localStorage.getItem('omniHist') || '[]'); } catch (e) {}

        // Avoid duplicate consecutive entries
        if (h.length > 0 && h[0].t === item.t) return;

        h.unshift(item);
        if (h.length > 10) h.pop();
        try { localStorage.setItem('omniHist', JSON.stringify(h)); } catch (e) {}
        loadHist();
    }, 1500);
}

function loadHist() {
    let h = [];
    try { h = JSON.parse(localStorage.getItem('omniHist') || '[]'); } catch (e) {}

    const list = document.getElementById('historyList');
    if (!list) return;

    list.innerHTML = h.length
        ? h.map(i => `
            <div class="ocu-hist-item">
                <span class="ocu-hist-text">${escapeHTML(i.t)}</span>
                <span class="ocu-hist-time">${escapeHTML(i.d)}</span>
            </div>
        `).join('')
        : '<div class="ocu-hist-empty">No recent history</div>';
}

function clearHist() {
    try { localStorage.removeItem('omniHist'); } catch (e) {}
    loadHist();
    showToast('History cleared');
}

function toggleHistory() {
    const p = document.getElementById('historyPanel');
    p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
}

/* ================================================================
   MODAL LOGIC
   ================================================================ */

function openModal(target) {
    state.modalTarget = target;
    let units;
    let active;

    if (target === 'compound') {
        units  = Object.keys(DB[state.cat].u).filter(u => u !== state.from);
        active = state.compound;
    } else {
        units  = Object.keys(DB[state.cat].u);
        active = (target === 'from') ? state.from : state.to;
    }

    renderModalList(units, active);
    document.getElementById('unitModal').classList.add('active');
    setTimeout(() => {
        const search = document.getElementById('modalSearch');
        if (search) { search.value = ''; search.focus(); }
    }, 100);
}

function renderModalList(units, active) {
    document.getElementById('modalList').innerHTML = units.map(u => `
        <div class="ocu-unit-opt ${u === active ? 'selected' : ''}" onclick="selectUnit('${escapeHTML(u)}')">
            <span>${escapeHTML(u)}</span>
            ${u === active ? '<i class="fa-solid fa-check text-accent-cyan"></i>' : ''}
        </div>
    `).join('');
}

function closeModal() {
    document.getElementById('unitModal').classList.remove('active');
    document.getElementById('modalSearch').value = '';
}

function selectUnit(u) {
    if (state.modalTarget === 'from') {
        state.from = u;
        // Update compound partner to logical pair
        if (DB[state.cat] && DB[state.cat].compoundPair && DB[state.cat].compoundPair[u]) {
            state.compound = DB[state.cat].compoundPair[u];
            document.getElementById('uCompoundDisp').innerText = state.compound;
        }
    } else if (state.modalTarget === 'compound') {
        state.compound = u;
        document.getElementById('uCompoundDisp').innerText = u;
    } else {
        state.to = u;
    }
    updateLabels();
    closeModal();
    if (state.cat === 'currency') setTimeout(updateChart, 300);
}

function filterModalList(txt) {
    let units;
    const active = state.modalTarget === 'compound'
        ? state.compound
        : (state.modalTarget === 'from' ? state.from : state.to);

    if (state.modalTarget === 'compound') {
        units = Object.keys(DB[state.cat].u)
            .filter(u => u !== state.from && u.toLowerCase().includes(txt.toLowerCase()));
    } else {
        units = Object.keys(DB[state.cat].u)
            .filter(u => u.toLowerCase().includes(txt.toLowerCase()));
    }

    renderModalList(units, active);
}

window.addEventListener('click', (e) => {
    const modal = document.getElementById('unitModal');
    if (e.target === modal) closeModal();
});

/* ================================================================
   THEME LOGIC
   ================================================================ */

function loadTheme() {
    try {
        const saved = localStorage.getItem('omniTheme');
        if (saved === 'light') {
            document.body.classList.add('light-mode');
            updateThemeIcon(true);
        }
    } catch (e) {}
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    try { localStorage.setItem('omniTheme', isLight ? 'light' : 'dark'); } catch (e) {}
    updateThemeIcon(isLight);
    if (state.cat === 'currency') updateChart();
}

function updateThemeIcon(isLight) {
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = isLight ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
}

/* ================================================================
   TOAST NOTIFICATIONS
   ================================================================ */

function showToast(msg, type = 'info') {
    const box = document.getElementById('toast-box');
    if (!box) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconMap = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    const icon = iconMap[type] || iconMap.info;

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(msg)}</span>`;
    box.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.4s ease forwards';
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 400);
    }, 2800);
}

/* ================================================================
   SECURITY HELPERS
   ================================================================ */

/** Escape HTML special characters to prevent XSS in dynamically inserted strings. */
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
