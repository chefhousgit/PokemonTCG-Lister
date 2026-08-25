const DB_NAME = 'ptcgpb-lister';
const STORE = 'handles';
const HANDLE_KEY = 'accounts-folder';
const HEX_JSON = /^[0-9a-f]{8,}\.json$/i;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function canRememberFolder() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function saveFolderHandle(handle) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put({ handle, name: handle.name, savedAt: Date.now() }, HANDLE_KEY);
  });
}

export async function loadRememberedFolder() {
  try {
    const db = await openDb();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (!row || !row.handle) return null;
    return row;
  } catch {
    return null;
  }
}

export async function folderPermission(handle) {
  if (!handle || typeof handle.queryPermission !== 'function') return 'denied';
  const current = await handle.queryPermission({ mode: 'read' });
  if (current === 'granted') return 'granted';
  if (typeof handle.requestPermission !== 'function') return current;
  return handle.requestPermission({ mode: 'read' });
}

async function walkJsonFiles(dirHandle, prefix = dirHandle.name) {
  const files = [];
  for await (const [name, entry] of dirHandle.entries()) {
    const rel = `${prefix}/${name}`;
    if (entry.kind === 'directory') {
      if (/\/Accounts\/Saved$/i.test(rel) || /(^|\/)Saved$/i.test(name)) continue;
      files.push(...await walkJsonFiles(entry, rel));
    } else if (name.toLowerCase().endsWith('.json')) {
      const file = await entry.getFile();
      Object.defineProperty(file, 'webkitRelativePath', { value: rel });
      files.push(file);
    }
  }
  return files;
}

export function filterAccountJsons(fileList) {
  const files = Array.from(fileList || []);
  const safe = files.filter((file) => {
    const rel = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    if (/Accounts\/Saved/i.test(rel)) return false;
    return rel.toLowerCase().endsWith('.json');
  });
  const accounts = safe.filter((file) => /(?:^|\/)accounts\/[^/]+\.json$/i.test((file.webkitRelativePath || file.name).replace(/\\/g, '/')));
  const collections = safe.filter((file) => /(?:^|\/)collections\/[^/]+\.json$/i.test((file.webkitRelativePath || '').replace(/\\/g, '/')));
  if (accounts.length || collections.length) return [...accounts, ...collections];
  const hexNamed = safe.filter((file) => HEX_JSON.test(file.name));
  if (hexNamed.length) return hexNamed;
  return safe;
}

export async function filesFromRememberedFolder(handle) {
  const all = await walkJsonFiles(handle);
  return filterAccountJsons(all);
}

export async function pickAndRememberFolder() {
  const handle = await window.showDirectoryPicker({ id: 'ptcgpb-accounts', mode: 'read' });
  await saveFolderHandle(handle);
  return handle;
}
