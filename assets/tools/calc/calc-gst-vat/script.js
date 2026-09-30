/**
 * ============================================================
 *  GLOBAL GST/VAT MASTER — COMMERCIAL EDITION v3.0 (GOD MODE)
 * ============================================================
 *  File        : script.js
 *  Tool        : GST/VAT Calculator & Invoice Generator
 *  Project     : Trusted Tools Web by MD KAWSAR
 *  Architecture: Class-based JS module for namespace isolation.
 *                Instantiated as window.taxApp on DOMContentLoaded.
 *
 *  God Mode Features (v3 additions):
 *    - Quantity (Qty) input with Unit Price mode
 *    - Discount Module: Percentage (%) and Flat (fixed) discount
 *    - Dynamic Tax Splitting: CGST + SGST shown for India (IN)
 *    - Number-to-Words converter in invoice footer
 *    - LocalStorage-based Recent Calculations history panel (max 10)
 *    - Cursor-position-preserving comma-mask (fixes cursor jump bug)
 *    - State cleared on invalid input to prevent ghost invoices
 *    - html2pdf.js loaded non-blocking (deferred via JS)
 *    - Optimised _cacheDom: single querySelectorAll pass
 *
 *  Privacy: 100% client-side. No data ever leaves the browser.
 * ============================================================
 */


/* ============================================================
   SECTION 1: COUNTRY / JURISDICTION CONFIGURATION
   ============================================================
   splitTax: true  → Show CGST + SGST split (India-style)
   splitLabel      → Labels for the two halves (default: CGST / SGST)
   ============================================================ */
const COUNTRY_CONFIG = [
    { code: 'custom', name: '🌍 Custom Region (Manual Rate)', rate: 0,    currency: 'USD', symbol: '$',   locale: 'en-US', splitTax: false },
    { code: 'BD',     name: '🇧🇩 Bangladesh (VAT)',           rate: 15,   currency: 'BDT', symbol: '৳',   locale: 'en-BD', splitTax: false },
    { code: 'US',     name: '🇺🇸 United States (Sales Tax)',  rate: 8.25, currency: 'USD', symbol: '$',   locale: 'en-US', splitTax: false },
    { code: 'IN',     name: '🇮🇳 India (GST)',                rate: 18,   currency: 'INR', symbol: '₹',   locale: 'en-IN', splitTax: true,  splitLabel: ['CGST', 'SGST'] },
    { code: 'GB',     name: '🇬🇧 United Kingdom (VAT)',       rate: 20,   currency: 'GBP', symbol: '£',   locale: 'en-GB', splitTax: false },
    { code: 'CA',     name: '🇨🇦 Canada (HST/GST)',           rate: 13,   currency: 'CAD', symbol: 'C$',  locale: 'en-CA', splitTax: false },
    { code: 'AU',     name: '🇦🇺 Australia (GST)',            rate: 10,   currency: 'AUD', symbol: 'A$',  locale: 'en-AU', splitTax: false },
    { code: 'AE',     name: '🇦🇪 UAE (VAT)',                  rate: 5,    currency: 'AED', symbol: 'AED', locale: 'en-AE', splitTax: false },
    { code: 'DE',     name: '🇩🇪 Germany (VAT)',              rate: 19,   currency: 'EUR', symbol: '€',   locale: 'de-DE', splitTax: false },
    { code: 'FR',     name: '🇫🇷 France (VAT)',               rate: 20,   currency: 'EUR', symbol: '€',   locale: 'fr-FR', splitTax: false },
    { code: 'JP',     name: '🇯🇵 Japan (Consumption)',        rate: 10,   currency: 'JPY', symbol: '¥',   locale: 'ja-JP', splitTax: false },
    { code: 'SG',     name: '🇸🇬 Singapore (GST)',            rate: 9,    currency: 'SGD', symbol: 'S$',  locale: 'en-SG', splitTax: false },
    { code: 'MY',     name: '🇲🇾 Malaysia (SST)',             rate: 6,    currency: 'MYR', symbol: 'RM',  locale: 'en-MY', splitTax: false },
    { code: 'SA',     name: '🇸🇦 Saudi Arabia (VAT)',         rate: 15,   currency: 'SAR', symbol: 'SAR', locale: 'ar-SA', splitTax: false },
    { code: 'BR',     name: '🇧🇷 Brazil (ICMS)',              rate: 17,   currency: 'BRL', symbol: 'R$',  locale: 'pt-BR', splitTax: false },
    { code: 'ZA',     name: '🇿🇦 South Africa (VAT)',         rate: 15,   currency: 'ZAR', symbol: 'R',   locale: 'en-ZA', splitTax: false }
];

/* History storage key & max saved entries */
const HISTORY_KEY     = 'gst_master_history_v3';
const HISTORY_MAX     = 10;
const INVOICE_ID_KEY  = 'ultra_invoice_id';


/* ============================================================
   SECTION 2: NUMBER-TO-WORDS ENGINE
   ============================================================
   Converts a positive float into English words for the invoice
   footer. Supports up to hundreds of billions.
   Examples:
     1234.50  → "One Thousand Two Hundred Thirty-Four and 50/100"
     0.99     → "Zero and 99/100"
   ============================================================ */
const NUM_ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
];
const NUM_TENS = [
    '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];
const NUM_SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

/**
 * Converts an integer < 1000 to words.
 * @param {number} n
 * @returns {string}
 */
function _chunkToWords(n) {
    if (n === 0) return '';
    if (n < 20)  return NUM_ONES[n];
    if (n < 100) return NUM_TENS[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + NUM_ONES[n % 10] : '');
    return NUM_ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + _chunkToWords(n % 100) : '');
}

/**
 * Converts a positive number to English words.
 * @param {number} amount
 * @returns {string}
 */
function numberToWords(amount) {
    if (isNaN(amount) || amount < 0) return 'Invalid Amount';

    const intPart   = Math.floor(amount);
    const decPart   = Math.round((amount - intPart) * 100);

    if (intPart === 0 && decPart === 0) return 'Zero Only';

    let intWords = '';
    if (intPart === 0) {
        intWords = 'Zero';
    } else {
        let remaining = intPart;
        const parts   = [];
        let scale     = 0;
        while (remaining > 0) {
            const chunk = remaining % 1000;
            if (chunk !== 0) {
                const chunkWords = _chunkToWords(chunk);
                parts.unshift(NUM_SCALES[scale] ? chunkWords + ' ' + NUM_SCALES[scale] : chunkWords);
            }
            remaining = Math.floor(remaining / 1000);
            scale++;
        }
        intWords = parts.join(' ');
    }

    const decStr = decPart > 0 ? ` and ${String(decPart).padStart(2, '0')}/100` : ' Only';
    return intWords + decStr;
}


/* ============================================================
   SECTION 3: TAX MASTER APPLICATION CLASS (v3 God Mode)
   ============================================================ */
class TaxMasterUltra {

    constructor() {
        /* ── Locale & Currency State ── */
        this.currentLocale   = 'en-US';
        this.currentCurrency = 'USD';
        this.currentSymbol   = '$';
        this.currentCode     = 'custom';
        this.currentConfig   = COUNTRY_CONFIG[0];

        /* ── UI State ── */
        this.isInclusive    = false;   // false = Exclusive, true = Inclusive
        this.discountType   = 'pct';   // 'pct' = percentage, 'flat' = fixed amount

        /* ── Result State ── */
        this.lastResult     = null;    // Full result object from _calculate()

        /* ── DOM Cache ── */
        this.dom = {};

        /* Boot */
        this.init();
    }

    /* ----------------------------------------------------------
       INITIALIZATION — sequences all setup steps
    ---------------------------------------------------------- */
    init() {
        this._cacheDom();
        this._populateCountries();
        this._attachListeners();
        this._updateCountryConfig();
        this._renderHistory();
        console.info('[TaxMaster v3] God Mode Engine initialized.');
    }

    /* ----------------------------------------------------------
       DOM CACHING (v3 — extended with new God Mode elements)
       Single function, all getElementById calls in one place.
    ---------------------------------------------------------- */
    _cacheDom() {
        const ids = [
            /* Original */
            'countrySelect', 'taxRateInput', 'amountInput', 'taxToggle',
            'btnCalculate', 'btnReset',
            'resultBox', 'skeletonLoader',
            'lblExc', 'lblInc',
            'resNet', 'resTax', 'resTotal', 'resRateDisplay',
            'invoiceModal', 'toast-box',
            /* Invoice fields */
            'invId', 'invDate', 'invBase', 'invRate', 'invTax', 'invTotal',
            /* v3 New inputs */
            'qtyInput', 'discountInput',
            'discPillPct', 'discPillFlat',
            /* v3 New result rows */
            'resLineDetail', 'resLineDetailVal',
            'resSubtotal', 'resSubtotalVal',
            'resDiscount', 'resDiscountVal', 'resDiscountRow',
            'resTaxSplitBadge',
            'resCgstRow', 'resCgstLabel', 'resCgstVal',
            'resSgstRow', 'resSgstLabel', 'resSgstVal',
            'resRateRowLabel',
            /* v3 History */
            'historyWrap', 'historyBody', 'historyCount', 'histClearBtn',
            /* v3 Invoice extras */
            'invQty', 'invUnitPrice', 'invDiscountRow', 'invDiscountVal',
            'invWordsText', 'invDetailSection',
            'invCgstRow', 'invSgstRow', 'invCgstVal', 'invSgstVal',
            'invCgstLabel', 'invSgstLabel',
            'invWordsRow'
        ];

        this.dom = {};
        ids.forEach(id => {
            this.dom[id] = document.getElementById(id);
        });

        /* Shorthand aliases for common elements */
        this.dom.skeleton   = this.dom['skeletonLoader'];
        this.dom.modal      = this.dom['invoiceModal'];
        this.dom.toastBox   = this.dom['toast-box'];
    }

    /* ----------------------------------------------------------
       POPULATE COUNTRY DROPDOWN
    ---------------------------------------------------------- */
    _populateCountries() {
        if (!this.dom.countrySelect) return;
        this.dom.countrySelect.innerHTML = COUNTRY_CONFIG.map(c =>
            `<option value="${c.code}" data-rate="${c.rate}" data-sym="${c.symbol}" data-cur="${c.currency}" data-loc="${c.locale}" data-split="${c.splitTax ? '1' : '0'}">${c.name}</option>`
        ).join('');
    }

    /* ----------------------------------------------------------
       EVENT LISTENERS — all bindings centralised
    ---------------------------------------------------------- */
    _attachListeners() {
        /* Jurisdiction change */
        this.dom.countrySelect?.addEventListener('change', () => this._updateCountryConfig());

        /* Amount input — cursor-safe comma masking */
        this.dom.amountInput?.addEventListener('input', (e) => this._handleAmountMask(e));

        /* Enter key on amount → calculate */
        this.dom.amountInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this._triggerCalculation(true);
        });

        /* Qty input — only allow positive integers */
        this.dom.qtyInput?.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            if (e.target.value === '0') e.target.value = '1';
        });

        /* Discount input — allow decimal numbers */
        this.dom.discountInput?.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9.]/g, '');
            const parts = e.target.value.split('.');
            if (parts.length > 2) e.target.value = parts[0] + '.' + parts.slice(1).join('');
        });

        /* Discount type pills */
        this.dom.discPillPct?.addEventListener('click', () => this._setDiscountType('pct'));
        this.dom.discPillFlat?.addEventListener('click', () => this._setDiscountType('flat'));

        /* Tax mode toggle */
        this.dom.taxToggle?.addEventListener('change', (e) => {
            this.isInclusive = e.target.checked;
            e.target.setAttribute('aria-checked', String(this.isInclusive));
            this.dom.lblExc?.classList.toggle('active', !this.isInclusive);
            this.dom.lblInc?.classList.toggle('active',  this.isInclusive);
            if (this.dom.resultBox?.style.display === 'block') {
                this._triggerCalculation(false);
            }
        });

        /* Primary CTA */
        this.dom.btnCalculate?.addEventListener('click', () => this._triggerCalculation(true));

        /* Reset */
        this.dom.btnReset?.addEventListener('click', () => this._resetApp());

        /* History panel toggle */
        this.dom.historyWrap?.addEventListener('click', (e) => {
            if (e.target.closest('.gst2-history-header')) {
                this.dom.historyWrap.classList.toggle('open');
            }
        });

        /* Clear history */
        this.dom.histClearBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._clearHistory();
        });
    }

    /* ----------------------------------------------------------
       DISCOUNT TYPE SWITCH
    ---------------------------------------------------------- */
    _setDiscountType(type) {
        this.discountType = type;
        this.dom.discPillPct?.classList.toggle('active',  type === 'pct');
        this.dom.discPillFlat?.classList.toggle('active', type === 'flat');

        /* Update placeholder & label unit */
        const unitEl = document.getElementById('discLabelUnit');
        if (unitEl) unitEl.textContent = type === 'pct' ? '(%)' : '(Flat)';

        if (this.dom.discountInput) {
            this.dom.discountInput.placeholder = type === 'pct' ? '0.00' : '0.00';
        }
    }

    /* ----------------------------------------------------------
       CURSOR-SAFE COMMA MASKING (fixes cursor jump bug)
       Preserves the caret position after reformatting so the
       cursor stays where the user placed it.
       @param {InputEvent} e
    ---------------------------------------------------------- */
    _handleAmountMask(e) {
        const input    = e.target;
        const raw      = input.value;
        const selStart = input.selectionStart;

        /* Clear validation error state */
        input.classList.remove('input-error');

        /* Count how many non-formatting characters precede the cursor */
        const rawBeforeCursor = raw.slice(0, selStart).replace(/,/g, '');

        /* Strip commas and reformat */
        let stripped = raw.replace(/[^0-9.]/g, '');

        /* Allow only one decimal point */
        const dotIndex = stripped.indexOf('.');
        if (dotIndex !== -1) {
            stripped = stripped.slice(0, dotIndex + 1) + stripped.slice(dotIndex + 1).replace(/\./g, '');
        }

        /* Apply thousands separators to integer part only */
        const parts   = stripped.split('.');
        parts[0]      = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        const formatted = parts.join('.');

        input.value = formatted;

        /* Recalculate cursor position in the newly formatted string */
        let digitsCount  = 0;
        let newCursorPos = 0;
        const target     = rawBeforeCursor.length;

        for (let i = 0; i < formatted.length; i++) {
            if (formatted[i] !== ',') digitsCount++;
            if (digitsCount >= target) {
                newCursorPos = i + 1;
                break;
            }
            newCursorPos = i + 1;
        }

        /* Restore cursor via requestAnimationFrame to avoid browser override */
        requestAnimationFrame(() => {
            input.setSelectionRange(newCursorPos, newCursorPos);
        });
    }

    /* ----------------------------------------------------------
       UPDATE COUNTRY / JURISDICTION CONFIG
    ---------------------------------------------------------- */
    _updateCountryConfig() {
        const select = this.dom.countrySelect;
        if (!select) return;

        const opt = select.options[select.selectedIndex];
        this.currentCode     = opt.value;
        this.currentSymbol   = opt.getAttribute('data-sym');
        this.currentCurrency = opt.getAttribute('data-cur');
        this.currentLocale   = opt.getAttribute('data-loc');
        this.currentConfig   = COUNTRY_CONFIG.find(c => c.code === this.currentCode) || COUNTRY_CONFIG[0];

        if (this.dom.taxRateInput) {
            this.dom.taxRateInput.value = opt.getAttribute('data-rate');
        }
    }

    /* ----------------------------------------------------------
       UTILITY: Parse comma-formatted string → float
    ---------------------------------------------------------- */
    _getRawNumber(val) {
        return parseFloat(String(val).replace(/,/g, '')) || 0;
    }

    /* ----------------------------------------------------------
       CURRENCY FORMATTING
       Uses Intl.NumberFormat then swaps non-standard symbols.
    ---------------------------------------------------------- */
    _formatCurrency(num) {
        try {
            const formatted = new Intl.NumberFormat(this.currentLocale, {
                style                : 'currency',
                currency             : this.currentCurrency,
                currencyDisplay      : 'symbol',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(num);

            const nativeSymbol = new Intl.NumberFormat(this.currentLocale, {
                style: 'currency', currency: this.currentCurrency, currencyDisplay: 'symbol'
            }).formatToParts(0).find(p => p.type === 'currency');

            if (nativeSymbol && nativeSymbol.value !== this.currentSymbol) {
                return formatted.replace(nativeSymbol.value, this.currentSymbol);
            }
            return formatted;
        } catch {
            return `${this.currentSymbol}${num.toFixed(2)}`;
        }
    }

    /* ----------------------------------------------------------
       CALCULATION TRIGGER
       Validates inputs, clears lastResult on failure so ghost
       invoices cannot be generated.
    ---------------------------------------------------------- */
    _triggerCalculation(showLoader = true) {
        const amountStr  = this.dom.amountInput?.value  || '';
        const rateStr    = this.dom.taxRateInput?.value  || '0';
        const qtyStr     = this.dom.qtyInput?.value      || '1';
        const discStr    = this.dom.discountInput?.value || '0';

        const amount     = this._getRawNumber(amountStr);
        const rate       = parseFloat(rateStr)   || 0;
        const qty        = Math.max(1, parseInt(qtyStr, 10) || 1);
        const discountRaw = parseFloat(discStr)  || 0;

        /* ── Validation ── */
        if (!amountStr || isNaN(amount) || amount <= 0) {
            this._showToast('Please enter a valid amount!', 'error');
            if (this.dom.amountInput) this.dom.amountInput.classList.add('input-error');
            this.dom.amountInput?.focus();
            /* Clear stale result to prevent ghost invoice */
            this.lastResult = null;
            if (this.dom.resultBox) this.dom.resultBox.style.display = 'none';
            return;
        }

        if (showLoader) {
            if (this.dom.resultBox) this.dom.resultBox.style.display = 'none';
            if (this.dom.skeleton)  {
                this.dom.skeleton.style.display = 'block';
                this.dom.skeleton.setAttribute('aria-hidden', 'false');
            }

            setTimeout(() => {
                this._calculate(amount, rate, qty, discountRaw);
                if (this.dom.skeleton) {
                    this.dom.skeleton.style.display = 'none';
                    this.dom.skeleton.setAttribute('aria-hidden', 'true');
                }
                if (this.dom.resultBox) this.dom.resultBox.style.display = 'block';
                this.dom.resultBox?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                this._showToast('Calculation Complete!', 'success');
                this._saveToHistory();
                this._renderHistory();
            }, 600);
        } else {
            this._calculate(amount, rate, qty, discountRaw);
            this._saveToHistory();
            this._renderHistory();
        }
    }

    /* ----------------------------------------------------------
       MATHEMATICAL ENGINE (v3 — Qty + Discount + Tax Split)
       
       Flow:
         lineTotal   = unitPrice × qty
         afterDisc   = lineTotal − discountAmount
         [Exclusive] net = afterDisc, tax = net × rate/100, gross = net + tax
         [Inclusive] gross = afterDisc, net = gross / (1 + rate/100), tax = gross − net
         [India split] cgst = tax / 2, sgst = tax / 2
    ---------------------------------------------------------- */
    _calculate(unitPrice, rate, qty, discountRaw) {
        /* Step 1: Line total */
        const lineTotal = unitPrice * qty;

        /* Step 2: Discount amount */
        let discountAmount = 0;
        if (this.discountType === 'pct') {
            discountAmount = lineTotal * (Math.min(discountRaw, 100) / 100);
        } else {
            discountAmount = Math.min(discountRaw, lineTotal);
        }
        const afterDiscount = lineTotal - discountAmount;

        /* Step 3: Tax calculation */
        let net, tax, gross;
        if (this.isInclusive) {
            gross = afterDiscount;
            net   = afterDiscount / (1 + (rate / 100));
            tax   = gross - net;
        } else {
            net   = afterDiscount;
            tax   = afterDiscount * (rate / 100);
            gross = net + tax;
        }

        /* Step 4: Tax split for India (CGST / SGST) */
        const cfg      = this.currentConfig;
        const doSplit  = cfg.splitTax && tax > 0;
        const halfTax  = tax / 2;
        const labels   = cfg.splitLabel || ['CGST', 'SGST'];

        /* ── Render base rows ── */
        this._setInnerText('resNet',   this._formatCurrency(net));
        this._setInnerText('resTotal', this._formatCurrency(gross));
        this._setInnerText('resRateDisplay', rate);

        /* ── Line detail (qty × unit price) ── */
        if (qty > 1 || discountAmount > 0) {
            this._showEl('resLineDetail');
            this._setInnerText('resLineDetailVal', `${qty} × ${this._formatCurrency(unitPrice)} = ${this._formatCurrency(lineTotal)}`);
        } else {
            this._hideEl('resLineDetail');
        }

        /* ── Subtotal row (after qty, before discount) ── */
        if (qty > 1) {
            this._showEl('resSubtotal');
            this._setInnerText('resSubtotalVal', this._formatCurrency(lineTotal));
        } else {
            this._hideEl('resSubtotal');
        }

        /* ── Discount row ── */
        if (discountAmount > 0) {
            this._showEl('resDiscountRow');
            this._setInnerText('resDiscountVal', `- ${this._formatCurrency(discountAmount)}`);
        } else {
            this._hideEl('resDiscountRow');
        }

        /* ── Tax row label + split badge ── */
        const rateLabel = document.getElementById('resRateRowLabel');
        const splitBadge = document.getElementById('resTaxSplitBadge');
        if (rateLabel) rateLabel.textContent = `Tax Amount (`;
        if (splitBadge) {
            splitBadge.style.display = doSplit ? 'inline-flex' : 'none';
            if (doSplit) splitBadge.textContent = `${labels[0]} + ${labels[1]}`;
        }

        /* ── Tax value ── */
        this._setInnerText('resTax', this._formatCurrency(tax));

        /* ── CGST / SGST split rows ── */
        const cgstRow = document.getElementById('resCgstRow');
        const sgstRow = document.getElementById('resSgstRow');
        if (cgstRow) cgstRow.style.display = doSplit ? 'flex' : 'none';
        if (sgstRow) sgstRow.style.display = doSplit ? 'flex' : 'none';
        if (doSplit) {
            this._setInnerText('resCgstLabel', `${labels[0]} (${rate / 2}%)`);
            this._setInnerText('resSgstLabel', `${labels[1]} (${rate / 2}%)`);
            this._setInnerText('resCgstVal',   this._formatCurrency(halfTax));
            this._setInnerText('resSgstVal',   this._formatCurrency(halfTax));
        }

        /* ── Persist full result for invoice & history ── */
        this.lastResult = {
            unitPrice, qty, lineTotal,
            discountRaw, discountType: this.discountType, discountAmount,
            afterDiscount, net, tax, gross, rate,
            doSplit, halfTax, splitLabels: labels,
            countryCode: this.currentCode,
            countryName: this.currentConfig.name,
            date: new Date(),
            symbol: this.currentSymbol,
            currency: this.currentCurrency,
            locale: this.currentLocale
        };
    }

    /* ----------------------------------------------------------
       DOM HELPERS
    ---------------------------------------------------------- */
    _setInnerText(id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    }

    _showEl(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    }

    _hideEl(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }

    /* ----------------------------------------------------------
       RESET APPLICATION
    ---------------------------------------------------------- */
    _resetApp() {
        if (this.dom.amountInput)  this.dom.amountInput.value  = '';
        if (this.dom.qtyInput)     this.dom.qtyInput.value     = '1';
        if (this.dom.discountInput) this.dom.discountInput.value = '';
        if (this.dom.resultBox)    this.dom.resultBox.style.display = 'none';
        if (this.dom.amountInput)  this.dom.amountInput.classList.remove('input-error');
        this.lastResult = null;
        this._showToast('Calculator Reset', 'success');
    }

    /* ----------------------------------------------------------
       TOAST NOTIFICATION SYSTEM
    ---------------------------------------------------------- */
    _showToast(msg, type = 'success') {
        const toastBox = this.dom.toastBox;
        if (!toastBox) return;

        const toast   = document.createElement('div');
        const icon    = type === 'error'
            ? '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>'
            : '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>';

        toast.className = `toast ${type}`;
        toast.innerHTML = `${icon} <span>${msg}</span>`;
        toast.setAttribute('role', 'alert');
        toastBox.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity   = '1';
            toast.style.transform = 'translateX(0)';
        });

        setTimeout(() => {
            toast.style.opacity   = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    /* ----------------------------------------------------------
       CLIPBOARD COPY (Public)
    ---------------------------------------------------------- */
    copyToClipboard() {
        if (!this.lastResult) return;
        const r    = this.lastResult;
        const fmt  = (n) => `${r.symbol}${n.toFixed(2)}`;
        let lines  = [
            `GST/VAT Calculation — ${r.countryName}`,
            `Qty × Unit Price: ${r.qty} × ${fmt(r.unitPrice)} = ${fmt(r.lineTotal)}`
        ];
        if (r.discountAmount > 0) lines.push(`Discount (${r.discountType === 'pct' ? r.discountRaw + '%' : 'Flat ' + fmt(r.discountRaw)}): -${fmt(r.discountAmount)}`);
        lines.push(`Net Amount: ${fmt(r.net)}`);
        if (r.doSplit) {
            lines.push(`${r.splitLabels[0]}: ${fmt(r.halfTax)}`);
            lines.push(`${r.splitLabels[1]}: ${fmt(r.halfTax)}`);
        }
        lines.push(`Tax (${r.rate}%): ${fmt(r.tax)}`);
        lines.push(`Gross Total: ${fmt(r.gross)}`);

        navigator.clipboard.writeText(lines.join('\n'))
            .then(() => this._showToast('Copied to Clipboard!', 'success'))
            .catch(() => this._showToast('Copy failed. Please try manually.', 'error'));
    }

    /* ----------------------------------------------------------
       INVOICE ID GENERATOR (localStorage-based auto-increment)
    ---------------------------------------------------------- */
    _getInvoiceID() {
        let id = parseInt(localStorage.getItem(INVOICE_ID_KEY) || '1000', 10) + 1;
        localStorage.setItem(INVOICE_ID_KEY, id);
        return `INV-${id}`;
    }

    /* ----------------------------------------------------------
       OPEN INVOICE MODAL (Public)
       Populates all invoice DOM fields from this.lastResult.
    ---------------------------------------------------------- */
    openInvoiceModal() {
        if (!this.lastResult) {
            this._showToast('Calculate tax first!', 'error');
            return;
        }

        const r   = this.lastResult;
        const fmt = (n) => this._formatCurrency(n);

        /* Core fields */
        this._setInnerText('invId',   this._getInvoiceID());
        this._setInnerText('invDate', r.date.toLocaleDateString(r.locale, { year: 'numeric', month: 'long', day: 'numeric' }));
        this._setInnerText('invBase', fmt(r.net));
        this._setInnerText('invRate', `${r.rate}%`);
        this._setInnerText('invTax',  fmt(r.tax));
        this._setInnerText('invTotal', fmt(r.gross));

        /* Qty & Unit Price detail */
        this._setInnerText('invQty',       String(r.qty));
        this._setInnerText('invUnitPrice', fmt(r.unitPrice));

        /* Discount row */
        const invDiscRow = document.getElementById('invDiscountRow');
        if (invDiscRow) {
            if (r.discountAmount > 0) {
                invDiscRow.style.display = '';
                this._setInnerText('invDiscountVal',
                    `- ${fmt(r.discountAmount)} (${r.discountType === 'pct' ? r.discountRaw + '%' : 'Flat'})`
                );
            } else {
                invDiscRow.style.display = 'none';
            }
        }

        /* CGST / SGST split rows */
        const cgstRow = document.getElementById('invCgstRow');
        const sgstRow = document.getElementById('invSgstRow');
        if (cgstRow) cgstRow.style.display = r.doSplit ? '' : 'none';
        if (sgstRow) sgstRow.style.display = r.doSplit ? '' : 'none';
        if (r.doSplit) {
            this._setInnerText('invCgstLabel', `${r.splitLabels[0]} (${r.rate / 2}%)`);
            this._setInnerText('invSgstLabel', `${r.splitLabels[1]} (${r.rate / 2}%)`);
            this._setInnerText('invCgstVal',   fmt(r.halfTax));
            this._setInnerText('invSgstVal',   fmt(r.halfTax));
        }

        /* Number-to-Words footer */
        const wordsEl = document.getElementById('invWordsText');
        if (wordsEl) {
            wordsEl.textContent = numberToWords(r.gross);
        }

        /* Show modal & lock scroll */
        if (this.dom.modal) this.dom.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    /* ----------------------------------------------------------
       CLOSE INVOICE MODAL (Public)
    ---------------------------------------------------------- */
    closeModal() {
        if (this.dom.modal) this.dom.modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    /* ----------------------------------------------------------
       PDF GENERATION ENGINE (Public)
       html2pdf.js must be loaded before this is called.
       The library is loaded non-blocking via _loadHtml2Pdf().
    ---------------------------------------------------------- */
    downloadPDF() {
        const element   = document.getElementById('invoiceContent');
        const invoiceId = document.getElementById('invId')?.innerText || 'Invoice';

        const options = {
            margin   : 0.3,
            filename : `${invoiceId}.pdf`,
            image    : { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale           : 2,
                useCORS         : true,
                letterRendering : true,
                scrollY         : 0,
                windowWidth     : 800,
                backgroundColor : '#ffffff'
            },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };

        this._showToast('Generating PDF...', 'success');

        if (typeof html2pdf === 'undefined') {
            /* html2pdf not yet loaded — load it now and retry */
            this._loadHtml2Pdf(() => {
                html2pdf().set(options).from(element).save()
                    .then(() => this._showToast('Invoice Downloaded!', 'success'))
                    .catch(() => this._showToast('PDF Export Failed. Use Print instead.', 'error'));
            });
        } else {
            html2pdf().set(options).from(element).save()
                .then(() => this._showToast('Invoice Downloaded!', 'success'))
                .catch(() => this._showToast('PDF Export Failed. Use Print instead.', 'error'));
        }
    }

    /* ----------------------------------------------------------
       NON-BLOCKING html2pdf.js LOADER
       Called only when user requests PDF. Library not loaded
       at page start — improves initial load performance.
       @param {Function} callback - called once library is ready
    ---------------------------------------------------------- */
    _loadHtml2Pdf(callback) {
        if (typeof html2pdf !== 'undefined') { callback(); return; }
        const script = document.createElement('script');
        script.src   = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.defer = true;
        script.onload  = callback;
        script.onerror = () => this._showToast('Failed to load PDF library.', 'error');
        document.head.appendChild(script);
    }


    /* ══════════════════════════════════════════════════════════
       SECTION 4: HISTORY PANEL (localStorage)
    ══════════════════════════════════════════════════════════ */

    /* ----------------------------------------------------------
       SAVE TO HISTORY
       Reads this.lastResult and prepends a summary entry to
       localStorage. Trims to HISTORY_MAX items.
    ---------------------------------------------------------- */
    _saveToHistory() {
        if (!this.lastResult) return;
        const r = this.lastResult;

        const entry = {
            id          : Date.now(),
            countryName : r.countryName,
            countryCode : r.countryCode,
            rate        : r.rate,
            net         : r.net,
            tax         : r.tax,
            gross       : r.gross,
            symbol      : r.symbol,
            qty         : r.qty,
            unitPrice   : r.unitPrice,
            discountAmount: r.discountAmount,
            timestamp   : r.date.toISOString()
        };

        let history = this._loadHistory();
        history.unshift(entry);
        if (history.length > HISTORY_MAX) history = history.slice(0, HISTORY_MAX);

        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch {
            /* localStorage might be blocked — fail silently */
        }
    }

    /* ----------------------------------------------------------
       LOAD HISTORY from localStorage
    ---------------------------------------------------------- */
    _loadHistory() {
        try {
            return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        } catch {
            return [];
        }
    }

    /* ----------------------------------------------------------
       CLEAR ALL HISTORY
    ---------------------------------------------------------- */
    _clearHistory() {
        try { localStorage.removeItem(HISTORY_KEY); } catch { /* noop */ }
        this._renderHistory();
        this._showToast('History Cleared', 'success');
    }

    /* ----------------------------------------------------------
       RENDER HISTORY PANEL
       Builds DOM from the stored entries array.
    ---------------------------------------------------------- */
    _renderHistory() {
        const body      = document.getElementById('historyBody');
        const countEl   = document.getElementById('historyCount');
        const wrapEl    = document.getElementById('historyWrap');
        if (!body || !countEl || !wrapEl) return;

        const history = this._loadHistory();
        countEl.textContent = history.length;

        /* Hide the entire panel if no entries yet */
        if (history.length === 0) {
            body.innerHTML = `<div class="gst2-hist-empty">
                <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                No calculations saved yet.
            </div>`;
            const clearBtn = document.getElementById('histClearBtn');
            if (clearBtn) clearBtn.style.display = 'none';
            return;
        }

        const clearBtn = document.getElementById('histClearBtn');
        if (clearBtn) clearBtn.style.display = '';

        body.innerHTML = history.map(entry => {
            const timeStr = this._formatHistoryTime(entry.timestamp);
            const sym     = entry.symbol || '$';
            const fmt2    = (n) => `${sym}${Number(n).toFixed(2)}`;
            const discLine = entry.discountAmount > 0
                ? ` · Disc: -${fmt2(entry.discountAmount)}`
                : '';
            const qtyLine  = entry.qty > 1
                ? `${entry.qty} × ${fmt2(entry.unitPrice)} · `
                : '';

            return `<div class="gst2-hist-entry" role="button" tabindex="0" 
                         aria-label="Load ${entry.countryName} calculation"
                         data-id="${entry.id}">
                <div class="gst2-hist-left">
                    <span class="gst2-hist-jurisdiction">${entry.countryName} · ${entry.rate}%</span>
                    <span class="gst2-hist-amounts">${qtyLine}Net: ${fmt2(entry.net)} · Tax: ${fmt2(entry.tax)}${discLine}</span>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
                    <span class="gst2-hist-total">${fmt2(entry.gross)}</span>
                    <span class="gst2-hist-time">${timeStr}</span>
                </div>
            </div>`;
        }).join('');

        /* Keyboard accessibility for history entries */
        body.querySelectorAll('.gst2-hist-entry').forEach(el => {
            el.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') el.click();
            });
        });
    }

    /* ----------------------------------------------------------
       FORMAT HISTORY TIMESTAMP to relative time
    ---------------------------------------------------------- */
    _formatHistoryTime(iso) {
        try {
            const d    = new Date(iso);
            const now  = Date.now();
            const diff = Math.floor((now - d.getTime()) / 1000);
            if (diff < 60)   return 'just now';
            if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        } catch {
            return '';
        }
    }

} /* end class TaxMasterUltra */


/* ============================================================
   SECTION 5: BOOTSTRAP
   ============================================================
   - html2pdf.js is NOT preloaded at startup (non-blocking).
     It is loaded on-demand when downloadPDF() is first called.
   - Remove any <script src="html2pdf..."> from <head> for
     maximum initial page speed.
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    window.taxApp = new TaxMasterUltra();
});
