const { loadRules, evaluateTradeLegality } = require('./rules/engine');
const { rankSourceAccounts } = require('./routing/router');
const { addJobEvent, jobPayloadFromRow } = require('./jobs');

async function loadRoutingSnapshot(db, cardRow) {
  const accounts = (await db.query('SELECT * FROM accounts')).rows;
  const inventory = (await db.query(
    'SELECT * FROM inventory_items WHERE card_id = $1',
    [cardRow.id],
  )).rows;
  const reservations = (await db.query(
    `SELECT r.* FROM inventory_reservations r
     JOIN inventory_items i ON i.id = r.inventory_item_id
     WHERE i.card_id = $1`,
    [cardRow.id],
  )).rows;
  return { accounts, inventory, reservations, rules: loadRules() };
}

async function createManualSale(db, { listingId, buyerHandle, buyerFriendId, pricePaid }) {
  const listingRes = await db.query(
    `SELECT l.*, c.card_id AS card_key, c.name, c.rarity, c.tradeable, c.set_code
     FROM listings l JOIN cards c ON c.id = l.card_id WHERE l.id = $1`,
    [listingId],
  );
  const listing = listingRes.rows[0];
  if (!listing) throw new Error('Listing not found');

  const card = {
    id: listing.card_id,
    card_id: listing.card_key,
    rarity: listing.rarity,
    tradeable: listing.tradeable,
    set_code: listing.set_code,
  };
  const snap = await loadRoutingSnapshot(db, card);
  const legal = evaluateTradeLegality(card, snap.rules);
  if (!legal.ok) throw new Error(`Card is not legally tradeable: ${legal.reasons.join(', ')}`);

  const routed = rankSourceAccounts({
    card,
    qty: 1,
    accounts: snap.accounts,
    inventory: snap.inventory,
    reservations: snap.reservations,
    rules: snap.rules,
  });
  if (routed.cannotFulfill || !routed.pick[0]) {
    const why = routed.ranked.map((r) => `${r.label}: ${r.reasons.join('/') || 'ok'}`).join('; ');
    throw new Error(`Cannot fulfill: ${why}`);
  }

  const pick = routed.pick[0];
  const orderRes = await db.query(
    `INSERT INTO orders (listing_id, buyer_handle, buyer_friend_id, price_paid, status)
     VALUES ($1, $2, $3, $4, 'open') RETURNING *`,
    [listingId, buyerHandle || null, buyerFriendId || null, pricePaid || listing.price || 0],
  );
  const order = orderRes.rows[0];

  await db.query(
    `INSERT INTO inventory_reservations (inventory_item_id, listing_id, order_id, qty)
     VALUES ($1, $2, $3, 1)`,
    [pick.inventory_item_id, listingId, order.id],
  );
  await db.query(
    `UPDATE inventory_items SET reserved_qty = reserved_qty + 1 WHERE id = $1`,
    [pick.inventory_item_id],
  );
  await db.query(`UPDATE listings SET status = 'reserved' WHERE id = $1`, [listingId]);
  await db.query(
    `UPDATE accounts SET friend_slots_used = friend_slots_used + 1 WHERE id = $1`,
    [pick.account_id],
  );

  const jobRes = await db.query(
    `INSERT INTO trade_jobs (order_id, source_account_id, target_friend_id, card_id, status)
     VALUES ($1, $2, $3, $4, 'queued') RETURNING *`,
    [order.id, pick.account_id, buyerFriendId || null, card.id],
  );
  const job = jobRes.rows[0];
  await db.query(
    `INSERT INTO friend_links (account_id, buyer_friend_id, state, job_id)
     VALUES ($1, $2, 'requested', $3)`,
    [pick.account_id, buyerFriendId || 'unknown', job.id],
  );

  const account = snap.accounts.find((a) => a.id === pick.account_id);
  const payload = jobPayloadFromRow(job, account, card);
  await addJobEvent(db, job.id, 'web', 'created', { orderId: order.id, routing: pick, payload });
  await addJobEvent(db, job.id, 'system', 'routed', { ranked: routed.ranked });

  await db.query(`UPDATE trade_jobs SET status = 'routed' WHERE id = $1`, [job.id]);
  return { order, job, routing: routed };
}

async function releaseJob(db, job, reason) {
  if (job.source_account_id) {
    await db.query(
      `UPDATE accounts SET friend_slots_used = GREATEST(friend_slots_used - 1, 0) WHERE id = $1`,
      [job.source_account_id],
    );
  }
  const resRows = await db.query(
    `SELECT * FROM inventory_reservations WHERE order_id = $1`,
    [job.order_id],
  );
  for (const res of resRows.rows) {
    await db.query(
      `UPDATE inventory_items SET reserved_qty = GREATEST(reserved_qty - $1, 0) WHERE id = $2`,
      [res.qty, res.inventory_item_id],
    );
    await db.query('DELETE FROM inventory_reservations WHERE id = $1', [res.id]);
  }
  await db.query(
    `UPDATE friend_links SET state = 'removed' WHERE job_id = $1`,
    [job.id],
  );
  await addJobEvent(db, job.id, 'system', 'released', { reason });
}

module.exports = { createManualSale, loadRoutingSnapshot, releaseJob };
