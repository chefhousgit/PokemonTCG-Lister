const express = require('express');
const { getDb } = require('./utils/db');
const { assertSafeJobPayload } = require('./utils/jobPayload');
const { addJobEvent, jobPayloadFromRow, executor } = require('./utils/jobs');
const { releaseJob } = require('./utils/fulfillment');

const router = express.Router();
const CLAIM_TTL_MS = Number(process.env.CLAIM_TTL_MS || 5 * 60 * 1000);

function requireAgent(req, res, next) {
  const expected = process.env.AGENT_TOKEN;
  if (!expected) return res.status(503).json({ error: 'AGENT_TOKEN is not configured' });
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-agent-token'];
  if (token !== expected) return res.status(401).json({ error: 'Invalid agent token' });
  next();
}

router.use(requireAgent);

async function expireStaleClaims(db) {
  const stale = await db.query(
    `SELECT * FROM trade_jobs
     WHERE status IN ('claimed', 'in_progress', 'friend_pending')
       AND heartbeat_at IS NOT NULL`,
  );
  const cutoff = Date.now() - CLAIM_TTL_MS;
  for (const job of stale.rows) {
    if (new Date(job.heartbeat_at).getTime() < cutoff) {
      await db.query(
        `UPDATE trade_jobs SET status = 'queued', claimed_by_agent = NULL, claimed_at = NULL WHERE id = $1`,
        [job.id],
      );
      await releaseJob(db, job, 'stale_heartbeat');
      await addJobEvent(db, job.id, 'system', 'requeued', { reason: 'stale_heartbeat' });
    }
  }
}

router.post('/jobs/claim', async (req, res) => {
  try {
    const db = getDb();
    await expireStaleClaims(db);
    const agentId = req.body.agentId || 'local-agent';

    const candidates = await db.query(
      `SELECT j.* FROM trade_jobs j
       WHERE j.status IN ('queued', 'routed')
         AND j.source_account_id IS NOT NULL
         AND j.source_account_id NOT IN (
           SELECT source_account_id FROM trade_jobs
           WHERE status IN ('claimed', 'in_progress', 'friend_pending', 'awaiting_confirmation')
             AND source_account_id IS NOT NULL
         )
       ORDER BY j.id ASC`,
    );
    const job = candidates.rows[0];
    if (!job) return res.json({ job: null });

    await db.query(
      `UPDATE trade_jobs
       SET status = 'claimed', claimed_by_agent = $2, claimed_at = NOW(), heartbeat_at = NOW(), attempts = attempts + 1
       WHERE id = $1`,
      [job.id, agentId],
    );

    const account = (await db.query('SELECT * FROM accounts WHERE id = $1', [job.source_account_id])).rows[0];
    const card = (await db.query('SELECT * FROM cards WHERE id = $1', [job.card_id])).rows[0];
    const payload = jobPayloadFromRow({ ...job, status: 'claimed' }, account, card);
    assertSafeJobPayload(payload);
    await addJobEvent(db, job.id, 'agent', 'claimed', { agentId });

    const exec = executor();
    const precheck = await exec.validate(payload);

    res.json({
      job: { ...job, status: 'claimed' },
      payload,
      precheck,
      executor: exec.name,
      checklist: exec.name === 'manual' ? require('./utils/executors/manual').CHECKLIST : [],
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/jobs/:id/heartbeat', async (req, res) => {
  const db = getDb();
  const job = (await db.query('SELECT * FROM trade_jobs WHERE id = $1', [req.params.id])).rows[0];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  await db.query('UPDATE trade_jobs SET heartbeat_at = NOW() WHERE id = $1', [job.id]);
  if (job.source_account_id && req.body) {
    const fields = [];
    const values = [];
    let i = 1;
    for (const key of ['friend_slots_used', 'friend_slots_total', 'trade_currency']) {
      if (req.body[key] != null) {
        fields.push(`${key} = $${i}`);
        values.push(req.body[key]);
        i += 1;
      }
    }
    if (fields.length) {
      values.push(job.source_account_id);
      await db.query(
        `UPDATE accounts SET ${fields.join(', ')}, last_heartbeat_at = NOW() WHERE id = $${i}`,
        values,
      );
    } else {
      await db.query('UPDATE accounts SET last_heartbeat_at = NOW() WHERE id = $1', [job.source_account_id]);
    }
  }
  await addJobEvent(db, job.id, 'agent', 'heartbeat', req.body || {});
  res.json({ ok: true });
});

router.post('/jobs/:id/event', async (req, res) => {
  try {
    if (req.body && req.body.payload) assertSafeJobPayload(req.body.payload);
    const db = getDb();
    await addJobEvent(db, req.params.id, 'agent', req.body.type || 'progress', req.body.payload || req.body);
    if (req.body.status) {
      await db.query('UPDATE trade_jobs SET status = $2 WHERE id = $1', [req.params.id, req.body.status]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/jobs/:id/complete', async (req, res) => {
  const db = getDb();
  const job = (await db.query('SELECT * FROM trade_jobs WHERE id = $1', [req.params.id])).rows[0];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  await db.query(`UPDATE trade_jobs SET status = 'completed' WHERE id = $1`, [job.id]);
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
  await addJobEvent(db, job.id, 'agent', 'completed', req.body || {});
  res.json({ ok: true });
});

router.post('/jobs/:id/fail', async (req, res) => {
  const db = getDb();
  const job = (await db.query('SELECT * FROM trade_jobs WHERE id = $1', [req.params.id])).rows[0];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  await db.query(`UPDATE trade_jobs SET status = 'failed', last_error = $2 WHERE id = $1`, [job.id, req.body.error || 'agent_failed']);
  await releaseJob(db, job, 'agent_failed');
  await addJobEvent(db, job.id, 'agent', 'failed', req.body || {});
  res.json({ ok: true });
});

router.get('/config', async (_req, res) => {
  const db = getDb();
  const paths = await db.query('SELECT * FROM ptcgpb_paths ORDER BY id DESC');
  res.json({
    paths: paths.rows,
    executor: executor().name,
  });
});

module.exports = router;
