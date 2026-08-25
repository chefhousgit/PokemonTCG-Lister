const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compactRowsFromDocument, buildDashboardPayload, expandCounts } = require('./dashboardPayload');

test('expandCounts repeats ids by quantity', () => {
  assert.deepEqual(expandCounts({ A: 2, B: 1 }), ['A', 'A', 'B']);
});

test('compact rows keep pack and timestamp from pulls', () => {
  const rows = compactRowsFromDocument({
    deviceAccount: 'acc-1',
    pulls: [{ pack: 'Charizard', timestamp: '2026-01-01T00:00:00Z', cards: ['PK_1', 'PK_2'] }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].account, 'acc-1');
  assert.equal(rows[0].pack, 'Charizard');
  assert.deepEqual(rows[0].cardIds, ['PK_1', 'PK_2']);
});

test('buildDashboardPayload synthesizes a pull when source_json is missing', () => {
  const payload = buildDashboardPayload(
    [{ id: 1, external_key: 'acc-1', label: 'Alpha', health: 'active', trade_currency: 40, packs_opened: 12 }],
    { 1: { PK_10_000010_00: 2 } },
  );
  assert.equal(payload.summary.ok, true);
  assert.equal(payload.summary.tradeAccountCount, 1);
  assert.equal(payload.rows.length, 1);
  assert.equal(payload.rows[0].cardIds.length, 2);
  assert.equal(payload.documents[0].deviceAccount, 'acc-1');
});

test('retired accounts are omitted', () => {
  const payload = buildDashboardPayload(
    [{ id: 2, external_key: 'gone', label: 'Gone', health: 'retired' }],
    { 2: { PK_1: 1 } },
  );
  assert.equal(payload.summary.accountCount, 0);
});
