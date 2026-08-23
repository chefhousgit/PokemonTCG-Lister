const express = require('express');
const { getDb } = require('./utils/db');
const { addJobEvent, jobPayloadFromRow } = require('./utils/jobs');
const { loadRoutingSnapshot, releaseJob } = require('./utils/fulfillment');
const { rankSourceAccounts } = require('./utils/routing/router');
const ManualExecutor = require('./utils/executors/manual');

const router = express.Router();

router.get('/', async (_req, res) => {
  const db = getDb();
  const jobs = await db.query(
    `SELECT j.*, a.label AS account_label, a.external_key, a.emulator_instance,
            c.name AS card_name, c.card_id AS card_key, o.buyer_handle, o.buyer_friend_id
     FROM trade_jobs j
     LEFT JOIN accounts a ON a.id = j.source_account_id
     LEFT JOIN cards c ON c.id = j.card_id
     LEFT JOIN orders o ON o.id = j.order_id
     ORDER BY j.id DESC`,
  );
  res.json({ jobs: jobs.rows, checklist: ManualExecutor.CHECKLIST });
});

router.get('/:id', async (req, res) => {
  const db = getDb();
  const jobRes = await db.query(
    `SELECT j.*, a.label AS account_label, a.external_key, a.emulator_instance,
            c.name AS card_name, c.card_id AS card_key
     FROM trade_jobs j
     LEFT JOIN accounts a ON a.id = j.source_account_id
     LEFT JOIN cards c ON c.id = j.card_id
     WHERE j.id = $1`,
    [req.params.id],
  );
  if (!jobRes.rows[0]) return res.status(404).json({ error: 'Job not found' });
  const events = await db.query('SELECT * FROM job_events WHERE job_id = $1 ORDER BY ts ASC, id ASC', [req.params.id]);
  res.json({ job: jobRes.rows[0], events: events.rows, checklist: ManualExecutor.CHECKLIST });
});

router.get('/:id/routing', async (req, res) => {
  const db = getDb();
  const jobRes = await db.query(
    `SELECT j.*, c.* FROM trade_jobs j JOIN cards c ON c.id = j.card_id WHERE j.id = $1`,
    [req.params.id],
  );
  const job = jobRes.rows[0];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const snap = await loadRoutingSnapshot(db, job);
  const routed = rankSourceAccounts({
    card: job,
    qty: 1,
    accounts: snap.accounts,
    inventory: snap.inventory,
    reservations: snap.reservations,
    rules: snap.rules,
  });
  res.json(routed);
});

router.post('/:id/override', async (req, res) => {
  const db = getDb();
  const jobRes = await db.query('SELECT * FROM trade_jobs WHERE id = $1', [req.params.id]);
  const job = jobRes.rows[0];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  await db.query('UPDATE trade_jobs SET source_account_id = $2 WHERE id = $1', [job.id, req.body.accountId]);
  await addJobEvent(db, job.id, 'web', 'override', { accountId: req.body.accountId });
  res.json({ ok: true });
});

async function setStatus(req, res, status, actorType) {
  const db = getDb();
  const jobRes = await db.query('SELECT * FROM trade_jobs WHERE id = $1', [req.params.id]);
  const job = jobRes.rows[0];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (status === 'queued') {
    await db.query(
      `UPDATE trade_jobs SET status = 'queued', claimed_by_agent = NULL, claimed_at = NULL WHERE id = $1`,
      [job.id],
    );
  } else {
    await db.query('UPDATE trade_jobs SET status = $2 WHERE id = $1', [job.id, status]);
  }
  if (status === 'failed' || status === 'needs_human') {
    await releaseJob(db, job, status);
  }
  if (status === 'completed') {
    await db.query(`UPDATE friend_links SET state = 'traded' WHERE job_id = $1`, [job.id]);
    const reservations = await db.query('SELECT * FROM inventory_reservations WHERE order_id = $1', [job.order_id]);
    for (const r of reservations.rows) {
      await db.query(
        `UPDATE inventory_items SET qty = GREATEST(qty - $1, 0), reserved_qty = GREATEST(reserved_qty - $1, 0) WHERE id = $2`,
        [r.qty, r.inventory_item_id],
      );
      await db.query('DELETE FROM inventory_reservations WHERE id = $1', [r.id]);
    }
    await db.query(`UPDATE listings SET status = 'sold' WHERE id = (SELECT listing_id FROM orders WHERE id = $1)`, [job.order_id]);
    await db.query(`UPDATE orders SET status = 'fulfilled' WHERE id = $1`, [job.order_id]);
  }
  await addJobEvent(db, job.id, 'web', actorType, { status });
  res.json({ ok: true, status });
}

router.post('/:id/retry', (req, res) => setStatus(req, res, 'queued', 'retry'));
router.post('/:id/fail', (req, res) => setStatus(req, res, 'failed', 'force_fail'));
router.post('/:id/needs-human', (req, res) => setStatus(req, res, 'needs_human', 'needs_human'));
router.post('/:id/complete', (req, res) => setStatus(req, res, 'completed', 'complete'));

router.post('/:id/event', async (req, res) => {
  const db = getDb();
  await addJobEvent(db, req.params.id, req.body.actor || 'web', req.body.type || 'note', req.body.payload || {});
  res.json({ ok: true });
});

module.exports = router;
module.exports.jobPayloadFromRow = jobPayloadFromRow;
