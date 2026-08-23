const express = require('express');
const { getDb } = require('./utils/db');
const { loadRules, evaluateTradeLegality } = require('./utils/rules/engine');
const { summarizeCard } = require('./utils/aggregates');

const router = express.Router();

router.get('/', async (req, res) => {
  const db = getDb();
  const rules = loadRules();
  const q = `%${String(req.query.q || '').trim()}%`;
  const cards = await db.query(
    `SELECT * FROM cards
     WHERE ($1 = '%%' OR name ILIKE $1 OR card_id ILIKE $1 OR set_code ILIKE $1)
     ORDER BY set_code, number, name`,
    [q],
  );

  const items = await db.query(
    `SELECT i.*, a.external_key, a.label, a.health, a.emulator_instance,
            a.friend_slots_total, a.friend_slots_used, a.trade_currency
     FROM inventory_items i
     JOIN accounts a ON a.id = i.account_id`,
  );

  const byCard = new Map();
  for (const item of items.rows) {
    if (!byCard.has(item.card_id)) byCard.set(item.card_id, []);
    byCard.get(item.card_id).push(item);
  }

  const rows = cards.rows.map((card) => {
    const legal = evaluateTradeLegality(card, rules);
    const inv = (byCard.get(card.id) || []).map((item) => ({
      ...item,
      legal: legal.ok,
      account: {
        id: item.account_id,
        label: item.label,
        external_key: item.external_key,
        health: item.health,
      },
    }));
    const summary = summarizeCard(inv);
    return { card, ...summary, legal };
  }).filter((row) => row.total > 0 || req.query.empty === '1');

  res.json({ rows });
});

module.exports = router;
