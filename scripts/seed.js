const { initDb, getDb } = require('../routes/utils/db');

const SEED_CARDS = [
  ['PK_SEED_SHARED_00', 'B4', '130', 'Shared Seed Card', 'one_diamond', '00'],
  ['PK_10_020130_00', 'B4', '013', 'Seed Card 013', 'one_diamond', '00'],
  ['PK_10_020480_00', 'B4', '048', 'Seed Card 048', 'one_diamond', '00'],
  ['PK_10_020600_00', 'B4', '060', 'Seed Card 060', 'one_diamond', '00'],
  ['PK_10_019620_00', 'B4', '962', 'Seed Card 962', 'one_diamond', '00'],
  ['PK_10_019650_00', 'B4', '965', 'Seed Card 965', 'one_diamond', '00'],
  ['PK_10_019690_00', 'B4', '969', 'Seed Card 969', 'one_diamond', '00'],
  ['PK_10_019700_00', 'B4', '970', 'Seed Card 970', 'one_diamond', '00'],
  ['PK_10_019760_00', 'B4', '976', 'Seed Card 976', 'one_diamond', '00'],
  ['PK_10_019790_00', 'B4', '979', 'Seed Card 979', 'one_diamond', '00'],
  ['PK_10_019810_00', 'B4', '981', 'Seed Card 981', 'one_diamond', '00'],
  ['PK_10_019850_00', 'B4', '985', 'Seed Card 985', 'one_diamond', '00'],
  ['PK_10_019880_00', 'B4', '988', 'Seed Card 988', 'one_diamond', '00'],
  ['PK_10_020000_00', 'B4', '000', 'Seed Card 000', 'one_diamond', '00'],
  ['PK_10_020060_00', 'B4', '006', 'Seed Card 006', 'one_diamond', '00'],
  ['PK_10_020150_00', 'B4', '015', 'Seed Card 015', 'one_diamond', '00'],
  ['PK_10_020190_00', 'B4', '019', 'Seed Card 019', 'one_diamond', '00'],
  ['PK_10_020270_00', 'B4', '027', 'Seed Card 027', 'one_diamond', '00'],
  ['PK_10_020340_00', 'B4', '034', 'Seed Card 034', 'one_diamond', '00'],
  ['PK_10_020510_00', 'B4', '051', 'Seed Card 051', 'one_diamond', '00'],
  ['PK_10_020520_00', 'B4', '052', 'Seed Card 052', 'one_diamond', '00'],
  ['PK_10_020570_00', 'B4', '057', 'Seed Card 057', 'one_diamond', '00'],
  ['PK_10_020820_00', 'B4', '082', 'Seed Card 082', 'one_diamond', '00'],
  ['PK_10_020940_00', 'B4', '094', 'Seed Card 094', 'one_diamond', '00'],
  ['PK_10_020980_00', 'B4', '098', 'Seed Card 098', 'one_diamond', '00'],
  ['TR_10_001580_00', 'B4', 'T58', 'Seed Trainer 058', 'one_diamond', '00'],
  ['PK_90_020150_00', 'PROMO-B', 'P15', 'Seed Promo 015', 'promo', '00'],
];

const ACCOUNTS = [
  { key: 'seed-alpha', label: 'Alpha (main)', instance: '2', slots: 10, used: 2, dust: 400, weight: 0 },
  { key: 'seed-bravo', label: 'Bravo (burner)', instance: '4', slots: 10, used: 1, dust: 250, weight: 10 },
  { key: 'seed-charlie', label: 'Charlie (full friends)', instance: '6', slots: 5, used: 5, dust: 80, weight: 5 },
];

async function seedIfEmpty() {
  await initDb();
  const db = getDb();
  const existing = await db.query('SELECT COUNT(*)::int AS n FROM accounts');
  if (existing.rows[0].n > 0) {
    console.log('[seed] accounts already present — skip');
    return;
  }

  for (const [cardId, setCode, number, name, rarity, variant] of SEED_CARDS) {
    await db.query(
      `INSERT INTO cards (card_id, set_code, number, name, rarity, variant)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (card_id) DO NOTHING`,
      [cardId, setCode, number, name, rarity, variant],
    );
  }

  const accountIds = [];
  for (const acc of ACCOUNTS) {
    const res = await db.query(
      `INSERT INTO accounts (external_key, label, in_game_handle, emulator_instance,
        friend_slots_total, friend_slots_used, trade_currency, packs_opened, health, priority_weight)
       VALUES ($1, $2, $2, $3, $4, $5, $6, 12, 'active', $7)
       RETURNING id`,
      [acc.key, acc.label, acc.instance, acc.slots, acc.used, acc.dust, acc.weight],
    );
    accountIds.push(res.rows[0].id);
  }

  const cards = await db.query('SELECT id, card_id FROM cards');
  const byKey = Object.fromEntries(cards.rows.map((c) => [c.card_id, c.id]));

  async function addItem(accountId, cardKey, qty) {
    await db.query(
      `INSERT INTO inventory_items (account_id, card_id, qty, reserved_qty, source)
       VALUES ($1, $2, $3, 0, 'seed')
       ON CONFLICT (account_id, card_id) DO UPDATE SET qty = EXCLUDED.qty`,
      [accountId, byKey[cardKey], qty],
    );
  }

  // Shared card on all three accounts — acceptance 6a/b/c
  await addItem(accountIds[0], 'PK_SEED_SHARED_00', 1);
  await addItem(accountIds[1], 'PK_SEED_SHARED_00', 1);
  await addItem(accountIds[2], 'PK_SEED_SHARED_00', 1);

  const extras = SEED_CARDS.map((c) => c[0]).filter((id) => id !== 'PK_SEED_SHARED_00');
  for (let i = 0; i < extras.length; i += 1) {
    await addItem(accountIds[i % 2], extras[i], 1 + (i % 2));
  }

  console.log('[seed] inserted 3 accounts and demo inventory');
}

if (require.main === module) {
  seedIfEmpty().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedIfEmpty, SEED_CARDS };
