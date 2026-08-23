const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertSafeImportPath, containsSavedPath } = require('./pathGuard');

test('allows Accounts/Cards paths', () => {
  assert.equal(containsSavedPath('C:\\PTCGPB-main\\Accounts\\Cards\\accounts\\a.json'), false);
  assertSafeImportPath('C:\\PTCGPB-main\\Accounts\\Cards\\accounts');
});

test('rejects Accounts/Saved', () => {
  assert.equal(containsSavedPath('C:\\PTCGPB-main\\Accounts\\Saved\\2\\x.xml'), true);
  assert.throws(
    () => assertSafeImportPath('C:\\foo\\Accounts\\Saved\\x.xml'),
    /Accounts\/Saved/,
  );
});
