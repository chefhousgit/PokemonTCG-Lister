const express = require('express');
const { getDb } = require('./utils/db');
const { assertSafeImportPath } = require('./utils/importers/pathGuard');
const { ensureCatalog } = require('./utils/catalog');
const {
  loadState,
  saveState,
  publicState,
  mergeAlertSettings,
  searchCatalog,
  sendTestAlert,
} = require('./utils/cardAlerts');

const router = express.Router();

router.get('/paths', async (_req, res) => {
  const db = getDb();
  const result = await db.query('SELECT * FROM ptcgpb_paths ORDER BY id DESC');
  res.json({
    paths: result.rows,
    envFallback: process.env.PTCGPB_ROOT || null,
  });
});

router.post('/paths', async (req, res) => {
  const label = String(req.body.label || 'This computer').trim();
  const folderPath = String(req.body.folder_path || '').trim();
  try {
    assertSafeImportPath(folderPath);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const db = getDb();
  const result = await db.query(
    `INSERT INTO ptcgpb_paths (label, folder_path)
     VALUES ($1, $2)
     ON CONFLICT (folder_path) DO UPDATE SET label = EXCLUDED.label
     RETURNING *`,
    [label, folderPath],
  );
  res.json({ path: result.rows[0] });
});

router.delete('/paths/:id', async (req, res) => {
  const db = getDb();
  await db.query('DELETE FROM ptcgpb_paths WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.get('/card-alerts', async (_req, res) => {
  try { await ensureCatalog(); } catch { /* names still fall back to ids */ }
  const state = await loadState(getDb());
  res.json(publicState(state));
});

router.put('/card-alerts', async (req, res) => {
  try {
    try { await ensureCatalog(); } catch { /* names still fall back to ids */ }
    const current = await loadState(getDb());
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'webhookUrl')) {
      patch.webhookUrl = req.body.webhookUrl;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'cardIds')) {
      patch.cardIds = req.body.cardIds;
    }
    const next = await saveState(getDb(), mergeAlertSettings(current, patch));
    res.json(publicState(next));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/card-alerts/test', async (req, res) => {
  try {
    try { await ensureCatalog(); } catch { /* names still fall back to ids */ }
    await sendTestAlert(getDb(), req.body && req.body.webhookUrl);
    res.json({ ok: true });
  } catch (err) {
    const status = /webhook|Discord|Save a Discord/i.test(err.message) ? 400 : 502;
    res.status(status).json({ error: err.message });
  }
});

router.get('/catalog', async (req, res) => {
  try { await ensureCatalog(); } catch { /* empty search if catalog missing */ }
  res.json({ cards: searchCatalog(req.query.q) });
});

module.exports = router;
