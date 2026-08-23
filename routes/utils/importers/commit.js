const { parseAccountJson } = require('./ptcgpbAccount');

async function ensureCard(db, cardKey) {
  const found = await db.query('SELECT id FROM cards WHERE card_id = $1', [cardKey]);
  if (found.rows[0]) return found.rows[0].id;
  const variant = cardKey.split('_').pop() || '00';
  const inserted = await db.query(
    `INSERT INTO cards (card_id, name, rarity, variant)
     VALUES ($1, $2, 'unknown', $3)
     ON CONFLICT (card_id) DO UPDATE SET name = cards.name
     RETURNING id`,
    [cardKey, cardKey, variant],
  );
  return inserted.rows[0].id;
}

async function upsertParsedAccount(db, parsed) {
  if (!parsed.account) return { skipped: parsed.skipped || [] };
  const a = parsed.account;
  const existing = await db.query('SELECT * FROM accounts WHERE external_key = $1', [a.external_key]);
  let accountId;
  if (existing.rows[0]) {
    const row = await db.query(
      `UPDATE accounts SET
         label = COALESCE($2, label),
         in_game_handle = COALESCE($3, in_game_handle),
         friend_id = COALESCE($4, friend_id),
         emulator_instance = COALESCE($5, emulator_instance),
         packs_opened = COALESCE($6, packs_opened),
         trade_currency = COALESCE($7, trade_currency),
         notes = COALESCE($8, notes),
         health = CASE WHEN health = 'retired' THEN 'active' ELSE health END,
         updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [existing.rows[0].id, a.label, a.in_game_handle, a.friend_id, a.emulator_instance, a.packs_opened, a.trade_currency, a.notes],
    );
    accountId = row.rows[0].id;
  } else {
    const row = await db.query(
      `INSERT INTO accounts (external_key, label, in_game_handle, friend_id, emulator_instance,
        packs_opened, trade_currency, notes, health)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING id`,
      [a.external_key, a.label, a.in_game_handle, a.friend_id, a.emulator_instance, a.packs_opened, a.trade_currency, a.notes],
    );
    accountId = row.rows[0].id;
  }

  for (const [cardKey, qty] of Object.entries(parsed.counts || {})) {
    const cardId = await ensureCard(db, cardKey);
    await db.query(
      `INSERT INTO inventory_items (account_id, card_id, qty, reserved_qty, source, acquired_at)
       VALUES ($1, $2, $3, 0, 'ptcgpb', NOW())
       ON CONFLICT (account_id, card_id) DO UPDATE SET qty = EXCLUDED.qty, source = 'ptcgpb'`,
      [accountId, cardId, qty],
    );
  }

  const marks = { ...parsed.marks.traded, ...parsed.marks.shared };
  for (const [cardKey, qty] of Object.entries(marks)) {
    const cardId = await ensureCard(db, cardKey);
    const item = await db.query(
      'SELECT id FROM inventory_items WHERE account_id = $1 AND card_id = $2',
      [accountId, cardId],
    );
    if (!item.rows[0]) continue;
    const existingRes = await db.query(
      `SELECT id FROM inventory_reservations WHERE inventory_item_id = $1 AND listing_id IS NULL AND order_id IS NULL`,
      [item.rows[0].id],
    );
    if (!existingRes.rows[0]) {
      await db.query(
        `INSERT INTO inventory_reservations (inventory_item_id, qty) VALUES ($1, $2)`,
        [item.rows[0].id, qty],
      );
      await db.query(
        `UPDATE inventory_items SET reserved_qty = reserved_qty + $1 WHERE id = $2`,
        [qty, item.rows[0].id],
      );
    }
  }

  return { accountId };
}

async function commitParsed(db, parsedRows, retireKeys) {
  const results = [];
  for (const parsed of parsedRows) {
    results.push(await upsertParsedAccount(db, parsed));
  }
  for (const key of retireKeys || []) {
    await db.query(
      `UPDATE accounts SET health = 'retired', updated_at = NOW() WHERE external_key = $1`,
      [key],
    );
  }
  return results;
}

function parseUploadedJson(buffer, filename) {
  const obj = JSON.parse(buffer.toString('utf8'));
  return parseAccountJson(obj, filename);
}

module.exports = { upsertParsedAccount, commitParsed, parseUploadedJson, ensureCard };
