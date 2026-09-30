/**
 * =============================================================================
 *  SMART EMI CALCULATOR — ULTRA PRO MAX
 *  script.js — Tool Logic (External, Strict Separation of Concerns)
 * =============================================================================
 *  Version : 4.0 (CodeCanyon Release Build)
 *  Author  : MD KAWSAR
 *  License : Standard CodeCanyon License
 *  Project : Trusted Tools Web
 *
 *  Changelog v4.0:
 *  - FIX: Replaced simple-interest moratorium with compound (capitalized) interest
 *  - FIX: Negative amortization guard — shows error toast and aborts if EMI < monthly interest
 *  - NEW: Lump-sum pre-payment input — applies one-time payment at a user-specified month
 *  - NEW: Lump-sum savings summary badge (months saved + interest saved)
 *  - NEW: Export to CSV for the full amortization schedule
 *  - IMPROVED: Currency toggle now converts the loan amount instead of resetting it
 *  - IMPROVED: All edge cases (NaN, zero, negative, Infinity) handled gracefully
 *  - IMPROVED: Chart.js theme refresh preserved from v3.6
 *
 *  ARCHITECTURE NOTES:
 *  - All DOM IDs referenced here must remain UNCHANGED in index.html
 *  - Uses the global #toastArea element for notifications
 *  - Exports: refreshChartTheme() for global.js themeChanged event
 * =============================================================================
 */

'use strict';

// ---------------------------------------------------------------------------
//  APP STATE
//  Central configuration and runtime state object.
//  currency     : active currency code ('BDT' or 'USD')
//  symbol       : active currency symbol ('৳' or '$')
//  chartInstance: reference to the active Chart.js doughnut instance
//  isCalculating: re-entrancy guard for the calculation engine
//  lastResult   : stores the last successful calculation result for CSV export
// ---------------------------------------------------------------------------
const appConfig = {
    currency      : 'BDT',
    symbol        : '৳',
    chartInstance : null,
    isCalculating : false,
    lastResult    : null  // { rows: [...], emi, totalInterest, principal }
};

// BDT → USD conversion rate (approximate; used for currency toggle conversion)
const BDT_TO_USD = 0.0091;
const USD_TO_BDT = 110;


// ---------------------------------------------------------------------------
//  DOM READY — INITIALIZER
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initChart();       // Build Chart.js doughnut on #loanChart
    loadTheme();       // Apply saved theme and sync chart colors
    calculateUltra();  // Run initial calculation with default values
});


// ---------------------------------------------------------------------------
//  SYNC
//  Keeps a text/number input and its paired range slider in sync.
//
//  @param {string} src  — ID of the element that was just changed
//  @param {string} dest — ID of the paired element to update
// ---------------------------------------------------------------------------
let debounceTimer;

function sync(src, dest) {
    const srcEl  = document.getElementById(src);
    const destEl = document.getElementById(dest);
    if (!srcEl || !destEl) return;

    // Parse value; clamp negatives to zero
    let val = parseFloat(srcEl.value) || 0;
    if (val < 0) val = 0;

    destEl.value = val;
    updateDisplayLabels(src, val);

    // Debounce: wait 50 ms after the last keystroke before recalculating
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => calculateUltra(), 50);
}


// ---------------------------------------------------------------------------
//  UPDATE DISPLAY LABELS
//  Refreshes the highlighted live-value badge next to each input label.
//
//  @param {string} src — Source element ID
//  @param {number} val — New numeric value to display
// ---------------------------------------------------------------------------
function updateDisplayLabels(src, val) {
    const fmt = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 0 });

    if (src.includes('Amount')) {
        const el = document.getElementById('disp-amt');
        if (el) el.innerText = fmt(val);
    }
    if (src.includes('Rate')) {
        const el = document.getElementById('disp-rate');
        if (el) el.innerText = val + '%';
    }
    if (src.includes('Tenure')) {
        const el = document.getElementById('disp-year');
        if (el) el.innerText = val + ' Years';
    }
}


// ---------------------------------------------------------------------------
//  SWITCH MODE (Tab Navigation)
//
//  @param {string} mode — 'standard' | 'advanced' | 'afford'
// ---------------------------------------------------------------------------
function switchMode(mode) {
    // Update tab button states
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const isActive = btn.id === 'tab-' + mode;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
    });

    // Show / hide feature panels
    const advanced = document.getElementById('advanced-features');
    const afford   = document.getElementById('afford-features');
    if (advanced) advanced.classList.toggle('hidden', mode !== 'advanced');
    if (afford)   afford.classList.toggle('hidden',   mode !== 'afford');

    calculateUltra();
}


// ---------------------------------------------------------------------------
//  CALCULATE ULTRA — MAIN CALCULATION ENGINE
//
//  Handles:
//    1. Input validation (zeros, NaN, negatives)
//    2. Compound-interest moratorium period
//    3. Standard EMI formula
//    4. NEGATIVE AMORTIZATION GUARD — aborts if EMI ≤ monthly interest
//    5. Month-by-month amortization loop with:
//       - Monthly pre-payment (extraEMI)
//       - One-time lump-sum pre-payment at a specific month
//    6. Lump-sum savings comparison (vs. baseline without lump-sum)
//    7. Tax saving badge logic
//    8. UI, chart, and table updates
// ---------------------------------------------------------------------------
function calculateUltra() {
    if (appConfig.isCalculating) return;
    appConfig.isCalculating = true;

    try {
        // ── Read inputs safely ──────────────────────────────────────
        const getVal = (id, fallback = 0) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            const v = parseFloat(el.value);
            return isNaN(v) ? fallback : Math.abs(v);
        };

        const P         = getVal('loanAmount');     // Original principal
        const R         = getVal('interestRate');    // Annual interest rate (%)
        const N         = getVal('loanTenure');      // Tenure in years
        const extra     = getVal('extraEMI');        // Monthly extra payment
        const morat     = Math.round(getVal('moratorium')); // Moratorium months (integer)
        const lumpAmt   = getVal('lumpSum');         // Lump-sum amount
        const lumpMonth = Math.max(1, Math.round(getVal('lumpSumMonth', 12))); // Lump-sum month

        // ── Core validation ─────────────────────────────────────────
        if (P <= 0 || R <= 0 || N <= 0) {
            resetResults();
            return;
        }

        // Monthly interest rate (decimal) and total repayment months
        const r = R / 12 / 100;
        const n = Math.round(N * 12); // Round to avoid floating-point tenure issues

        // ── MORATORIUM: Compound (Capitalized) Interest ─────────────
        // During the moratorium, no EMI is paid. Interest accrues and
        // is compounded monthly, inflating the principal. This is the
        // standard bank practice (compound, not simple, capitalization).
        let adjustedPrincipal = P;
        if (morat > 0) {
            adjustedPrincipal = P * Math.pow(1 + r, morat);
        }

        // ── STANDARD EMI FORMULA ─────────────────────────────────────
        // EMI = P_adj × r × (1+r)^n / ((1+r)^n − 1)
        const factor = Math.pow(1 + r, n);
        let emi = (adjustedPrincipal * r * factor) / (factor - 1);

        // Guard: non-finite result means invalid inputs (e.g., r=0 path not reached, but safeguard)
        if (!isFinite(emi) || emi <= 0) {
            resetResults();
            showToast('Unable to calculate EMI. Please check your inputs.', 'error');
            return;
        }

        // ── NEGATIVE AMORTIZATION GUARD ──────────────────────────────
        // If the EMI amount is less than or equal to the first month's interest,
        // the loan balance will NEVER decrease. Abort and warn the user.
        const firstMonthInterest = adjustedPrincipal * r;
        if (emi <= firstMonthInterest) {
            resetResults();
            showToast('EMI is less than monthly interest — loan cannot be repaid. Increase tenure or reduce the rate.', 'error');
            return;
        }

        // ── AMORTIZATION SIMULATION ──────────────────────────────────
        // Run two simulations:
        //   1. baseline — standard EMI + monthly extra (no lump-sum)
        //   2. withLump — same but applies lump-sum at the target month
        // This allows us to compute savings from the lump-sum payment.

        const simulate = (applyLump) => {
            let balance      = adjustedPrincipal;
            let totalInt     = 0;
            let months       = 0;
            const rows       = [];
            const maxLoop    = 960; // 80-year safety cap

            // Compound interest accumulated during moratorium is cost too
            // Include moratorium interest in total interest display
            if (morat > 0) {
                totalInt += adjustedPrincipal - P;
            }

            const startDate = new Date();

            while (balance > 0.5 && months < maxLoop) {
                months++;

                // Apply lump-sum at the specified month (only once)
                if (applyLump && months === lumpMonth && lumpAmt > 0) {
                    const actualLump = Math.min(lumpAmt, balance);
                    balance -= actualLump;
                    if (balance <= 0.5) break; // Loan fully cleared by lump-sum
                }

                const interest  = balance * r;
                let principal   = emi + extra - interest;

                // ── Negative amortization check inside loop ──
                // If extra was removed mid-loop somehow, interest can exceed payment.
                // This is a belt-and-suspenders guard; the outer guard should catch it first.
                if (principal <= 0) {
                    // Cannot recover; break to avoid infinite loop
                    break;
                }

                // Clamp final month: don't overpay
                if (balance < principal) {
                    principal = balance;
                    balance   = 0;
                } else {
                    balance -= principal;
                }

                totalInt += interest;

                // Build table row data (only for the primary simulation)
                const rowDate = new Date(startDate);
                rowDate.setMonth(rowDate.getMonth() + months);
                rows.push({
                    label    : rowDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                    principal: Math.round(principal),
                    interest : Math.round(interest),
                    balance  : Math.round(Math.max(0, balance))
                });
            }

            return { months, totalInt, rows };
        };

        // Run baseline (no lump-sum) and lump-sum simulations
        const baseline = simulate(false);
        const withLump = (lumpAmt > 0) ? simulate(true) : baseline;

        // The "active" simulation drives the UI
        const active = withLump;

        // Update main result UI
        updateUI(emi, active.totalInt, P);
        updateChart(P, active.totalInt);
        generateTable(active.rows);

        // Store result for CSV export
        appConfig.lastResult = {
            rows         : active.rows,
            emi,
            totalInterest: active.totalInt,
            principal    : P
        };

        // Reveal the CSV export button now that data is ready
        const csvBtn = document.getElementById('csvExportBtn');
        if (csvBtn) csvBtn.classList.remove('hidden');

        // ── Lump-sum savings summary ──────────────────────────────────
        const savingsBox = document.getElementById('lumpSumSavings');
        if (savingsBox) {
            if (lumpAmt > 0 && withLump.months < baseline.months) {
                const savedMonths = baseline.months - withLump.months;
                const savedInt    = Math.round(baseline.totalInt - withLump.totalInt);
                savingsBox.innerHTML =
                    `<i class="fa-solid fa-trophy" aria-hidden="true"></i>
                     Lump-sum saves you <strong>${savedMonths} month${savedMonths > 1 ? 's' : ''}</strong>
                     and <strong>${appConfig.symbol}&nbsp;${savedInt.toLocaleString()}</strong> in interest!`;
                savingsBox.classList.remove('hidden');
            } else {
                savingsBox.classList.add('hidden');
            }
        }

        // ── Tax saving badge ─────────────────────────────────────────
        const taxThreshold = appConfig.currency === 'BDT' ? 2500000 : 30000;
        const taxBadge     = document.getElementById('taxBadge');
        if (taxBadge) {
            const show = P > taxThreshold && N >= 10;
            taxBadge.style.display  = show ? 'block' : 'none';
            taxBadge.setAttribute('aria-hidden', String(!show));
        }

    } catch (err) {
        console.error('EMI Calculation Error:', err);
        showToast('An unexpected error occurred. Please refresh and try again.', 'error');
    } finally {
        appConfig.isCalculating = false;
    }
}


// ---------------------------------------------------------------------------
//  RESET RESULTS
//  Clears all result displays when inputs are invalid.
// ---------------------------------------------------------------------------
function resetResults() {
    ['emiValue', 'totalInterest', 'totalPayment'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = appConfig.symbol + ' 0';
    });
    updateChart(1, 0); // Reset chart with placeholder data to avoid empty render

    // Hide CSV button and savings box
    const csvBtn    = document.getElementById('csvExportBtn');
    const savingsBox = document.getElementById('lumpSumSavings');
    if (csvBtn)    csvBtn.classList.add('hidden');
    if (savingsBox) savingsBox.classList.add('hidden');

    appConfig.lastResult = null;
}


// ---------------------------------------------------------------------------
//  UPDATE UI
//  Writes the three key result values to their DOM targets.
//
//  @param {number} emi           — Calculated monthly EMI
//  @param {number} totalInterest — Total interest paid
//  @param {number} P             — Original principal
// ---------------------------------------------------------------------------
function updateUI(emi, totalInterest, P) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = appConfig.symbol + ' ' + Math.round(val).toLocaleString();
    };
    set('emiValue',      emi);
    set('totalInterest', totalInterest);
    set('totalPayment',  P + totalInterest);
}


// ---------------------------------------------------------------------------
//  CHART.JS VISUALIZATION
// ---------------------------------------------------------------------------

/**
 * GET CHART COLORS
 * Resolves chart colors from the active CSS theme at runtime.
 * Falls back to hardcoded hex values if CSS variables are unavailable.
 */
function getChartColors() {
    const styles  = getComputedStyle(document.documentElement);
    const isLight = document.body.classList.contains('light-mode');

    const rawPrimary = styles.getPropertyValue('--brand-primary').trim();
    const rawAccent  = styles.getPropertyValue('--accent-purple').trim();

    const primary = rawPrimary || '#ff0055';
    const accent  = rawAccent  || '#d124ff';

    const legendColor  = isLight ? '#636e72'                : '#8b949e';
    const tooltipBg    = isLight ? 'rgba(255,255,255,0.95)' : 'rgba(13,17,23,0.95)';
    const tooltipTitle = isLight ? '#2c3e50'                : primary;
    const tooltipBody  = isLight ? '#636e72'                : '#8b949e';

    return { primary, accent, legendColor, tooltipBg, tooltipTitle, tooltipBody };
}


/**
 * INIT CHART
 * Creates the Chart.js doughnut instance on the #loanChart canvas.
 * Called once on DOMContentLoaded.
 */
function initChart() {
    const canvas = document.getElementById('loanChart');
    if (!canvas) return;

    const colors = getChartColors();
    const ctx    = canvas.getContext('2d');

    appConfig.chartInstance = new Chart(ctx, {
        type : 'doughnut',
        data : {
            labels   : ['Principal Amount', 'Total Interest'],
            datasets : [{
                data             : [1, 0],
                backgroundColor  : [colors.primary, colors.accent],
                borderColor      : [colors.primary, colors.accent],
                borderWidth      : 2,
                hoverOffset      : 12,
                hoverBorderWidth : 3
            }]
        },
        options: {
            responsive          : true,
            maintainAspectRatio : false,
            cutout              : '72%',

            plugins: {
                legend: {
                    position : 'bottom',
                    labels   : {
                        color           : colors.legendColor,
                        usePointStyle   : true,
                        pointStyleWidth : 10,
                        padding         : 20,
                        font            : { size: 13, family: "'Segoe UI', sans-serif" }
                    }
                },
                tooltip: {
                    backgroundColor : colors.tooltipBg,
                    titleColor      : colors.tooltipTitle,
                    bodyColor       : colors.tooltipBody,
                    borderColor     : colors.primary,
                    borderWidth     : 1,
                    padding         : 12,
                    cornerRadius    : 8,
                    callbacks: {
                        label: (ctx) =>
                            ` ${ctx.label}: ${appConfig.symbol}${Math.round(ctx.raw).toLocaleString()}`
                    }
                }
            },

            animation: {
                animateRotate : true,
                duration      : 700,
                easing        : 'easeInOutQuart'
            }
        }
    });
}


/**
 * UPDATE CHART
 * Pushes new principal and interest values into the existing chart instance.
 *
 * @param {number} p — Principal amount (or placeholder)
 * @param {number} i — Total interest
 */
function updateChart(p, i) {
    if (!appConfig.chartInstance) return;
    // Guard: chart requires at least one positive value to render meaningfully
    const safeP = (p > 0 || i > 0) ? p : 1;
    appConfig.chartInstance.data.datasets[0].data = [safeP, i];
    appConfig.chartInstance.update('active');
}


/**
 * REFRESH CHART THEME
 * Re-reads CSS variables and updates all chart colors after a theme toggle.
 * Exposed globally so global.js can call it via the 'themeChanged' event.
 */
function refreshChartTheme() {
    if (!appConfig.chartInstance) return;
    const colors = getChartColors();

    const ds = appConfig.chartInstance.data.datasets[0];
    ds.backgroundColor = [colors.primary, colors.accent];
    ds.borderColor     = [colors.primary, colors.accent];

    appConfig.chartInstance.options.plugins.legend.labels.color     = colors.legendColor;
    appConfig.chartInstance.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
    appConfig.chartInstance.options.plugins.tooltip.titleColor      = colors.tooltipTitle;
    appConfig.chartInstance.options.plugins.tooltip.bodyColor       = colors.tooltipBody;
    appConfig.chartInstance.options.plugins.tooltip.borderColor     = colors.primary;

    appConfig.chartInstance.update();
}


// ---------------------------------------------------------------------------
//  AMORTIZATION TABLE
// ---------------------------------------------------------------------------

/**
 * GENERATE TABLE
 * Builds the amortization schedule HTML from pre-computed row data.
 * Limited to 360 rows (30 years) for rendering performance.
 *
 * @param {Array} rows — Array of { label, principal, interest, balance } objects
 */
function generateTable(rows) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    const limit  = Math.min(rows.length, 360);
    let   html   = '';

    for (let i = 0; i < limit; i++) {
        const row = rows[i];
        html += `<tr>
            <td>${row.label}</td>
            <td>${row.principal.toLocaleString()}</td>
            <td class="text-danger">${row.interest.toLocaleString()}</td>
            <td class="text-primary">${appConfig.symbol} ${row.balance.toLocaleString()}</td>
        </tr>`;
    }

    tbody.innerHTML = html;
}


/**
 * TOGGLE TABLE
 * Shows or hides the amortization table wrapper.
 * Scrolls into view when revealed. Updates aria-expanded on the toggle button.
 */
function toggleTable() {
    const wrapper = document.getElementById('tableContainer');
    const btn     = document.getElementById('toggleTableBtn');
    if (!wrapper) return;

    const willShow = wrapper.classList.contains('hidden');
    wrapper.classList.toggle('hidden', !willShow);

    if (btn) btn.setAttribute('aria-expanded', String(willShow));

    if (willShow) {
        setTimeout(() => wrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
}


// ---------------------------------------------------------------------------
//  CSV EXPORT
// ---------------------------------------------------------------------------

/**
 * EXPORT CSV
 * Generates a CSV file from the last computed amortization schedule
 * and triggers a browser download. No server involved.
 */
function exportCSV() {
    if (!appConfig.lastResult || !appConfig.lastResult.rows.length) {
        showToast('Please calculate EMI first before exporting.', 'error');
        return;
    }

    const { rows, emi, totalInterest, principal } = appConfig.lastResult;
    const sym = appConfig.currency;

    // Build CSV header and summary rows
    let csv  = 'Smart EMI Ultra Pro Max — Amortization Schedule\n';
    csv += `Principal (${sym}),${Math.round(principal).toLocaleString()}\n`;
    csv += `Monthly EMI (${sym}),${Math.round(emi).toLocaleString()}\n`;
    csv += `Total Interest (${sym}),${Math.round(totalInterest).toLocaleString()}\n`;
    csv += `Total Amount (${sym}),${Math.round(principal + totalInterest).toLocaleString()}\n`;
    csv += `Generated,${new Date().toLocaleString()}\n\n`;

    // Column headers
    csv += `Month/Year,Principal (${sym}),Interest (${sym}),Balance (${sym})\n`;

    // Data rows — limit matches generateTable() cap
    const limit = Math.min(rows.length, 360);
    for (let i = 0; i < limit; i++) {
        const row = rows[i];
        csv += `${row.label},${row.principal},${row.interest},${row.balance}\n`;
    }

    // Create a Blob and trigger download
    const blob    = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url     = URL.createObjectURL(blob);
    const anchor  = document.createElement('a');
    anchor.href     = url;
    anchor.download = `EMI_Schedule_${Date.now()}.csv`;

    // Append, click, and clean up immediately
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Release the object URL after a short delay to ensure the download started
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast('CSV exported successfully!', 'success');
}


// ---------------------------------------------------------------------------
//  AI AFFORDABILITY ADVISOR
// ---------------------------------------------------------------------------

/**
 * RUN AI ADVISOR
 * Calculates the Debt-to-Income (DTI) ratio and outputs a color-coded
 * risk assessment.
 *
 * DTI thresholds:
 *   < 40% — Healthy (green)
 *   40–59% — Moderate risk (yellow/warning)
 *   >= 60% — High risk (red/error)
 */
function runAIAdvisor() {
    const incomeEl  = document.getElementById('monthlyIncome');
    const emiEl     = document.getElementById('emiValue');
    const responseEl = document.getElementById('aiResponse');

    const income    = parseFloat(incomeEl?.value) || 0;
    const existing  = parseFloat(document.getElementById('currentEMI')?.value) || 0;

    // Parse EMI from the display text (strip symbol and commas)
    const newEMI = parseFloat(emiEl?.innerText.replace(/[^0-9.]/g, '')) || 0;

    if (income <= 0) {
        showToast('Please enter a valid monthly income.', 'error');
        return;
    }

    if (newEMI <= 0) {
        showToast('Please calculate the EMI first.', 'error');
        return;
    }

    const totalObligation = existing + newEMI;
    const ratio           = (totalObligation / income) * 100;

    responseEl.style.display = 'block';

    let msg, color, icon;
    if (ratio < 40) {
        msg   = `<strong>Excellent! (DTI: ${ratio.toFixed(1)}%)</strong><br>Your debt load is healthy. Banks typically approve loans with DTI below 40%.`;
        color = 'var(--status-success)';
        icon  = 'fa-circle-check';
    } else if (ratio < 60) {
        msg   = `<strong>Moderate Risk (DTI: ${ratio.toFixed(1)}%)</strong><br>Approaching the 50% limit. Some banks may require a co-applicant or higher down payment.`;
        color = 'var(--status-warning)';
        icon  = 'fa-triangle-exclamation';
    } else {
        msg   = `<strong>High Risk (DTI: ${ratio.toFixed(1)}%)</strong><br>EMIs consume over 60% of income. Loan rejection risk is significant. Consider a smaller loan or longer tenure.`;
        color = 'var(--status-error)';
        icon  = 'fa-hand-paper';
    }

    responseEl.innerHTML        = `<i class="fa-solid ${icon}" aria-hidden="true"></i> <span>${msg}</span>`;
    responseEl.style.borderColor = color;
    responseEl.style.borderLeft  = `3px solid ${color}`;

    setTimeout(() => responseEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
}


// ---------------------------------------------------------------------------
//  PDF GENERATOR
// ---------------------------------------------------------------------------

/**
 * GENERATE PDF
 * Creates a branded Loan Summary PDF using jsPDF and triggers a download.
 */
async function generatePDF() {
    if (!window.jspdf) {
        showToast('PDF library is still loading. Please try again in a moment.', 'error');
        return;
    }

    if (!appConfig.lastResult) {
        showToast('Please calculate the EMI first.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc       = new jsPDF();

    showToast('Generating PDF report…', 'success');

    // ── Header bar ──
    doc.setFillColor(5, 5, 16);
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(0, 242, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('TRUSTED TOOLS WEB', 105, 18, { align: 'center' });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Financial Assessment Report — Home & Car Loan EMI Calculator', 105, 28, { align: 'center' });

    // ── Loan summary ──
    let y = 60;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text('Loan Summary', 20, y);
    doc.setDrawColor(0, 242, 255);
    doc.line(20, y + 2, 190, y + 2);

    y += 15;

    const getTxt = (id) => document.getElementById(id)?.innerText || '-';
    const getInp = (id) => document.getElementById(id)?.value     || '-';

    const rows = [
        ['Loan Amount',    `${getInp('loanAmount')} ${appConfig.currency}`],
        ['Interest Rate',  `${getInp('interestRate')}%`],
        ['Tenure',         `${getInp('loanTenure')} Years`],
        ['Monthly EMI',    getTxt('emiValue').replace(appConfig.symbol, appConfig.currency + ' ')],
        ['Total Interest', getTxt('totalInterest').replace(appConfig.symbol, appConfig.currency + ' ')],
        ['Total Amount',   getTxt('totalPayment').replace(appConfig.symbol, appConfig.currency + ' ')]
    ];

    doc.setFontSize(11);
    rows.forEach(row => {
        doc.setFont('helvetica', 'bold');
        doc.text(row[0], 25, y);
        doc.setFont('helvetica', 'normal');
        doc.text(':  ' + row[1], 80, y);
        y += 10;
    });

    // ── Advanced inputs (if non-zero) ──
    const morat   = parseFloat(document.getElementById('moratorium')?.value) || 0;
    const extra   = parseFloat(document.getElementById('extraEMI')?.value)   || 0;
    const lumpAmt = parseFloat(document.getElementById('lumpSum')?.value)    || 0;

    if (morat > 0 || extra > 0 || lumpAmt > 0) {
        y += 5;
        doc.setFontSize(14);
        doc.text('Advanced Settings', 20, y);
        doc.line(20, y + 2, 190, y + 2);
        y += 15;
        doc.setFontSize(11);

        if (morat > 0) {
            doc.setFont('helvetica', 'bold');
            doc.text('Moratorium', 25, y);
            doc.setFont('helvetica', 'normal');
            doc.text(':  ' + morat + ' months', 80, y);
            y += 10;
        }
        if (extra > 0) {
            doc.setFont('helvetica', 'bold');
            doc.text('Monthly Pre-payment', 25, y);
            doc.setFont('helvetica', 'normal');
            doc.text(':  ' + extra.toLocaleString() + ' ' + appConfig.currency, 80, y);
            y += 10;
        }
        if (lumpAmt > 0) {
            doc.setFont('helvetica', 'bold');
            doc.text('Lump-sum Pre-payment', 25, y);
            doc.setFont('helvetica', 'normal');
            doc.text(':  ' + lumpAmt.toLocaleString() + ' ' + appConfig.currency + ' at month ' + (document.getElementById('lumpSumMonth')?.value || '-'), 80, y);
            y += 10;
        }
    }

    // ── Footer ──
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text('Generated on: ' + new Date().toLocaleString(), 105, 280, { align: 'center' });
    doc.text('www.trustedtoolsweb.com',                      105, 285, { align: 'center' });

    doc.save(`EMI_Report_${Date.now()}.pdf`);
}


// ---------------------------------------------------------------------------
//  UTILITIES
// ---------------------------------------------------------------------------

/**
 * TOGGLE CURRENCY
 * Switches the active currency between BDT and USD.
 * IMPROVED: Converts the current loan amount rather than resetting it,
 * providing a smoother UX. Sliders are clamped to their configured max values.
 */
function toggleCurrency() {
    const prevCurrency = appConfig.currency;
    const currentAmt   = parseFloat(document.getElementById('loanAmount')?.value) || 0;

    // Flip state
    appConfig.currency = prevCurrency === 'BDT' ? 'USD' : 'BDT';
    appConfig.symbol   = appConfig.currency === 'USD' ? '$' : '৳';

    // Convert the loan amount proportionally
    let convertedAmt;
    if (appConfig.currency === 'USD') {
        convertedAmt = Math.round(currentAmt * BDT_TO_USD);
    } else {
        convertedAmt = Math.round(currentAmt * USD_TO_BDT);
    }

    // Clamp to slider range (10,000 – 10,000,000 for BDT; 200 – 10,000,000 for USD)
    const minAmt = appConfig.currency === 'USD' ? 200    : 10000;
    const maxAmt = 10000000;
    convertedAmt = Math.max(minAmt, Math.min(maxAmt, convertedAmt));

    // Apply converted amount
    const amtInput   = document.getElementById('loanAmount');
    const amtRange   = document.getElementById('rangeAmount');
    if (amtInput) amtInput.value = convertedAmt;
    if (amtRange) amtRange.value = convertedAmt;

    // Update the live display badge
    updateDisplayLabels('loanAmount', convertedAmt);

    // Swap the currency icon
    const icon = document.getElementById('curIcon');
    if (icon) {
        icon.className = appConfig.currency === 'USD' ? 'fa-solid fa-dollar-sign' : 'fa-solid fa-coins';
    }

    calculateUltra();

    showToast(`Switched to ${appConfig.currency} (amount converted)`, 'success');
}


/**
 * LOAD THEME
 * Reads the saved theme preference from localStorage and applies light mode
 * if necessary. Also triggers a chart color refresh.
 */
function loadTheme() {
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
        refreshChartTheme();
    }
}


/**
 * SHOW TOAST
 * Displays a brief notification using the global #toastArea element.
 *
 * The #toastArea is force-fixed to the top of the viewport via inline style
 * to guarantee visibility regardless of scroll position or CSS load order.
 *
 * @param {string} msg  — Message text to display
 * @param {string} type — 'success' | 'error'
 */
function showToast(msg, type) {
    const area = document.getElementById('toastArea');
    if (!area) return;

    // Force the toast container to stay fixed and above all page content
    area.style.cssText = [
        'position: fixed',
        'top: 70px',
        'left: 50%',
        'transform: translateX(-50%)',
        'z-index: 99999',
        'display: flex',
        'flex-direction: column',
        'align-items: center',
        'gap: 10px',
        'pointer-events: none',
        'width: max-content',
        'max-width: 90vw'
    ].join(';');

    const div = document.createElement('div');
    div.className = 'toast ' + (type === 'success' ? 'success' : 'error');
    div.style.cssText = 'pointer-events: auto; animation: fadeInUp 0.3s ease both;';
    div.setAttribute('role', 'alert');
    div.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation'}" aria-hidden="true"></i> <span>${msg}</span>`;

    area.appendChild(div);

    // Auto-dismiss after 3.5 seconds
    setTimeout(() => {
        div.style.opacity    = '0';
        div.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            if (div.parentNode) div.parentNode.removeChild(div);
        }, 300);
    }, 3500);
}


// ---------------------------------------------------------------------------
//  EVENT LISTENERS
// ---------------------------------------------------------------------------

// Re-sync chart colors when the user toggles dark/light mode (dispatched by global.js)
document.addEventListener('themeChanged', refreshChartTheme);

// Lightweight content protection — disable right-click context menu
document.addEventListener('contextmenu', e => e.preventDefault());
