const { evaluateTradeLegality, currencyCost } = require('../rules/engine');
const { accountSellable } = require('../aggregates');

function freeFriendSlots(account) {
  return Number(account.friend_slots_total || 0) - Number(account.friend_slots_used || 0);
}

function rankSourceAccounts({ card, qty = 1, accounts, inventory, reservations = [], locks = {}, rules }) {
  const needed = Number(qty) || 1;
  const reservedByItem = {};
  for (const r of reservations) {
    reservedByItem[r.inventory_item_id] = (reservedByItem[r.inventory_item_id] || 0) + Number(r.qty || 0);
  }

  const ranked = [];
  for (const account of accounts) {
    const reasons = [];
    const item = inventory.find((row) => row.account_id === account.id && row.card_id === card.id);
    const extraReserved = item ? reservedByItem[item.id] || 0 : 0;
    const effective = item
      ? { ...item, reserved_qty: Number(item.reserved_qty || 0) + extraReserved }
      : { qty: 0, reserved_qty: 0 };

    const legal = evaluateTradeLegality(card, rules);
    if (!legal.ok) reasons.push(...legal.reasons);

    const spare = accountSellable(effective, account, legal.ok);
    if (spare < 1) reasons.push('no_spare_copy');

    const slots = freeFriendSlots(account);
    if (slots < 1) reasons.push('no_free_friend_slot');

    const cost = currencyCost(card, rules);
    if (Number(account.trade_currency || 0) < cost) reasons.push('insufficient_trade_currency');

    if (account.health !== 'active') reasons.push(`health_${account.health || 'unknown'}`);
    if (locks[account.id] || locks[account.emulator_instance]) reasons.push('emulator_locked');

    const weight = Number(account.priority_weight || 0);
    const score = reasons.length ? -1000 : spare * 10 + slots * 3 + weight;

    ranked.push({
      account_id: account.id,
      external_key: account.external_key,
      label: account.label,
      inventory_item_id: item ? item.id : null,
      spare,
      free_friend_slots: slots,
      score,
      eligible: reasons.length === 0,
      reasons,
    });
  }

  ranked.sort((a, b) => b.score - a.score || String(a.label).localeCompare(String(b.label)));
  const eligible = ranked.filter((r) => r.eligible);
  const cannotFulfill = eligible.length < needed
    ? { ok: false, needed, available: eligible.length, reasons: ['insufficient_eligible_accounts'] }
    : null;

  return { ranked, cannotFulfill, pick: eligible.slice(0, needed) };
}

module.exports = { rankSourceAccounts, freeFriendSlots };
