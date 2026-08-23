const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertSafeJobPayload, UnsafeJobPayloadError } = require('./jobPayload');

test('agent rejects poisoned credential payload', () => {
  assert.throws(
    () => assertSafeJobPayload({ account_key: 'abc', username: 'player', password: 'secret' }),
    UnsafeJobPayloadError,
  );
});

test('agent rejects Accounts/Saved path in payload', () => {
  assert.throws(
    () => assertSafeJobPayload({ account_key: 'abc', file: 'Accounts/Saved/2/x.xml' }),
    UnsafeJobPayloadError,
  );
});
