const express = require('express');
const { getDb } = require('./utils/db');

const router = express.Router();

router.get('/', async (_req, res) => {
  const db = getDb();
  const accounts = await db.query('SELECT * FROM accounts ORDER BY priority_weight DESC, label');
  const jobs = await db.query(
    `SELECT source_account_id, COUNT(*)::int AS n
     FROM trade_jobs
     WHERE status NOT IN ('completed', 'failed', 'cancelled')
     GROUP BY source_account_id`,
  );
  const inflight = Object.fromEntries(jobs.rows.map((r) => [r.source_account_id, r.n]));
  res.json({
    accounts: accounts.rows.map((a) => ({
      ...a,
      jobs_in_flight: inflight[a.id] || 0,
      friend_slots_free: Number(a.friend_slots_total) - Number(a.friend_slots_used),
    })),
  });
});

module.exports = router;
