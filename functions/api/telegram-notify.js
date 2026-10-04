/**
 * TrustedToolsWeb — Cloudflare Pages Function
 * POST /api/telegram-notify
 *
 * Required Cloudflare environment variables/secrets:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_CHAT_ID
 */

const MAX_BODY_BYTES = 8 * 1024;

// Best-effort abuse protection (per Worker isolate): max N requests per IP per window.
// For hard guarantees add a Cloudflare WAF rate-limiting rule on /api/telegram-notify.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateBuckets = new Map();

const rateLimited = (request) => {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  if (rateBuckets.size > 500) {
    for (const [key, v] of rateBuckets) if (now - v.start > RATE_LIMIT_WINDOW_MS) rateBuckets.delete(key);
  }
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store"
  }
});

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const allowedOrigin = (request) => {
  const origin = request.headers.get("Origin");
  // Browsers always send Origin on cross-site/same-site POST fetches; reject requests without it.
  if (!origin) return false;

  const requestUrl = new URL(request.url);
  return origin === requestUrl.origin || origin === "https://trustedtoolsweb.com";
};

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!allowedOrigin(request)) {
    return json({ error: "Forbidden origin." }, 403);
  }

  if (rateLimited(request)) {
    return json({ error: "Too many requests. Please try again later." }, 429);
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ error: "Content-Type must be application/json." }, 415);
  }

  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("[TTW] Telegram secrets are not configured.");
    return json({ error: "Telegram notifications are not configured." }, 503);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "Request body is too large." }, 413);
  }

  let payload;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ error: "Request body is too large." }, 413);
    }
    payload = JSON.parse(raw || "{}");
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json({ error: "Invalid payload." }, 400);
  }

  const pageId = String(payload.pageId || "home").slice(0, 120);
  const userName = String(payload.userName || "Anonymous").slice(0, 120);
  const message = String(payload.message || "").slice(0, 2000);
  const baseUrl = String(payload.baseUrl || "").slice(0, 300);

  if (!message.trim()) {
    return json({ error: "Message is required." }, 400);
  }

  const text = [
    `💬 <b>New Comment on ${escapeHtml(pageId)}</b>`,
    "",
    `👤 <b>${escapeHtml(userName)}</b>`,
    `📝 ${escapeHtml(message)}`,
    "",
    `🔗 ${escapeHtml(baseUrl)}`
  ].join("\n");

  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });

    if (!telegramResponse.ok) {
      const detail = await telegramResponse.text();
      console.error("[TTW] Telegram API error:", telegramResponse.status, detail);
      return json({ error: "Telegram delivery failed." }, 502);
    }

    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("[TTW] Telegram request failed:", error);
    return json({ error: "Telegram delivery failed." }, 502);
  }
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": new URL(context.request.url).origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store"
      }
    });
  }

  if (context.request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  return onRequestPost(context);
}
