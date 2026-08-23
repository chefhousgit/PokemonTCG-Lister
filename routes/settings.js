const express = require('express');
const { getDb } = require('./utils/db');
const { assertSafeImportPath } = require('./utils/importers/pathGuard');

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

module.exports = router;
