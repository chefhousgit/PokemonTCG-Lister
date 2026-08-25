const { parseAccountJson } = require('./ptcgpbAccount');
const { catalogFields, ensureCatalog } = require('../catalog');

async function ensureCards(db, keys) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return {};
  await ensureCatalog().catch(() => {});
  const values = [];
  const params = [];
  unique.forEach((key, i) => {
    const meta = catalogFields(key);
    const base = i * 7;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
    params.push(key, meta.name, meta.rarity, meta.variant, meta.set_code || null, meta.number || null, meta.image_ref || null);
  });
  await db.query(
    `INSERT INTO cards (card_id, name, rarity, variant, set_code, number, image_ref)
     VALUES ${values.join(',')}
     ON CONFLICT (card_id) DO UPDATE SET
       name = CASE WHEN cards.rarity = 'unknown' OR cards.name = cards.card_id THEN EXCLUDED.name ELSE cards.name END,
       rarity = CASE WHEN cards.rarity = 'unknown' THEN EXCLUDED.rarity ELSE cards.rarity END,
       set_code = COALESCE(cards.set_code, EXCLUDED.set_code),
       number = COALESCE(cards.number, EXCLUDED.number),
       image_ref = COALESCE(cards.image_ref, EXCLUDED.image_ref)`,
    params,
  );
  const rows = await db.query('SELECT id, card_id FROM cards WHERE card_id = ANY($1::text[])', [unique]);
  return Object.fromEntries(rows.rows.map((r) => [r.card_id, r.id]));
}

async function ensureCard(db, cardKey) {
  const map = await ensureCards(db, [cardKey]);
  return map[cardKey];
}

async function upsertParsedAccount(db, parsed, cardMap = {}) {
  if (!parsed.account) return { skipped: parsed.skipped || [] };
  const a = parsed.account;
  const existing = await db.query('SELECT * FROM accounts WHERE external_key = $1', [a.external_key]);
  let accountId;
  const sourceJson = parsed.raw ? JSON.stringify(parsed.raw) : null;
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
         source_json = COALESCE($9, source_json),
         health = CASE WHEN health = 'retired' THEN 'active' ELSE health END,
         updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [existing.rows[0].id, a.label, a.in_game_handle, a.friend_id, a.emulator_instance, a.packs_opened, a.trade_currency, a.notes, sourceJson],
    );
    accountId = row.rows[0].id;
  } else {
    const row = await db.query(
      `INSERT INTO accounts (external_key, label, in_game_handle, friend_id, emulator_instance,
        packs_opened, trade_currency, notes, health, source_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9) RETURNING id`,
      [a.external_key, a.label, a.in_game_handle, a.friend_id, a.emulator_instance, a.packs_opened, a.trade_currency, a.notes, sourceJson],
    );
    accountId = row.rows[0].id;
  }

  for (const [cardKey, qty] of Object.entries(parsed.counts || {})) {
    const cardId = cardMap[cardKey] || await ensureCard(db, cardKey);
    await db.query(
      `INSERT INTO inventory_items (account_id, card_id, qty, reserved_qty, source, acquired_at)
       VALUES ($1, $2, $3, 0, 'ptcgpb', NOW())
       ON CONFLICT (account_id, card_id) DO UPDATE SET qty = EXCLUDED.qty, source = 'ptcgpb'`,
      [accountId, cardId, qty],
    );
  }

  const marks = { ...(parsed.marks && parsed.marks.traded), ...(parsed.marks && parsed.marks.shared) };
  for (const [cardKey, qty] of Object.entries(marks)) {
    const cardId = cardMap[cardKey] || await ensureCard(db, cardKey);
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
  const allKeys = [];
  for (const parsed of parsedRows || []) {
    allKeys.push(...Object.keys(parsed.counts || {}));
    allKeys.push(...Object.keys((parsed.marks && parsed.marks.traded) || {}));
    allKeys.push(...Object.keys((parsed.marks && parsed.marks.shared) || {}));
  }
  const cardMap = await ensureCards(db, allKeys);

  const results = [];
  let itemCount = 0;
  for (const parsed of parsedRows) {
    const result = await upsertParsedAccount(db, parsed, cardMap);
    results.push(result);
    itemCount += Object.keys(parsed.counts || {}).length;
  }
  for (const key of retireKeys || []) {
    await db.query(
      `UPDATE accounts SET health = 'retired', updated_at = NOW() WHERE external_key = $1`,
      [key],
    );
  }
  return { results, accounts: results.filter((r) => r.accountId).length, items: itemCount };
}

function parseUploadedJson(buffer, filename) {
  const obj = JSON.parse(buffer.toString('utf8'));
  const parsed = parseAccountJson(obj, filename);
  parsed.raw = obj;
  return parsed;
}

module.exports = { upsertParsedAccount, commitParsed, parseUploadedJson, ensureCard };
