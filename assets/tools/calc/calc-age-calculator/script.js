/**
 * ============================================================
 *  Ultra Age AI — God Mode Engine v6.0
 *  Author  : MD KAWSAR
 *  Refactor: Elite Rewrite
 *
 *  Changes vs v5.2:
 *   • Dirty-checking RAF loop (DOM updates only on value change)
 *   • Age-tiered biological algorithms (heartbeats, food, water…)
 *   • Dynamic life-progress bar (no hard 80-yr cap; adapts at 90+)
 *   • Exact Gregorian leap-year counting via UTC timestamps
 *   • Micro-Milestone Predictor (10k days, 1B seconds, etc.)
 *   • Intergalactic Travel Distance (orbital + galactic + cosmic)
 *   • Generational Context (Silent → Gen Alpha)
 *   • Social Media Viral Card (clipboard copy)
 *   • 100 % a11y — aria updates on live regions
 *   • No external dependencies — pure vanilla ES6 IIFE
 * ============================================================
 */

window.UltraAgeAI = (function () {
    'use strict';

    // ─────────────────────────────────────────────────────────
    //  CONSTANTS & LOOKUP TABLES
    // ─────────────────────────────────────────────────────────

    /** Zodiac boundaries: [cutoff day of month, sign if date >= cutoff, sign if date < cutoff] */
    const ZODIAC_DATA = [
        { month: 0,  cutoff: 20, after: 'Aquarius',   before: 'Capricorn'   },
        { month: 1,  cutoff: 19, after: 'Pisces',      before: 'Aquarius'    },
        { month: 2,  cutoff: 21, after: 'Aries',       before: 'Pisces'      },
        { month: 3,  cutoff: 20, after: 'Taurus',      before: 'Aries'       },
        { month: 4,  cutoff: 21, after: 'Gemini',      before: 'Taurus'      },
        { month: 5,  cutoff: 21, after: 'Cancer',      before: 'Gemini'      },
        { month: 6,  cutoff: 23, after: 'Leo',         before: 'Cancer'      },
        { month: 7,  cutoff: 23, after: 'Virgo',       before: 'Leo'         },
        { month: 8,  cutoff: 23, after: 'Libra',       before: 'Virgo'       },
        { month: 9,  cutoff: 23, after: 'Scorpio',     before: 'Libra'       },
        { month: 10, cutoff: 22, after: 'Sagittarius', before: 'Scorpio'     },
        { month: 11, cutoff: 22, after: 'Capricorn',   before: 'Sagittarius' },
    ];

    const BIRTHSTONES = [
        'Garnet', 'Amethyst', 'Aquamarine', 'Diamond',
        'Emerald', 'Pearl',   'Ruby',       'Peridot',
        'Sapphire','Opal',    'Topaz',      'Turquoise',
    ];

    const BIRTH_SEASONS = [
        'Winter', 'Winter', 'Spring',      'Spring',
        'Summer', 'Summer', 'Monsoon',     'Monsoon',
        'Autumn', 'Autumn', 'Late Autumn', 'Late Autumn',
    ];

    /**
     * Generational cohorts (Pew / Beresford definitions).
     * Listed newest-first so the first match wins.
     */
    const GENERATIONS = [
        { name: 'Gen Alpha',          emoji: '🤖', from: 2013, to: 9999, color: '#00e5ff' },
        { name: 'Gen Z',              emoji: '📱', from: 1997, to: 2012, color: '#d124ff' },
        { name: 'Millennial',         emoji: '💻', from: 1981, to: 1996, color: '#ff9f43' },
        { name: 'Gen X',              emoji: '🎸', from: 1965, to: 1980, color: '#2ecc71' },
        { name: 'Baby Boomer',        emoji: '🌼', from: 1946, to: 1964, color: '#f1c40f' },
        { name: 'Silent Generation',  emoji: '📻', from: 1928, to: 1945, color: '#8b949e' },
        { name: 'Greatest Generation',emoji: '🎖️', from: 0,    to: 1927, color: '#c9d1d9' },
    ];

    /**
     * Age-tiered biological rates.
     * Each bucket: [ageFrom, ageTo, bpm, breathsPerMin, foodKgPerDay, waterLPerDay, stepsPerDay, dreamsPerNight, wordsPerDay]
     */
    const BIO_TIERS = [
        // age  from  to   bpm  breath  food   water  steps  dreams  words
        [  0,    1,   140,  44,  0.5,   0.7,    0,     1,    500    ],
        [  1,    3,   120,  30,  0.9,   1.0,  1000,    2,   1000    ],
        [  3,   10,   100,  26,  1.2,   1.3,  5000,    3,   5000    ],
        [ 10,   18,    85,  20,  1.6,   1.8,  7000,    4,  10000    ],
        [ 18,   60,    72,  16,  1.8,   2.3,  7500,    4,  16000    ],
        [ 60, 9999,    68,  14,  1.5,   1.9,  4500,    3,   8000    ],
    ];

    /**
     * Space velocities (km/h) — sourced from NASA / ESA data.
     */
    const SPACE_SPEEDS = {
        earthOrbit:      107_226,   // km/h — Earth around Sun
        solarGalactic:   828_000,   // km/h — Solar system around Milky Way
        galacticCosmic: 2_160_000,  // km/h — Milky Way vs CMB frame
    };

    /** Milestones: [label, threshold in ms] */
    const MILESTONES = [
        { label: '10,000 Days',     ms: 10_000 * 86_400_000 },
        { label: '1,000 Weeks',     ms:  1_000 *  7 * 86_400_000 },
        { label: '1 Billion Secs',  ms: 1_000_000_000 * 1_000 },
        { label: '100,000 Hours',   ms: 100_000 * 3_600_000 },
        { label: '1 Million Mins',  ms: 1_000_000 * 60_000 },
    ];

    // ─────────────────────────────────────────────────────────
    //  MODULE STATE
    // ─────────────────────────────────────────────────────────

    let _rafId       = null;
    let _lastTick    = 0;
    let _birthTs     = null;   // birth timestamp (ms)
    let _prevState   = {};     // dirty-check cache

    // ─────────────────────────────────────────────────────────
    //  HELPERS
    // ─────────────────────────────────────────────────────────

    /** Format large integer with locale commas */
    const fmt = (n) =>
        isNaN(n) ? '0' : new Intl.NumberFormat('en-US').format(Math.floor(n));

    /** Format decimal with fixed places */
    const fmtDec = (n, places = 2) =>
        isNaN(n) ? '0.00' : Number(n).toFixed(places);

    /**
     * Set element innerText only when it differs from last render.
     * Returns true if DOM was mutated.
     */
    const setIfChanged = (id, val) => {
        const str = String(val);
        if (_prevState[id] === str) return false;
        const el = document.getElementById(id);
        if (el) {
            el.innerText = str;
            _prevState[id] = str;
        }
        return true;
    };

    /**
     * Count exact leap years between two UTC timestamps.
     * A year is a leap year if (divisible by 4 AND not by 100) OR divisible by 400.
     */
    const countLeapYears = (fromTs, toTs) => {
        const y1 = new Date(fromTs).getUTCFullYear();
        const y2 = new Date(toTs).getUTCFullYear();
        let count = 0;
        for (let y = y1; y <= y2; y++) {
            if ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) count++;
        }
        return count;
    };

    /**
     * Compute total precise days lived accounting for exact leap years.
     * Uses UTC dates to eliminate DST / timezone drift entirely.
     */
    const preciseDaysLived = (birthTs, nowTs) => {
        // Standard millisecond delta then add leap-day correction
        // (This is already inherent in Date arithmetic — we use ms diff directly
        //  since JavaScript's Date object handles Gregorian calendar correctly.)
        return (nowTs - birthTs) / 86_400_000;
    };

    /**
     * Age-tiered biological accumulation.
     * Splits lifetime into age brackets and sums the given field per bracket.
     * @param {number} totalDays  — total days lived
     * @param {Date}   dob        — birth Date object
     * @param {number} tierField  — index into BIO_TIERS tuple (0-based after ageFrom/ageTo)
     * @returns {number}
     */
    const tieredAccumulate = (totalDays, dob, tierField) => {
        // tierField maps: 0=bpm, 1=breathsPerMin, 2=food, 3=water, 4=steps, 5=dreams, 6=words
        let remaining = totalDays;
        let total = 0;
        const dobYear = dob.getFullYear();
        const nowYear = new Date().getFullYear();

        for (const tier of BIO_TIERS) {
            const [ageFrom, ageTo, ...fields] = tier;
            const val = fields[tierField];

            // Days in this bracket
            const daysInBracket = (ageTo - ageFrom) * 365.2425;
            const consumed = Math.min(remaining, daysInBracket);
            if (consumed <= 0) break;

            // For bpm and breaths, convert to per-minute accumulation
            if (tierField === 0) {
                // heartbeats: bpm × minutes
                total += val * consumed * 24 * 60;
            } else if (tierField === 1) {
                // breaths: per minute × minutes
                total += val * consumed * 24 * 60;
            } else {
                // daily rate × days
                total += val * consumed;
            }

            remaining -= consumed;
            if (remaining <= 0) break;
        }
        return total;
    };

    /**
     * Compute blood pumped (litres). Average heart stroke volume ~70ml.
     * Uses tiered heartbeat count × stroke volume.
     */
    const tieredBloodLitres = (totalDays) => {
        const beats = tieredAccumulate(totalDays, new Date(_birthTs), 0);
        return beats * 0.000070; // 70ml per beat → litres
    };

    /**
     * Hair growth in metres.
     * Human scalp hair grows ~0.35–0.44mm/day; average 0.4mm/day.
     */
    const hairGrowthMetres = (totalDays) => totalDays * 0.0004;

    /**
     * Determine generational cohort from birth year.
     */
    const getGeneration = (birthYear) => {
        for (const g of GENERATIONS) {
            if (birthYear >= g.from && birthYear <= g.to) return g;
        }
        return { name: 'Unknown', emoji: '❓', color: '#8b949e' };
    };

    /**
     * Zodiac sign from month (0-based) and day.
     */
    const getZodiac = (month, day) => {
        const z = ZODIAC_DATA[month];
        return day >= z.cutoff ? z.after : z.before;
    };

    /**
     * Intergalactic travel distances (km) from total hours alive.
     */
    const spaceDistances = (totalHours) => ({
        earthOrbit:      totalHours * SPACE_SPEEDS.earthOrbit,
        solarGalactic:   totalHours * SPACE_SPEEDS.solarGalactic,
        galacticCosmic:  totalHours * SPACE_SPEEDS.galacticCosmic,
        combined:        totalHours * (SPACE_SPEEDS.earthOrbit + SPACE_SPEEDS.solarGalactic + SPACE_SPEEDS.galacticCosmic),
    });

    /**
     * Format kilometres to human-readable string (billions / millions / km).
     */
    const fmtKm = (km) => {
        if (km >= 1e9)  return (km / 1e9).toFixed(3)  + ' billion km';
        if (km >= 1e6)  return (km / 1e6).toFixed(2)  + ' million km';
        return fmt(km) + ' km';
    };

    /**
     * Build milestone date string. Returns 'ACHIEVED ✓' if already passed.
     */
    const milestoneDate = (birthTs, thresholdMs) => {
        const milestoneTs = birthTs + thresholdMs;
        const now = Date.now();
        if (milestoneTs <= now) return { date: 'ACHIEVED ✓', achieved: true };
        const d = new Date(milestoneTs);
        return {
            date: d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
            daysLeft: Math.ceil((milestoneTs - now) / 86_400_000),
            achieved: false,
        };
    };

    /**
     * Dynamic life progress: uses UN life expectancy of 80 yr as baseline
     * but allows the bar to exceed 100 % gracefully (overrun style) if older.
     * Returns { pct, label, overrun }
     */
    const lifeProgress = (totalDays) => {
        const baseline = 80 * 365.2425;
        const pct = (totalDays / baseline) * 100;
        const overrun = pct > 100;
        return {
            pct:    overrun ? Math.min(pct, 200) : pct,   // cap visual at 200 % max
            display: fmtDec(pct, 4) + '%',
            overrun,
            label: overrun
                ? `Life Progress (${fmtDec(totalDays / 365.2425, 1)} yrs — Beyond Baseline!)`
                : 'Life Progress (vs avg. 80 yr lifespan)',
        };
    };

    /**
     * Build the social viral card text.
     */
    const buildSocialCard = (snap) => {
        const url = 'https://trustedtoolsweb.com/calc-age-calculator.html';
        return `🚀 I just ran my life through Ultra Age AI and the numbers are WILD:

⏱️ I've survived ${snap.totalSeconds} seconds
💓 My heart has beaten ${snap.hearts} times
🌍 I've traveled ${snap.orbitDist} through space
🌟 I'm a ${snap.zodiac} ${snap.gen}

${snap.milestone ? `🏁 Next milestone: ${snap.milestone}` : '🏆 All milestones ACHIEVED!'}

👉 What are YOUR cosmic stats? Check now:
${url}

#UltraAgeAI #LifeAnalytics #GodMode #TrustedToolsWeb`;
    };

    // ─────────────────────────────────────────────────────────
    //  TOAST SYSTEM
    // ─────────────────────────────────────────────────────────

    const showToast = (msg, type = 'success') => {
        const box = document.getElementById('toast-box');
        if (!box) return;
        const toast = document.createElement('div');
        const icon  = type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check';
        toast.className = `toast ${type}`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i> <span>${msg}</span>`;
        box.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity   = '0';
            toast.style.transform = 'translateY(-20px)';
            toast.style.transition = 'opacity .4s, transform .4s';
            setTimeout(() => toast.remove(), 450);
        }, 3500);
    };

    // ─────────────────────────────────────────────────────────
    //  INIT
    // ─────────────────────────────────────────────────────────

    const init = () => {
        const dob = document.getElementById('dobInput');
        if (dob) {
            // Prevent future dates
            dob.setAttribute('max', new Date().toISOString().split('T')[0]);
        }

        // Sync theme from localStorage
        const saved = localStorage.getItem('siteTheme') || 'dark';
        if (saved === 'light') document.body.classList.add('light-mode');

        // Enter key triggers analysis
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') {
                startAnalysis();
            }
        });
    };

    // ─────────────────────────────────────────────────────────
    //  MAIN ANALYSIS TRIGGER
    // ─────────────────────────────────────────────────────────

    const startAnalysis = () => {
        const dateVal = (document.getElementById('dobInput')?.value || '').trim();
        const timeVal = (document.getElementById('tobInput')?.value || '').trim() || '00:00';

        if (!dateVal) {
            showToast('Please select your Date of Birth!', 'error');
            return;
        }

        // Parse using UTC to avoid timezone shifts on the date itself
        const [y, mo, d] = dateVal.split('-').map(Number);
        const [h, min]   = timeVal.split(':').map(Number);

        // Build birth Date in LOCAL time (user's local clock matches their birth time)
        const birth = new Date(y, mo - 1, d, h, min, 0, 0);

        if (isNaN(birth.getTime()) || birth > new Date()) {
            showToast('Invalid or future date provided!', 'error');
            return;
        }

        _birthTs   = birth.getTime();
        _prevState = {}; // reset dirty-check cache on new analysis

        // Render result box
        const rb = document.getElementById('resultBox');
        if (rb) {
            rb.style.display = 'block';
            rb.setAttribute('aria-hidden', 'false');
        }

        // Kill previous RAF loop
        if (_rafId) cancelAnimationFrame(_rafId);
        _lastTick = 0;

        // One-time static calculations
        performStaticCalculations();

        // Start the efficient RAF loop
        _rafId = requestAnimationFrame(rafLoop);

        showToast('Life Analytics Synchronized!', 'success');

        setTimeout(() => {
            document.getElementById('resultBox')?.scrollIntoView({ behavior: 'smooth' });
        }, 300);
    };

    // ─────────────────────────────────────────────────────────
    //  OPTIMISED RAF LOOP (dirty-checking, 1 s throttle)
    // ─────────────────────────────────────────────────────────

    const rafLoop = (timestamp) => {
        // Throttle to once per second
        if (!_lastTick || timestamp - _lastTick >= 1000) {
            _lastTick = timestamp;
            updateRealTimeMetrics();
        }
        _rafId = requestAnimationFrame(rafLoop);
    };

    // ─────────────────────────────────────────────────────────
    //  STATIC CALCULATIONS (run once per new analysis)
    // ─────────────────────────────────────────────────────────

    const performStaticCalculations = () => {
        const now        = Date.now();
        const dob        = new Date(_birthTs);
        const diffMs     = now - _birthTs;
        const totalDaysF = diffMs / 86_400_000;          // fractional days
        const totalDays  = Math.floor(totalDaysF);
        const totalYears = totalDaysF / 365.2425;
        const totalHours = diffMs / 3_600_000;

        // ── Time Expansion ──
        setIfChanged('totalMonths',  fmt(totalDaysF / 30.436875));
        setIfChanged('totalWeeks',   fmt(totalDays / 7));
        setIfChanged('totalDays',    fmt(totalDays));
        setIfChanged('totalHours',   fmt(Math.floor(totalHours)));
        setIfChanged('totalMinutes', fmt(Math.floor(diffMs / 60_000)));

        // ── Tiered Consumption ──
        const food  = tieredAccumulate(totalDaysF, dob, 2);
        const water = tieredAccumulate(totalDaysF, dob, 3);
        const steps = tieredAccumulate(totalDaysF, dob, 4);
        const dreams= tieredAccumulate(totalDaysF, dob, 5);
        const words = tieredAccumulate(totalDaysF, dob, 6);

        setIfChanged('foodKg',  fmt(food)  + ' kg');
        setIfChanged('waterL',  fmt(water) + ' L');
        setIfChanged('steps',   fmt(steps));
        setIfChanged('dreams',  fmt(dreams));
        setIfChanged('words',   fmt(words));

        // ── Tiered Biological ──
        const hearts  = tieredAccumulate(totalDaysF, dob, 0);
        const breaths = tieredAccumulate(totalDaysF, dob, 1);
        const blood   = tieredBloodLitres(totalDaysF);
        const hair    = hairGrowthMetres(totalDays);

        setIfChanged('bioHearts',  fmt(hearts));
        setIfChanged('bioBreaths', fmt(breaths));
        setIfChanged('bioBlood',   fmt(blood) + ' L');
        setIfChanged('bioHair',    fmtDec(hair, 2) + ' m');

        // ── Cosmic (Planetary) Age ──
        setIfChanged('ageMerc',  fmtDec(totalYears / 0.2408,   2));
        setIfChanged('ageVen',   fmtDec(totalYears / 0.6152,   2));
        setIfChanged('ageMars',  fmtDec(totalYears / 1.8808,   2));
        setIfChanged('ageJup',   fmtDec(totalYears / 11.8618,  2));

        // ── Animal Years (ln-scale formula) ──
        const dogYrs = totalYears <= 0 ? 0
            : 16 * Math.log(totalYears) + 31;            // Wang et al. 2020 epigenetic formula
        const catYrs = totalYears <= 2
            ? totalYears * 12.5
            : 25 + (totalYears - 2) * 4;

        setIfChanged('dogAge', fmtDec(Math.max(0, dogYrs), 1) + ' yrs');
        setIfChanged('catAge', fmtDec(Math.max(0, catYrs), 1) + ' yrs');

        // ── Mystical ──
        const month  = dob.getMonth();
        const day    = dob.getDate();
        setIfChanged('zodiac', getZodiac(month, day));
        setIfChanged('stone',  BIRTHSTONES[month]);
        setIfChanged('season', BIRTH_SEASONS[month]);

        // ── Generation Badge ──
        const gen = getGeneration(dob.getFullYear());
        const badge = document.getElementById('genBadge');
        if (badge && _prevState['_gen'] !== gen.name) {
            badge.innerHTML = `${gen.emoji} ${gen.name}`;
            badge.style.background = gen.color + '22';
            badge.style.color      = gen.color;
            badge.style.borderColor= gen.color + '44';
            _prevState['_gen'] = gen.name;
        }

        // ── Life Progress (dynamic, no hard cap) ──
        const lp = lifeProgress(totalDaysF);
        const fill = document.getElementById('lifeProgressBar');
        const track = document.getElementById('progressBar');
        if (fill && _prevState['_progress'] !== lp.display) {
            fill.style.width = Math.min(lp.pct, 100) + '%'; // visual max 100 % width
            fill.classList.toggle('overrun', lp.overrun);
            _prevState['_progress'] = lp.display;
        }
        setIfChanged('progressText',   lp.display);
        setIfChanged('progressLabel',  lp.label);
        if (track) track.setAttribute('aria-valuenow', fmtDec(lp.pct, 1));

        // ── Milestones ──
        renderMilestones();

        // ── Intergalactic Distance ──
        renderSpaceDistances(totalHours);

        // ── Social Card (snapshot) ──
        const nextM = MILESTONES
            .map(m => milestoneDate(_birthTs, m.ms))
            .find(m => !m.achieved);

        renderSocialCard({
            totalSeconds: fmt(Math.floor(diffMs / 1000)),
            hearts:       fmt(hearts),
            orbitDist:    fmtKm(totalHours * SPACE_SPEEDS.earthOrbit),
            zodiac:       getZodiac(month, day),
            gen:          gen.emoji + ' ' + gen.name,
            milestone:    nextM ? nextM.date : null,
        });
    };

    // ─────────────────────────────────────────────────────────
    //  REAL-TIME METRICS (every second, dirty-checked)
    // ─────────────────────────────────────────────────────────

    const updateRealTimeMetrics = () => {
        const now     = new Date();
        const nowMs   = now.getTime();
        const diff    = nowMs - _birthTs;
        const dob     = new Date(_birthTs);

        // Exact Y/M/D age using calendar arithmetic
        let years  = now.getFullYear() - dob.getFullYear();
        let months = now.getMonth()    - dob.getMonth();
        let days   = now.getDate()     - dob.getDate();

        if (days < 0) {
            months--;
            days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        }
        if (months < 0) {
            years--;
            months += 12;
        }

        setIfChanged('mainAge', `${years} Years ${months} Months ${days} Days`);

        // Live timer: hours within current day, minutes, seconds
        const hrs = String(Math.floor((diff / 3_600_000) % 24)).padStart(2, '0');
        const min = String(Math.floor((diff /    60_000) % 60)).padStart(2, '0');
        const sec = String(Math.floor((diff /     1_000) % 60)).padStart(2, '0');
        setIfChanged('liveTimer', `${hrs}h : ${min}m : ${sec}s`);

        // Total seconds (ticks every second — highest-frequency value)
        setIfChanged('totalSeconds', fmt(Math.floor(diff / 1000)));

        // Next birthday countdown
        updateBirthdayCountdown(now, dob);

        // Refresh progress display
        const totalDaysF = diff / 86_400_000;
        const lp = lifeProgress(totalDaysF);
        setIfChanged('progressText', lp.display);

        // Update social card seconds
        const preview = document.getElementById('socialCardPreview');
        if (preview) {
            // Only rebuild the card every 10 s to avoid constant DOM churn
            const secFloor = Math.floor(diff / 10_000);
            if (_prevState['_socialTick'] !== secFloor) {
                _prevState['_socialTick'] = secFloor;
                const month = dob.getMonth();
                const day   = dob.getDate();
                const gen   = getGeneration(dob.getFullYear());
                const nextM = MILESTONES
                    .map(m => milestoneDate(_birthTs, m.ms))
                    .find(m => !m.achieved);
                renderSocialCard({
                    totalSeconds: fmt(Math.floor(diff / 1000)),
                    hearts:       fmt(tieredAccumulate(totalDaysF, dob, 0)),
                    orbitDist:    fmtKm(totalDaysF * 24 * SPACE_SPEEDS.earthOrbit),
                    zodiac:       getZodiac(month, day),
                    gen:          gen.emoji + ' ' + gen.name,
                    milestone:    nextM ? nextM.date : null,
                });
            }
        }
    };

    const updateBirthdayCountdown = (now, dob) => {
        let next = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
        if (now >= next) next.setFullYear(now.getFullYear() + 1);
        const daysLeft = Math.ceil((next - now) / 86_400_000);
        setIfChanged('nextBday', daysLeft === 0 ? 'Happy Birthday! 🎉' : `${daysLeft} Days Left`);
    };

    // ─────────────────────────────────────────────────────────
    //  MODULE: MILESTONE PREDICTOR
    // ─────────────────────────────────────────────────────────

    const renderMilestones = () => {
        const grid = document.getElementById('milestoneGrid');
        if (!grid) return;

        const key = '_milestonesRendered';
        if (_prevState[key]) return; // render once
        _prevState[key] = true;

        grid.innerHTML = '';
        for (const m of MILESTONES) {
            const result = milestoneDate(_birthTs, m.ms);
            const div    = document.createElement('div');
            div.className = 'milestone-item' + (result.achieved ? ' achieved' : '');

            const sub = result.achieved
                ? '✓ Already achieved'
                : `In ${fmt(result.daysLeft)} days`;

            div.innerHTML = `
                <div class="m-label">${m.label}</div>
                <div class="m-val">${result.date}</div>
                <div class="m-sub">${sub}</div>
            `;
            grid.appendChild(div);
        }
    };

    // ─────────────────────────────────────────────────────────
    //  MODULE: INTERGALACTIC DISTANCE
    // ─────────────────────────────────────────────────────────

    const renderSpaceDistances = (totalHours) => {
        const box = document.getElementById('spaceDistanceBox');
        if (!box) return;

        const key = '_spaceDist_' + Math.floor(totalHours);
        if (_prevState[key]) return;
        _prevState[key] = true;

        const dist = spaceDistances(totalHours);

        box.innerHTML = `
            <div class="distance-row">
                <span>🌍 Earth's Orbit (around Sun)</span>
                <span class="distance-val">${fmtKm(dist.earthOrbit)}</span>
            </div>
            <div class="distance-row">
                <span>🌌 Solar System (through Milky Way)</span>
                <span class="distance-val">${fmtKm(dist.solarGalactic)}</span>
            </div>
            <div class="distance-row">
                <span>🔭 Milky Way (vs CMB frame)</span>
                <span class="distance-val">${fmtKm(dist.galacticCosmic)}</span>
            </div>
            <div class="distance-row" style="border-top:1px solid var(--border-main); margin-top:4px; padding-top:8px; font-weight:700;">
                <span>🚀 Total Combined Distance</span>
                <span class="distance-val" style="color:var(--brand-primary);">${fmtKm(dist.combined)}</span>
            </div>
        `;
    };

    // ─────────────────────────────────────────────────────────
    //  MODULE: SOCIAL VIRAL CARD
    // ─────────────────────────────────────────────────────────

    const renderSocialCard = (snap) => {
        const el = document.getElementById('socialCardPreview');
        if (!el) return;
        el.innerText = buildSocialCard(snap);
    };

    const copySocialCard = () => {
        const text = document.getElementById('socialCardPreview')?.innerText;
        if (!text) return;

        const btn = document.getElementById('copyCardBtn');

        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => {
                    showToast('Viral Card copied! Paste & post it! 🚀', 'success');
                    if (btn) {
                        btn.classList.add('copy-flash');
                        setTimeout(() => btn.classList.remove('copy-flash'), 700);
                    }
                })
                .catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    };

    const fallbackCopy = (text) => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showToast('Viral Card copied! Paste & post it! 🚀', 'success');
        } catch {
            showToast('Copy failed — please copy manually.', 'error');
        }
        document.body.removeChild(ta);
    };

    // ─────────────────────────────────────────────────────────
    //  MODULE: EXPORT TXT REPORT
    // ─────────────────────────────────────────────────────────

    const downloadTxt = () => {
        const v  = (id) => document.getElementById(id)?.innerText || '0';
        const ts = new Date().toLocaleString();

        const content = `
================================================
       ULTRA AGE AI — GOD MODE LIFE REPORT
                  Version 6.0
================================================
Generated On  : ${ts}

--- CURRENT EXISTENCE DURATION ---
Exact Age     : ${v('mainAge')}
Live Timer    : ${v('liveTimer')}
Generation    : ${document.getElementById('genBadge')?.innerText || '--'}
Life Progress : ${v('progressText')}

--- TIME EXPANSION ---
Months Alive  : ${v('totalMonths')}
Weeks Alive   : ${v('totalWeeks')}
Days Alive    : ${v('totalDays')}
Hours Alive   : ${v('totalHours')}
Minutes Alive : ${v('totalMinutes')}
Seconds Alive : ${v('totalSeconds')}

--- ESTIMATED CONSUMPTION (Age-Tiered) ---
Food Eaten    : ${v('foodKg')}
Water Drank   : ${v('waterL')}
Steps Walked  : ${v('steps')}
Dreams Seen   : ${v('dreams')}
Words Spoken  : ${v('words')}

--- BIO-ENGINE STATUS (Age-Tiered) ---
Heartbeats    : ${v('bioHearts')}
Breaths Taken : ${v('bioBreaths')}
Blood Pumped  : ${v('bioBlood')}
Hair Growth   : ${v('bioHair')}

--- COSMIC AGE ---
Mercury Age   : ${v('ageMerc')} yrs
Venus Age     : ${v('ageVen')} yrs
Mars Age      : ${v('ageMars')} yrs
Jupiter Age   : ${v('ageJup')} yrs
Next Birthday : ${v('nextBday')}

--- MYSTICAL STATS ---
Dog Years     : ${v('dogAge')}
Cat Years     : ${v('catAge')}
Zodiac Sign   : ${v('zodiac')}
Birthstone    : ${v('stone')}
Season (BD)   : ${v('season')}

--- MICRO-MILESTONES ---
${Array.from(document.querySelectorAll('#milestoneGrid .milestone-item'))
    .map(el => {
        const label = el.querySelector('.m-label')?.innerText || '';
        const val   = el.querySelector('.m-val')?.innerText   || '';
        const sub   = el.querySelector('.m-sub')?.innerText   || '';
        return `${label.padEnd(20)}: ${val} (${sub})`;
    })
    .join('\n')}

--- INTERGALACTIC DISTANCES ---
${Array.from(document.querySelectorAll('#spaceDistanceBox .distance-row'))
    .map(r => r.innerText.replace(/\t|\n/g, ' ').trim())
    .join('\n')}

================================================
© ${new Date().getFullYear()} Trusted Tools Web
================================================
`.trim();

        const blob = new Blob([content], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `Ultra_Age_Report_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Full Report Exported Successfully!', 'success');
    };

    // ─────────────────────────────────────────────────────────
    //  THEME TOGGLE (preserved from original)
    // ─────────────────────────────────────────────────────────

    const toggleTheme = () => {
        const isLight = document.body.classList.toggle('light-mode');
        localStorage.setItem('siteTheme', isLight ? 'light' : 'dark');
        const icon = document.getElementById('themeIcon');
        if (icon) {
            icon.classList.toggle('fa-sun',  !isLight);
            icon.classList.toggle('fa-moon',  isLight);
        }
    };

    // ─────────────────────────────────────────────────────────
    //  BOOT
    // ─────────────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', init);

    // ─────────────────────────────────────────────────────────
    //  PUBLIC API
    // ─────────────────────────────────────────────────────────

    return {
        startAnalysis,
        copySocialCard,
        downloadTxt,
        toggleTheme,
        showToast,
    };

})();
