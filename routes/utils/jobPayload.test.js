const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertSafeJobPayload, UnsafeJobPayloadError } = require('./jobPayload');

test('accepts identifier-only job', () => {
  assertSafeJobPayload({
    account_key: '0a1e2fdfdb18c237',
    instance: '2',
    buyer_friend_id: '1111222233334444',
    card_id: 'PK_10_020130_00',
  });
});

test('rejects credential-shaped keys', () => {
  assert.throws(
    () => assertSafeJobPayload({ account_key: 'abc', password: 'nope' }),
    UnsafeJobPayloadError,
  );
  assert.throws(
    () => assertSafeJobPayload({ account_key: 'abc', nested: { token: 'x' } }),
    UnsafeJobPayloadError,
  );
});

test('rejects Accounts/Saved paths', () => {
  assert.throws(
    () => assertSafeJobPayload({
      account_key: 'abc',
      note: 'C:\\PTCGPB\\Accounts\\Saved\\2\\x.xml',
    }),
    UnsafeJobPayloadError,
  );
});
