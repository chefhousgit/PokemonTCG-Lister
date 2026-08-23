const fs = require('fs');
const path = require('path');
const { assertSafeImportPath, containsSavedPath, isSavedDirName } = require('./pathGuard');
const { parseAccountJson } = require('./ptcgpbAccount');

function resolveScanRoots(folderPath) {
  assertSafeImportPath(folderPath);
  const root = path.resolve(folderPath);
  const candidates = [
    path.join(root, 'Accounts', 'Cards', 'accounts'),
    path.join(root, 'Cards', 'accounts'),
    path.join(root, 'accounts'),
    root,
  ];
  return candidates.filter((dir) => {
    if (containsSavedPath(dir)) return false;
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  });
}

function listJsonFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (isSavedDirName(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (containsSavedPath(full)) continue;
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === 'saved') continue;
      out.push(...listJsonFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json') && entry.name.toLowerCase() !== 'wishlist.json') {
      out.push(full);
    }
  }
  return out;
}

function scanPtcgpbFolder(folderPath) {
  assertSafeImportPath(folderPath);
  if (!fs.existsSync(folderPath)) {
    return { ok: false, error: 'path_not_found', parsed: [], wishlist: [] };
  }
  const roots = resolveScanRoots(folderPath);
  const seen = new Set();
  const files = [];
  for (const root of roots) {
    for (const file of listJsonFiles(root)) {
      if (!seen.has(file)) {
        seen.add(file);
        files.push(file);
      }
    }
  }

  const parsed = [];
  for (const file of files) {
    try {
      assertSafeImportPath(file);
      const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
      parsed.push(parseAccountJson(obj, path.basename(file)));
    } catch (err) {
      parsed.push({ skipped: [{ reason: 'parse_error', file, message: err.message }] });
    }
  }

  const wishlistCandidates = [
    path.join(folderPath, 'Accounts', 'Cards', 'wishlist.json'),
    path.join(folderPath, 'wishlist.json'),
  ];
  let wishlist = [];
  for (const wp of wishlistCandidates) {
    if (containsSavedPath(wp)) continue;
    if (fs.existsSync(wp)) {
      try {
        const data = JSON.parse(fs.readFileSync(wp, 'utf8'));
        wishlist = data.cards || [];
      } catch {
        wishlist = [];
      }
      break;
    }
  }

  return { ok: true, parsed, wishlist, fileCount: files.length };
}

module.exports = { scanPtcgpbFolder, resolveScanRoots };
