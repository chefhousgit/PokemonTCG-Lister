function buildImportDiff(existingAccounts, incoming) {
  const byKey = new Map(existingAccounts.map((a) => [a.external_key, a]));
  const incomingKeys = new Set();
  const adds = [];
  const updates = [];
  const skips = [];

  for (const row of incoming) {
    if (row.skipped && row.skipped.length && !row.account) {
      skips.push(...row.skipped);
      continue;
    }
    incomingKeys.add(row.account.external_key);
    const prev = byKey.get(row.account.external_key);
    if (!prev) {
      adds.push(row);
    } else {
      updates.push({ previous: prev, next: row });
    }
    if (row.skipped && row.skipped.length) skips.push(...row.skipped);
  }

  const retires = existingAccounts
    .filter((a) => a.health !== 'retired' && !incomingKeys.has(a.external_key) && String(a.external_key).startsWith('seed-') === false)
    .map((a) => ({ external_key: a.external_key, id: a.id }));

  return { adds, updates, skips, retires };
}

module.exports = { buildImportDiff };
