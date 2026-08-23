const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeCard, sellableQty } = require('./aggregates');

test('three accounts show total/sellable/per-account', () => {
  const rows = [
    { qty: 1, reserved_qty: 0, legal: true, account: { id: 1, label: 'A', health: 'active' } },
    { qty: 1, reserved_qty: 0, legal: true, account: { id: 2, label: 'B', health: 'active' } },
    { qty: 1, reserved_qty: 0, legal: true, account: { id: 3, label: 'C', health: 'active' } },
  ];
  const summary = summarizeCard(rows);
  assert.equal(summary.total, 3);
  assert.equal(summary.sellable, 3);
  assert.equal(summary.perAccount.length, 3);
  assert.equal(sellableQty(rows), 3);
});

test('flagged accounts do not count as sellable', () => {
  const rows = [
    { qty: 2, reserved_qty: 0, legal: true, account: { id: 1, label: 'A', health: 'flagged' } },
  ];
  assert.equal(sellableQty(rows), 0);
  assert.equal(summarizeCard(rows).total, 2);
});
