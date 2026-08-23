const express = require('express');
const { getDb } = require('./utils/db');
const { createManualSale } = require('./utils/fulfillment');

const router = express.Router();

router.get('/', async (_req, res) => {
  const db = getDb();
  const rows = await db.query(
    `SELECT o.*, l.title, c.name, c.card_id AS card_key
     FROM orders o
     LEFT JOIN listings l ON l.id = o.listing_id
     LEFT JOIN cards c ON c.id = l.card_id
     ORDER BY o.id DESC`,
  );
  res.json({ orders: rows.rows });
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const result = await createManualSale(db, {
      listingId: req.body.listingId,
      buyerHandle: req.body.buyerHandle,
      buyerFriendId: req.body.buyerFriendId,
      pricePaid: req.body.pricePaid,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
