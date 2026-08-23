const EXCLUDED_HEALTH = new Set(['flagged', 'retired']);

function accountSellable(item, account, legal) {
  if (!legal) return 0;
  if (!account || EXCLUDED_HEALTH.has(account.health)) return 0;
  const qty = Number(item.qty || 0);
  const reserved = Number(item.reserved_qty || 0);
  return Math.max(0, qty - reserved);
}

function summarizeCard(rows) {
  let total = 0;
  let reserved = 0;
  let sellable = 0;
  const perAccount = [];
  for (const row of rows) {
    const qty = Number(row.qty || 0);
    const res = Number(row.reserved_qty || 0);
    total += qty;
    reserved += res;
    const canSell = accountSellable(row, row.account, row.legal !== false);
    sellable += canSell;
    perAccount.push({
      account_id: row.account && row.account.id,
      label: row.account && (row.account.label || row.account.external_key),
      health: row.account && row.account.health,
      qty,
      reserved_qty: res,
      sellable: canSell,
    });
  }
  return { total, reserved, sellable, perAccount };
}

function sellableQty(rows) {
  return summarizeCard(rows).sellable;
}

module.exports = { accountSellable, summarizeCard, sellableQty, EXCLUDED_HEALTH };
