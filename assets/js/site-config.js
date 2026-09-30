/**
 * ============================================================================
 * TRUSTEDTOOLSWEB — MASTER SITE CONFIGURATION
 * ============================================================================
 * Author      : MD KAWSAR
 * Project     : Trusted Tools Web (CodeCanyon Premium)
 * Description : Master public configuration object. Buyers edit this file
 *               for public settings and feature toggles. Private secrets
 *               (e.g. Telegram bot credentials) must remain server-side.
 *               The core comments.js file should NEVER be modified directly.
 * ============================================================================
 */

window.SITE_CONFIG = {

    // ── BRANDING ──────────────────────────────────────────────────────────────
    brandName   : "Trusted Tools Web",
    author      : "MD KAWSAR",
    /** Your domain — no trailing slash */
    baseUrl     : "https://trustedtoolsweb.com",

    // ── SEO META ──────────────────────────────────────────────────────────────
    defaultDescription : "Secure, Fast, and Client-Side Developer Tools for everyone.",
    themeColor         : "#0d1117",

    // ── SOCIAL MEDIA ──────────────────────────────────────────────────────────
    facebookAppId : "123456789",
    twitterHandle : "@TrustedToolsWeb",
    ogSiteName    : "Trusted Tools Web - Secure Developer Suite",

    // ── ASSETS & PATHS ────────────────────────────────────────────────────────
    defaultOGImage : "../../assets/img/og-banner.webp",
    favicon        : "favicon.png",
    appleIcon      : "favicon.png",

    // ── CONTACT ───────────────────────────────────────────────────────────────
    contactEmail : "contact@trustedtoolsweb.com",
    mainSiteUrl  : "https://trustedtoolsweb.com",

    // ══════════════════════════════════════════════════════════════════════════
    // COMMENT SYSTEM — All 15 Premium Feature Controls Live Here
    // ══════════════════════════════════════════════════════════════════════════
    commentSystem: {

        // ── ADMIN ─────────────────────────────────────────────────────────────
        /** Array of Google email addresses with full admin privileges. */
        adminEmails: ["kawsar98dd@gmail.com"],

        // ── FIREBASE (Required) ───────────────────────────────────────────────
        firebase: {
            apiKey            : "AIzaSyDc9m-lsrzsOC3zVRyXb2xoOOMnyQ7hUic",
            authDomain        : "account-tools-comments.firebaseapp.com",
            projectId         : "account-tools-comments",
            storageBucket     : "account-tools-comments.firebasestorage.app",
            messagingSenderId : "339954634804",
            appId             : "1:339954634804:web:a0865ac6aa61e76306fa61"
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 1 — IMAGE ATTACHMENTS (ImgBB)
        // ────────────────────────────────────────────────────────────────────
        imageAttachments: {
            /** Master on/off toggle for image uploads. */
            enabled       : true,
            /** Your ImgBB API key from https://api.imgbb.com */
            imgbbApiKey   : "",
            /** Image expiration in seconds. 0 = never expires. */
            expiration    : 0,
            /** Max allowed file size in MB. */
            maxSizeMB     : 5,
            /** Comma-separated accepted MIME types. */
            acceptedTypes : "image/jpeg,image/png,image/gif,image/webp"
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 2 — VOICE NOTES (Cloudinary)
        // ────────────────────────────────────────────────────────────────────
        voiceNotes: {
            /** Master on/off toggle for audio recording. */
            enabled           : true,
            /** Your Cloudinary cloud name from the dashboard. */
            cloudName         : "",
            /** Your unsigned upload preset configured in Cloudinary. */
            uploadPreset      : "ttw_audio_preset",
            /** Maximum recording duration in seconds. */
            maxDurationSeconds: 60,

            // ── FEATURE 2 UPGRADE — Audio Preview & Clean/Enhance ────────────
            /**
             * enableVoiceEnhance: Master toggle for the new Audio Preview UI.
             *
             * When TRUE (recommended):
             *   - After recording stops, an inline preview panel appears in the
             *     toolbar with Play/Pause, Retake (discard), and "Clean Voice"
             *     toggle buttons BEFORE the audio is uploaded to Cloudinary.
             *   - If the user activates "Clean Voice", the raw audio blob is
             *     processed via the Web Audio API (highpass filter @ 80 Hz to
             *     remove wind/rumble + DynamicsCompressor to normalize volume)
             *     before the final blob is staged for upload.
             *   - Clicking "Post Comment" uploads whichever blob is staged
             *     (processed or original).
             *
             * When FALSE:
             *   - Legacy behaviour is preserved exactly: recording stops →
             *     blob is staged immediately → "Post Comment" uploads it.
             *     Zero UI change from the original product.
             */
            enableVoiceEnhance: true,

            /**
             * voiceEnhance: Fine-tuning knobs for the Web Audio processing
             * pipeline. Only used when enableVoiceEnhance is true AND the
             * user has toggled "Clean Voice" on in the preview panel.
             * Advanced buyers may tweak these; defaults are sensible for most
             * voice recordings.
             */
            voiceEnhance: {
                /**
                 * highpassFrequency (Hz):
                 * Frequencies BELOW this value are attenuated to cut wind
                 * rumble, low-frequency hum, and mic handling noise.
                 * Typical range: 60–120 Hz. Default: 80 Hz.
                 */
                highpassFrequency : 80,

                /**
                 * highpassQ:
                 * Quality factor for the highpass filter. Lower = gentler
                 * rolloff. Typical range: 0.5–1.5. Default: 0.707 (Butterworth).
                 */
                highpassQ         : 0.707,

                /**
                 * compressorThreshold (dBFS):
                 * Signal level above which compression begins. More negative =
                 * more compression. Typical range: -30 to -10. Default: -24.
                 */
                compressorThreshold: -24,

                /**
                 * compressorKnee (dB):
                 * Smoothness of the transition into compression.
                 * Typical range: 0–40. Default: 30.
                 */
                compressorKnee    : 30,

                /**
                 * compressorRatio:
                 * Amount of gain reduction. 4:1 is a gentle voice setting.
                 * Typical range: 2–20. Default: 4.
                 */
                compressorRatio   : 4,

                /**
                 * compressorAttack (seconds):
                 * How quickly the compressor responds to peaks.
                 * Default: 0.003 (3 ms — fast enough to catch transients).
                 */
                compressorAttack  : 0.003,

                /**
                 * compressorRelease (seconds):
                 * How quickly gain recovers after a loud peak.
                 * Default: 0.25 (250 ms — natural-sounding release).
                 */
                compressorRelease : 0.25
            }
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 3 — USER CRUD (Edit & Delete Own Comments)
        // Enforced by Firestore Security Rules — no config needed here.
        // ────────────────────────────────────────────────────────────────────
        userCRUD: {
            /** Allow authors to edit their own comments. */
            editEnabled  : true,
            /** Allow authors to delete their own comments. */
            deleteEnabled: true
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 4 — TELEGRAM NOTIFICATIONS
        // ────────────────────────────────────────────────────────────────────
        telegram: {
            /** Master on/off toggle. */
            enabled   : true,
            /** Same-origin endpoint; the bot token must stay server-side. */
            endpoint  : "/api/telegram-notify"
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 5 — UPVOTES & SORTING
        // ────────────────────────────────────────────────────────────────────
        upvotes: {
            /** Enable the like/upvote button on comments. */
            enabled       : true,
            /** Default sort order: "newest" | "mostLiked" */
            defaultSort   : "newest"
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 6 — ADMIN PIN COMMENT
        // ────────────────────────────────────────────────────────────────────
        pinComment: {
            /** Enable admin ability to pin a comment to the top. */
            enabled: true
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 7 — PAGINATION / LOAD MORE
        // ────────────────────────────────────────────────────────────────────
        pagination: {
            /** Number of top-level comments to load per batch. */
            commentsPerPage: 10
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 8 — ANTI-SPAM / COOLDOWN TIMER
        // ────────────────────────────────────────────────────────────────────
        antiSpam: {
            /** Cooldown period between posts in seconds. */
            cooldownSeconds: 30
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 9 — MARKDOWN & CODE SNIPPETS
        // ────────────────────────────────────────────────────────────────────
        markdown: {
            /** Enable basic markdown parsing: **bold**, *italic*, `code`. */
            enabled: true
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 10 — IN-FEED ADS
        // ────────────────────────────────────────────────────────────────────
        ads: {
            /** Set to false to disable ads entirely. */
            enabled       : true,
            /** Inject an ad container after every N comments. */
            injectAfterN  : 5,
            /** The raw HTML for your ad unit. Use a Google AdSense tag or any banner. */
            adHTML        : `<div style="text-align:center;padding:12px 0;">
                                <ins class="adsbygoogle" style="display:block"
                                     data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                                     data-ad-slot="XXXXXXXXXX"
                                     data-ad-format="auto"
                                     data-full-width-responsive="true"></ins>
                             </div>`
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 11 — AUTO PROFANITY FILTER
        // ────────────────────────────────────────────────────────────────────
        profanityFilter: {
            /** Enable profanity replacement before rendering. */
            enabled  : true,
            /** Add your list of words to block. Case-insensitive matching. */
            wordList : ["badword1", "badword2", "spam", "scam", "idiot", "stupid", "dumb"]
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 12 — USER BADGES
        // ────────────────────────────────────────────────────────────────────
        badges: {
            /** Enable the badge system. */
            enabled                : true,
            /** Upvote count required to earn the "Trusted User" badge. */
            trustedUserUpvoteThreshold: 10
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 13 — @MENTION SYSTEM
        // ────────────────────────────────────────────────────────────────────
        mentions: {
            /** Highlight @username strings in comment text. */
            enabled: true
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 14 — GDPR COMPLIANCE
        // ────────────────────────────────────────────────────────────────────
        gdpr: {
            /** Show the GDPR consent checkbox before a user can post. */
            consentCheckboxEnabled: true,
            /** Show the "Export My Data" button in the logged-in user panel. */
            dataExportEnabled     : true,
            /** Text displayed in the consent checkbox label. */
            consentText           : "I agree that my name and comment will be stored as per the Privacy Policy."
        },

        // ────────────────────────────────────────────────────────────────────
        // FEATURE 15 — AUTO SEO SCHEMA (JSON-LD)
        // ────────────────────────────────────────────────────────────────────
        seoSchema: {
            /** Auto-inject DiscussionForumPosting JSON-LD schema into <head>. */
            enabled: true
        }
    }
};
