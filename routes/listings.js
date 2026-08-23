const express = require('express');
const { getDb } = require('./utils/db');
const { getMarketplaceAdapter } = require('./utils/adapters/marketplace');
const { loadRules, evaluateTradeLegality } = require('./utils/rules/engine');
const { summarizeCard } = require('./utils/aggregates');
const { draftCopy } = require('./utils/listingCopy');

const router = express.Router();

async function cardWithSellable(db, cardId) {
  const cardRes = await db.query('SELECT * FROM cards WHERE id = $1 OR card_id = $1', [cardId]);
  const card = cardRes.rows[0];
  if (!card) return null;
  const items = await db.query(
    `SELECT i.*, a.label, a.health, a.external_key
     FROM inventory_items i JOIN accounts a ON a.id = i.account_id
     WHERE i.card_id = $1`,
    [card.id],
  );
  const rules = loadRules();
  const legal = evaluateTradeLegality(card, rules);
  const rows = items.rows.map((item) => ({
    ...item,
    legal: legal.ok,
    account: { id: item.account_id, label: item.label, health: item.health, external_key: item.external_key },
  }));
  return { card, legal, summary: summarizeCard(rows) };
}

router.get('/', async (_req, res) => {
  const db = getDb();
  const rows = await db.query(
    `SELECT l.*, c.name, c.card_id AS card_key, c.set_code, c.rarity
     FROM listings l JOIN cards c ON c.id = l.card_id
     ORDER BY l.id DESC`,
  );
  res.json({ listings: rows.rows });
});

router.post('/bulk', async (req, res) => {
  const db = getDb();
  const adapter = getMarketplaceAdapter();
  const ids = req.body.cardIds || [];
  const created = [];
  const refused = [];
  for (const rawId of ids) {
    const info = await cardWithSellable(db, rawId);
    if (!info) {
      refused.push({ cardId: rawId, reasons: ['card_not_found'] });
      continue;
    }
    if (!info.legal.ok) {
      refused.push({ cardId: info.card.card_id, reasons: info.legal.reasons });
      continue;
    }
    if (info.summary.sellable < 1) {
      refused.push({ cardId: info.card.card_id, reasons: ['no_sellable_copies'] });
      continue;
    }
    const copy = draftCopy(info.card, info.summary.sellable);
    const row = await db.query(
      `INSERT INTO listings (card_id, title, description, price, status, max_quantity, adapter_name)
       VALUES ($1, $2, $3, $4, 'draft', $5, $6) RETURNING *`,
      [info.card.id, copy.title, copy.description, req.body.price || null, info.summary.sellable, adapter.name],
    );
    created.push(row.rows[0]);
  }
  res.json({ created, refused, adapter: adapter.name });
});

router.post('/:id/publish', async (req, res) => {
  try {
    const db = getDb();
    const listingRes = await db.query('SELECT * FROM listings WHERE id = $1', [req.params.id]);
    const listing = listingRes.rows[0];
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    const adapter = getMarketplaceAdapter(req.body.adapter);
    const published = await adapter.publish(listing);
    const updated = await db.query(
      `UPDATE listings SET status = 'published', external_id = $2, adapter_name = $3 WHERE id = $1 RETURNING *`,
      [listing.id, published.externalId, adapter.name],
    );
    res.json({ listing: updated.rows[0], published });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/publish-all-drafts', async (_req, res) => {
  const db = getDb();
  const adapter = getMarketplaceAdapter();
  const drafts = await db.query(`SELECT * FROM listings WHERE status = 'draft'`);
  const published = [];
  for (const listing of drafts.rows) {
    const result = await adapter.publish(listing);
    const updated = await db.query(
      `UPDATE listings SET status = 'published', external_id = $2, adapter_name = $3 WHERE id = $1 RETURNING *`,
      [listing.id, result.externalId, adapter.name],
    );
    published.push(updated.rows[0]);
  }
  res.json({ published, adapter: adapter.name });
});

module.exports = router;
module.exports.cardWithSellable = cardWithSellable;
