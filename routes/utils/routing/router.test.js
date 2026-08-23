const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rankSourceAccounts } = require('./router');

const rules = {
  rarityEligibility: { one_diamond: true },
  currencyCostByRarity: { one_diamond: 0 },
  perSetRestrictions: [],
};

const card = { id: 1, rarity: 'one_diamond', tradeable: true };

function accounts() {
  return [
    { id: 1, external_key: 'a', label: 'A', health: 'active', friend_slots_total: 10, friend_slots_used: 1, trade_currency: 100, priority_weight: 1 },
    { id: 2, external_key: 'b', label: 'B', health: 'active', friend_slots_total: 10, friend_slots_used: 2, trade_currency: 100, priority_weight: 2 },
    { id: 3, external_key: 'c', label: 'C', health: 'active', friend_slots_total: 5, friend_slots_used: 5, trade_currency: 100, priority_weight: 99 },
  ];
}

function inventory() {
  return [
    { id: 11, account_id: 1, card_id: 1, qty: 1, reserved_qty: 0 },
    { id: 12, account_id: 2, card_id: 1, qty: 1, reserved_qty: 0 },
    { id: 13, account_id: 3, card_id: 1, qty: 1, reserved_qty: 0 },
  ];
}

test('proof 6a: three accounts all appear with spare copies', () => {
  const result = rankSourceAccounts({ card, qty: 1, accounts: accounts(), inventory: inventory(), rules });
  assert.equal(result.ranked.length, 3);
  assert.equal(result.ranked.filter((r) => r.spare === 1).length, 3);
});

test('proof 6b: selling two copies picks two different accounts', () => {
  const result = rankSourceAccounts({ card, qty: 2, accounts: accounts(), inventory: inventory(), rules });
  assert.equal(result.pick.length, 2);
  const ids = new Set(result.pick.map((p) => p.account_id));
  assert.equal(ids.size, 2);
  assert.ok(!ids.has(3));
});

test('proof 6c: zero free friend slots excluded with reason', () => {
  const result = rankSourceAccounts({ card, qty: 1, accounts: accounts(), inventory: inventory(), rules });
  const blocked = result.ranked.find((r) => r.account_id === 3);
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.reasons.includes('no_free_friend_slot'));
});
