const path = require('path');

const SAVED_SEGMENT = /(?:^|[\\/])Accounts[\\/]Saved(?:[\\/]|$)/i;

function normalizeForCheck(p) {
  return String(p || '').replace(/\//g, '\\');
}

function containsSavedPath(p) {
  const unified = String(p || '').replace(/\\/g, '/');
  return /Accounts\/Saved/i.test(unified) || SAVED_SEGMENT.test(normalizeForCheck(p));
}

function assertSafeImportPath(candidate, root) {
  const raw = String(candidate || '');
  if (!raw) throw new Error('Import path is required');
  if (containsSavedPath(raw)) {
    throw new Error('Refusing to read Accounts/Saved — those files hold plaintext credentials');
  }
  if (root) {
    const resolved = path.resolve(root, raw);
    const rootResolved = path.resolve(root);
    if (containsSavedPath(resolved)) {
      throw new Error('Refusing to read Accounts/Saved — those files hold plaintext credentials');
    }
    const rel = path.relative(rootResolved, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Import path escapes the configured PTCGPB root');
    }
  }
  return true;
}

function isSavedDirName(name) {
  return String(name || '').toLowerCase() === 'saved';
}

module.exports = {
  containsSavedPath,
  assertSafeImportPath,
  isSavedDirName,
};
