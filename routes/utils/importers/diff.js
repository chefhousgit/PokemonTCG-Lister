function countsEqual(left, right) {
  const a = left || {};
  const b = right || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (Number(a[key] || 0) !== Number(b[key] || 0)) return false;
  }
  return true;
}

function buildImportDiff(existingAccounts, incoming, inventoryByKey = {}, options = {}) {
  const byKey = new Map(existingAccounts.map((a) => [a.external_key, a]));
  const incomingKeys = new Set();
  const adds = [];
  const updates = [];
  const unchanged = [];
  const skips = [];

  for (const row of incoming) {
    if (row.skipped && row.skipped.length && !row.account) {
      skips.push(...row.skipped);
      continue;
    }
    incomingKeys.add(row.account.external_key);
    const prev = byKey.get(row.account.external_key);
    if (!prev) {
      adds.push({
        account: row.account,
        counts: row.counts,
        marks: row.marks,
        skipped: row.skipped,
      });
    } else if (countsEqual(inventoryByKey[row.account.external_key], row.counts)) {
      unchanged.push({
        previous: { id: prev.id, external_key: prev.external_key, label: prev.label },
        next: row,
      });
    } else {
      updates.push({
        previous: { id: prev.id, external_key: prev.external_key, label: prev.label },
        next: row,
      });
    }
    if (row.skipped && row.skipped.length) skips.push(...row.skipped);
  }

  const fullSync = Boolean(options.fullSync);
  const retires = fullSync
    ? existingAccounts
      .filter((a) => a.health !== 'retired'
        && !incomingKeys.has(a.external_key)
        && !String(a.external_key).startsWith('seed-'))
      .map((a) => ({ external_key: a.external_key, id: a.id, label: a.label }))
    : [];

  return { adds, updates, unchanged, skips, retires, fullSync };
}

async function loadInventoryByAccountKey(db) {
  const rows = await db.query(
    `SELECT a.external_key, c.card_id, i.qty
     FROM inventory_items i
     JOIN accounts a ON a.id = i.account_id
     JOIN cards c ON c.id = i.card_id`,
  );
  const map = {};
  for (const row of rows.rows) {
    if (!map[row.external_key]) map[row.external_key] = {};
    map[row.external_key][row.card_id] = Number(row.qty);
  }
  return map;
}

module.exports = { buildImportDiff, countsEqual, loadInventoryByAccountKey };
