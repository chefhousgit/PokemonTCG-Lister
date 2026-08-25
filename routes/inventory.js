const express = require('express');
const { getDb } = require('./utils/db');
const { loadRules, evaluateTradeLegality } = require('./utils/rules/engine');
const { summarizeCard } = require('./utils/aggregates');
const { ensureCatalog, getCatalog, enrichCardRow, listCatalogCards } = require('./utils/catalog');

const router = express.Router();

function summarizeOwned(card, items, rules) {
  const legal = evaluateTradeLegality(card, rules);
  const inv = (items || []).map((item) => ({
    ...item,
    legal: legal.ok,
    account: {
      id: item.account_id,
      label: item.label,
      external_key: item.external_key,
      health: item.health,
    },
  }));
  return { ...summarizeCard(inv), legal };
}

router.get('/', async (req, res) => {
  try {
    await ensureCatalog();
  } catch {
    // Inventory still works with raw card ids if GitHub is unreachable.
  }

  const db = getDb();
  const rules = loadRules();
  const q = `%${String(req.query.q || '').trim()}%`;
  const library = req.query.library === '1';

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

  const seen = new Set();
  const rows = cards.rows.map((card) => {
    seen.add(card.card_id);
    const summary = summarizeOwned(card, byCard.get(card.id) || [], rules);
    return { card: enrichCardRow(card), ...summary };
  }).filter((row) => row.total > 0 || library || req.query.empty === '1');

  if (library) {
    for (const info of listCatalogCards()) {
      if (seen.has(info.card_id)) continue;
      if (q !== '%%') {
        const blob = `${info.name} ${info.card_id} ${info.set_code}`.toLowerCase();
        if (!blob.includes(String(req.query.q || '').trim().toLowerCase())) continue;
      }
      rows.push({
        card: enrichCardRow({
          id: null,
          card_id: info.card_id,
          name: info.name,
          set_code: info.set_code,
          number: info.number,
          rarity: info.rarity,
        }),
        total: 0,
        reserved: 0,
        sellable: 0,
        perAccount: [],
        legal: { ok: true },
      });
    }
  }

  const catalog = getCatalog();
  res.json({
    rows,
    expansions: catalog.expansions || [],
    rarities: catalog.rarities || [],
  });
});

module.exports = router;
