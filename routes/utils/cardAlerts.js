const axios = require('axios');
const { lookupCard } = require('./catalog');

const HOUR_MS = 60 * 60 * 1000;
const STATE_KEY = 'card_alerts';
const DISCORD_HOSTS = new Set(['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com']);

function isDiscordHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  return DISCORD_HOSTS.has(host);
}

function emptyState() {
  return {
    webhookUrl: '',
    cardIds: [],
    lastCounts: {},
    lastSentAt: 0,
    baselineReady: false,
  };
}

function normalizeCardId(id) {
  return String(id || '').trim().toUpperCase();
}

function normalizeWatchList(ids) {
  const out = [];
  const seen = new Set();
  for (const raw of ids || []) {
    const id = normalizeCardId(raw);
    if (!/^(PK|TR)_/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 50) break;
  }
  return out;
}

function extractWebhookCandidate(raw) {
  const text = String(raw || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^[\s'"<]+/, '')
    .replace(/[\s'">]+$/, '')
    .trim();
  if (!text) return '';
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[.,;]+$/, '') : text;
}

function sanitizeWebhook(url) {
  const value = extractWebhookCandidate(url);
  if (!value) return '';
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Webhook must be a Discord webhook URL.');
  }
  if (parsed.protocol === 'http:') parsed.protocol = 'https:';
  if (parsed.protocol !== 'https:' || !isDiscordHost(parsed.hostname)) {
    throw new Error('Webhook must be a Discord webhook URL.');
  }
  const pathMatch = parsed.pathname.match(/^\/api\/(?:v\d+\/)?webhooks\/(\d+)\/([^/]+)\/?$/i)
    || parsed.pathname.match(/^\/api\/(?:v\d+\/)?webhooks\/(\d+)\/([^/]+)\/(?:github|slack)\/?$/i);
  if (!pathMatch) {
    throw new Error('Webhook must be a Discord webhook URL.');
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const canonicalHost = host === 'discordapp.com' ? 'discord.com' : host;
  return `https://${canonicalHost}/api/webhooks/${pathMatch[1]}/${decodeURIComponent(pathMatch[2])}`;
}

function isUsableWebhook(url) {
  try {
    return Boolean(sanitizeWebhook(url));
  } catch {
    return false;
  }
}

function mergeAlertSettings(current, patch = {}) {
  const base = { ...emptyState(), ...(current || {}) };
  const next = { ...base };
  if (Object.prototype.hasOwnProperty.call(patch, 'webhookUrl')) {
    next.webhookUrl = sanitizeWebhook(patch.webhookUrl);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'cardIds')) {
    next.cardIds = normalizeWatchList(patch.cardIds);
  } else {
    next.cardIds = normalizeWatchList(base.cardIds);
  }
  return next;
}

function countWatchedFromRows(rowsText, watchedIds) {
  const watch = normalizeWatchList(watchedIds);
  const counts = {};
  for (const id of watch) counts[id] = 0;
  for (const line of String(rowsText || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const rawIds = Array.isArray(row.cardIds) ? row.cardIds : (row.cards || row.Cards || []);
    const ids = Array.isArray(rawIds) ? rawIds : String(rawIds || '').split(/[|;,\s]+/).filter(Boolean);
    for (const raw of ids) {
      const id = normalizeCardId(raw);
      if (Object.prototype.hasOwnProperty.call(counts, id)) counts[id] += 1;
    }
  }
  return counts;
}

function addedSince(previous, current, watchedIds) {
  const added = [];
  for (const id of normalizeWatchList(watchedIds)) {
    const before = Number((previous && previous[id]) || 0);
    const after = Number((current && current[id]) || 0);
    const delta = after - before;
    if (delta > 0) added.push({ cardId: id, added: delta, total: after });
  }
  return added;
}

function seedNewWatches(lastCounts, currentCounts, cardIds) {
  const next = { ...(lastCounts || {}) };
  for (const id of cardIds) {
    if (next[id] == null) next[id] = Number((currentCounts && currentCounts[id]) || 0);
  }
  return next;
}

function evaluateHourlyAlert(state, currentCounts, now = Date.now()) {
  const webhookUrl = state && state.webhookUrl ? String(state.webhookUrl).trim() : '';
  const cardIds = normalizeWatchList(state && state.cardIds);
  const base = {
    webhookUrl,
    cardIds,
    lastCounts: { ...((state && state.lastCounts) || {}) },
    lastSentAt: Number((state && state.lastSentAt) || 0),
    baselineReady: !!(state && state.baselineReady),
  };

  if (!isUsableWebhook(webhookUrl) || !cardIds.length) {
    return { send: false, added: [], state: base };
  }

  if (!base.baselineReady) {
    return {
      send: false,
      added: [],
      state: {
        ...base,
        lastCounts: { ...currentCounts },
        lastSentAt: now,
        baselineReady: true,
      },
    };
  }

  const lastCounts = seedNewWatches(base.lastCounts, currentCounts, cardIds);
  const seeded = { ...base, lastCounts };

  if (base.lastSentAt && now - base.lastSentAt < HOUR_MS) {
    return { send: false, added: [], state: seeded };
  }

  const added = addedSince(lastCounts, currentCounts, cardIds);
  return {
    send: added.length > 0,
    added,
    state: {
      ...seeded,
      lastCounts: { ...currentCounts },
      lastSentAt: now,
    },
  };
}

function buildDiscordPayload(added, lookup = lookupCard) {
  const embeds = (added || []).slice(0, 10).map((item) => {
    const info = (typeof lookup === 'function' ? lookup(item.cardId) : null) || {};
    const embed = {
      title: info.name || item.cardId,
      description: `${Number(item.total || 0)} total, x${Number(item.added || 0)} since last webhook`,
      color: 0x58a6ff,
    };
    if (info.image_url) embed.thumbnail = { url: info.image_url };
    return embed;
  });
  return {
    content: embeds.length === 1
      ? `**${embeds[0].title}** — ${embeds[0].description}`
      : 'Watched cards since last webhook',
    embeds,
  };
}

function snapshotReport(lastCounts, currentCounts, cardIds) {
  const report = [];
  for (const id of normalizeWatchList(cardIds)) {
    const total = Number((currentCounts && currentCounts[id]) || 0);
    const before = Number((lastCounts && lastCounts[id]) || 0);
    report.push({
      cardId: id,
      added: Math.max(0, total - before),
      total,
    });
  }
  return report;
}

function buildTestDiscordPayload(state, currentCounts, lookup = lookupCard) {
  const items = snapshotReport(state && state.lastCounts, currentCounts, state && state.cardIds);
  if (!items.length) {
    return {
      content: 'Test from Lister — webhook is working. Add a watched card to include live totals.',
      embeds: [{
        title: 'Lister test',
        description: 'No watched cards yet',
        color: 0x58a6ff,
      }],
    };
  }
  const payload = buildDiscordPayload(items, lookup);
  payload.content = items.some((item) => item.added > 0)
    ? 'Test from Lister — live totals vs last webhook.'
    : 'Test from Lister — live totals (nothing new since last webhook).';
  return payload;
}

function publicState(state) {
  const cardIds = normalizeWatchList(state && state.cardIds);
  return {
    webhookUrl: (state && state.webhookUrl) || '',
    cardIds,
    cards: cardIds.map((cardId) => {
      const info = lookupCard(cardId) || {};
      return {
        card_id: cardId,
        name: info.name || cardId,
        image_url: info.image_url || '',
        set_code: info.set_code || '',
      };
    }),
    baselineReady: !!(state && state.baselineReady),
    lastSentAt: Number((state && state.lastSentAt) || 0),
  };
}

function searchCatalog(query, limit = 16) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const { listCatalogCards } = require('./catalog');
  const hits = [];
  for (const info of listCatalogCards()) {
    const blob = `${info.name} ${info.card_id} ${info.set_code || ''}`.toLowerCase();
    if (!blob.includes(q)) continue;
    hits.push({
      card_id: info.card_id,
      name: info.name,
      image_url: info.image_url || '',
      set_code: info.set_code || '',
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

async function loadState(db) {
  const row = await db.query('SELECT value_json FROM dashboard_state WHERE key = $1', [STATE_KEY]);
  let raw = row.rows[0] && row.rows[0].value_json;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!raw || typeof raw !== 'object') return emptyState();
  return {
    ...emptyState(),
    webhookUrl: raw.webhookUrl || '',
    cardIds: normalizeWatchList(raw.cardIds),
    lastCounts: raw.lastCounts && typeof raw.lastCounts === 'object' ? raw.lastCounts : {},
    lastSentAt: Number(raw.lastSentAt || 0),
    baselineReady: !!raw.baselineReady,
  };
}

async function saveState(db, state) {
  const value = {
    webhookUrl: state.webhookUrl || '',
    cardIds: normalizeWatchList(state.cardIds),
    lastCounts: state.lastCounts || {},
    lastSentAt: Number(state.lastSentAt || 0),
    baselineReady: !!state.baselineReady,
  };
  await db.query(
    `INSERT INTO dashboard_state (key, value_json, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [STATE_KEY, JSON.stringify(value)],
  );
  return value;
}

async function processLiveRows(db, rowsText) {
  try {
    const { ensureCatalog } = require('./catalog');
    await ensureCatalog();
  } catch {
    // Names/images fall back to card ids if the catalog is unavailable.
  }
  const state = await loadState(db);
  const current = countWatchedFromRows(rowsText, state.cardIds);
  const result = evaluateHourlyAlert(state, current, Date.now());
  await saveState(db, result.state);
  if (!result.send) return { sent: false, added: [] };
  const payload = buildDiscordPayload(result.added, lookupCard);
  await axios.post(result.state.webhookUrl, payload, { timeout: 15000 });
  return { sent: true, added: result.added };
}

async function sendTestAlert(db, overrideUrl) {
  try {
    const { ensureCatalog } = require('./catalog');
    await ensureCatalog();
  } catch {
    // Names/images fall back to card ids if the catalog is unavailable.
  }
  const state = await loadState(db);
  let webhookUrl = '';
  try {
    webhookUrl = sanitizeWebhook(overrideUrl != null && String(overrideUrl).trim() !== '' ? overrideUrl : state.webhookUrl);
  } catch {
    throw new Error('Webhook must be a Discord webhook URL.');
  }
  if (!webhookUrl) throw new Error('Save a Discord webhook URL first.');
  const { peekLive } = require('./liveDashboard');
  const live = peekLive();
  if (state.cardIds.length && (!live || !live.rows)) {
    throw new Error('No live Cards data yet. Keep the agent and card dashboard running, then try again.');
  }
  const current = countWatchedFromRows(live && live.rows, state.cardIds);
  const payload = buildTestDiscordPayload(state, current, lookupCard);
  try {
    await axios.post(webhookUrl, payload, { timeout: 15000 });
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 401 || status === 404) {
      throw new Error('Discord rejected that webhook. Copy a fresh URL from Channel → Integrations → Webhooks.');
    }
    throw new Error(err.message || 'Could not send the test webhook.');
  }
  await saveState(db, {
    ...state,
    webhookUrl,
    lastCounts: current,
    lastSentAt: Date.now(),
    baselineReady: true,
  });
  return { ok: true };
}

module.exports = {
  HOUR_MS,
  STATE_KEY,
  countWatchedFromRows,
  addedSince,
  normalizeWatchList,
  sanitizeWebhook,
  mergeAlertSettings,
  evaluateHourlyAlert,
  buildDiscordPayload,
  buildTestDiscordPayload,
  snapshotReport,
  publicState,
  searchCatalog,
  loadState,
  saveState,
  processLiveRows,
  sendTestAlert,
  emptyState,
};
