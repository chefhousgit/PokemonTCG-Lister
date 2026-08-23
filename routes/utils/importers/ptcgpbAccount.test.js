const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseAccountJson } = require('./ptcgpbAccount');

const fixtures = path.join(__dirname, 'fixtures');

test('empty metadata is valid and keys by deviceAccount', () => {
  const obj = JSON.parse(fs.readFileSync(path.join(fixtures, 'empty-meta.json'), 'utf8'));
  const parsed = parseAccountJson(obj, 'aaa111aaa111aaaa.json');
  assert.equal(parsed.account.external_key, 'aaa111aaa111aaaa');
  assert.equal(parsed.account.label, 'aaa111aaa111aaaa');
  assert.equal(parsed.counts['PK_10_020600_00'], 1);
  assert.deepEqual(parsed.skipped, []);
});

test('nested metadata and duplicate cards in one pull', () => {
  const obj = JSON.parse(fs.readFileSync(path.join(fixtures, 'full-meta.json'), 'utf8'));
  const parsed = parseAccountJson(obj, 'bbb222bbb222bbbb.json');
  assert.equal(parsed.account.in_game_handle, 'seed-bravo');
  assert.equal(parsed.account.emulator_instance, '2');
  assert.equal(parsed.account.trade_currency, 360);
  assert.equal(parsed.counts['PK_10_020130_00'], 2);
  assert.equal(parsed.counts['PK_10_020480_00'], 1);
});

test('falls back to filename stem when deviceAccount missing', () => {
  const parsed = parseAccountJson({ metadata: {}, pulls: [] }, 'ccc333ccc333cccc.json');
  assert.equal(parsed.account.external_key, 'ccc333ccc333cccc');
});
