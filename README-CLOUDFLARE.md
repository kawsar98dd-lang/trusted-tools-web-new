# TrustedToolsWeb — Cloudflare Pages deployment

## Deployment

This project is designed for GitHub → Cloudflare Pages.

- Framework preset: None
- Build command: leave empty
- Build output directory: `/`
- Root directory: `/`

## Telegram comment notifications

The Telegram bot token is **server-side only**.

Cloudflare Pages → Settings → Environment variables and secrets:

- `TELEGRAM_BOT_TOKEN` — Secret
- `TELEGRAM_CHAT_ID` — Secret

The browser calls:

`POST /api/telegram-notify`

which is handled by:

`functions/api/telegram-notify.js`

Do not put a Telegram bot token in `assets/js/`, HTML, CSS, or any public file.

## Local development

Install Wrangler if needed, copy `.dev.vars.example` to `.dev.vars`, fill in test credentials, then run the project with Cloudflare Pages/Wrangler.

Never commit `.dev.vars`.
