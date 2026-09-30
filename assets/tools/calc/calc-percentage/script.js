/**
 * TRUSTED TOOLS WEB — PROFESSIONAL SCRIPT
 * Tool: Percentage Master Pro Max
 * Version: 3.0.0
 * Features: 11 Advanced Calculators, History Management, Enter-Key Support,
 *           Reset Buttons, Double Discount, Reverse Percentage, Compound
 *           Frequency Options, Markup vs Margin, Zero-Bug Validation.
 */

(function () {
    "use strict";

    // ─── 1. CONFIGURATION ───────────────────────────────────────────────────

    const CONFIG = {
        MAX_HISTORY: 20,
        TOAST_DURATION: 3000,
        PRECISION: 2
    };

    let state = {
        history: [],
        isDarkMode: true
    };

    // ─── 2. SAFE TOAST ──────────────────────────────────────────────────────

    /**
     * showToast — works whether global.js has already defined it or not.
     * Falls back to a self-contained implementation when needed.
     */
    const showToast = (message, isError = false) => {
        // Prefer the global implementation if present
        if (typeof window.showToast === "function" && window.showToast !== showToast) {
            window.showToast(message, isError);
            return;
        }

        // Self-contained fallback
        let box = document.getElementById("toast-box");
        if (!box) {
            box = document.createElement("div");
            box.id = "toast-box";
            document.body.appendChild(box);
        }

        const toast = document.createElement("div");
        toast.className = `toast ${isError ? "error" : "success"}`;
        toast.innerHTML = `<i class="fa-solid ${isError ? "fa-circle-exclamation" : "fa-circle-check"}"></i> ${message}`;
        box.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = "toastFadeOut 0.4s ease forwards";
            setTimeout(() => toast.remove(), 400);
        }, CONFIG.TOAST_DURATION);
    };

    // ─── 3. UTILITY FUNCTIONS ───────────────────────────────────────────────

    /**
     * Reads a number input; returns null and shows toast on invalid/empty.
     * @param {string} id
     * @param {string} label
     * @param {{ min?: number, max?: number }} [opts]
     */
    const getInput = (id, label = "Input", opts = {}) => {
        const el = document.getElementById(id);
        if (!el) return null;

        const raw = el.value.trim();
        if (raw === "") {
            markError(el, `Please enter a value for "${label}"`);
            return null;
        }

        const val = parseFloat(raw);
        if (isNaN(val)) {
            markError(el, `"${label}" must be a valid number`);
            return null;
        }

        if (opts.min !== undefined && val < opts.min) {
            markError(el, `"${label}" cannot be less than ${opts.min}`);
            return null;
        }

        if (opts.max !== undefined && val > opts.max) {
            markError(el, `"${label}" cannot exceed ${opts.max}`);
            return null;
        }

        el.classList.remove("input-error");
        return val;
    };

    const markError = (el, msg) => {
        el.classList.add("input-error");
        el.focus();
        showToast(msg, true);
        setTimeout(() => el.classList.remove("input-error"), 2500);
    };

    /**
     * Format a number with commas and up to `decimals` decimal places.
     */
    const fmt = (num, decimals = CONFIG.PRECISION) => {
        const factor = Math.pow(10, decimals);
        const rounded = Math.round(num * factor) / factor;
        return new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals
        }).format(rounded);
    };

    /**
     * Show the result box with a fade-in animation and update its value span.
     */
    const displayResult = (boxId, value) => {
        const box = document.getElementById(boxId);
        if (!box) return;
        const valEl = box.querySelector(".result-value");
        if (!valEl) return;

        box.classList.remove("show");
        void box.offsetWidth; // Force reflow to restart animation
        valEl.innerText = value;
        box.classList.add("show");
    };

    /**
     * Copy text to clipboard; strips formatting commas before copying.
     */
    window.copyToClipboard = async (text) => {
        if (!text || text === "0" || text === "0%" || text.trim() === "") {
            showToast("Nothing to copy yet!", true);
            return;
        }
        const clean = text.replace(/,/g, "");
        try {
            await navigator.clipboard.writeText(clean);
            showToast("Result copied to clipboard!");
        } catch {
            const ta = document.createElement("textarea");
            ta.value = clean;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
            showToast("Result copied!");
        }
    };

    // ─── 4. RESET CARDS ─────────────────────────────────────────────────────

    /**
     * Resets all inputs and hides the result box for a given card prefix.
     * Each card's inputs must share a prefix convention (e.g. id="gen-*").
     */
    window.resetCard = (prefix) => {
        const prefixMap = {
            gen:    ["gen-percent", "gen-value"],
            disc:   ["disc-price", "disc-percent", "disc-extra"],
            marks:  ["marks-obt", "marks-total"],
            change: ["change-old", "change-new"],
            gst:    ["gst-amount", "gst-rate"],
            tip:    ["tip-bill", "tip-percent", "tip-people"],
            margin: ["margin-cost", "margin-sell"],
            ci:     ["ci-principal", "ci-rate", "ci-time"],
            frac:   ["frac-num", "frac-den"],
            rev:    ["rev-value", "rev-percent"],
            mu:     ["mu-cost", "mu-margin"]
        };

        const boxMap = {
            gen:    "res-box-gen",
            disc:   "res-box-disc",
            marks:  "res-box-marks",
            change: "res-box-change",
            gst:    "res-box-gst",
            tip:    "res-box-tip",
            margin: "res-box-margin",
            ci:     "res-box-ci",
            frac:   "res-box-frac",
            rev:    "res-box-rev",
            mu:     "res-box-mu"
        };

        const ids = prefixMap[prefix];
        if (ids) {
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.value = "";
                    el.classList.remove("input-error");
                }
            });
        }

        // Also reset select elements (ci-freq)
        if (prefix === "ci") {
            const freq = document.getElementById("ci-freq");
            if (freq) freq.selectedIndex = 0;
        }

        const box = document.getElementById(boxMap[prefix]);
        if (box) {
            box.classList.remove("show");
            const valEl = box.querySelector(".result-value");
            if (valEl) {
                // Reset to sensible default placeholder
                const defaults = { marks: "0%", change: "0%", frac: "0%", margin: "0%", mu: "0" };
                valEl.innerText = defaults[prefix] || "0";
                valEl.style.color = "";
            }
        }

        showToast("Calculator reset");
    };

    // ─── 5. HISTORY ─────────────────────────────────────────────────────────

    const loadHistory = () => {
        try {
            state.history = JSON.parse(localStorage.getItem("calcHistory_v3")) || [];
        } catch {
            state.history = [];
        }
        renderHistory();
    };

    const addToHistory = (type, details, result) => {
        state.history.unshift({
            type,
            details,
            result,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        });
        if (state.history.length > CONFIG.MAX_HISTORY) state.history.pop();
        localStorage.setItem("calcHistory_v3", JSON.stringify(state.history));
        renderHistory();
    };

    const renderHistory = () => {
        const list = document.getElementById("historyList");
        if (!list) return;

        if (state.history.length === 0) {
            list.innerHTML = `
                <div class="history-empty">
                    <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
                    <p>No history available yet.<br>Start calculating!</p>
                </div>`;
            return;
        }

        list.innerHTML = state.history.map(item => `
            <div class="history-item animated-entry" role="listitem">
                <div class="history-item-header">
                    <span>${escapeHtml(item.type)}</span>
                    <span>${escapeHtml(item.time)}</span>
                </div>
                <div class="history-item-details">${escapeHtml(item.details)}</div>
                <div class="history-item-result">= ${escapeHtml(item.result)}</div>
            </div>
        `).join("");
    };

    /** Prevent XSS in history rendering */
    const escapeHtml = (str) =>
        String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

    window.toggleHistory = () => {
        const panel = document.getElementById("historyPanel");
        if (!panel) return;
        const isOpening = !panel.classList.contains("active");
        panel.classList.toggle("active");
        if (isOpening) renderHistory();
        // Trap focus accessibility
        if (isOpening) {
            const close = panel.querySelector(".history-close-btn");
            if (close) setTimeout(() => close.focus(), 350);
        }
    };

    window.clearHistory = () => {
        if (confirm("Are you sure you want to clear all history?")) {
            state.history = [];
            localStorage.removeItem("calcHistory_v3");
            renderHistory();
            showToast("History cleared");
        }
    };

    // ─── 6. THEME ENGINE ────────────────────────────────────────────────────

    const applyTheme = (theme) => {
        const icon = document.getElementById("themeIcon");
        if (theme === "light") {
            document.body.classList.add("light-mode");
            state.isDarkMode = false;
            if (icon) icon.className = "fa-solid fa-moon";
        } else {
            document.body.classList.remove("light-mode");
            state.isDarkMode = true;
            if (icon) icon.className = "fa-solid fa-sun";
        }
    };

    window.toggleTheme = () => {
        const newTheme = document.body.classList.contains("light-mode") ? "dark" : "light";
        applyTheme(newTheme);
        localStorage.setItem("siteTheme", newTheme);
        showToast(`${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} mode enabled`);
    };

    // ─── 7. CALCULATOR ENGINES ──────────────────────────────────────────────

    // 1. General Percentage  →  (P / 100) × V
    window.calcGeneral = function () {
        const p = getInput("gen-percent", "Percentage", { min: 0 });
        const v = getInput("gen-value", "Value");
        if (p === null || v === null) return;

        const res = (p / 100) * v;
        const out = fmt(res);
        displayResult("res-box-gen", out);
        addToHistory("General %", `${p}% of ${v}`, out);
    };

    // 2. Smart Discount  →  price × (1 - d1/100) × (1 - d2/100)
    window.calcDiscount = function () {
        const price = getInput("disc-price", "Original Price", { min: 0 });
        const d1    = getInput("disc-percent", "First Discount %", { min: 0, max: 100 });
        if (price === null || d1 === null) return;

        // Extra discount is optional — empty field = 0
        const extraEl = document.getElementById("disc-extra");
        let d2 = 0;
        if (extraEl && extraEl.value.trim() !== "") {
            const parsed = parseFloat(extraEl.value);
            if (isNaN(parsed) || parsed < 0 || parsed > 100) {
                markError(extraEl, "Extra Discount must be between 0 and 100");
                return;
            }
            d2 = parsed;
        }

        const afterFirst  = price * (1 - d1 / 100);
        const afterSecond = afterFirst * (1 - d2 / 100);
        const saved       = price - afterSecond;

        const savedEl = document.getElementById("saved-amount");
        if (savedEl) savedEl.innerText = fmt(saved);

        const outFinal = fmt(afterSecond);
        displayResult("res-box-disc", outFinal);

        const details = d2 > 0
            ? `Price: ${price}, Disc: ${d1}% + ${d2}%`
            : `Price: ${price}, Disc: ${d1}%`;
        addToHistory("Discount", details, outFinal);
    };

    // 3. Marks / GPA  →  (obtained / total) × 100
    window.calcMarks = function () {
        const obt = getInput("marks-obt", "Marks Obtained", { min: 0 });
        const tot = getInput("marks-total", "Total Marks", { min: 1 });
        if (obt === null || tot === null) return;

        if (obt > tot) {
            showToast("Obtained marks cannot exceed total marks", true);
            return;
        }

        const pct = (obt / tot) * 100;
        const out = fmt(pct) + "%";
        displayResult("res-box-marks", out);
        addToHistory("Exam Marks", `Got ${obt} out of ${tot}`, out);
    };

    // 4. Growth / Decline  →  ((new - old) / |old|) × 100
    window.calcChange = function () {
        const oldV = getInput("change-old", "Initial Value");
        const newV = getInput("change-new", "Final Value");
        if (oldV === null || newV === null) return;
        if (oldV === 0) { showToast("Initial value cannot be 0", true); return; }

        const diff    = newV - oldV;
        const percent = (diff / Math.abs(oldV)) * 100;
        const sign    = percent >= 0 ? "+" : "";
        const out     = sign + fmt(percent) + "%";

        const resEl = document.getElementById("res-change");
        if (resEl) resEl.style.color = percent >= 0
            ? "var(--accent-green)"
            : "var(--accent-red)";

        const diffEl = document.getElementById("diff-val");
        if (diffEl) diffEl.innerText = fmt(diff);

        displayResult("res-box-change", out);
        addToHistory("Growth/Decline", `${oldV} → ${newV}`, out);
    };

    // 5. GST / VAT
    //    Add:    total = amount × (1 + rate/100)
    //    Remove: base  = amount / (1 + rate/100)
    window.calcGST = function (isAdd) {
        const amt  = getInput("gst-amount", "Base Amount", { min: 0 });
        const rate = getInput("gst-rate", "Tax Rate", { min: 0, max: 100 });
        if (amt === null || rate === null) return;

        let tax, total;
        if (isAdd) {
            tax   = (rate / 100) * amt;
            total = amt + tax;
        } else {
            // Reverse: amt is the tax-inclusive price
            const base = amt / (1 + rate / 100);
            tax   = amt - base;
            total = base;
        }

        const gstValEl = document.getElementById("gst-val");
        if (gstValEl) gstValEl.innerText = fmt(tax);

        const box = document.getElementById("res-box-gst");
        if (box) {
            const hint = box.querySelector(".copy-hint");
            if (hint) hint.innerText = isAdd ? "Total Bill Amount" : "Price Before Tax";
        }

        const out = fmt(total);
        displayResult("res-box-gst", out);
        addToHistory(
            "Tax Calc",
            `${isAdd ? "Add" : "Remove"} ${rate}% on ${amt}`,
            out
        );
    };

    // 6. Tip & Split
    window.calcTip = function () {
        const bill = getInput("tip-bill", "Bill Amount", { min: 0 });
        const tipP = getInput("tip-percent", "Tip %", { min: 0, max: 100 });
        if (bill === null || tipP === null) return;

        let ppl = 1;
        const pplEl = document.getElementById("tip-people");
        if (pplEl && pplEl.value.trim() !== "") {
            const parsed = parseFloat(pplEl.value);
            if (isNaN(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
                markError(pplEl, "Number of people must be a whole number ≥ 1");
                return;
            }
            ppl = parsed;
        }

        const tipAmount = (tipP / 100) * bill;
        const totalBill = bill + tipAmount;
        const perPerson = totalBill / ppl;

        const tipEl  = document.getElementById("total-tip");
        const billEl = document.getElementById("total-bill");
        if (tipEl)  tipEl.innerText  = fmt(tipAmount);
        if (billEl) billEl.innerText = fmt(totalBill);

        const out = fmt(perPerson);
        displayResult("res-box-tip", out);
        addToHistory("Tip Split", `Bill: ${bill}, Tip: ${tipP}%, People: ${ppl}`, `Each: ${out}`);
    };

    // 7. Profit Margin  →  ((sell - cost) / sell) × 100
    window.calcMargin = function () {
        const cost = getInput("margin-cost", "Cost Price", { min: 0 });
        const sell = getInput("margin-sell", "Selling Price", { min: 0 });
        if (cost === null || sell === null) return;
        if (sell === 0) { showToast("Selling price cannot be 0", true); return; }

        const profit = sell - cost;
        const margin = (profit / sell) * 100;

        const profitEl = document.getElementById("margin-profit");
        if (profitEl) profitEl.innerText = fmt(profit);

        const resBox = document.getElementById("res-box-margin");
        if (resBox) {
            const valEl = resBox.querySelector(".result-value");
            if (valEl) valEl.style.color = margin < 0
                ? "var(--accent-red)"
                : "var(--accent-green)";
        }

        const out = fmt(margin) + "%";
        displayResult("res-box-margin", out);
        addToHistory("Profit Margin", `Cost: ${cost}, Sell: ${sell}`, out);
    };

    // 8. Compound Interest with frequency
    //    A = P × (1 + r/(n×100))^(n×t)
    //    where n = compounding frequency per year
    window.calcCI = function () {
        const P = getInput("ci-principal", "Principal", { min: 0 });
        const R = getInput("ci-rate", "Rate", { min: 0 });
        const T = getInput("ci-time", "Years", { min: 0 });
        if (P === null || R === null || T === null) return;

        const freqEl = document.getElementById("ci-freq");
        const n = freqEl ? parseInt(freqEl.value, 10) : 1;

        // A = P(1 + r/(n*100))^(n*t)
        const A        = P * Math.pow(1 + R / (n * 100), n * T);
        const interest = A - P;

        const ciIntEl = document.getElementById("ci-interest");
        if (ciIntEl) ciIntEl.innerText = fmt(interest);

        const freqLabel = freqEl
            ? freqEl.options[freqEl.selectedIndex].text.split(" ")[0]
            : "Yearly";

        const out = fmt(A);
        displayResult("res-box-ci", out);
        addToHistory(
            "Compound Int.",
            `P:${P}, R:${R}%, T:${T}yr, ${freqLabel}`,
            out
        );
    };

    // 9. Fraction to Percent  →  (num / den) × 100
    window.calcFraction = function () {
        const num = getInput("frac-num", "Numerator");
        const den = getInput("frac-den", "Denominator");
        if (num === null || den === null) return;
        if (den === 0) { showToast("Denominator cannot be 0", true); return; }

        const decimal = num / den;
        const percent = decimal * 100;

        const fracDecEl = document.getElementById("frac-decimal");
        if (fracDecEl) fracDecEl.innerText = fmt(decimal, 4);

        const out = fmt(percent) + "%";
        displayResult("res-box-frac", out);
        addToHistory("Fraction", `${num} ÷ ${den}`, out);
    };

    // 10. Reverse Percentage  →  (X / Y) × 100  =  Original
    //     "X is Y% of what?"
    window.calcReverse = function () {
        const x = getInput("rev-value", "Known Value (X)");
        const y = getInput("rev-percent", "Percentage (Y)", { min: 0.001 });
        if (x === null || y === null) return;
        if (y === 0) { showToast("Percentage cannot be 0", true); return; }

        const original = (x / y) * 100;
        const out = fmt(original);
        displayResult("res-box-rev", out);
        addToHistory("Reverse %", `${x} is ${y}% of ?`, out);
    };

    // 11. Markup vs Margin
    //     Given cost C and desired margin M%:
    //       Selling Price  = C / (1 - M/100)
    //       Markup %       = ((Sell - Cost) / Cost) × 100
    //       Profit         = Sell - Cost
    window.calcMarkup = function () {
        const cost   = getInput("mu-cost", "Cost Price", { min: 0 });
        const margin = getInput("mu-margin", "Desired Margin %", { min: 0, max: 99.99 });
        if (cost === null || margin === null) return;

        const sell      = cost / (1 - margin / 100);
        const profit    = sell - cost;
        const markupPct = cost > 0 ? (profit / cost) * 100 : 0;

        const markupEl = document.getElementById("mu-markup-pct");
        const profitEl = document.getElementById("mu-profit");
        if (markupEl) markupEl.innerText = fmt(markupPct) + "%";
        if (profitEl) profitEl.innerText = fmt(profit);

        const out = fmt(sell);
        displayResult("res-box-mu", out);
        addToHistory(
            "Markup/Margin",
            `Cost: ${cost}, Margin: ${margin}%`,
            `Sell: ${out}`
        );
    };

    // ─── 8. ENTER KEY & INIT ────────────────────────────────────────────────

    document.addEventListener("DOMContentLoaded", () => {

        // 1. Load theme
        const savedTheme = localStorage.getItem("siteTheme") || "dark";
        applyTheme(savedTheme);

        // 2. Load history
        loadHistory();

        // 3. Enter key — fires the first .pct-btn-calc inside the parent card
        document.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
            const card = e.target.closest(".calc-card");
            if (!card) return;
            const btn = card.querySelector(".pct-btn-calc");
            if (btn) {
                e.preventDefault();
                btn.click();
            }
        });

        // 4. Focus ring on input wrappers
        document.querySelectorAll("input, select").forEach(input => {
            input.addEventListener("focus", () =>
                input.parentElement.classList.add("focused"));
            input.addEventListener("blur", () =>
                input.parentElement.classList.remove("focused"));
        });

        // 5. Close history panel on Escape
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                const panel = document.getElementById("historyPanel");
                if (panel && panel.classList.contains("active")) {
                    toggleHistory();
                }
            }
        });

        // 6. Keyboard accessibility for .pct-result-value (Enter = copy)
        document.querySelectorAll(".pct-result-value").forEach(el => {
            el.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    copyToClipboard(el.innerText);
                }
            });
        });
    });

})();
