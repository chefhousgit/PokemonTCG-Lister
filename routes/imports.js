const express = require('express');
const fs = require('fs');
const multer = require('multer');
const { getDb } = require('./utils/db');
const { buildImportDiff, loadInventoryByAccountKey } = require('./utils/importers/diff');
const { scanPtcgpbFolder } = require('./utils/importers/scanFolder');
const { parseUploadedJson, commitParsed } = require('./utils/importers/commit');
const { assertSafeImportPath } = require('./utils/importers/pathGuard');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 2000 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (!name.endsWith('.json')) return cb(null, false);
    if (name.includes('saved')) return cb(null, false);
    cb(null, true);
  },
});

function uploadPreview(req, res, next) {
  upload.any()(req, res, (err) => {
    if (!err) return next();
    const tooMany = err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE';
    return res.status(400).json({
      error: 'upload_failed',
      message: tooMany
        ? 'Too many files. In the folder picker, open Accounts\\Cards\\accounts and choose that folder — not the whole PTCGPB-main folder.'
        : err.message,
    });
  });
}

async function persistPreview(db, diff, parsed) {
  const stored = { diff, parsed };
  const row = await db.query(
    'INSERT INTO import_previews (diff_json) VALUES ($1) RETURNING id, created_at',
    [JSON.stringify(stored)],
  );
  return { id: row.rows[0].id, created_at: row.rows[0].created_at, diff };
}

function rowsToCommit(parsed, diff) {
  const writeKeys = new Set([
    ...(diff.adds || []).map((row) => row.account.external_key),
    ...(diff.updates || []).map((row) => row.next.account.external_key),
  ]);
  return parsed.filter((row) => row.account && writeKeys.has(row.account.external_key));
}

async function previewFromParsed(parsed, { fullSync = false } = {}) {
  const db = getDb();
  const existing = (await db.query('SELECT * FROM accounts')).rows;
  const inventoryByKey = await loadInventoryByAccountKey(db);
  const diff = buildImportDiff(existing, parsed, inventoryByKey, { fullSync });
  const preview = await persistPreview(db, diff, rowsToCommit(parsed, diff));
  return { ...preview, checked: parsed.length };
}

router.post('/preview', uploadPreview, async (req, res) => {
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
    const fullSync = req.body.fullSync === '1' || req.body.fullSync === true;
    const preview = await previewFromParsed(parsed, { fullSync });
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
    const preview = await previewFromParsed(scanned.parsed, { fullSync: true });
    res.json({ ...preview, fileCount: scanned.fileCount, wishlist: scanned.wishlist });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/latest', async (_req, res) => {
  const db = getDb();
  const row = await db.query('SELECT id, created_at FROM import_previews ORDER BY id DESC LIMIT 1');
  if (!row.rows[0]) return res.json({ preview: null });
  const full = await db.query('SELECT * FROM import_previews WHERE id = $1', [row.rows[0].id]);
  const stored = JSON.parse(full.rows[0].diff_json);
  const parsed = stored.parsed || [];
  res.json({
    id: full.rows[0].id,
    created_at: full.rows[0].created_at,
    diff: stored.diff,
    processed: stored.cursor || 0,
    total: parsed.length,
  });
});

router.post('/commit', async (req, res) => {
  try {
    const db = getDb();
    const row = await db.query('SELECT * FROM import_previews WHERE id = $1', [req.body.previewId]);
    if (!row.rows[0]) {
      return res.status(404).json({
        error: 'Preview not found',
        message: 'That preview is gone (already committed, or the server restarted). Open Inventory to check, or upload the folder again.',
      });
    }
    const stored = JSON.parse(row.rows[0].diff_json);
    const parsed = stored.parsed || [];
    const cursor = Number(stored.cursor || 0);
    const limit = Math.min(Math.max(Number(req.body.limit) || 8, 1), 25);
    const slice = parsed.slice(cursor, cursor + limit);
    const nextCursor = cursor + slice.length;
    const done = nextCursor >= parsed.length;
    const retireKeys = done ? (stored.diff.retires || []).map((r) => r.external_key) : [];

    console.log(`[import] commit preview ${req.body.previewId} ${cursor}->${nextCursor}/${parsed.length}`);
    const summary = await commitParsed(db, slice, retireKeys);
    stored.cursor = nextCursor;
    stored.writtenAccounts = (stored.writtenAccounts || 0) + summary.accounts;
    stored.writtenItems = (stored.writtenItems || 0) + summary.items;

    if (done) {
      await db.query('DELETE FROM import_previews WHERE id = $1', [req.body.previewId]);
      console.log(`[import] commit done accounts=${stored.writtenAccounts} items=${stored.writtenItems}`);
    } else {
      await db.query('UPDATE import_previews SET diff_json = $2 WHERE id = $1', [req.body.previewId, JSON.stringify(stored)]);
    }

    res.json({
      ok: true,
      done,
      processed: nextCursor,
      total: parsed.length,
      accounts: stored.writtenAccounts,
      items: stored.writtenItems,
    });
  } catch (err) {
    console.error('[import] commit failed', err);
    res.status(400).json({ error: err.message, message: err.message });
  }
});

module.exports = router;
