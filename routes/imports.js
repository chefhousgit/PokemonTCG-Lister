const express = require('express');
const fs = require('fs');
const multer = require('multer');
const { getDb } = require('./utils/db');
const { buildImportDiff } = require('./utils/importers/diff');
const { scanPtcgpbFolder } = require('./utils/importers/scanFolder');
const { parseUploadedJson, commitParsed } = require('./utils/importers/commit');
const { assertSafeImportPath } = require('./utils/importers/pathGuard');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

async function persistPreview(db, diff, parsed) {
  const stored = { diff, parsed };
  const row = await db.query(
    'INSERT INTO import_previews (diff_json) VALUES ($1) RETURNING id, created_at',
    [JSON.stringify(stored)],
  );
  return { id: row.rows[0].id, created_at: row.rows[0].created_at, diff };
}

router.post('/preview', upload.array('files', 200), async (req, res) => {
  try {
    const parsed = [];
    for (const file of req.files || []) {
      if (String(file.originalname).toLowerCase().includes('saved')) {
        parsed.push({ skipped: [{ reason: 'blocked_saved_path', filename: file.originalname }] });
        continue;
      }
      try {
        parsed.push(parseUploadedJson(file.buffer, file.originalname));
      } catch (err) {
        parsed.push({ skipped: [{ reason: 'parse_error', filename: file.originalname, message: err.message }] });
      }
    }
    const db = getDb();
    const existing = (await db.query('SELECT * FROM accounts')).rows;
    const diff = buildImportDiff(existing, parsed);
    const preview = await persistPreview(db, diff, parsed);
    res.json(preview);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/scan', async (req, res) => {
  try {
    const db = getDb();
    let folderPath = String(req.body.folder_path || '').trim();
    if (req.body.pathId) {
      const row = await db.query('SELECT * FROM ptcgpb_paths WHERE id = $1', [req.body.pathId]);
      if (!row.rows[0]) return res.status(404).json({ error: 'Saved path not found' });
      folderPath = row.rows[0].folder_path;
      await db.query('UPDATE ptcgpb_paths SET last_used_at = NOW() WHERE id = $1', [req.body.pathId]);
    }
    if (!folderPath && process.env.PTCGPB_ROOT) folderPath = process.env.PTCGPB_ROOT;
    assertSafeImportPath(folderPath);

    if (!fs.existsSync(folderPath)) {
      return res.status(409).json({
        error: 'path_not_visible',
        message: 'This server cannot see that folder. On Railway that is expected. Upload the account JSON files from this computer, or run the local agent on the PC that has PTCGPB and scan from there.',
        folder_path: folderPath,
      });
    }

    const scanned = scanPtcgpbFolder(folderPath);
    const existing = (await db.query('SELECT * FROM accounts')).rows;
    const diff = buildImportDiff(existing, scanned.parsed);
    const preview = await persistPreview(db, diff, scanned.parsed);
    res.json({ ...preview, fileCount: scanned.fileCount, wishlist: scanned.wishlist });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/commit', async (req, res) => {
  try {
    const db = getDb();
    const row = await db.query('SELECT * FROM import_previews WHERE id = $1', [req.body.previewId]);
    if (!row.rows[0]) return res.status(404).json({ error: 'Preview not found' });
    const stored = JSON.parse(row.rows[0].diff_json);
    const retireKeys = (stored.diff.retires || []).map((r) => r.external_key);
    const results = await commitParsed(db, stored.parsed, retireKeys);
    await db.query('DELETE FROM import_previews WHERE id = $1', [req.body.previewId]);
    res.json({ ok: true, results });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
