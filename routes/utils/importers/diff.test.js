const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildImportDiff, countsEqual } = require('./diff');

function incoming(key, counts) {
  return { account: { external_key: key, label: key }, counts, skipped: [] };
}

test('countsEqual treats missing keys as zero', () => {
  assert.equal(countsEqual({ a: 1 }, { a: 1, b: 0 }), true);
  assert.equal(countsEqual({ a: 1 }, { a: 2 }), false);
});

test('existing account with same qty is unchanged, not an add', () => {
  const diff = buildImportDiff(
    [{ id: 1, external_key: 'acc-1', label: 'acc-1', health: 'active' }],
    [incoming('acc-1', { PK_1: 2 })],
    { 'acc-1': { PK_1: 2 } },
  );
  assert.equal(diff.adds.length, 0);
  assert.equal(diff.updates.length, 0);
  assert.equal(diff.unchanged.length, 1);
  assert.equal(diff.retires.length, 0);
});

test('existing account with new qty is an update', () => {
  const diff = buildImportDiff(
    [{ id: 1, external_key: 'acc-1', label: 'acc-1', health: 'active' }],
    [incoming('acc-1', { PK_1: 5 })],
    { 'acc-1': { PK_1: 2 } },
  );
  assert.equal(diff.updates.length, 1);
  assert.equal(diff.unchanged.length, 0);
});

test('unknown deviceAccount is an add', () => {
  const diff = buildImportDiff([], [incoming('acc-new', { PK_1: 1 })], {});
  assert.equal(diff.adds.length, 1);
});

test('does not retire missing accounts unless fullSync', () => {
  const existing = [
    { id: 1, external_key: 'keep-me', label: 'keep-me', health: 'active' },
    { id: 2, external_key: 'gone', label: 'gone', health: 'active' },
  ];
  const partial = buildImportDiff(existing, [incoming('keep-me', { PK_1: 1 })], { 'keep-me': { PK_1: 1 } });
  assert.equal(partial.retires.length, 0);

  const full = buildImportDiff(existing, [incoming('keep-me', { PK_1: 1 })], { 'keep-me': { PK_1: 1 } }, { fullSync: true });
  assert.equal(full.retires.length, 1);
  assert.equal(full.retires[0].external_key, 'gone');
});

test('fullSync never retires seed accounts', () => {
  const diff = buildImportDiff(
    [{ id: 9, external_key: 'seed-alpha', label: 'Alpha', health: 'active' }],
    [incoming('acc-1', { PK_1: 1 })],
    {},
    { fullSync: true },
  );
  assert.equal(diff.retires.length, 0);
});
