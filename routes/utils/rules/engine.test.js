const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateTradeLegality, currencyCost } = require('./engine');

const rules = {
  rarityEligibility: { one_diamond: true, one_star: false },
  currencyCostByRarity: { one_diamond: 0, one_star: 500 },
  perSetRestrictions: [],
};

test('allows eligible rarity', () => {
  const result = evaluateTradeLegality({ rarity: 'one_diamond', tradeable: true }, rules);
  assert.equal(result.ok, true);
});

test('refuses ineligible rarity', () => {
  const result = evaluateTradeLegality({ rarity: 'one_star', tradeable: true }, rules);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('rarity_ineligible:one_star'));
});

test('currency cost is data-driven', () => {
  assert.equal(currencyCost({ rarity: 'one_star' }, rules), 500);
});
