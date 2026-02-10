// opening.worker.js

const MIN_REQUEST_GAP_MS = 5000;
const ENDPOINT = "https://explorer.lichess.ovh/lichess";

let lock = false;
let queued = null;
let lastSentAtMs = 0;
let nextAllowedAtMs = 0;

const cache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response) {
  const header = response.headers.get("retry-after");
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds * 1000);
  }
  return 0;
}


function parseBodyRetryAfterMs(body) {
  if (!body) return 0;
  if (typeof body === "object") {
    const wait = Number(body.wait || body.retryAfter || body.retry_after);
    if (Number.isFinite(wait) && wait > 0) return Math.ceil(wait * 1000);

    const msg = String(body.error || body.message || "");
    const m = msg.match(/(\d+(?:\.\d+)?)\s*s(ec(ond)?s?)?/i);
    if (m) return Math.ceil(Number(m[1]) * 1000);
    return 0;
  }

  const txt = String(body);
  const m = txt.match(/(\d+(?:\.\d+)?)\s*s(ec(ond)?s?)?/i);
  if (m) return Math.ceil(Number(m[1]) * 1000);
  return 0;
}

function scoreMove(move) {
  const total = (move.white || 0) + (move.draws || 0) + (move.black || 0);
  if (total <= 0) return -Infinity;
  return ((move.white || 0) + 0.5 * (move.draws || 0)) / total;
}

function normalizeApiSuccess(fen, body) {
  const moves = Array.isArray(body?.moves) ? body.moves : [];

  const suggestions = moves
    .map((m) => {
      const total = (m.white || 0) + (m.draws || 0) + (m.black || 0);
      return {
        uci: m.uci || "",
        san: m.san || "",
        white: m.white || 0,
        draws: m.draws || 0,
        black: m.black || 0,
        total,
        score: scoreMove(m)
      };
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return b.score - a.score;
    });

  return {
    fen,
    status: "ok",
    cached: false,
    openingName: body?.opening?.name || "",
    suggestions,
    nextAllowedAtMs,
    receivedAtMs: Date.now()
  };
}

async function fetchSuggestions(fen) {
  const now = Date.now();
  const waitForGap = Math.max(0, MIN_REQUEST_GAP_MS - (now - lastSentAtMs));
  const waitForPolicy = Math.max(0, nextAllowedAtMs - now);
  const waitMs = Math.max(waitForGap, waitForPolicy);
  if (waitMs > 0) await sleep(waitMs);

  const url = `${ENDPOINT}?variant=standard&speeds=rapid,classical,blitz&fen=${encodeURIComponent(fen)}`;

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });
  } catch (err) {
    return {
      fen,
      status: "network_error",
      cached: false,
      suggestions: [],
      message: String(err?.message || err || "network error"),
      nextAllowedAtMs,
      receivedAtMs: Date.now()
    };
  }

  lastSentAtMs = Date.now();

  const headerRetryAfterMs = parseRetryAfterMs(response);

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : await response.text().catch(() => "");

  const bodyRetryAfterMs = parseBodyRetryAfterMs(body);
  const retryAfterMs = Math.max(headerRetryAfterMs, bodyRetryAfterMs);
  if (retryAfterMs > 0) {
    nextAllowedAtMs = Math.max(nextAllowedAtMs, Date.now() + retryAfterMs);
  }

  if (response.ok) {
    return normalizeApiSuccess(fen, body || {});
  }

  if (response.status === 429) {
    if (retryAfterMs <= 0) {
      nextAllowedAtMs = Math.max(nextAllowedAtMs, Date.now() + MIN_REQUEST_GAP_MS);
    }

    return {
      fen,
      status: "rate_limited",
      cached: false,
      suggestions: [],
      retryAtMs: nextAllowedAtMs,
      message: (typeof body === "string") ? body : (body?.error || body?.message || "rate limited"),
      nextAllowedAtMs,
      receivedAtMs: Date.now()
    };
  }

  return {
    fen,
    status: `http_${response.status}`,
    cached: false,
    suggestions: [],
    message: (typeof body === "string") ? body : (body?.error || body?.message || "request failed"),
    nextAllowedAtMs,
    receivedAtMs: Date.now()
  };
}

async function drainQueue() {
  if (lock) return;
  if (!queued) return;

  lock = true;

  while (queued) {
    const job = queued;
    queued = null;

    const cached = cache.get(job.fen);
    if (cached) {
      self.postMessage({
        type: "opening_result",
        payload: { ...cached, cached: true }
      });
      continue;
    }

    const payload = await fetchSuggestions(job.fen);
    cache.set(job.fen, payload);

    self.postMessage({
      type: "opening_result",
      payload
    });
  }

  lock = false;
}

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type !== "suggest_opening") return;
  if (!msg.fen || typeof msg.fen !== "string") return;

  queued = { reqId: msg.reqId, fen: msg.fen };
  drainQueue();
};
