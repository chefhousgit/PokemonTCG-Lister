const STALE_MS = 5 * 60 * 1000;

let memory = null;
let pullRequested = false;

function isFresh(live, now = Date.now()) {
  if (!live || !live.at) return false;
  return now - live.at <= STALE_MS;
}

function getLive() {
  return memory && isFresh(memory) ? memory : null;
}

function peekLive() {
  return memory;
}

function getLiveMeta() {
  if (!memory) return { source: 'imported', live: false, pullRequested };
  return {
    source: isFresh(memory) ? 'ptcgpb' : 'imported',
    live: isFresh(memory),
    at: memory.at,
    ageMs: Date.now() - memory.at,
    agentId: memory.agentId || null,
    dashboardUrl: memory.dashboardUrl || null,
    accountCount: memory.summary && memory.summary.accountCount,
    rowCount: memory.rows ? memory.rows.split('\n').filter(Boolean).length : 0,
    stale: !isFresh(memory),
    pullRequested,
  };
}

function requestPull() {
  pullRequested = true;
  return getLiveMeta();
}

function takePullRequest() {
  const was = pullRequested;
  pullRequested = false;
  return was;
}

function setLive(partial) {
  memory = {
    at: Date.now(),
    agentId: partial.agentId || null,
    dashboardUrl: partial.dashboardUrl || null,
    summary: partial.summary || (memory && memory.summary) || null,
    rows: partial.rows != null ? partial.rows : (memory && memory.rows) || '',
    marks: partial.marks || (memory && memory.marks) || { ok: true, accounts: [] },
    wishlist: partial.wishlist || (memory && memory.wishlist) || { cards: [] },
    uiPrefs: partial.uiPrefs || (memory && memory.uiPrefs) || null,
  };
  return getLiveMeta();
}

function queueWrite(kind, payload) {
  if (!memory) memory = { at: 0, pending: [] };
  if (!Array.isArray(memory.pending)) memory.pending = [];
  memory.pending.push({ kind, payload, at: Date.now() });
  if (kind === 'wishlist') memory.wishlist = payload;
  if (kind === 'marks' && memory.marks && Array.isArray(memory.marks.accounts)) {
    const key = payload.deviceAccount || payload.account;
    memory.marks.accounts = memory.marks.accounts.map((row) => (
      row.deviceAccount === key || row.account === key
        ? { ...row, tradedCards: payload.tradedCards || row.tradedCards, sharedCards: payload.sharedCards || row.sharedCards }
        : row
    ));
  }
  if (kind === 'ui-prefs') memory.uiPrefs = { ...(memory.uiPrefs || {}), ...payload, useLocalCardImages: false };
}

function takePendingWrites() {
  const pending = (memory && memory.pending) || [];
  if (memory) memory.pending = [];
  return pending;
}

function parsePortsFile(text) {
  const out = { primary: 0, legacy: 0, splash: 0 };
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(primary|legacy|splash)\s*=\s*(\d+)\s*$/i);
    if (!match) continue;
    out[match[1].toLowerCase()] = Number(match[2]);
  }
  return out;
}

module.exports = {
  STALE_MS,
  getLive,
  peekLive,
  getLiveMeta,
  setLive,
  queueWrite,
  takePendingWrites,
  requestPull,
  takePullRequest,
  parsePortsFile,
  isFresh,
};
