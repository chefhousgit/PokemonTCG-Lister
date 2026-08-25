const fs = require('fs');
const path = require('path');

function parsePortsFile(text) {
  const out = { primary: 0, legacy: 0, splash: 0 };
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(primary|legacy|splash)\s*=\s*(\d+)\s*$/i);
    if (!match) continue;
    out[match[1].toLowerCase()] = Number(match[2]);
  }
  return out;
}

function cardsDir(root) {
  return path.join(root, 'Accounts', 'Cards');
}

function readPorts(root) {
  const file = path.join(cardsDir(root), '.dashboard_ports.txt');
  if (!fs.existsSync(file)) return { primary: 0, legacy: 0, splash: 0 };
  return parsePortsFile(fs.readFileSync(file, 'utf8'));
}

async function ping(base) {
  const res = await fetch(`${base}/__dashboard/ping`, { method: 'GET', cache: 'no-store' });
  return res.status === 204 || res.ok;
}

async function discoverDashboard(config) {
  if (config.dashboardUrl) {
    const base = String(config.dashboardUrl).replace(/\/$/, '');
    if (await ping(base).catch(() => false)) return base;
  }
  const roots = [config.ptcgpbRoot].filter(Boolean);
  for (const root of roots) {
    const ports = readPorts(root);
    for (const port of [ports.primary, ports.legacy]) {
      if (!port) continue;
      const base = `http://127.0.0.1:${port}`;
      if (await ping(base).catch(() => false)) return base;
    }
  }
  return null;
}

async function getJson(base, pathname) {
  const res = await fetch(`${base}${pathname}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${pathname} ${res.status}`);
  return res.json();
}

async function getText(base, pathname) {
  const res = await fetch(`${base}${pathname}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${pathname} ${res.status}`);
  return res.text();
}

async function postJson(base, pathname, body) {
  const res = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`${pathname} ${res.status}`);
  const type = res.headers.get('content-type') || '';
  return type.includes('json') ? res.json() : { ok: true };
}

async function applyWrites(base, pending) {
  for (const item of pending || []) {
    if (item.kind === 'wishlist') {
      await postJson(base, '/__dashboard/wishlist', item.payload);
    } else if (item.kind === 'marks') {
      await postJson(base, '/__dashboard/account-card-marks', item.payload);
    } else if (item.kind === 'ui-prefs') {
      await postJson(base, '/__dashboard/ui-prefs', item.payload);
    }
  }
}

async function pullLive(base) {
  const [summary, rows, marks, wishlist, uiPrefs] = await Promise.all([
    getJson(base, '/__dashboard/accounts-summary'),
    getText(base, '/__dashboard/dashboard-rows'),
    getJson(base, '/__dashboard/account-card-marks').catch(() => ({ ok: true, accounts: [] })),
    getJson(base, '/__dashboard/wishlist').catch(() => ({ cards: [] })),
    getJson(base, '/__dashboard/ui-prefs').catch(() => null),
  ]);
  return { summary, rows, marks, wishlist, uiPrefs, dashboardUrl: base };
}

module.exports = { discoverDashboard, applyWrites, pullLive, readPorts };
