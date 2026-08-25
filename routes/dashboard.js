const express = require('express');
const { getDb } = require('./utils/db');
const { buildDashboardPayload } = require('./utils/dashboardPayload');
const { getLive, getLiveMeta, queueWrite } = require('./utils/liveDashboard');

const router = express.Router();

async function loadPayload() {
  const db = getDb();
  const accounts = (await db.query(
    `SELECT * FROM accounts WHERE health <> 'retired' ORDER BY external_key`,
  )).rows;
  const items = (await db.query(
    `SELECT i.account_id, c.card_id, i.qty
     FROM inventory_items i
     JOIN cards c ON c.id = i.card_id`,
  )).rows;
  const countsByAccountId = {};
  for (const item of items) {
    if (!countsByAccountId[item.account_id]) countsByAccountId[item.account_id] = {};
    countsByAccountId[item.account_id][item.card_id] = Number(item.qty);
  }
  return buildDashboardPayload(accounts, countsByAccountId);
}

async function readState(key, fallback) {
  const db = getDb();
  const row = await db.query('SELECT value_json FROM dashboard_state WHERE key = $1', [key]);
  if (!row.rows[0]) return fallback;
  return row.rows[0].value_json;
}

async function writeState(key, value) {
  const db = getDb();
  await db.query(
    `INSERT INTO dashboard_state (key, value_json, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
}

router.get('/ping', (_req, res) => res.status(204).end());

router.post('/shutdown', (_req, res) => res.status(202).json({ ok: true, ignored: true }));

router.get('/database-index/status', (_req, res) => {
  const live = getLiveMeta();
  res.json({
    ok: true,
    phase: 'ready',
    mode: live.live ? 'ptcgpb' : 'lister',
    message: live.live ? 'Live from the PTCGPB card dashboard on the agent PC.' : 'Using imported Lister accounts.',
  });
});

router.post('/database-index/ensure', (_req, res) => {
  const live = getLiveMeta();
  res.json({
    ok: true,
    phase: 'ready',
    mode: live.live ? 'ptcgpb' : 'lister',
    message: live.live ? 'Live from the PTCGPB card dashboard on the agent PC.' : 'Using imported Lister accounts.',
  });
});

router.get('/accounts-summary', async (_req, res) => {
  try {
    const live = getLive();
    if (live && live.summary) return res.json({ ...live.summary, source: 'ptcgpb' });
    const payload = await loadPayload();
    res.json(payload.summary);
  } catch (err) {
    console.error('[dashboard] summary', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/accounts-data', async (_req, res) => {
  const live = getLive();
  if (live && live.summary && Array.isArray(live.summary.accounts) && live.summary.accounts.length) {
    return res.json({
      ok: true,
      accountCount: live.summary.accounts.length,
      skippedCount: 0,
      skipped: [],
      accounts: live.summary.accounts,
    });
  }
  const payload = await loadPayload();
  res.json({
    ok: true,
    accountCount: payload.documents.length,
    skippedCount: 0,
    skipped: [],
    accounts: payload.documents,
  });
});

router.get('/dashboard-rows', async (_req, res) => {
  try {
    const live = getLive();
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (live && live.rows != null) return res.send(live.rows.endsWith('\n') || !live.rows ? live.rows : `${live.rows}\n`);
    const payload = await loadPayload();
    res.send(payload.rows.map((row) => JSON.stringify(row)).join('\n') + (payload.rows.length ? '\n' : ''));
  } catch (err) {
    console.error('[dashboard] rows', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/dashboard-rows-page', async (req, res) => {
  const live = getLive();
  const rows = live && live.rows
    ? live.rows.split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : (await loadPayload()).rows;
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const limit = Math.min(Math.max(Number(req.query.limit) || 25000, 1), 50000);
  const slice = rows.slice(offset, offset + limit);
  res.json({
    ok: true,
    source: live ? 'ptcgpb' : 'lister',
    offset,
    limit,
    total: rows.length,
    count: slice.length,
    hasMore: offset + slice.length < rows.length,
    nextOffset: offset + slice.length < rows.length ? offset + slice.length : null,
    rows: slice,
  });
});

router.get('/account-card-marks', async (_req, res) => {
  const live = getLive();
  if (live && live.marks) return res.json(live.marks);
  const payload = await loadPayload();
  res.json({
    ok: true,
    accounts: payload.summary.accounts.map((entry) => ({
      deviceAccount: entry.deviceAccount,
      account: entry.account,
      tradedCards: entry.tradedCards || {},
      sharedCards: entry.sharedCards || {},
    })),
  });
});

async function saveMarks(req, res) {
  const deviceAccount = String(req.body.deviceAccount || req.body.account || '').trim();
  if (!deviceAccount) return res.status(400).json({ ok: false, error: 'Missing account.' });
  queueWrite('marks', req.body);
  const db = getDb();
  const row = await db.query('SELECT id, source_json FROM accounts WHERE external_key = $1', [deviceAccount]);
  if (row.rows[0]) {
    const current = row.rows[0].source_json && typeof row.rows[0].source_json === 'object' ? row.rows[0].source_json : { deviceAccount };
    current.tradedCards = req.body.tradedCards || current.tradedCards || {};
    current.sharedCards = req.body.sharedCards || current.sharedCards || {};
    await db.query('UPDATE accounts SET source_json = $2, updated_at = NOW() WHERE id = $1', [
      row.rows[0].id,
      JSON.stringify(current),
    ]);
  }
  res.json({ ok: true });
}

router.post('/account-card-marks', saveMarks);

router.get('/account-trade-marks', async (_req, res) => {
  const live = getLive();
  if (live && live.marks) return res.json(live.marks);
  const payload = await loadPayload();
  res.json({
    ok: true,
    accounts: payload.summary.accounts.map((entry) => ({
      deviceAccount: entry.deviceAccount,
      account: entry.account,
      tradedCards: entry.tradedCards || {},
      sharedCards: entry.sharedCards || {},
    })),
  });
});

router.post('/account-trade-marks', saveMarks);

router.get('/wishlist', async (_req, res) => {
  const live = getLive();
  if (live && live.wishlist) return res.json(live.wishlist);
  const value = await readState('wishlist', { cards: [] });
  res.json(value);
});

router.post('/wishlist', async (req, res) => {
  const cards = Array.isArray(req.body.cards) ? req.body.cards : [];
  const value = { cards };
  queueWrite('wishlist', value);
  await writeState('wishlist', value);
  res.json({ ok: true, ...value });
});

router.get('/ui-prefs', async (_req, res) => {
  const live = getLive();
  if (live && live.uiPrefs) return res.json({ ok: true, ...live.uiPrefs });
  const prefs = await readState('ui-prefs', {
    language: 'en_US',
    theme: 'dark',
    cardSize: 120,
    pageSize: 25,
    useLocalCardImages: false,
  });
  res.json({ ok: true, ...prefs });
});

router.post('/ui-prefs', async (req, res) => {
  const current = await readState('ui-prefs', {
    language: 'en_US',
    theme: 'dark',
    cardSize: 120,
    pageSize: 25,
    useLocalCardImages: false,
  });
  const next = {
    ...current,
    ...req.body,
    useLocalCardImages: false,
  };
  queueWrite('ui-prefs', next);
  await writeState('ui-prefs', next);
  res.json({ ok: true, ...next });
});

router.get('/card-images/status', (_req, res) => {
  res.json({ ok: true, useLocalCardImages: false, running: false, total: 0, done: 0 });
});

router.post('/card-images/prefetch', (_req, res) => {
  res.json({ ok: true, skipped: true, message: 'Remote GitHub images are used in Lister.' });
});

router.get('/instances', (_req, res) => {
  res.json({ ok: true, instances: [] });
});

router.get('/settings-friend-id', (_req, res) => {
  res.json({ ok: true, friendIds: [] });
});

router.all('/account-json/open', (_req, res) => {
  res.status(400).json({ ok: false, error: 'Opening account files on disk is disabled in Lister.' });
});

router.all('/account-shinedust/deduct', (_req, res) => {
  res.status(400).json({ ok: false, error: 'Shinedust writes stay in PTCGPB. Lister does not change bot files.' });
});

router.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not available in Lister. Bot launch and inject stay in PTCGPB.' });
});

module.exports = router;
